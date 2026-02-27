const { autoScroll, randomDelay, humanMove, scrollElement } = require('./utils');
const { likePost } = require('./actions');

const searchByHashtag = async (page, tag, seenUrls, logCallback) => {
    logCallback(`Searching for hashtag: #${tag}`);

    // Always navigate to ensure fresh state
    await page.goto(`https://www.instagram.com/explore/tags/${tag}/`, { waitUntil: 'networkidle2' });
    await randomDelay(3000, 5000);

    let collectedPosts = [];
    let scrollAttempts = 0;
    const MAX_SCROLLS = 15; // Limit to avoid infinite loops

    while (collectedPosts.length < 9 && scrollAttempts < MAX_SCROLLS) {
        // 1. Grab all visible post links
        const postLinks = await page.$$eval('a[href*="/p/"]', links => links.map(link => link.href));

        // 2. Filter duplicates AND previously seen posts
        const newUniqueLinks = postLinks.filter(link =>
            !seenUrls.has(link) && !collectedPosts.includes(link)
        );

        if (newUniqueLinks.length > 0) {
            collectedPosts.push(...newUniqueLinks);
            logCallback(`Found ${newUniqueLinks.length} new posts (Total batch: ${collectedPosts.length})`);
        }

        // 3. If we don't have enough, SCROLL
        if (collectedPosts.length < 9) {
            logCallback(`Looking for more posts... (Scroll ${scrollAttempts + 1}/${MAX_SCROLLS})`);
            await page.evaluate(() => window.scrollBy(0, 800)); // Scroll down one viewport approx
            await randomDelay(2000, 4000); // Wait for load
            scrollAttempts++;
        }
    }

    logCallback(`Batch complete. Returning ${collectedPosts.length} new posts for #${tag}`);
    return collectedPosts;
};

// Scroll through profile, maybe click on a post, close it, etc.
const browseProfile = async (page, username, logCallback) => {
    logCallback(`Browsing @${username}'s profile... (Human Mode)`);

    // Initial "Reading" pause
    await randomDelay(2000, 5000);

    // Slow Scroll down
    await autoScroll(page);

    // Random pause after scrolling
    await randomDelay(3000, 7000);

    // Scroll back up a bit? Humans do that.
    if (Math.random() > 0.5) {
        await page.evaluate(() => window.scrollBy(0, -300));
        await randomDelay(1000, 3000);
    }

    // Maybe click on a photo to "view" it
    const posts = await page.$$('a[href*="/p/"]');
    if (posts.length > 0) {
        logCallback(`Contemplating posts...`);
        await randomDelay(2000, 4000);

        // Pick a random post
        const randomIndex = Math.floor(Math.random() * Math.min(posts.length, 6)); // Top 6 posts

        // Use smartClick if available, or standard click
        // converting elementHandle to smartClick would need utils import here if not already 
        // ensuring we just click standard for now to be safe or use the passed page
        await posts[randomIndex].click();

        logCallback(`Viewing a specific post by @${username}`);
        await randomDelay(4000, 8000); // Look at the photo longer

        // Maybe like it?
        if (Math.random() > 0.4) { // 60% chance to like while browsing
            await likePost(page);
            logCallback(`Liked a post during browsing.`);
            await randomDelay(1000, 2000);
        }

        // Close modal
        await page.keyboard.press('Escape');
        await randomDelay(2000, 4000);
    }

    logCallback(`Finished browsing @${username}.`);
};

const analyzeProfile = async (page, username, keywords, logCallback) => {
    logCallback(`Analyzing profile: @${username}`);

    // Check if we are already on the profile page
    const currentUrl = page.url();
    if (!currentUrl.includes(username)) {
        await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 5000);
    } else {
        logCallback('Already on profile page.');
        await randomDelay(2000, 4000); // Wait for content to load if we just clicked
    }

    // Get Bio and visible text
    const bioStub = await page.evaluate(() => {
        // Try meta description first
        const meta = document.querySelector('meta[property="og:description"]');
        let text = meta ? meta.content : "";

        // Fallback to page content headers (name, bio category)
        const h1 = document.querySelector('h1');
        if (h1) text += " " + h1.parentElement.innerText;

        // Also grab any visible text in the bio section
        const bioSection = document.querySelector('section main div header section');
        if (bioSection) text += " " + bioSection.innerText;

        return text;
    });

    logCallback(`Bio Text Extracted: "${bioStub.substring(0, 50)}..."`);

    logCallback('Profile filtering DISABLED. Approving everyone.', 'success');
    return true;
};

const exploreReels = async (page, keywords, logCallback) => {
    logCallback('Starting Reels Exploration...');

    // Go to Reels Feed (or generic explore if reels direct link fails)
    if (!page.url().includes('/reels/')) {
        await page.goto('https://www.instagram.com/reels/', { waitUntil: 'networkidle2' });
        await randomDelay(3000, 5000);
    }

    let reelsProcessed = 0;
    const MAX_REELS = 50; // Use a much larger limit as requested
    let noMatchCount = 0;

    while (reelsProcessed < MAX_REELS) {
        logCallback(`Watching Reel ${reelsProcessed + 1}...`);

        // 1. Watch the reel (Human behavior)
        // Random watch time: 5s to 15s
        await randomDelay(5000, 15000);

        // 2. Extract Caption/Description & Author
        const { caption, author } = await page.evaluate(() => {
            // Try common selectors for Reel CAption
            // Instagram Reels DOM is tricky and changes often.
            // We look for the main text container.

            // This selector targets the Reel text area container
            const nodes = document.querySelectorAll('div[role="button"]');
            let foundCaption = "";
            let foundAuthor = "";

            // Heuristic: Find the text content near the "Follow" button or Author Name
            // In Reels, the Author name is usually an anchor tag inside a specific structure

            // Try finding the currently active reel (center of screen usually)
            // But simplify: Just look for visible text on screen. 
            // In Reels mode, usually only one is prominent.

            const h1 = document.querySelector('h1');
            if (h1) foundCaption = h1.innerText;

            // Fallback: look for spans with text that looks like caption
            const spans = Array.from(document.querySelectorAll('span'));
            // Filter for longer text that isn't UI text
            const longSpan = spans.find(s => s.innerText.length > 20 && s.innerText.length < 300);
            if (longSpan) foundCaption += " " + longSpan.innerText;

            // Find Author
            // Look for links that are NOT hashtags/music/places
            const links = Array.from(document.querySelectorAll('a'));
            const authorLink = links.find(a => {
                const href = a.getAttribute('href');
                return href && href.startsWith('/') && !href.includes('/explore/') && !href.includes('/audio/') && !href.includes('/reels/') && href.split('/').length === 3;
            });

            if (authorLink) foundAuthor = authorLink.getAttribute('href');

            return { caption: foundCaption, author: foundAuthor };
        });

        logCallback(`Reel Caption: "${caption.substring(0, 40)}..."`);

        // 3. Keyword Check (Super Loose)
        // If NO keywords are set, we assume user wants to explore EVERYTHING (or we use generic business terms)
        const relevant = keywords.length === 0 || keywords.some(k => caption.toLowerCase().includes(k.toLowerCase()));

        if (relevant && author) {
            logCallback('Reel matches criteria! Visiting author...');

            const profileUrl = `https://www.instagram.com${author}`;
            logCallback(`Navigating to author: ${profileUrl}`);

            return profileUrl; // RETURN user to be processed by main loop (Action Chain)
        } else {
            if (relevant && !author) logCallback('Reel relevant but Author NOT found. Skipping.', 'warning');
            else logCallback('Reel not relevant. Skipping.');
            noMatchCount++;
        }

        // 5. Next Reel (Scroll Down)
        logCallback('Scrolling to next Reel...');
        await page.keyboard.press('ArrowDown');
        await randomDelay(2000, 4000);
        reelsProcessed++;

        // Safety Break
        if (!page.url().includes('/reels/')) {
            logCallback('Lost Reels context. Restarting navigation.', 'warning');
            await page.goto('https://www.instagram.com/reels/', { waitUntil: 'networkidle2' });
            await randomDelay(3000, 5000);
        }
    }

    return null; // Finished batch without finding anyone
};

module.exports = { searchByHashtag, analyzeProfile, browseProfile, exploreReels };

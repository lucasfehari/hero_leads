const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { executablePath } = require('puppeteer');
const { login } = require('./login');
const { randomDelay, smartClick, autoScroll, humanMove } = require('./utils');
const { searchByHashtag, analyzeProfile, browseProfile, exploreReels } = require('./strategies');
const { followUser, likePost, commentPost, sendDM } = require('./actions');
const { hasInteracted, recordInteraction } = require('./history_db');

puppeteer.use(StealthPlugin());

/**
 * BotEngine: The Brain of the Operation
 * Uses a State Machine approach to manage the bot's lifecycle and decision making.
 */
class BotEngine {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.config = {};
        this.logCallback = console.log;

        // State Tracking
        this.stats = {
            profilesVisited: 0,
            profilesActioned: 0,
            errors: 0
        };
    }

    /**
     * Initialize the bot and browser
     */
    async start(config, logCallback) {
        if (this.isRunning) {
            logCallback('Bot is already running.', 'warning');
            return;
        }

        this.config = config;
        this.logCallback = logCallback;
        this.isRunning = true;

        try {
            this.log('Launching browser engine...');
            this.browser = await puppeteer.launch({
                headless: false,
                executablePath: executablePath(),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-infobars',
                    '--window-size=1280,800',
                    '--disable-blink-features=AutomationControlled',
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream'
                ]
            });

            this.page = (await this.browser.pages())[0];
            await this.page.setViewport({ width: 1280, height: 800 });

            this.log('Browser online. verifying authentication...');
            const isLoggedIn = await login(this.page, this.logCallback);

            if (!isLoggedIn) {
                this.log('Authentication failed. Aborting.', 'error');
                await this.stop();
                return;
            }

            this.log('Authentication confirmed. Starting logic engine.');

            // Parse configuration
            // 3. Target List (Specific Usernames)
            let customList = [];
            if (this.config.targetListEnabled && this.config.targetList) {
                // Split by newline or comma, remove '@' and spaces
                customList = this.config.targetList
                    .split(/[\n,]+/)
                    .map(u => u.trim().replace('@', ''))
                    .filter(u => u);
            }

            // 1. Hashtags (Where to search)
            const hashtags = this.config.hashtags
                ? this.config.hashtags.split(/[, \n]+/).map(k => k.trim().replace('#', '')).filter(k => k)
                : [];

            // 2. Interest Keywords (What to filter for in Bios/Reels)
            // If empty, we might use hashtags as fallback or approve all
            const interestKeywords = this.config.interestKeywords
                ? this.config.interestKeywords.split(/[, \n]+/).map(k => k.trim()).filter(k => k)
                : hashtags; // Fallback to hashtags if no specific keywords set

            if (customList.length > 0) {
                this.log(`Target List Enabled: ${customList.length} users loaded.`);
                await this.runLoop([], [], customList);
            } else if (hashtags.length === 0 && !this.config.onlyReels) {
                this.log('No targets or hashtags provided. Cannot start search loop.', 'warning');
            } else {
                await this.runLoop(hashtags, interestKeywords, []);
            }

        } catch (error) {
            this.log(`Critical Engine Failure: ${error.message}`, 'error');
            console.error(error);
            await this.stop();
        }
    }

    /**
     * Main Automation Loop
     */
    async runLoop(keywords, interestKeywords, customList = []) {
        this.strategyState = 'hashtags'; // 'hashtags', 'reels', 'custom_list'
        const seenHashtagPosts = new Set(); // Session memory for hashtags

        let customListIndex = 0;

        while (this.isRunning) {
            try {
                if (customList.length > 0) {
                    this.strategyState = 'custom_list';
                    this.log(`Strategy: Target List Mode 🎯`);

                    if (customListIndex >= customList.length) {
                        this.log('Finished processing all users in the Target List.', 'success');
                        await this.stop();
                        break;
                    }

                    const targetUser = customList[customListIndex];
                    this.log(`[${customListIndex + 1}/${customList.length}] Targeting: @${targetUser}`);

                    // We can reuse processPost by creating a fake post URL pointing to their profile
                    // processPost is smart enough to detect it's a URL to a profile directly
                    const fakePostUrl = `https://www.instagram.com/${targetUser}/`;
                    await this.processPost(fakePostUrl);

                    customListIndex++;

                    // Human pause between actions
                    await this.humanPause('action_gap');
                } else if (keywords.length > 0 || this.config.onlyReels) {
                    // STRATEGY SWITCHER
                    // If "Only Reels" is ON, force Reels.
                    // Else: 70% chance Hashtags, 30% chance Reels (or alternate)

                    if (this.config.onlyReels) {
                        this.strategyState = 'reels';
                    } else if (Math.random() > 0.7) {
                        this.strategyState = 'reels';
                    } else {
                        this.strategyState = 'hashtags';
                    }

                    if (this.strategyState === 'reels') {
                        this.log('Strategy: Reels Exploration 🎥');
                        // Use keywords if available, otherwise pass empty array (browse all)
                        const searchKeywords = this.config.onlyReels && keywords.length === 0 ? [] : keywords;

                        const profileUrl = await exploreReels(this.page, searchKeywords, (msg, type) => this.log(msg, type));

                        if (profileUrl) {
                            // We found a lead in Reels! Process them.
                            // Mark as seen immediately so we don't process again (if we had a way to track reel URL, but we track profile)
                            await this.processPost(profileUrl);
                        }
                    } else {
                        this.log('Strategy: Hashtag Search 🔍');
                        // Existing Hashtag Logic
                        const tag = keywords[Math.floor(Math.random() * keywords.length)];
                        this.log(`Selected Hashtag: #${tag}`);
                        const posts = await searchByHashtag(this.page, tag, seenHashtagPosts, (msg, type) => this.log(msg, type));
                        this.log(`Found ${posts.length} posts for #${tag}`);

                        for (const postUrl of posts) {
                            if (!this.isRunning) break;

                            // Mark as seen immediately so we don't process again
                            seenHashtagPosts.add(postUrl);

                            await this.processPost(postUrl);

                            // Human pause between actions
                            await this.humanPause('action_gap');
                        }
                    }
                } else {
                    this.log('No keywords provided. Waiting...');
                    await randomDelay(5000, 10000);
                }

                if (this.strategyState !== 'custom_list') {
                    // Cycle Cool-down
                    this.log(`Finished current strategy cycle. Cooling down...`);
                    await randomDelay(30000, 60000);
                }
            } catch (e) {
                this.log(`Error during strategy execution: ${e.message}`, 'error');
                this.stats.errors++;
            }

            if (this.strategyState !== 'custom_list') {
                this.log('All keywords processed. Engine sleeping for 10 minutes...');
                await randomDelay(600000, 600000);
            }
        }
    }

    /**
     * Process a single post to find and interact with the author
     */
    async processPost(postUrl) {
        try {
            this.log(`Visiting Post: ${postUrl}`);
            await this.page.goto(postUrl, { waitUntil: 'networkidle2' });

            // "Reading" the post
            await randomDelay(2000, 5000);

            // STRATEGY: Find the Author
            let username = null;

            // Validation: Is this a Profile URL already?
            const profileMatch = postUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?$/);
            if (profileMatch) {
                username = profileMatch[1];
                if (['explore', 'reels', 'p', 'stories'].includes(username)) username = null; // False positives
            }

            if (!username) {
                username = await this.identifyAuthor();
            }

            if (!username) {
                this.log('Could not identify author. Skipping.', 'warning');
                return;
            }

            // PERSISTENCE CHECK: Have we met before?
            if (!this.config.ignoreHistory && hasInteracted(username, this.config.profile || 'default')) {
                this.log(`Skipping @${username} (Already interacted in history).`, 'warning');
                return;
            }

            this.log(`Target Identified: @${username}`);

            // STRATEGY: Navigate to Profile
            // We prioritize clicking the link to be human-like, but fallback to goto if needed.
            const navigated = await this.navigateToProfile(username);

            if (!navigated) {
                this.log(`Failed to navigate to @${username}. Skipping.`, 'error');
                return;
            }

            // STRATEGY: Analyze & Interact
            await this.interactWithProfile(username);

        } catch (e) {
            this.log(`Error processing post: ${e.message}`, 'error');
            this.stats.errors++;
        }
    }

    /**
     * Identifies the author of the current post using multiple strategies
     */
    async identifyAuthor() {
        // Strategy A: Metadata (High Confidence)
        let username = await this.page.evaluate(() => {
            try {
                // Check JSON-LD
                const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                for (const script of scripts) {
                    const data = JSON.parse(script.innerText);
                    if (data?.author?.identifier?.value) return data.author.identifier.value;
                }
                // Check Meta Tags
                const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
                const match = ogTitle?.match(/\(@([a-zA-Z0-9_.]+)\)/);
                if (match) return match[1];
            } catch (e) { return null; }
            return null;
        });

        if (username) return username;

        // Strategy B: Visual/Geometric Fallback (Medium Confidence)
        this.log('Metadata failed. Engaging Visual Identification...', 'warning');

        // Find the visible link most likely to be the author (Top-Left priority)
        const authorLinkHandle = await this.findAuthorLinkElement();
        if (authorLinkHandle) {
            username = await this.page.evaluate(el => el.getAttribute('href').replace(/\//g, ''), authorLinkHandle);
            return username;
        }

        return null;
    }

    /**
     * Finds the author link element on the page based on position
     */
    async findAuthorLinkElement(targetUsername = null) {
        return await this.page.evaluateHandle((target) => {
            const anchors = Array.from(document.querySelectorAll('a'));

            // Filter candidates
            const candidates = anchors.map(a => {
                const rect = a.getBoundingClientRect();
                return {
                    element: a,
                    href: a.getAttribute('href'),
                    text: a.innerText,
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                    isVisible: rect.width > 0 && rect.height > 0 &&
                        window.getComputedStyle(a).visibility !== 'hidden' &&
                        rect.top >= 0 // Must be visible in viewport
                };
            }).filter(item => {
                if (!item.isVisible) return false;
                if (!item.href || !/^\/[\w\.]+\/?$/.test(item.href)) return false; // Must be profile link

                // Exclude system paths
                const system = ['/explore/', '/reels/', '/stories/', '/p/', '/direct/', '/accounts/', '/legal/'];
                if (system.some(s => item.href.includes(s))) return false;

                // If we have a target username, must match
                if (target && !item.href.includes(`/${target}/`)) return false;

                return true;
            });

            // Sort: Top-most, then Left-most
            candidates.sort((a, b) => {
                if (Math.abs(a.y - b.y) > 20) return a.y - b.y; // Different rows
                return a.x - b.x; // Same row
            });

            return candidates.length > 0 ? candidates[0].element : null;
        }, targetUsername);
    }

    /**
     * Smartly navigates to the profile
     */
    async navigateToProfile(username) {
        // 1. Try to find the link and click it (Human way)
        try {
            const linkHandle = await this.findAuthorLinkElement(username);

            if (linkHandle && linkHandle.asElement()) {
                this.log(`Clicking profile link for @${username}...`);

                // Smart interaction
                await smartClick(this.page, linkHandle);

                // Wait for navigation
                await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 })
                    .catch(() => this.log("Navigation timeout (might be SPA transition)."));

                await randomDelay(2000, 4000); // Wait for page settle

                // Verify we are there
                if (this.page.url().includes(username)) return true;
                this.log("Click didn't take us to profile. Falling back to direct navigation.", 'warning');
            }
        } catch (e) {
            this.log(`Smart nav failed: ${e.message}`, 'warning');
        }

        // 2. Fallback: Direct Navigation
        try {
            await this.page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
            await randomDelay(3000, 5000);
            return this.page.url().includes(username);
        } catch (e) {
            return false;
        }
    }

    /**
     * Interact with the profile
     */
    async interactWithProfile(username) {
        const keywords = this.config.keywords ? this.config.keywords.split(',') : [];

        // 1. Analyze
        const context = await analyzeProfile(this.page, username, keywords, this.logCallback);

        if (!context) {
            this.log(`Skipping @${username} (Criteria Not Met).`);
            return;
        }

        this.log(`Criteria Met for @${username}. Initiating Interaction Sequence.`, 'success');

        // 2. Browse (Human Behavior)
        await browseProfile(this.page, username, this.logCallback);

        // Long pause after browsing before following
        await this.humanPause('contemplation');

        // 3. Follow
        const followed = await followUser(this.page);
        if (followed) this.log(`Successfully Followed @${username}`, 'success');

        // CRITICAL: Long pause to avoid "bot-like" behavior detection
        await this.humanPause('action_gap');

        // 4. Like & Comment (if configured)
        // Split by pipe '|' to allow commas in the actual message
        const comments = this.config.commentTemplate ? this.config.commentTemplate.split('|') : [];
        if (comments.length > 0) {
            // Must find a post to comment on
            const latestPost = await this.page.$('a[href*="/p/"]');
            if (latestPost) {
                await smartClick(this.page, latestPost);
                await randomDelay(3000, 5000); // Read post

                // Chance to look at comments
                if (Math.random() > 0.5) {
                    await autoScroll(this.page);
                    await randomDelay(2000, 4000);
                }

                // Pick random comment
                const commentText = comments[Math.floor(Math.random() * comments.length)].trim();
                this.log(`Commenting: "${commentText}"`);

                const commented = await commentPost(this.page, commentText);
                if (commented) this.log('Comment Posted.', 'success');

                await randomDelay(2000, 3000);
                await this.page.keyboard.press('Escape'); // Close modal
                await randomDelay(3000, 5000);
            }
        }

        // 5. DM (if configured)
        if (this.config.dmTemplate) {
            // Support Multiple Messages per Person using ';;;' separator
            // Example: "Hi! ;;; How are you?" -> Sends "Hi!", waits, then sends "How are you?"

            // First, pick a VARIATION from the pipe '|' Spintax
            const dms = this.config.dmTemplate.split('|');
            const chosenTemplate = dms[Math.floor(Math.random() * dms.length)].trim();

            // Now check if this chosen template has multiple parts (;;;)
            const messagesToSend = chosenTemplate.split(';;;').map(m => m.trim()).filter(m => m);

            this.log("Preparing to send DM... (Waiting for safety)");
            await this.humanPause('action_gap_long'); // Extra long pause before DM

            this.log(`Sending DM(s) to @${username}...`);

            let allSent = true;
            for (const msg of messagesToSend) {
                const sent = await sendDM(this.page, username, msg, this.config.audios);
                if (!sent) {
                    allSent = false;
                    break;
                }
                // Small pause between multiple messages to same person
                if (messagesToSend.length > 1) await randomDelay(2000, 4000);
            }

            if (allSent) {
                this.log(`DM Sequence Sent to @${username}`, 'success');
                await randomDelay(10000, 20000); // Big pause after DM sequence
            } else {
                this.log(`DM failed or restricted for @${username}`, 'warning');
            }
        }

        // Record the interaction in DB to never visit again
        recordInteraction(username, ['processed'], this.config.profile || 'default');
        this.stats.profilesActioned++;

        // ROTATION CHECK
        if (this.config.rotationEnabled && this.stats.profilesActioned >= (this.config.rotationLimit || 10)) {
            await this.rotateProfile();
        }
    }

    /**
     * Helpers
     */
    async humanPause(type = 'default') {
        let min = 2000, max = 5000;
        if (type === 'action_gap') { min = 4000; max = 8000; }
        if (type === 'action_gap_long') { min = 8000; max = 15000; }
        if (type === 'contemplation') { min = 5000; max = 10000; }
        if (type === 'post_processing') { min = 15000; max = 35000; }

        await randomDelay(min, max);
    }

    async stop() {
        this.isRunning = false;
        this.log('🛑 Stopping bot... (Finishing current action)');
        // We don't force exit process.exit() because it kills the server.
        // The loops check `this.isRunning` and will break naturally.
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
        this.log('Bot Engine Shutdown Complete.');
    }

    log(msg, type = 'info') {
        if (this.logCallback) this.logCallback(msg, type);
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }
}

// Singleton Instance for export, but new instance per start call
const engine = new BotEngine();

module.exports = {
    start: (config, log) => engine.start(config, log),
    stop: () => engine.stop()
};

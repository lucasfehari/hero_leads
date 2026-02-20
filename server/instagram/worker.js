/**
 * Instagram Publisher Worker
 *
 * Uses the SAME robust selector strategy as the existing Instagram scraper bot:
 *  - Multi-language text dictionaries (PT, EN, ES, FR, IT, DE) instead of fragile CSS classes
 *  - evaluateHandle() with textContent search to find buttons by what they SAY
 *  - el.closest('button') / el.closest('div[role="button"]') traversal from SVG → clickable
 *  - humanMove (Bézier curve mouse) + smartClick + humanType (per-key random delay)
 *  - Observation loops: verify state CHANGED rather than assuming success
 */

const { db } = require('./db');
const path = require('path');
const fs = require('fs');

// ── Re-use same utils as scraper bot ──────────────────────────────────────
const { randomDelay, humanType, humanMove, smartClick } = require('../bot/utils');

// ── Multi-language dictionaries (same pattern as actions.js) ──────────────
const TEXTS = {
    NEW_POST: ['new post', 'nova publicação', 'nuevo post', 'nouvelle publication', 'nuova pubblicazione', 'neues post', 'criar'],
    NEXT: ['next', 'avançar', 'siguiente', 'suivant', 'weiter', 'avanti', 'próximo'],
    SHARE: ['share', 'compartilhar', 'compartir', 'partager', 'teilen', 'condividi', 'publicar'],
    OK: ['ok', 'okay', 'done', 'concluído', 'listo', 'terminé', 'ok'],
    NOT_NOW: ['not now', 'agora não', 'ahora no', 'plus tard', 'jetzt nicht', 'non ora'],
};

let io = null;
let workerInterval = null;

// ── Worker lifecycle ───────────────────────────────────────────────────────
function start(socketIo) {
    io = socketIo;
    console.log('[IG Worker] Started. Checking every 60 seconds.');
    checkAndPublish();
    workerInterval = setInterval(checkAndPublish, 60 * 1000);
}

function stop() {
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
        console.log('[IG Worker] Stopped.');
    }
}

// ── Main check loop ────────────────────────────────────────────────────────
async function checkAndPublish() {
    const now = new Date().toISOString();

    const duePosts = db.prepare(`
        SELECT p.*, a.cookie_file, a.name as account_name
        FROM ig_posts p
        JOIN ig_accounts a ON p.account_id = a.id
        WHERE p.status = 'scheduled'
          AND p.scheduled_at IS NOT NULL
          AND p.scheduled_at <= ?
        ORDER BY p.scheduled_at ASC
        LIMIT 5
    `).all(now);

    if (duePosts.length === 0) return;

    console.log(`[IG Worker] Found ${duePosts.length} post(s) to publish.`);
    for (const post of duePosts) {
        await publishPost(post);
    }
}

// ── Core publisher ─────────────────────────────────────────────────────────
async function publishPost(post) {
    const log = (msg, level = 'info') => {
        console.log(`[IG Worker] Post #${post.id}: ${msg}`);
        db.prepare('INSERT INTO ig_post_logs (post_id, message, level) VALUES (?, ?, ?)').run(post.id, msg, level);
        if (io) io.emit('ig-worker-log', { post_id: post.id, message: msg, level, timestamp: new Date().toISOString() });
    };

    db.prepare("UPDATE ig_posts SET status = 'publishing' WHERE id = ?").run(post.id);
    if (io) io.emit('ig-post-status', { id: post.id, status: 'publishing' });

    log(`Starting publish — type: ${post.post_type || 'single'}, account: "${post.account_name}"`);

    // Parse media_files array (new) or fall back to legacy single media_path
    let mediaFiles = [];
    try { mediaFiles = JSON.parse(post.media_files || '[]'); } catch { mediaFiles = []; }
    if (mediaFiles.length === 0 && post.media_path) {
        mediaFiles = [{ path: post.media_path, mediaType: post.media_type || 'image' }];
    }

    // Pre-flight checks
    if (!post.cookie_file || !fs.existsSync(post.cookie_file)) {
        return fail(post, log, 'Cookie file not found — reconnect the account.');
    }
    if (mediaFiles.length === 0) {
        return fail(post, log, 'No media files attached to this post.');
    }
    for (const f of mediaFiles) {
        if (!f.path || !fs.existsSync(f.path)) {
            return fail(post, log, `Media file not found on disk: ${f.path}`);
        }
    }

    let browser = null;
    try {
        const puppeteer = require('puppeteer-extra');
        const Stealth = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(Stealth());
        const { executablePath } = require('puppeteer');

        const cookies = JSON.parse(fs.readFileSync(post.cookie_file, 'utf-8'));

        browser = await puppeteer.launch({
            headless: false,   // ← visible window for debugging — change back to true for production
            executablePath: executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900', '--start-maximized']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setCookie(...cookies);

        // ── Step 1: Load Instagram, verify session ──────────────────────────
        log('Navigating to Instagram...');
        await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        await randomDelay(2000, 4000);
        await dismissPopup(page);

        const isLoggedIn = await page.evaluate(() => !document.querySelector('input[name="username"]'));
        if (!isLoggedIn) {
            return fail(post, log, 'Session expired — please reconnect the account.');
        }
        log('Session valid ✓');

        // ── Step 2: Click "New Post" ─────────────────────────────────────────
        log('Opening new post dialog...');

        // The + icon / "New Post" SVG — try aria-label first, then text search
        const newPostEl = await page.evaluateHandle(() => {
            const svgLabels = ['New post', 'Nova publicação', 'Nuevo post', 'Nouvelle publication', 'Nuova pubblicazione', 'Neuer Beitrag'];
            for (const label of svgLabels) {
                const svg = document.querySelector(`svg[aria-label="${label}"]`);
                if (svg) return svg.closest('a') || svg.closest('button') || svg.closest('div[role="button"]');
            }
            return null;
        });

        if (!newPostEl || !newPostEl.asElement()) {
            await page.screenshot({ path: '/tmp/ig_worker_debug_newpost.png' }).catch(() => { });
            return fail(post, log, 'Could not find "New Post" button — check debug screenshot.');
        }
        await humanMove(page);
        await newPostEl.click();
        await randomDelay(1500, 2500);

        // ── Step 2b: Handle type submenu (Post / Story / Reel / Live) ───────
        // Screenshot confirmed the dropdown opens with Post / Live video / Ad items.
        // We must wait for the dropdown, then click "Post" using first-text-node matching
        // (the items contain SVG children whose text confuses a simple textContent check).
        log('Waiting for Create dropdown (Post / Live video / Ad)...');
        await randomDelay(1000, 1500);

        const POST_MENU_TEXTS = ['post', 'publicação', 'publicar', 'crear publicación', 'beitrag'];
        const clickedPost = await page.evaluate((texts) => {
            // Use TreeWalker to get ONLY text nodes — ignores SVG aria-label / child text
            function firstTextOf(el) {
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
                while (walker.nextNode()) {
                    const t = walker.currentNode.textContent.trim();
                    if (t.length > 0) return t.toLowerCase();
                }
                return '';
            }
            const candidates = Array.from(document.querySelectorAll(
                'a, button, div[role="menuitem"], li[role="menuitem"], span[role="link"]'
            ));
            const match = candidates.find(el => {
                const t = firstTextOf(el);
                return texts.some(candidate => t === candidate || t.startsWith(candidate + '\n') || t.startsWith(candidate + ' '));
            });
            if (match) { match.click(); return true; }
            return false;
        }, POST_MENU_TEXTS);

        if (clickedPost) {
            log('Clicked "Post" in dropdown.');
        } else {
            log('Could not find "Post" option — proceeding (may already be on upload screen).', 'info');
        }

        // Wait for the "Create new post" / upload modal to appear
        log('Waiting for upload modal...');
        await randomDelay(1500, 2500);
        // The modal usually has a dialog role or contains an h1/h2 with "Create new post"
        await page.waitForFunction(() => {
            return document.querySelector('div[role="dialog"]') !== null
                || document.querySelector('input[type="file"]') !== null;
        }, { timeout: 10000 }).catch(() => { });
        await randomDelay(500, 1000);

        // ── Step 3: Inject file(s) via the hidden input[type="file"] ────────
        log(`Uploading ${mediaFiles.length} file(s)...`);

        // Strategy: The input[type="file"] is ALWAYS in the DOM on Instagram,
        // but it's hidden (display:none or visibility:hidden). We expose it briefly,
        // use uploadFile(), then proceed. This avoids the native OS file-picker dialog.
        const exposed = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
            if (inputs.length === 0) return false;
            inputs.forEach(inp => {
                inp.style.display = 'block';
                inp.style.visibility = 'visible';
                inp.style.opacity = '1';
                inp.style.width = '1px';
                inp.style.height = '1px';
                inp.style.position = 'fixed';
                inp.style.top = '0';
                inp.style.left = '0';
            });
            return true;
        });

        if (!exposed) {
            // Last resort: click the "Select from computer" button to trigger the input
            log('input[type="file"] not in DOM yet — clicking "Select from computer"...', 'info');
            const SELECT_TEXTS = ['select from computer', 'selecionar do computador', 'seleccionar del equipo', 'choisir sur l\'ordinateur', 'vom computer auswählen'];
            const selectBtn = await findButtonByText(page, SELECT_TEXTS);
            if (selectBtn && selectBtn.asElement()) {
                // intercept the file chooser event instead of letting it open a real dialog
                const [chooser] = await Promise.all([
                    page.waitForFileChooser({ timeout: 5000 }).catch(() => null),
                    selectBtn.click(),
                ]);
                if (chooser) {
                    await chooser.accept(mediaFiles.map(f => f.path));
                    log(`${mediaFiles.length} file(s) accepted via file chooser.`);
                    await randomDelay(3000, 5000);
                } else {
                    // No file chooser intercepted — try exposing input again after button click
                    await randomDelay(1000, 2000);
                    await page.evaluate(() => {
                        document.querySelectorAll('input[type="file"]').forEach(inp => {
                            inp.style.display = 'block'; inp.style.opacity = '1';
                        });
                    });
                    const inp2 = await page.$('input[type="file"]');
                    if (!inp2) {
                        await page.screenshot({ path: '/tmp/ig_worker_debug_upload.png' }).catch(() => { });
                        return fail(post, log, 'File input not found after button click — check debug screenshot.');
                    }
                    await inp2.uploadFile(...mediaFiles.map(f => f.path));
                    log(`${mediaFiles.length} file(s) uploaded via exposed input.`);
                    await randomDelay(3000, 5000);
                }
            } else {
                await page.screenshot({ path: '/tmp/ig_worker_debug_upload.png' }).catch(() => { });
                return fail(post, log, 'Upload dialog not found — check debug screenshot at /tmp/ig_worker_debug_upload.png');
            }
        } else {
            // Direct uploadFile into exposed input
            const input = await page.$('input[type="file"]');
            await input.uploadFile(...mediaFiles.map(f => f.path));
            log(`${mediaFiles.length} file(s) uploaded via exposed input.`);
            await randomDelay(3000, 5000);
        }


        // ── Step 4: Navigate through modal steps (Crop → Filter → Caption) ──
        log('Proceeding through modal steps (Crop → Filter → Caption)...');

        // Find-and-click atomically INSIDE the active dialog only.
        // Scoping to dialog prevents accidentally clicking buttons on the background page
        // (e.g. the social "Share to WhatsApp" button on feed posts behind the modal).
        const clickByText = async (textList) => {
            return page.evaluate((texts) => {
                function firstText(el) {
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
                    while (walker.nextNode()) {
                        const t = walker.currentNode.textContent.trim();
                        if (t.length > 0) return t.toLowerCase();
                    }
                    return '';
                }
                // Scope to the topmost open dialog — never touch background page buttons
                const dialog = document.querySelector('div[role="dialog"]');
                const scope = dialog || document.body;
                const candidates = Array.from(scope.querySelectorAll('button, div[role="button"], a[role="button"]'));
                const match = candidates.find(el => {
                    const t = firstText(el);
                    return texts.some(c => t === c.toLowerCase() || t.includes(c.toLowerCase()));
                });
                if (match) { match.click(); return true; }
                return false;
            }, textList);
        };

        // Dedicated publish click — targets ONLY the top-right header button of the
        // Create Post modal ("Share"/"Compartilhar"), NOT the social-share popup.
        const clickPublish = async () => {
            const PUBLISH_TEXTS = ['share', 'compartilhar', 'compartir', 'partager', 'condividi', 'teilen', 'publish', 'publicar'];
            return page.evaluate((texts) => {
                function firstText(el) {
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
                    while (walker.nextNode()) {
                        const t = walker.currentNode.textContent.trim();
                        if (t.length > 0) return t.toLowerCase();
                    }
                    return '';
                }
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return false;

                // All buttons/links in dialog — prefer EXACT text match only
                const allBtns = Array.from(dialog.querySelectorAll('button, div[role="button"], a'));
                const exact = allBtns.find(el => texts.some(t => firstText(el) === t));
                if (exact) { exact.click(); return true; }
                return false;
            }, PUBLISH_TEXTS);
        };


        // Each Next click transitions the modal — retry up to 4 times total
        for (let step = 0; step < 4; step++) {
            // Small wait so the transition finishes before we search
            await randomDelay(1800, 3000);
            const clicked = await clickByText(TEXTS.NEXT, 'Next');
            if (!clicked) {
                log(`No "Next" button on step ${step + 1} — assuming caption screen reached.`);
                break;
            }
            log(`Clicked "Next" (step ${step + 1}).`);
        }

        // ── Step 5: Write caption + hashtags ────────────────────────────────
        log('Entering caption...');
        const fullCaption = buildCaption(post.caption, post.hashtags);

        // Screenshot BEFORE caption so we can see what screen we're on
        await page.screenshot({ path: '/tmp/ig_worker_debug_precaption.png' }).catch(() => { });
        log('Pre-caption screenshot saved to /tmp/ig_worker_debug_precaption.png');

        // Retry up to 4 times with increasing wait — the caption screen may take
        // a moment to render after the last "Next" transition.
        let captionClicked = false;
        for (let attempt = 0; attempt < 4; attempt++) {
            await randomDelay(1200, 2000);
            captionClicked = await page.evaluate(() => {
                // Try exact aria-label matches first
                const labels = [
                    'Write a caption\u2026', 'Write a caption...', 'Escreva uma legenda\u2026',
                    'Escreva uma legenda...', 'Escribe un pie de foto\u2026', 'Ajouter une l\u00e9gende\u2026',
                    'Aggiungi una didascalia\u2026', 'F\u00fcge eine Bildunterschrift hinzu\u2026',
                    'Escreva uma legenda', 'Write a caption',
                ];
                for (const label of labels) {
                    const el = document.querySelector(`[aria-label="${label}"]`);
                    if (el) { el.focus(); el.click(); return true; }
                }
                // Partial aria-label match (handles locale variations we haven't seen)
                const partials = ['legenda', 'caption', 'pie de foto', 'légende', 'didascalia', 'bildunterschrift'];
                for (const part of partials) {
                    const el = document.querySelector(`[aria-label*="${part}"]`);
                    if (el) { el.focus(); el.click(); return true; }
                }
                // Broadest fallback: any contenteditable inside the dialog
                const dialog = document.querySelector('div[role="dialog"]');
                if (dialog) {
                    const ce = dialog.querySelector('[contenteditable="true"]');
                    if (ce) { ce.focus(); ce.click(); return true; }
                }
                return false;
            });
            if (captionClicked) {
                log(`Caption box found (attempt ${attempt + 1}).`);
                break;
            }
            log(`Caption box not found on attempt ${attempt + 1}, retrying...`, 'info');
        }

        if (captionClicked && fullCaption.length > 0) {
            await randomDelay(400, 800);
            await page.keyboard.type(fullCaption, { delay: 80 });
            log(`Caption typed (${fullCaption.length} chars).`);
            await randomDelay(1000, 1800);
        } else if (!captionClicked) {
            log('Caption box not found after retries — check /tmp/ig_worker_debug_precaption.png', 'warning');
        }
        await randomDelay(1000, 1500);


        // ── Step 6: Click Share/Publish ──────────────────────────────────────
        // Screenshot BEFORE share so we can see the caption screen state
        await page.screenshot({ path: '/tmp/ig_worker_debug_caption.png' }).catch(() => { });
        log('Clicking Publish in modal header... (screenshot: /tmp/ig_worker_debug_caption.png)');
        const shared = await clickPublish();
        if (!shared) {
            return fail(post, log, 'Could not find "Share" button — see /tmp/ig_worker_debug_caption.png');
        }
        await randomDelay(1500, 2500);
        // Screenshot AFTER share to see confirmation / error
        await page.screenshot({ path: '/tmp/ig_worker_debug_after_share.png' }).catch(() => { });
        log('Post-share screenshot saved to /tmp/ig_worker_debug_after_share.png');

        // ── Step 7: Observe publication success ──────────────────────────────
        log('Waiting for publication confirmation...');
        const published = await observePublicationSuccess(page, log);

        if (published) {
            log('✅ Post published successfully!', 'success');
            db.prepare("UPDATE ig_posts SET status = 'published', published_at = datetime('now'), error_msg = NULL WHERE id = ?").run(post.id);
            if (io) io.emit('ig-post-status', { id: post.id, status: 'published' });
        } else {
            await page.screenshot({ path: '/tmp/ig_worker_debug_timeout.png' }).catch(() => { });
            return fail(post, log, 'Publication timed out — see /tmp/ig_worker_debug_timeout.png for current screen state');
        }


    } catch (err) {
        log(`❌ Unexpected error: ${err.message}`, 'error');
        fail(post, log, err.message);
    } finally {
        if (browser) {
            try { await browser.close(); } catch { /* ignore */ }
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find a button/clickable element by its visible text content.
 * Checks a list of translated texts — same pattern as TEXTS.FOLLOW in actions.js.
 */
async function findButtonByText(page, texts) {
    return page.evaluateHandle((textList) => {
        const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]'));
        return candidates.find(el => {
            const t = el.textContent.toLowerCase().trim();
            return textList.some(candidate => t === candidate.toLowerCase() || t.includes(candidate.toLowerCase()));
        }) || null;
    }, texts);
}

/**
 * Wait for a CSS selector to appear, with a timeout (ms).
 * Returns the element handle or null.
 */
async function waitForElement(page, selector, timeout = 10000) {
    try {
        await page.waitForSelector(selector, { timeout });
        return page.$(selector);
    } catch {
        return null;
    }
}

/**
 * Dismiss "Turn on Notifications" / "Add to Home Screen" popups
 * using the "Not Now" multi-language dictionary.
 */
async function dismissPopup(page) {
    try {
        const notNowBtn = await page.evaluateHandle((texts) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => texts.some(t => b.textContent.toLowerCase().includes(t))) || null;
        }, TEXTS.NOT_NOW);

        if (notNowBtn && notNowBtn.asElement()) {
            await notNowBtn.click();
            await randomDelay(800, 1500);
        }
    } catch { /* ignore */ }
}

/**
 * Observe publication success.
 * Instagram shows a checkmark, "Your post has been shared", or similar text.
 * Also accepts: the dialog closes, or we land on a post URL.
 */
async function observePublicationSuccess(page, log) {
    const SUCCESS_TEXTS = [
        'your post has been shared', 'sua publicação foi compartilhada',
        'tu publicación ha sido compartida', 'votre publication a été partagée',
        'il tuo post è stato condiviso', 'dein beitrag wurde geteilt',
        'post shared', 'post compartilhado', 'publicado'
    ];

    const deadline = Date.now() + 90000; // 90s max (video/carousel processing can be slow)

    while (Date.now() < deadline) {
        // 1. Check for success text on the page
        const found = await page.evaluate((successTexts) => {
            const allText = document.body.innerText.toLowerCase();
            return successTexts.some(t => allText.includes(t));
        }, SUCCESS_TEXTS);

        if (found) return true;

        // 2. Check if we navigated to a post URL (p/* or reels/*)
        const url = page.url();
        if (url.match(/\/p\/|\/reels\//)) return true;

        // 3. Check if the modal has closed (no more dialog)
        const modalGone = await page.evaluate(() => !document.querySelector('div[role="dialog"]'));
        if (modalGone) return true;

        await randomDelay(1500, 2000);
        log('Waiting for confirmation...', 'info');
    }

    return false;
}

/**
 * Mark a post as failed and emit socket event.
 */
function fail(post, log, reason) {
    log(`❌ ${reason}`, 'error');
    db.prepare("UPDATE ig_posts SET status = 'error', error_msg = ? WHERE id = ?").run(reason, post.id);
    if (io) io.emit('ig-post-status', { id: post.id, status: 'error', error: reason });
}

/**
 * Combine caption and hashtags into the final text.
 */
function buildCaption(caption, hashtags) {
    const parts = [];
    if (caption && caption.trim()) parts.push(caption.trim());
    if (hashtags && hashtags.trim()) parts.push(hashtags.trim());
    return parts.join('\n\n');
}

module.exports = { start, stop };

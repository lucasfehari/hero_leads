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

// ── Instagram Graph API (método do GoHighLevel) ───────────────────────────
const graphApi = require('./graph_api');
const { openTunnel, closeTunnel, buildPublicMediaUrl } = require('./tunnel');

// ── Re-use same utils as scraper bot (para fallback Puppeteer) ────────────
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

    // Query inclui os campos de API (ig_user_id, access_token, publish_method)
    // para decidir se usa Graph API ou Puppeteer
    const duePosts = db.prepare(`
        SELECT p.*, a.cookie_file, a.name as account_name,
               a.ig_user_id, a.access_token, a.publish_method
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

    log(`Starting publish — type: ${post.post_type || 'single'}, account: "${post.account_name}", method: ${post.publish_method || 'puppeteer'}`);

    // Parse media_files array (new) or fall back to legacy single media_path
    let mediaFiles = [];
    try { mediaFiles = JSON.parse(post.media_files || '[]'); } catch { mediaFiles = []; }
    if (mediaFiles.length === 0 && post.media_path) {
        mediaFiles = [{ path: post.media_path, mediaType: post.media_type || 'image' }];
    }

    // Verificar se os arquivos de mídia existem no disco
    if (mediaFiles.length === 0) {
        return fail(post, log, 'No media files attached to this post.');
    }
    for (const f of mediaFiles) {
        if (!f.path || !fs.existsSync(f.path)) {
            return fail(post, log, `Media file not found on disk: ${f.path}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // GRAPH API PATH — Método do GoHighLevel (legenda como parâmetro JSON)
    // Se a conta tem ig_user_id + access_token + publish_method='api',
    // usa a Instagram Graph API em vez do Puppeteer.
    // ══════════════════════════════════════════════════════════════════════
    if (post.publish_method === 'api' && post.ig_user_id && post.access_token) {
        log('📡 Usando Instagram Graph API para publicação...');

        try {
            // 1. Abrir tunnel para expor as mídias locais com URL pública
            log('Abrindo tunnel para URLs públicas de mídia...');
            const tunnelBaseUrl = await openTunnel();
            log(`Tunnel aberto: ${tunnelBaseUrl}`);

            // 2. Construir array de mídias com URLs públicas
            const publicMediaItems = mediaFiles.map(f => {
                // Extrair o filename do path absoluto (ex: 123456-image.jpg)
                const filename = f.filename || f.path.split(/[/\\]/).pop();
                return {
                    url: buildPublicMediaUrl(tunnelBaseUrl, filename),
                    mediaType: f.mediaType || 'image',
                };
            });

            log(`Mídias preparadas: ${publicMediaItems.map(m => m.url).join(', ')}`);

            // 3. Montar caption completa (legenda + hashtags)
            const fullCaption = buildCaption(post.caption, post.hashtags);
            log(`Caption: "${fullCaption.substring(0, 50)}..." (${fullCaption.length} chars)`);

            // 4. Publicar via Graph API
            const result = await graphApi.publishPost({
                igUserId: post.ig_user_id,
                accessToken: post.access_token,
                caption: fullCaption,
                postType: post.post_type || 'single',
                mediaItems: publicMediaItems,
                log,
            });

            // 5. Fechar tunnel após publicação
            await closeTunnel();

            if (result.success) {
                log(`✅ Post publicado via Graph API! Media ID: ${result.mediaId}`, 'success');
                db.prepare("UPDATE ig_posts SET status = 'published', published_at = datetime('now'), error_msg = NULL WHERE id = ?").run(post.id);
                if (io) io.emit('ig-post-status', { id: post.id, status: 'published' });
            } else {
                return fail(post, log, `Graph API: ${result.error}`);
            }

            return; // Publicação via API concluída — NÃO entra no fluxo Puppeteer

        } catch (apiErr) {
            await closeTunnel();
            return fail(post, log, `Graph API error: ${apiErr.message}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PUPPETEER PATH — Fallback para contas sem API configurada
    // ══════════════════════════════════════════════════════════════════════
    log('🌐 Usando Puppeteer (browser automation) — conta sem API configurada.');

    // Pre-flight check para Puppeteer: precisa de cookie file
    if (!post.cookie_file || !fs.existsSync(post.cookie_file)) {
        return fail(post, log, 'Cookie file not found — reconnect the account or configure Graph API.');
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
            return fail(post, log, 'Could not find "New Post" button. Verify that Instagram is in the expected language.');
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
                        return fail(post, log, 'File input not found after button click.');
                    }
                    await inp2.uploadFile(...mediaFiles.map(f => f.path));
                    log(`${mediaFiles.length} file(s) uploaded via exposed input.`);
                    await randomDelay(3000, 5000);
                }
            } else {
                return fail(post, log, 'Upload dialog not found. Try again.');
            }
        } else {
            // Direct uploadFile into exposed input
            const input = await page.$('input[type="file"]');
            await input.uploadFile(...mediaFiles.map(f => f.path));
            log(`${mediaFiles.length} file(s) uploaded via exposed input.`);
            await randomDelay(3000, 5000);
        }

        // ── Step 3b: Set crop to "Original" ─────────────────────────────────
        // After upload Instagram defaults to 1:1 crop (zoomed). We must set it to Original.
        log('Waiting for Crop / Expand icon to appear...');

        const waitForCropIcon = async () => {
            const start = Date.now();
            while (Date.now() - start < 10000) {
                const found = await page.evaluate(() => {
                    const expandLabels = ['Expandir', 'Expand', 'Expandir/reduzir', 'Expand/collapse'];
                    for (const label of expandLabels) {
                        if (document.querySelector(`svg[aria-label="${label}"], button[aria-label="${label}"]`)) return 'expand';
                    }
                    const cropLabels = ['Selecionar corte', 'Select crop', 'Seleccionar recorte', 'Sélectionner le recadrage', 'Ritaglia', 'Zuschneiden'];
                    for (const label of cropLabels) {
                        if (document.querySelector(`svg[aria-label="${label}"], button[aria-label="${label}"]`)) return 'menu';
                    }
                    return null;
                });
                if (found) return found;
                await new Promise(r => setTimeout(r, 500));
            }
            return null;
        };

        const cropType = await waitForCropIcon();

        if (cropType) {
            await randomDelay(1500, 2500); // Slower human reaction time before clicking the crop icon
            
            await page.evaluate((type) => {
                const expandLabels = ['Expandir', 'Expand', 'Expandir/reduzir', 'Expand/collapse'];
                const cropLabels = ['Selecionar corte', 'Select crop', 'Seleccionar recorte', 'Sélectionner le recadrage', 'Ritaglia', 'Zuschneiden'];
                const labels = type === 'expand' ? expandLabels : cropLabels;
                for (const label of labels) {
                    const el = document.querySelector(`svg[aria-label="${label}"], button[aria-label="${label}"]`);
                    if (el) {
                        const btn = el.closest('button') || el.closest('div[role="button"]') || el.parentElement;
                        if (btn) btn.click();
                        return;
                    }
                }
            }, cropType);
            
            if (cropType === 'menu') {
                log('Crop menu clicked. Waiting for "Original" option...');
                
                let originalFound = false;
                const startOrig = Date.now();
                while (Date.now() - startOrig < 6000) {
                    originalFound = await page.evaluate(() => {
                        const origLabels = ['Ícone de contorno de foto', 'Photo outline icon', 'Ícono de esquema de foto', 'Ícone de esboço de foto', 'Icône contour photo', 'Original'];
                        for (const label of origLabels) {
                            if (document.querySelector(`svg[aria-label="${label}"], button[aria-label="${label}"]`)) return true;
                        }
                        const spans = Array.from(document.querySelectorAll('span, div, button'));
                        if (spans.some(el => el.textContent.trim().toLowerCase() === 'original')) return true;
                        return false;
                    });
                    if (originalFound) break;
                    await new Promise(r => setTimeout(r, 500));
                }
                
                if (originalFound) {
                    await randomDelay(1500, 2500); // Reaction time to click Original
                    await page.evaluate(() => {
                        const origLabels = ['Ícone de contorno de foto', 'Photo outline icon', 'Ícono de esquema de foto', 'Ícone de esboço de foto', 'Icône contour photo', 'Original'];
                        for (const label of origLabels) {
                            const el = document.querySelector(`svg[aria-label="${label}"], button[aria-label="${label}"]`);
                            if (el) {
                                const btn = el.closest('button') || el.closest('div[role="button"]') || el.parentElement;
                                if (btn) { btn.click(); return; }
                            }
                        }
                        const spans = Array.from(document.querySelectorAll('span, div, button'));
                        const orig = spans.find(el => el.textContent.trim().toLowerCase() === 'original');
                        if (orig) orig.click();
                    });
                    log('Selected Original crop.');
                } else {
                    log('Original option not found in time.', 'warning');
                }
                
                await randomDelay(1500, 2000); // Wait after selecting crop
                
                // Close the crop panel by clicking the crop icon again
                await page.evaluate(() => {
                    const cropLabels = ['Selecionar corte', 'Select crop', 'Seleccionar recorte', 'Sélectionner le recadrage', 'Ritaglia', 'Zuschneiden'];
                    for (const label of cropLabels) {
                        const el = document.querySelector(`svg[aria-label="${label}"], button[aria-label="${label}"]`);
                        if (el) {
                            const btn = el.closest('button') || el.closest('div[role="button"]') || el.parentElement;
                            if (btn) btn.click();
                            return;
                        }
                    }
                });
                await randomDelay(1500, 2000); // Wait after closing panel
            } else {
                log('Clicked Expand button directly (Reels mode).');
                await randomDelay(1500, 2500);
            }
        } else {
            log('Crop icon not found — skipping crop step.', 'info');
        }

        // ── Step 4: Navigate through modal steps (Crop → Filter → Caption) ──
        log('Proceeding through modal steps (Crop → Filter → Caption)...');

        // Human-like Wait: Observes the DOM until "Next", "Share" or "Caption box" appears
        const waitForNextOrCaption = async () => {
            const start = Date.now();
            while (Date.now() - start < 15000) { // Up to 15s wait for UI to update
                const state = await page.evaluate((textsNext, textsShare) => {
                    const dialog = document.querySelector('div[role="dialog"]') || document.body;
                    const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    let hasNext = false;
                    let hasShare = false;
                    while ((node = walker.nextNode())) {
                        const t = node.nodeValue.trim().toLowerCase();
                        if (t.length > 0) {
                            if (textsNext.some(c => t === c.toLowerCase() || t === c.toLowerCase() + ' ')) hasNext = true;
                            if (textsShare.some(c => t === c.toLowerCase())) hasShare = true;
                        }
                    }
                    
                    let hasCaption = false;
                    const labels = [
                        'Write a caption\u2026', 'Write a caption...', 'Escreva uma legenda\u2026',
                        'Escreva uma legenda...', 'Escribe un pie de foto\u2026', 'Ajouter une l\u00e9gende\u2026',
                        'Aggiungi una didascalia\u2026', 'F\u00fcge eine Bildunterschrift hinzu\u2026',
                        'Escreva uma legenda', 'Write a caption',
                    ];
                    for (const label of labels) {
                        if (dialog.querySelector(`[aria-label="${label}"]`)) hasCaption = true;
                    }
                    const partials = ['legenda', 'caption', 'pie de foto', 'légende', 'didascalia', 'bildunterschrift'];
                    for (const part of partials) {
                        if (dialog.querySelector(`[aria-label*="${part}"]`)) hasCaption = true;
                    }
                    if (dialog.querySelector('[contenteditable="true"]')) hasCaption = true;
                    
                    return { hasNext, hasShare, hasCaption };
                }, TEXTS.NEXT, TEXTS.SHARE);
                
                if (state.hasCaption || state.hasShare) return 'caption_or_share';
                if (state.hasNext) return 'next';
                
                await new Promise(r => setTimeout(r, 500));
            }
            return 'timeout';
        };

        // Find-and-click atomically INSIDE the active dialog only.
        // Scoping to dialog prevents accidentally clicking buttons on the background page
        // (e.g. the social "Share to WhatsApp" button on feed posts behind the modal).
        const clickByText = async (textList) => {
            return page.evaluate((texts) => {
                const dialog = document.querySelector('div[role="dialog"]') || document.body;
                const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT, null, false);
                let node;
                const matches = [];
                while ((node = walker.nextNode())) {
                    const t = node.nodeValue.trim().toLowerCase();
                    if (t.length > 0 && texts.some(c => t === c.toLowerCase() || t === c.toLowerCase() + ' ')) {
                        matches.push(node.parentElement);
                    }
                }
                
                if (matches.length > 0) {
                    // Find the one that is inside a button/role="button", or just click the first one
                    for (const el of matches) {
                        const clickable = el.closest('button, div[role="button"], a[role="button"], a');
                        if (clickable) {
                            clickable.click();
                            return true;
                        }
                    }
                    // Fallback to clicking the element itself
                    matches[0].click();
                    return true;
                }
                return false;
            }, textList);
        };

        // Dedicated publish click — targets ONLY the top-right header button of the
        // Create Post modal ("Share"/"Compartilhar"), NOT the social-share popup.
        const clickPublish = async () => {
            const PUBLISH_TEXTS = ['share', 'compartilhar', 'compartir', 'partager', 'condividi', 'teilen', 'publish', 'publicar'];
            return page.evaluate((texts) => {
                const dialog = document.querySelector('div[role="dialog"]') || document.body;
                const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT, null, false);
                let node;
                const matches = [];
                while ((node = walker.nextNode())) {
                    const t = node.nodeValue.trim().toLowerCase();
                    if (t.length > 0 && texts.some(c => t === c.toLowerCase())) {
                        matches.push(node.parentElement);
                    }
                }
                if (matches.length > 0) {
                    // Prefer clicking the one that's actually a button wrapper
                    for (const el of matches) {
                        const clickable = el.closest('button, div[role="button"], a[role="button"], a');
                        if (clickable) {
                            clickable.click();
                            return true;
                        }
                    }
                    matches[0].click();
                    return true;
                }
                return false;
            }, PUBLISH_TEXTS);
        };


        // Each Next click transitions the modal.
        // Instead of blind sleeps, we wait for the UI to update like a human.
        for (let step = 0; step < 4; step++) {
            log(`Waiting for screen content to update (step ${step + 1})...`);
            const state = await waitForNextOrCaption();
            if (state === 'caption_or_share') {
                log(`Reached caption screen.`);
                break;
            }
            if (state === 'timeout') {
                log(`Timeout waiting for Next or Caption screen. Proceeding anyway.`);
                break;
            }
            
            // Found 'Next'. Wait a deliberate human reaction time before clicking.
            await randomDelay(2000, 3500); 
            const clicked = await clickByText(TEXTS.NEXT, 'Next');
            if (!clicked) {
                log(`Failed to click Next button on step ${step + 1}.`);
                break;
            }
            log(`Clicked "Next" (step ${step + 1}).`);
        }

        // ── Step 5: Write caption + hashtags ────────────────────────────────
        log('Entering caption...');
        const fullCaption = buildCaption(post.caption, post.hashtags);

        let captionClicked = false;
        const startCaptionWait = Date.now();
        while (Date.now() - startCaptionWait < 10000) {
            captionClicked = await page.evaluate(() => {
                const dialog = document.querySelector('div[role="dialog"]') || document.body;
                // Try exact aria-label matches first
                const labels = [
                    'Write a caption\u2026', 'Write a caption...', 'Escreva uma legenda\u2026',
                    'Escreva uma legenda...', 'Escribe un pie de foto\u2026', 'Ajouter une l\u00e9gende\u2026',
                    'Aggiungi una didascalia\u2026', 'F\u00fcge eine Bildunterschrift hinzu\u2026',
                    'Escreva uma legenda', 'Write a caption',
                ];
                for (const label of labels) {
                    const el = dialog.querySelector(`[aria-label="${label}"]`);
                    if (el) { el.focus(); el.click(); return true; }
                }
                // Partial aria-label match (handles locale variations we haven't seen)
                const partials = ['legenda', 'caption', 'pie de foto', 'légende', 'didascalia', 'bildunterschrift'];
                for (const part of partials) {
                    const el = dialog.querySelector(`[aria-label*="${part}"]`);
                    if (el) { el.focus(); el.click(); return true; }
                }
                // Broadest fallback: any contenteditable inside the dialog
                const ce = dialog.querySelector('[contenteditable="true"]');
                if (ce) { ce.focus(); ce.click(); return true; }
                return false;
            });
            if (captionClicked) break;
            await new Promise(r => setTimeout(r, 500));
        }

        if (!captionClicked) {
            await page.screenshot({ path: path.join(__dirname, 'ig_worker_debug_precaption.png') });
            log('Caption box not found after waiting — check ig_worker_debug_precaption.png', 'warning');
        } else {
            log('Caption box found and focused.');
        }

        if (captionClicked && fullCaption.length > 0) {
            await randomDelay(1500, 2500); // Pausa humana antes de "começar a digitar"

            // ────────────────────────────────────────────────────────────────────
            // SOLUÇÃO DEFINITIVA: CDP Input.insertText
            //
            // O Instagram usa o Lexical (editor de texto do Meta) para o caption.
            // Lexical intercepta InputEvent do tipo 'insertText' para atualizar
            // seu estado interno. Clipboard paste / execCommand / keyboard.type()
            // NÃO disparam esse evento corretamente — o texto aparece no DOM
            // visualmente, mas o state tree do Lexical fica VAZIO.
            // Quando o usuário clica "Share", o Lexical envia o state (vazio)
            // para o servidor → post sem legenda.
            //
            // CDP Input.insertText gera um InputEvent nativo de baixo nível que
            // o Lexical reconhece e sincroniza no state tree. É a ÚNICA forma
            // confiável de injetar texto em editores React/Lexical/Draft.js.
            // ────────────────────────────────────────────────────────────────────
            log('Injecting caption via CDP Input.insertText (Lexical-compatible)...');

            try {
                // 1. Localizar e focar o campo de legenda com Puppeteer (não apenas evaluate)
                //    Precisamos do ElementHandle para .click() real que garante focus nativo
                const boxHandle = await page.evaluateHandle(() => {
                    const dialog = document.querySelector('div[role="dialog"]') || document;
                    // Lista de aria-labels conhecidos em todos os idiomas
                    const labels = [
                        'Write a caption\u2026', 'Write a caption...', 'Write a caption',
                        'Escreva uma legenda\u2026', 'Escreva uma legenda...', 'Escreva uma legenda',
                        'Escribe un pie de foto\u2026', 'Escribe un pie de foto',
                        'Ajouter une l\u00e9gende\u2026', 'Ajouter une l\u00e9gende',
                        'Aggiungi una didascalia\u2026', 'Aggiungi una didascalia',
                        'F\u00fcge eine Bildunterschrift hinzu\u2026',
                    ];
                    for (const label of labels) {
                        const b = dialog.querySelector(`[aria-label="${label}"]`);
                        if (b) return b;
                    }
                    // Fallback parcial por substring no aria-label
                    const partials = ['legenda', 'caption', 'pie de foto', 'légende', 'didascalia', 'bildunterschrift'];
                    for (const part of partials) {
                        const el = dialog.querySelector(`[aria-label*="${part}"]`);
                        if (el) return el;
                    }
                    // Último recurso: qualquer contenteditable dentro do dialog
                    return dialog.querySelector('[contenteditable="true"]');
                });

                if (!boxHandle || !boxHandle.asElement()) {
                    log('Caption element handle not found — skipping caption injection.', 'warning');
                } else {
                    // Click real do Puppeteer (não .evaluate click) para garantir
                    // que o browser registra o foco nativo no elemento
                    await boxHandle.click();
                    await randomDelay(300, 600);

                    // Segundo click + focus para garantia dupla (Lexical às vezes
                    // precisa de dois clicks para ativar o cursor de edição)
                    await boxHandle.click();
                    await randomDelay(500, 1000);

                    // 2. Limpar qualquer conteúdo existente (placeholder ou texto anterior) utilizando seleção nativa
                    //    Isso evita problemas onde Ctrl+A seleciona toda a página ao invés de apenas a caixa de texto.
                    await page.evaluate((el) => {
                        el.focus();
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }, boxHandle);
                    await randomDelay(200, 400);
                    await page.keyboard.press('Backspace');
                    await randomDelay(300, 600);


                    // 3. Abrir sessão CDP (Chrome DevTools Protocol) para Input.insertText
                    //    Isso dispara InputEvent nativo que Lexical intercepta corretamente
                    const client = await page.createCDPSession();

                    // Dividimos o caption em chunks menores para não sobrecarregar o Lexical
                    // e simular uma digitação mais natural. Chunks de ~100 chars são seguros.
                    const CHUNK_SIZE = 100;
                    for (let i = 0; i < fullCaption.length; i += CHUNK_SIZE) {
                        const chunk = fullCaption.slice(i, i + CHUNK_SIZE);
                        await client.send('Input.insertText', { text: chunk });
                        // Micro-pausa entre chunks para o Lexical processar o state update
                        await randomDelay(150, 350);
                    }

                    await client.detach();
                    log(`Caption injected via CDP (${fullCaption.length} chars in ${Math.ceil(fullCaption.length / CHUNK_SIZE)} chunks).`);

                    // 4. Disparo de um espaço + backspace para forçar o Lexical a
                    //    executar o último reconcile() e persistir o state final.
                    //    Garantimos que o cursor está no FINAL usando seleção nativa (collapse to end).
                    await page.evaluate((el) => {
                        el.focus();
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        range.collapse(false); // Colapsa a seleção para o final exato do texto
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }, boxHandle);
                    await randomDelay(300, 600);
                    await page.keyboard.type(' '); // espaço (força reconcile)
                    await randomDelay(500, 800);
                    await page.keyboard.press('Backspace'); // remove o espaço extra
                    await randomDelay(300, 500);

                    // 5. VERIFICAÇÃO: Confirmar que o texto realmente persistiu no state
                    //    Lexical renderiza o texto final em <p> ou <span> dentro do contenteditable.
                    //    Se o texto não está lá, algo falhou e precisamos de fallback.
                    const verification = await page.evaluate((expected) => {
                        const dialog = document.querySelector('div[role="dialog"]') || document;
                        const ce = dialog.querySelector('[contenteditable="true"]');
                        if (!ce) return { found: false, actual: '' };
                        const actual = ce.textContent || '';
                        // Verificamos os primeiros 30 chars para confirmar (hashtags podem ter formatação diferente)
                        const expectedStart = expected.substring(0, 30).trim();
                        const found = actual.includes(expectedStart);
                        return { found, actual: actual.substring(0, 80) };
                    }, fullCaption);

                    if (verification.found) {
                        log(`✅ Caption verified in DOM: "${verification.actual.substring(0, 40)}..."`);
                    } else {
                        log(`⚠️ Caption NOT found in DOM after CDP injection. DOM shows: "${verification.actual.substring(0, 40)}...". Trying keyboard.type() fallback...`, 'warning');

                        // FALLBACK: Se CDP falhou, usamos keyboard.type() que é mais lento
                        // mas gera eventos KeyDown/KeyUp que alguns builds do Lexical aceitam
                        await boxHandle.click();
                        await randomDelay(300, 500);
                        await page.evaluate((el) => {
                            el.focus();
                            const range = document.createRange();
                            range.selectNodeContents(el);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }, boxHandle);
                        await randomDelay(200, 400);
                        await page.keyboard.press('Backspace');
                        await randomDelay(500, 800);

                        // keyboard.type() com delay simula digitação humana real
                        // Cada char gera keyDown → keyPress → input → keyUp
                        await page.keyboard.type(fullCaption, { delay: 10 });
                        await randomDelay(1000, 1500);

                        // Verificação final do fallback
                        const fallbackCheck = await page.evaluate(() => {
                            const dialog = document.querySelector('div[role="dialog"]') || document;
                            const ce = dialog.querySelector('[contenteditable="true"]');
                            return ce ? ce.textContent.length : 0;
                        });
                        log(`Fallback keyboard.type() complete. DOM content length: ${fallbackCheck} chars.`);
                    }
                }
            } catch (err) {
                log(`Error injecting caption: ${err.message}`, 'error');
                // Screenshot para debug caso falhe
                await page.screenshot({ path: path.join(__dirname, 'ig_worker_debug_caption_error.png') }).catch(() => {});
            }

            await randomDelay(3000, 4000); // Descanso antes de prosseguir
        } else if (!captionClicked) {
            log('Caption box not found after retries — check ig_worker_debug_precaption.png', 'warning');
        }

        log('Reviewing post... (Human reading pause)');
        await randomDelay(8000, 12000); // 8 to 12 seconds pause! Crucial for the background video upload to finish buffering and simulate human final review.

        // ── Step 6: Click Share/Publish ──────────────────────────────────────
        log('Clicking Publish...');
        const shared = await clickPublish();
        if (!shared) {
            await page.screenshot({ path: path.join(__dirname, 'ig_worker_debug_publish.png') });
            return fail(post, log, 'Could not find "Share" button. Check ig_worker_debug_publish.png');
        }
        await randomDelay(3000, 5000); // Takes time for the final dialog to render

        // ── Step 7: Observe publication success ──────────────────────────────
        log('Waiting for publication confirmation...');
        const published = await observePublicationSuccess(page, log);

        if (published) {
            log('✅ Post published successfully!', 'success');
            db.prepare("UPDATE ig_posts SET status = 'published', published_at = datetime('now'), error_msg = NULL WHERE id = ?").run(post.id);
            if (io) io.emit('ig-post-status', { id: post.id, status: 'published' });
        } else {
            return fail(post, log, 'Publication timed out. Check Instagram manually.');
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
        'post shared', 'post compartilhado', 'publicado',
        'seu vídeo do reels foi compartilhado', 'seu reel foi compartilhado',
        'your reel has been shared', 'has been shared', 'compartilhada'
    ];

    const deadline = Date.now() + 300000; // 5 minutes max (video/reels processing can be VERY slow)

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

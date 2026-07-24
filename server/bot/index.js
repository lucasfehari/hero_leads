const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { executablePath } = require('puppeteer');
const { login } = require('./login');
const { randomDelay, smartClick, autoScroll, humanMove, spinText, applyTemplateVars } = require('./utils');
const { searchByHashtag, analyzeProfile, browseProfile, exploreReels, isExcluded, generateHashtagsFromPrompt } = require('./strategies');
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
        this.excludedKeywords = [];
        this.isRunning = true;
        this.sessionStartTime = Date.now();  // For session time tracking
        this.sessionActionCount = 0;          // For max-interactions limit

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

            // Force allow microphone permissions to prevent Chrome blocking popups
            const context = this.browser.defaultBrowserContext();
            await context.overridePermissions('https://www.instagram.com', ['microphone']);

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
            let hashtags = this.config.hashtags
                ? this.config.hashtags.split(/[, \n]+/).map(k => k.trim().replace('#', '')).filter(k => k)
                : [];

            // 2. Interest Keywords (What to filter for in Bios/Reels)
            // FIX BUG 2: Use `let` so we can update AFTER AI may generate hashtags below.
            // Using `const hashtags` here would lock in an empty array if AI hasn't run yet.
            let interestKeywords = this.config.interestKeywords
                ? this.config.interestKeywords.split(/[, \n]+/).map(k => k.trim()).filter(k => k)
                : []; // Will be set to final hashtags list AFTER AI generation (see below)

            // 4. Excluded Keywords (block users whose username/name/bio matches)
            const excludedKeywords = Array.isArray(this.config.excludedKeywords)
                ? this.config.excludedKeywords
                : (this.config.excludedKeywords || '')
                    .split(',')
                    .map(k => k.toLowerCase().trim())
                    .filter(k => k);

            this.excludedKeywords = excludedKeywords; // persistir na instância para interactWithProfile()

            if (excludedKeywords.length > 0) {
                this.log(`Keyword exclusion filter active: [${excludedKeywords.join(', ')}]`);
            }

            if (customList.length > 0) {
                this.log(`Target List Enabled: ${customList.length} users loaded.`);
                await this.runLoop([], [], customList, excludedKeywords);
            } else {
                // 4.5 AI Campaign Planning Phase (Generate Hashtags)
                if (this.config.aiMode && hashtags.length === 0 && !this.config.onlyReels) {
                    if (!this.config.openRouterKey) {
                        this.log('❌ Modo I.A. ativado, mas a CHAVE DA API (OpenRouter) não foi configurada nas Configurações Globais. A I.A. não pode gerar hashtags sem ela.', 'error');
                    } else {
                        this.log('Planejando a campanha com I.A. (Gerando hashtags a partir do prompt)...');
                        const generatedHashtags = await generateHashtagsFromPrompt(
                            this.config.aiPrompt, 
                            this.config.openRouterKey, 
                            this.config.openRouterModel, 
                            (msg, type) => this.log(msg, type)
                        );
                        
                        if (generatedHashtags && generatedHashtags.length > 0) {
                            this.log(`I.A. sugeriu as hashtags: [${generatedHashtags.join(', ')}]`, 'success');
                            hashtags = generatedHashtags;
                            this.config.hashtags = generatedHashtags.join(','); // Store for strategy switcher
                        } else {
                            this.log('Falha ao gerar hashtags com I.A. Usando exploração de Reels como fallback.', 'warning');
                            this.config.onlyReels = true;
                        }
                    }
                }

                // FIX BUG 2: Resolve interestKeywords AFTER AI may have updated `hashtags`.
                // This ensures keyword filtering works correctly in AI campaign mode.
                if (interestKeywords.length === 0) {
                    interestKeywords = [...hashtags];
                }

                if (hashtags.length === 0 && !this.config.onlyReels) {
                    this.log('No targets or hashtags provided. Cannot start search loop.', 'warning');
                } else {
                    await this.runLoop(hashtags, interestKeywords, [], excludedKeywords);
                }
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
    async runLoop(keywords, interestKeywords, customList = [], excludedKeywords = []) {
        this.strategyState = 'hashtags'; // 'hashtags', 'reels', 'custom_list'
        const seenHashtagPosts = new Set(); // Session memory for hashtags

        let customListIndex = 0;
        // Round-robin: run hashtags N times for every 1 reels run
        // Pattern: [hashtags, hashtags, reels, hashtags, hashtags, reels, ...]
        const STRATEGY_CYCLE = ['hashtags', 'hashtags', 'reels']; // 2:1 ratio
        let strategyCycleIndex = 0;

        while (this.isRunning) {
            // ── Session Limits Check (max people, stop time, sleep schedule) ──
            if (!(await this.checkSessionLimits())) break;

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
                    // STRATEGY SWITCHER — Round-Robin
                    // If "Only Reels" is ON, always use reels.
                    // Else: cycle deterministically so all strategies are used.

                    if (this.config.onlyReels) {
                        this.strategyState = 'reels';
                    } else if (keywords.length === 0) {
                        // No hashtags configured — only reels available
                        this.strategyState = 'reels';
                    } else {
                        // Round-robin through the strategy cycle
                        this.strategyState = STRATEGY_CYCLE[strategyCycleIndex % STRATEGY_CYCLE.length];
                        strategyCycleIndex++;
                        this.log(`Strategy cycle [${strategyCycleIndex}/${STRATEGY_CYCLE.length}]: ${this.strategyState}`);
                    }

                    if (this.strategyState === 'reels') {
                        this.log('Strategy: Reels Exploration 🎥');
                        // Use keywords if available, otherwise pass empty array (browse all)
                        const searchKeywords = this.config.onlyReels && keywords.length === 0 ? [] : keywords;

                        // FIX BUG 4: Pass `this.config` so exploreReels can use AI filtering on captions
                        const profileUrl = await exploreReels(this.page, searchKeywords, (msg, type) => this.log(msg, type), excludedKeywords, this.config);

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
                    // Cycle Cool-down between strategies (human-like)
                    const cooldownMs = Math.floor(Math.random() * 30000) + 15000; // 15s–45s
                    this.log(`Finished [${this.strategyState}] cycle. Cooling down ${Math.round(cooldownMs/1000)}s before next strategy...`);
                    await randomDelay(cooldownMs, cooldownMs);
                }
            } catch (e) {
                this.log(`Error during strategy execution: ${e.message}`, 'error');
                this.stats.errors++;
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
            // FIX BUG 9: Extended list of Instagram system paths to prevent misidentification.
            const SYSTEM_PATHS = new Set([
                'explore', 'reels', 'reel', 'p', 'stories', 'story',
                'direct', 'accounts', 'tv', 'ar', 'developer', 'about',
                'legal', 'help', 'privacy', 'lite', 'share', 'music',
                'tags', 'locations', 'web', 'challenge', 'audio'
            ]);
            const profileMatch = postUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?$/);
            if (profileMatch) {
                username = profileMatch[1];
                if (SYSTEM_PATHS.has(username)) username = null; // False positives
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

            // FIX BUG 6: Early username exclusion check BEFORE visiting the profile.
            // Avoids wasting time + API tokens on profiles that would be excluded anyway.
            if (this.excludedKeywords && this.excludedKeywords.length > 0) {
                if (isExcluded(username, '', '', this.excludedKeywords)) {
                    this.log(`[FILTER] ⛔ Skipping @${username} (username exclusion — no profile visit needed).`, 'warning');
                    return;
                }
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
        // 1. Analyze
        const analyzeResult = await analyzeProfile(this.page, username, this.config, this.logCallback, this.excludedKeywords || []);

        if (!analyzeResult || (typeof analyzeResult === 'object' && !analyzeResult.approved)) {
            this.log(`Skipping @${username} (Criteria Not Met).`);
            return;
        }
        
        const aiMessage      = typeof analyzeResult === 'object' ? analyzeResult.aiMessage      : null;
        const aiActions      = typeof analyzeResult === 'object' ? analyzeResult.actions         : null;
        const profileContext  = typeof analyzeResult === 'object' ? (analyzeResult.profileContext || {}) : {};

        // Log profile identity for transparency
        if (profileContext.displayName) {
            this.log(`Perfil: ${profileContext.displayName} (@${username})`);
        }

        this.log(`Criteria Met for @${username}. Initiating Interaction Sequence.`, 'success');

        // 2. Browse (Human Behavior)
        await browseProfile(this.page, username, this.logCallback);

        // Long pause after browsing before following
        await this.humanPause('contemplation');

        // 3. Follow
        const shouldFollow = aiActions ? aiActions.shouldFollow !== false : true;
        if (shouldFollow) {
            const followed = await followUser(this.page);
            if (followed) this.log(`Successfully Followed @${username}`, 'success');
            // CRITICAL: Long pause to avoid "bot-like" behavior detection
            await this.humanPause('action_gap');
        } else {
            this.log(`[AI Orchestrator] Skipped Follow.`);
        }

        // 4. Like & Comment (if configured)
        const shouldComment = aiActions ? aiActions.shouldComment !== false : true;
        let commentText = '';
        if (shouldComment) {
             if (aiActions && aiActions.customComment) {
                 commentText = aiActions.customComment;
             } else if (this.config.commentTemplate) {
                 commentText = spinText(this.config.commentTemplate);
             }
        } else {
             this.log(`[AI Orchestrator] Skipped Comment.`);
        }
        
        if (commentText) {
            // Must find a post to comment on
            const latestPost = await this.page.$('a[href*="/p/"]');
            if (latestPost) {
                // Record the URL BEFORE entering the post so we know where to return
                const profileUrl = this.page.url();

                await smartClick(this.page, latestPost);
                await randomDelay(3000, 5000); // Read post

                // Chance to look at comments
                if (Math.random() > 0.5) {
                    await autoScroll(this.page);
                    await randomDelay(2000, 4000);
                }

                this.log(`Commenting: "${commentText}"`);

                const commented = await commentPost(this.page, commentText);
                if (commented) this.log('Comment Posted.', 'success');

                await randomDelay(2000, 3000);
                await this.page.keyboard.press('Escape'); // Try to close modal if it is one
                await randomDelay(1500, 2500);

                // ─────────────────────────────────────────────────────────────────────
                // CRITICAL FIX: Instagram sometimes opens the post as a full PAGE
                // (URL becomes /p/xyz/) instead of a modal overlay. In that case
                // pressing Escape does nothing — the browser stays on the post URL.
                // We MUST return to the profile page before the DM step runs,
                // otherwise sendDM() navigates from a post page and often fails.
                // ─────────────────────────────────────────────────────────────────────
                const currentUrl = this.page.url();
                const isStillOnPost = currentUrl.includes('/p/') || !currentUrl.includes(username);

                if (isStillOnPost) {
                    this.log(`Navegando de volta ao perfil de @${username} após comentário...`);
                    // Try goBack() first — it's instant if we opened a modal via navigation
                    try {
                        await this.page.goBack({ waitUntil: 'networkidle2', timeout: 6000 });
                        await randomDelay(1500, 2500);
                    } catch (_) { /* goBack may throw if there's no history */ }

                    // If still not on profile, force navigate
                    if (!this.page.url().includes(username)) {
                        await this.page.goto(
                            `https://www.instagram.com/${username}/`,
                            { waitUntil: 'networkidle2', timeout: 12000 }
                        ).catch(() => this.log('Timeout retornando ao perfil — continuando.', 'warning'));
                        await randomDelay(2000, 3000);
                    }

                    this.log(`✅ De volta ao perfil de @${username}.`);
                }
            }
        }

        // 5. DM (if configured or AI generated)
        const shouldDM = aiActions ? aiActions.shouldDM !== false : true;
        
        if (!shouldDM) {
             this.log(`[AI Orchestrator] Skipped DM.`);
        } else {
            // When AI Auto Message is ON → NEVER fall back to manual template.
            // If the AI didn't generate a customMessage, skip DM and warn (don't spam with generic text).
            // When aiAutoMessage is OFF (even if aiMode is ON for filtering), always use the manual template.
            if (this.config.aiAutoMessage && !aiMessage) {
                this.log(`[AI] ⚠️ Modo I.A. Total: I.A. não gerou mensagem para @${username}. DM pulado para evitar mensagem genérica.`, 'warning');
            } else {
            // If aiAutoMessage is OFF, aiMessage will be null → falls back to manual dmTemplate
            const effectiveDmTemplate = aiMessage || this.config.dmTemplate;
            
            if (effectiveDmTemplate) {
            // Support Multiple Messages per Person using ';;;' separator
            // Example: "Hi! ;;; How are you?" -> Sends "Hi!", waits, then sends "How are you?"

            // Process with spintax first, then inject real profile data via template vars.
            // FIX BUG 1: Apply spinText to ALL messages (AI-generated or manual).
            const spunTemplate = aiMessage ? spinText(aiMessage) : spinText(effectiveDmTemplate);

            // Replace {nome}, {usuario}, {nicho}, {bio} with real profile data.
            // Works in BOTH AI and non-AI modes. Result is unique per person.
            const chosenTemplate = applyTemplateVars(spunTemplate, username, profileContext);
            this.log(`Mensagem final: "${chosenTemplate.substring(0, 80)}${chosenTemplate.length > 80 ? '...' : ''}"`);

            // Split by ;;; for multi-message sequences
            const messagesToSend = chosenTemplate.split(';;;').map(m => m.trim()).filter(m => m);

            this.log("Preparing to send DM... (Waiting for safety)");
            await this.humanPause('action_gap_long'); // Extra long pause before DM

            this.log(`Sending DM(s) to @${username}...`);

            let allSent = true;
            for (let i = 0; i < messagesToSend.length; i++) {
                const msg = messagesToSend[i];
                const isSubsequentMessage = i > 0;
                const sent = await sendDM(this.page, username, msg, this.config.audios, isSubsequentMessage);
                if (!sent) {
                    allSent = false;
                    break;
                }
                // Small pause between multiple messages to same person
                if (messagesToSend.length > 1 && i < messagesToSend.length - 1) {
                    await randomDelay(2000, 4000);
                }
            }

            if (allSent) {
                this.log(`DM Sequence Sent to @${username}`, 'success');
                await randomDelay(10000, 20000); // Big pause after DM sequence
            } else {
                this.log(`DM failed or restricted for @${username}`, 'warning');
            }
            } // closes if (effectiveDmTemplate)
            } // closes if/else aiAutoMessage guard
        } // Closes the shouldDM else block

        // 6. Sleep Extra
        if (aiActions && aiActions.sleepAfterMs) {
            this.log(`[AI Orchestrator] Pause extra de ${aiActions.sleepAfterMs}ms solicitada.`);
            await randomDelay(aiActions.sleepAfterMs, aiActions.sleepAfterMs + 1000);
        }

        // Record the interaction in DB to never visit again
        recordInteraction(username, ['processed'], this.config.profile || 'default');
        this.stats.profilesActioned++;
        this.sessionActionCount++; // Track for sessionMaxActions limit

        // ROTATION CHECK
        if (this.config.rotationEnabled && this.stats.profilesActioned >= (this.config.rotationLimit || 10)) {
            await this.rotateProfile();
        }
    }

    /**
     * Helpers
     */

    /**
     * Checks all session-level limits every loop cycle.
     * Handles: max interactions, stop-at-clock-time, sleep schedule.
     * Returns false (and stops/sleeps) if a limit is hit.
     */
    async checkSessionLimits() {
        const cfg = this.config;

        // ── 1. Max interactions per session ───────────────────────────────────
        if (cfg.sessionMaxActions && parseInt(cfg.sessionMaxActions) > 0) {
            const max = parseInt(cfg.sessionMaxActions);
            if (this.sessionActionCount >= max) {
                this.log(`🎯 Limite de sessão atingido: ${max} interações realizadas. Encerrando.`, 'success');
                await this.stop();
                return false;
            }
            const remaining = max - this.sessionActionCount;
            if (remaining > 0 && remaining <= 5) {
                this.log(`⚠️ Quase no limite! ${remaining} interação(ões) restante(s).`, 'warning');
            }
        }

        // ── 2. Stop at specific clock time ────────────────────────────────────
        if (cfg.stopAtTime) {
            const now = new Date();
            const [stopH, stopM] = cfg.stopAtTime.split(':').map(Number);
            const stopTime = new Date();
            stopTime.setHours(stopH, stopM, 0, 0);
            if (now >= stopTime) {
                this.log(`⏰ Horário de parada atingido (${cfg.stopAtTime}). Encerrando sessão.`, 'warning');
                await this.stop();
                return false;
            }
            // Warn 5 min before stop
            const msUntilStop = stopTime - now;
            if (msUntilStop < 5 * 60 * 1000) {
                this.log(`⏰ Bot para em menos de 5 min (às ${cfg.stopAtTime}).`, 'warning');
            }
        }

        // ── 3. Sleep schedule ─────────────────────────────────────────────────
        if (cfg.sleepEnabled && cfg.sleepStart && cfg.sleepEnd) {
            const now = new Date();
            const cur = now.getHours() * 60 + now.getMinutes();
            const [sH, sM] = cfg.sleepStart.split(':').map(Number);
            const [eH, eM] = cfg.sleepEnd.split(':').map(Number);
            const sleepStartMin = sH * 60 + sM;
            const sleepEndMin   = eH * 60 + eM;

            // Overnight ranges (e.g. 23:00 → 07:00) cross midnight
            const isSleeping = sleepStartMin > sleepEndMin
                ? cur >= sleepStartMin || cur < sleepEndMin  // crosses midnight
                : cur >= sleepStartMin && cur < sleepEndMin; // same day

            if (isSleeping) {
                this.log(`😴 Modo Sono ativado (${cfg.sleepStart}–${cfg.sleepEnd}). Bot pausado até acordar...`, 'warning');
                // Poll every minute until sleep window ends
                while (this.isRunning) {
                    await randomDelay(60000, 60000); // check every 60s
                    const n = new Date();
                    const c = n.getHours() * 60 + n.getMinutes();
                    const stillSleeping = sleepStartMin > sleepEndMin
                        ? c >= sleepStartMin || c < sleepEndMin
                        : c >= sleepStartMin && c < sleepEndMin;
                    if (!stillSleeping) break;
                }
                if (this.isRunning) {
                    this.log(`☀️ Modo Sono encerrado (${cfg.sleepEnd}). Retomando prospecção!`, 'success');
                }
            }
        }

        return this.isRunning;
    }

    /**
     * FIX BUG 7: rotateProfile was called on line ~560 but NEVER EXISTED,
     * causing a TypeError crash the moment rotationLimit was reached.
     * Now implemented as a safe cool-down cycle with counter reset.
     */
    async rotateProfile() {
        this.log('🔄 Limite de rotação atingido. Iniciando pausa de segurança...', 'warning');
        this.stats.profilesActioned = 0; // Reset counter for next cycle
        const cooldownMs = this.config.rotationCooldownMs || (5 * 60 * 1000); // default: 5 minutes
        const minutes = Math.round(cooldownMs / 60000);
        this.log(`⏳ Cooldown de rotação: aguardando ${minutes} min antes de retomar...`);
        await randomDelay(cooldownMs, cooldownMs + 30000); // +30s random buffer
        this.log('✅ Cooldown de rotação concluído. Retomando prospecção.', 'success');
    }

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

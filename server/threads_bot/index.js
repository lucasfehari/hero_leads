const puppeteer = require('puppeteer');
const { loginToThreads } = require('./login');
const { searchThreads, scrollFeed, interactWithThread } = require('./actions');
const { analyzeThreadWithAI, generateKeywordsFromPrompt } = require('./strategies');
const { randomDelay } = require('../bot/utils');

class ThreadsBotEngine {
    constructor() {
        this.browser = null;
        this.isRunning = false;
        this.config = null;
        this.logCallback = () => {};
    }

    log(message, type = 'info') {
        if (this.logCallback) this.logCallback(message, type);
    }

    async stop() {
        this.isRunning = false;
        this.log('🛑 Stopping Threads bot...', 'warning');
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
                console.error(e);
            }
        }
        this.log('Threads Bot Engine Shutdown Complete.', 'warning');
    }

    async start(config, logCallback) {
        this.config = config;
        this.isRunning = true;
        if (logCallback) this.logCallback = logCallback;

        this.log(`Starting Threads bot with config: ${JSON.stringify(config)}`);
        
        try {
            this.log('Launching browser engine...');
            this.browser = await puppeteer.launch({
                headless: false,
                defaultViewport: null,
                args: ['--start-maximized', '--disable-notifications']
            });

            const page = await this.browser.newPage();
            
            // Go to Threads
            await page.goto('https://www.threads.net/', { waitUntil: 'networkidle2' });
            this.log('Browser online. Validating session...');

            // Login / Session Restore
            const isLoggedIn = await loginToThreads(page, (m, t) => this.log(m, t), this.config.profile || 'default');
            
            if (!isLoggedIn) {
                this.log('Could not log into Threads. Halting engine.', 'error');
                return;
            }

            this.log('Ready to prospect on Threads.');
            
            let keywords = this.config.keywords 
                ? this.config.keywords.split(',').map(k => k.trim()).filter(k => k)
                : [];
            
            if (keywords.length === 0 && this.config.aiMode) {
                // Se a IA está ligada e o usuário não passou palavras-chave (normal, pois removemos do UI)
                // A IA vai deduzir as keywords a partir do Prompt
                const aiKeywords = await generateKeywordsFromPrompt(this.config, (m, t) => this.log(m, t));
                if (aiKeywords && aiKeywords.length > 0) {
                    keywords = aiKeywords;
                }
            }

            if (keywords.length === 0) {
                this.log('Nenhum termo de busca gerado ou fornecido. O bot não tem o que procurar.', 'error');
                return;
            }
            // Track processed items to avoid duplicate AI calls and interactions
            const processedAuthors = new Set();
            const processedTexts = new Set();

            // Main Prospecting Loop
            for (let keyword of keywords) {
                if (!this.isRunning) break;
                
                await searchThreads(page, keyword, (m, t) => this.log(m, t));
                
                // Process results in the feed
                for (let i = 0; i < 5; i++) { // Scroll 5 times per keyword
                    if (!this.isRunning) break;

                    this.log(`Analyzing threads in view (Scroll ${i+1}/5)...`);
                    
                    // Extract threads visible on screen
                    const threadsData = await page.evaluate(() => {
                        const threads = [];
                        // This is a generic selector for Threads posts; actual DOM might require tweaking
                        const articles = document.querySelectorAll('div[data-pressable-container="true"]');
                        articles.forEach((article, idx) => {
                            // Give them a unique id so we can find them later with Puppeteer
                            if (!article.id) article.id = `thread-post-${Date.now()}-${idx}`;
                            const textContent = article.innerText;
                            const lines = textContent.split('\n');
                            const authorName = lines[0] || 'unknown'; // Rough heuristic
                            
                            threads.push({
                                id: article.id,
                                text: textContent,
                                authorName
                            });
                        });
                        return threads;
                    });

                    // AI Analysis and Interaction
                    for (let tData of threadsData) {
                        if (!this.isRunning) break;
                        
                        // Avoid over-processing or duplicate processing
                        if (tData.text.length < 10) continue;
                        
                        // Create a short hash/snippet of the text to avoid duplicates
                        const textSnippet = tData.text.substring(0, 100);
                        if (processedTexts.has(textSnippet)) continue;
                        processedTexts.add(textSnippet);

                        // Prevent spamming the same author in one session
                        if (processedAuthors.has(tData.authorName)) {
                            this.log(`Pulo: Já interagimos ou analisamos o perfil @${tData.authorName} nesta sessão.`);
                            continue;
                        }

                        const aiResult = await analyzeThreadWithAI(tData.text, tData.authorName, this.config, (m, type) => this.log(m, type));
                        
                        if (aiResult.approved && aiResult.actions) {
                            processedAuthors.add(tData.authorName); // Mark author as successfully prospected/interacted
                            // Find the element back in Puppeteer space
                            // Find the element back in Puppeteer space
                            const threadElement = await page.$(`#${tData.id}`);
                            if (threadElement) {
                                await interactWithThread(page, threadElement, aiResult.actions, (m, type) => this.log(m, type));
                            }
                        }
                    }

                    await scrollFeed(page);
                }
            }

        } catch (error) {
            this.log(`Critical Error: ${error.message}`, 'error');
            console.error(error);
        } finally {
            await this.stop();
        }
    }
}

module.exports = ThreadsBotEngine;

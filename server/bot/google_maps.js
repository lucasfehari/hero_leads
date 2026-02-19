const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { executablePath } = require('puppeteer');

puppeteer.use(StealthPlugin());

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class GoogleMapsBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.logCallback = console.log;
        this.dataCallback = null;
    }

    async start(config, logCallback, dataCallback) {
        if (this.isRunning) {
            logCallback('Google Maps Bot is already running.', 'warning');
            return;
        }

        this.isRunning = true;
        this.logCallback = logCallback;
        this.dataCallback = dataCallback;
        this.config = config;

        try {
            this.log('Launching Google Maps Scraper...');

            this.log('Launching Google Maps (External Chrome via BAT)...');

            // 1. Spawn the BAT file with the profile
            const profileName = config.profile || 'default_maps_session';
            const batPath = require('path').join(__dirname, '../../ABRIR_CHROME_ROBO.bat');
            const { spawn } = require('child_process');

            this.log(`Spawning Chrome via BAT for profile: ${profileName}`);

            const chromeProcess = spawn('cmd.exe', ['/c', batPath, profileName], {
                detached: true,
                stdio: 'ignore',
                windowsHide: false
            });
            chromeProcess.unref();

            // 2. Wait for Chrome
            await wait(5000);

            try {
                // 3. Connect
                this.browser = await puppeteer.connect({
                    browserURL: 'http://127.0.0.1:9222',
                    defaultViewport: null
                });
                this.log('Connected to External Chrome instance!');
            } catch (connErr) {
                this.log(`Could not connect to Chrome on port 9222: ${connErr.message}`, 'error');
                throw connErr;
            }

            this.page = (await this.browser.pages())[0];
            await this.page.setViewport({ width: 1280, height: 800 });

            this.log(`Navigating to Google Maps...`);
            await this.page.goto('https://www.google.com/maps?hl=en', { waitUntil: 'networkidle2' }); // Force English for better selector consistency? Or just use generic.

            // Try to handle Consent Dialog (Cookies)
            try {
                const buttonsToClick = [
                    'button[aria-label="Accept all"]',
                    'button[aria-label="Aceitar tudo"]',
                    'form[action*="consent"] button',
                    'button[jsname="b3VHJd"]' // Sometimes "Stay signed out" or similar
                ];

                for (const selector of buttonsToClick) {
                    if (await this.page.$(selector)) {
                        this.log(`Clicking detected consent/dialog button: ${selector}`);
                        await this.page.click(selector);
                        await wait(2000);
                    }
                }
            } catch (e) {
                // Ignore if no consent dialog
            }

            this.log(`Searching for: ${config.query}`);

            // Robust Search Box Selection
            const searchSelectors = [
                '#searchboxinput',
                'input[name="q"]',
                'input[aria-label="Search Google Maps"]',
                'input[id="searchboxinput"]'
            ];

            let searchBox = null;
            for (const selector of searchSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 3000 });
                    searchBox = selector;
                    break;
                } catch (e) { }
            }

            if (!searchBox) {
                throw new Error("Could not find search box. Google Maps layout might have changed or bot detected.");
            }

            this.log(`Found search box using: ${searchBox}`);
            await this.page.click(searchBox);
            await this.page.type(searchBox, config.query, { delay: 100 }); // Slow typing
            await wait(500);
            await this.page.keyboard.press('Enter');

            this.log('Search submit. Waiting for results...');
            await wait(3000); // Wait for animation

            // Wait for results to load (feed)
            try {
                // Try multiple feed selectors
                const feedSelectors = ['div[role="feed"]', 'div[aria-label="Results"]'];
                let feedFound = false;
                for (const fs of feedSelectors) {
                    if (await this.page.$(fs)) {
                        feedFound = true;
                        break;
                    }
                }

                if (!feedFound) await this.page.waitForSelector('div[role="feed"]', { timeout: 10000 });
            } catch (e) {
                this.log('Could not find results feed. Might be a single result or network issue.', 'warning');
            }

            // Scraping Loop
            await this.scrapeResults();

        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
            await this.stop();
        }
    }

    async scrapeResults() {
        let previousHeight = 0;
        const processed = new Set();
        let unchangedCount = 0;

        while (this.isRunning) {
            // Scroll the feed
            const feed = await this.page.$('div[role="feed"]');

            if (!feed) {
                this.log('No feed found. Might be a single result page.', 'warning');
                break;
            }

            // Get all result items
            const boxes = await feed.$$('div[role="article"]'); // Usually role="article" or similar class in Maps
            // Note: Google Maps classes change often. Need robust selectors. 
            // Often direct children of div[role="feed"] > div > div[jsaction]

            // We will evaluate in browser context to be safer
            const newLeads = await this.page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('div[role="feed"] > div > div[jsaction]'));
                const results = [];

                items.forEach(item => {
                    const text = item.innerText;
                    if (!text) return;

                    // Basic heuristics to split lines
                    const lines = text.split('\n');
                    const title = lines[0] || 'Unknown';
                    // Try to find phone
                    // Try to find rating

                    // Since we are just scrolling, we scrape what's visible on the card
                    // For full details, we'd need to click. 
                    // Let's scrape visible info first (Name, Rating, Category)

                    const link = item.querySelector('a');
                    const href = link ? link.href : '';

                    if (href) {
                        results.push({
                            title,
                            href,
                            raw: text
                        });
                    }
                });
                return results;
            });

            // Process found leads
            for (const lead of newLeads) {
                if (!processed.has(lead.href)) {
                    processed.add(lead.href);

                    // Visit for details if deep scraping is on
                    // For now, let's just emit what we found
                    // await this.clickAndScrape(lead.href); // Future improvement: Click each to get phone/website

                    // Simple "fast" mode: Scrape visible

                    // To get phone/website, we MUST click usually.
                    // Let's try to click the item in the list
                }
            }

            // Actually, to get PHONE and WEBSITE, we usually need to click the item.
            // Let's implement the "Click and Extract" strategy for better data.
            // Re-fetching handles to click

            const items = await feed.$$('a[href*="google.com/maps/place"]');
            for (const item of items) {
                if (!this.isRunning) break;

                const href = await this.page.evaluate(el => el.href, item);
                if (processed.has(href)) continue;

                // Click it
                processed.add(href);
                await item.scrollIntoView();
                await item.click();
                await wait(2000); // Wait for detail panel

                // Extract Details
                const details = await this.page.evaluate(() => {
                    const res = {};
                    const h1 = document.querySelector('h1');
                    res.name = h1 ? h1.innerText : '';

                    // Look for buttons or fields with specific icons (Phone, Website)
                    // Google Maps uses aria-labels frequently

                    const buttons = Array.from(document.querySelectorAll('button[data-tooltip], button[aria-label]'));

                    buttons.forEach(btn => {
                        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                        const tooltip = (btn.dataset.tooltip || '').toLowerCase();
                        const text = (btn.innerText || '').toLowerCase();

                        // Icon based detection is hard without visual. Text/Aria is better.
                        if (label.includes('phone') || label.includes('telefon') || tooltip.includes('copy phone')) {
                            res.phone = btn.innerText || btn.getAttribute('aria-label');
                        }
                        if (label.includes('website') || label.includes('site') || tooltip.includes('website')) {
                            res.website = btn.href || btn.innerText; // Buttons might not have href, usually 'a' tags do
                        }
                    });

                    // Address
                    const addressBtn = document.querySelector('button[data-item-id="address"]');
                    if (addressBtn) res.address = addressBtn.innerText;

                    // Fallback for Website: look for links that are not internal maps links
                    const websiteLink = Array.from(document.querySelectorAll('a[data-item-id="authority"]')).find(a => a.href);
                    if (websiteLink) res.website = websiteLink.href;

                    // Fallback for Phone
                    const phoneBtn = Array.from(document.querySelectorAll('button[data-item-id^="phone"]')).find(b => b);
                    if (phoneBtn) {
                        const phoneText = phoneBtn.dataset.itemId.replace('phone:tel:', ''); // sometimes data-item-id="phone:tel:+55..."
                        res.phone = phoneBtn.getAttribute('aria-label') || phoneBtn.innerText || phoneText;
                    }

                    return res;
                });

                if (details.name) {
                    this.log(`Extracted: ${details.name} | ${details.phone || 'No Phone'}`);
                    if (this.dataCallback) this.dataCallback(details);
                }

                // Go back to results? Or just click next?
                // Clicking another item in the left list works without going "back" usually.

                await wait(1000);
            }

            // SCROLL DOWN
            const scrollResult = await this.page.evaluate(async (feedSelector) => {
                const feed = document.querySelector(feedSelector);
                if (!feed) return false;

                const oldScroll = feed.scrollTop;
                feed.scrollTop += feed.offsetHeight;
                await new Promise(r => setTimeout(r, 1000));

                return feed.scrollTop !== oldScroll;
            }, 'div[role="feed"]');

            if (!scrollResult) {
                unchangedCount++;
                if (unchangedCount > 3) {
                    this.log('End of results reached.');
                    break;
                }
            } else {
                unchangedCount = 0;
            }

            await wait(2000);
        }

        await this.stop();
    }

    async stop() {
        this.isRunning = false;
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.log('Google Maps Bot Stopped.', 'warning');
    }

    log(msg, type = 'info') {
        if (this.logCallback) this.logCallback(msg, type);
        console.log(`[MAPS] [${type}] ${msg}`);
    }
}

module.exports = new GoogleMapsBot();

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
            logCallback('Google Maps Bot já está rodando.', 'warning');
            return;
        }

        this.isRunning = true;
        this.logCallback = logCallback;
        this.dataCallback = dataCallback;
        this.config = config;

        try {
            this.log('Iniciando Google Maps Scraper...');

            // Abrir navegador diretamente com puppeteer
            this.browser = await puppeteer.launch({
                headless: false,
                executablePath: executablePath(),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized'
                ],
                defaultViewport: null
            });

            this.page = (await this.browser.pages())[0];

            this.log('Navegador aberto. Acessando Google Maps...');
            await this.page.goto('https://www.google.com/maps', { waitUntil: 'networkidle2', timeout: 30000 });

            // Aceitar cookies/consentimento se aparecer
            await this.handleConsent();

            // Buscar
            this.log(`Buscando por: "${config.query}"...`);
            await this.doSearch(config.query);

            // Aguardar resultados carregarem
            this.log('Aguardando resultados...');
            await wait(3000);

            try {
                await this.page.waitForSelector('div[role="feed"]', { timeout: 12000 });
            } catch (e) {
                this.log('Feed de resultados não apareceu. Pode ser resultado único ou sem resultados.', 'warning');
            }

            // Iniciar scraping
            await this.scrapeResults();

        } catch (error) {
            this.log(`Erro: ${error.message}`, 'error');
            await this.stop();
        }
    }

    async handleConsent() {
        try {
            const consentSelectors = [
                'button[aria-label="Accept all"]',
                'button[aria-label="Aceitar tudo"]',
                'button[aria-label="Reject all"]',
                'form[action*="consent"] button:last-child',
                'button.VfPpkd-LgbsSe[jsname="b3VHJd"]'
            ];
            for (const sel of consentSelectors) {
                const btn = await this.page.$(sel);
                if (btn) {
                    this.log(`Fechando diálogo de consentimento: ${sel}`);
                    await btn.click();
                    await wait(2000);
                    break;
                }
            }
        } catch (e) {
            // Sem diálogo, tudo certo
        }
    }

    async doSearch(query) {
        // Tentar focar na caixa de busca
        const searchSelectors = [
            '#searchboxinput',
            'input[aria-label="Search Google Maps"]',
            'input[name="q"]'
        ];

        let searchBox = null;
        for (const sel of searchSelectors) {
            try {
                await this.page.waitForSelector(sel, { timeout: 5000 });
                searchBox = sel;
                break;
            } catch (e) { }
        }

        if (!searchBox) {
            throw new Error('Caixa de busca não encontrada. O Google Maps pode ter mudado o layout.');
        }

        await this.page.click(searchBox, { clickCount: 3 });
        await wait(300);
        await this.page.type(searchBox, query, { delay: 80 });
        await wait(400);
        await this.page.keyboard.press('Enter');
    }

    async scrapeResults() {
        this.log('Iniciando extração de leads...');
        const processed = new Set();
        let unchangedCount = 0;
        let totalFound = 0;

        while (this.isRunning) {
            const feed = await this.page.$('div[role="feed"]');

            if (!feed) {
                this.log('Feed não encontrado. Encerrando.', 'warning');
                break;
            }

            // Pegar todos os itens clicáveis do feed
            const items = await feed.$$('a[href*="google.com/maps/place"]');

            for (const item of items) {
                if (!this.isRunning) break;

                const href = await this.page.evaluate(el => el.href, item);
                if (processed.has(href)) continue;
                processed.add(href);

                try {
                    // Scroll até o item e clica
                    await this.page.evaluate(el => el.scrollIntoView({ block: 'center' }), item);
                    await wait(400);
                    await item.click();
                    await wait(2500); // Esperar o painel lateral carregar

                    const details = await this.extractDetails();

                    if (details && details.name) {
                        totalFound++;
                        this.log(`[${totalFound}] ${details.name} | ${details.phone || 'S/Telefone'} | ${details.website || 'S/Site'}`);
                        if (this.dataCallback) this.dataCallback(details);
                    }

                    await wait(800);
                } catch (e) {
                    this.log(`Erro ao processar item: ${e.message}`, 'warning');
                }
            }

            // Rolar o feed para carregar mais resultados
            const scrolled = await this.page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (!feed) return false;
                const before = feed.scrollTop;
                feed.scrollTop += feed.clientHeight;
                return feed.scrollTop !== before;
            });

            if (!scrolled) {
                unchangedCount++;
                if (unchangedCount >= 3) {
                    this.log(`Fim dos resultados. Total extraído: ${totalFound} leads.`);
                    break;
                }
                await wait(1500);
            } else {
                unchangedCount = 0;
                await wait(2000);
            }
        }

        await this.stop();
    }

    async extractDetails() {
        return await this.page.evaluate(() => {
            const res = {};

            // Nome
            const h1 = document.querySelector('h1');
            res.name = h1 ? h1.innerText.trim() : '';
            if (!res.name) return null;

            // Telefone via data-item-id
            const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
            if (phoneBtn) {
                const raw = phoneBtn.getAttribute('data-item-id') || '';
                res.phone = raw.replace('phone:tel:', '').trim() ||
                    phoneBtn.getAttribute('aria-label') ||
                    phoneBtn.innerText.trim();
            }

            // Telefone fallback via aria-label
            if (!res.phone) {
                const allBtns = Array.from(document.querySelectorAll('button[aria-label]'));
                const phoneAria = allBtns.find(b => {
                    const label = b.getAttribute('aria-label') || '';
                    return label.match(/^\+?[\d\s\(\)\-]{7,}$/);
                });
                if (phoneAria) res.phone = phoneAria.getAttribute('aria-label').trim();
            }

            // Website
            const websiteLink = document.querySelector('a[data-item-id="authority"]');
            if (websiteLink) res.website = websiteLink.href;

            // Endereço
            const addressBtn = document.querySelector('button[data-item-id="address"]');
            if (addressBtn) res.address = addressBtn.innerText.trim();

            // Categoria / Rating (visíveis no topo do painel)
            const ratingEl = document.querySelector('div.fontBodyMedium span[aria-label]');
            if (ratingEl) res.rating = ratingEl.getAttribute('aria-label') || ratingEl.innerText.trim();

            return res;
        });
    }

    async stop() {
        this.isRunning = false;
        if (this.browser) {
            try { await this.browser.close(); } catch (e) { }
            this.browser = null;
        }
        this.log('Google Maps Bot encerrado.', 'warning');
    }

    log(msg, type = 'info') {
        if (this.logCallback) this.logCallback(msg, type);
        console.log(`[MAPS] [${type.toUpperCase()}] ${msg}`);
    }
}

module.exports = new GoogleMapsBot();

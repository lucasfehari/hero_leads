/**
 * index.js — Motor Principal do Threads Bot
 *
 * Arquitetura baseada em Máquina de Estados.
 * Cada iteração do loop:
 *   1. Verifica o estado atual
 *   2. Executa somente a ação correspondente ao estado
 *   3. Faz a transição validada para o próximo estado
 *   4. Em caso de erro: vai para RECUPERACAO_DE_ERRO e tenta retomar
 */

const puppeteer = require('puppeteer');
const { loginToThreads } = require('./login');
const { searchThreads, scrollFeed, interactWithThread, forceCloseModal } = require('./actions');
const { analyzeThreadWithAI, generateKeywordsFromPrompt } = require('./strategies');
const { randomDelay } = require('../bot/utils');
const { StateMachine, STATES } = require('./state_machine');
const Logger = require('./logger');
const Navigator = require('./navigator');

// Quantas vezes pode tentar se recuperar por keyword antes de pular
const MAX_RECOVERY_ATTEMPTS = 3;
// Quantos scrolls por keyword
const SCROLLS_PER_KEYWORD = 5;
// Quantos posts analisar por scroll
const MAX_POSTS_PER_SCROLL = 8;

class ThreadsBotEngine {
    constructor() {
        this.browser = null;
        this.isRunning = false;
        this.config = null;
        this.logger = null;
        this.stateMachine = null;
        this.navigator = null;
    }

    // =========================================================
    //  Controle do Motor
    // =========================================================

    async stop() {
        this.isRunning = false;
        if (this.logger) this.logger.log('🛑 Parando Threads Bot...', 'warning');
        if (this.browser) {
            try { await this.browser.close(); } catch (e) { /* silencioso */ }
        }
        if (this.logger) {
            this.logger.log('Motor encerrado.', 'warning');
            this.logger.close();
        }
    }

    async start(config, logCallback) {
        this.config = config;
        this.isRunning = true;

        // Inicializar sistemas
        this.logger = new Logger(logCallback);
        this.stateMachine = new StateMachine(this.logger);

        this.logger.log(`🚀 Threads Bot iniciado. Config: ${JSON.stringify({
            ...config,
            openRouterKey: config.openRouterKey ? '***' : undefined,
        })}`);

        try {
            // ── Browser ──────────────────────────────────────
            this.logger.log('Iniciando navegador...');
            this.browser = await puppeteer.launch({
                headless: false,
                defaultViewport: null,
                args: [
                    '--start-maximized',
                    '--disable-notifications',
                    '--disable-infobars',
                    '--no-first-run',
                ],
            });

            const page = await this.browser.newPage();

            // User Agent humano para evitar detecção
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            );

            // Inicializar Navigator agora que temos a página
            this.navigator = new Navigator(page, this.logger);

            // ── Login ─────────────────────────────────────────
            await page.goto('https://www.threads.net/', { waitUntil: 'networkidle2', timeout: 30000 });
            this.logger.log('Navegador online. Validando sessão...');

            const isLoggedIn = await loginToThreads(
                page,
                (m, t) => this.logger.log(m, t),
                this.config.profile || 'default'
            );

            if (!isLoggedIn) {
                this.logger.log('Falha no login do Threads. Encerrando.', 'error');
                return;
            }

            this.logger.log('✅ Sessão validada. Pronto para prospectar.', 'success');

            // ── Keywords ──────────────────────────────────────
            let keywords = this.config.keywords
                ? this.config.keywords.split(',').map(k => k.trim()).filter(k => k)
                : [];

            if (keywords.length === 0 && this.config.aiMode) {
                const aiKeywords = await generateKeywordsFromPrompt(
                    this.config,
                    (m, t) => this.logger.log(m, t)
                );
                if (aiKeywords && aiKeywords.length > 0) keywords = aiKeywords;
            }

            if (keywords.length === 0) {
                this.logger.log('Nenhum termo de busca disponível. Encerrando.', 'error');
                return;
            }

            this.logger.log(`🔑 Keywords: [${keywords.join(', ')}]`, 'info');

            // ── Loop Principal ────────────────────────────────
            for (const keyword of keywords) {
                if (!this.isRunning) break;
                await this._processKeyword(page, keyword);
            }

        } catch (error) {
            if (this.logger) {
                this.logger.log(`❌ Erro crítico: ${error.message}`, 'error');
                if (this.browser) {
                    const pages = await this.browser.pages();
                    if (pages.length > 0) {
                        await this.logger.captureScreenshot(pages[pages.length - 1], 'critical_error');
                    }
                }
            }
            console.error('[ThreadsBot] Critical Error:', error);
        } finally {
            await this.stop();
        }
    }

    // =========================================================
    //  Processamento de uma Keyword
    // =========================================================

    async _processKeyword(page, keyword) {
        if (!this.isRunning) return;

        this.logger.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        this.logger.log(`🔍 Iniciando busca: "${keyword}"`, 'info');

        // Transição para BUSCANDO_POST
        this.stateMachine.transition(STATES.BUSCANDO_POST);

        try {
            await searchThreads(page, keyword, (m, t) => this.logger.log(m, t));
        } catch (e) {
            this.logger.log(`Falha na busca por "${keyword}": ${e.message}`, 'error');
            this.stateMachine.forceError();
            await this._recoverError(page, `https://www.threads.net/search?q=${encodeURIComponent(keyword)}`);
            return;
        }

        let recoveryAttempts = 0;

        for (let scrollIdx = 0; scrollIdx < SCROLLS_PER_KEYWORD; scrollIdx++) {
            if (!this.isRunning) break;
            if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
                this.logger.log(`⚠️ Limite de recuperações atingido para "${keyword}". Próxima keyword.`, 'warning');
                break;
            }

            this.logger.log(`\n📜 Scroll ${scrollIdx + 1}/${SCROLLS_PER_KEYWORD} | Keyword: "${keyword}"`);

            // Transição para ANALISANDO_POST
            if (!this.stateMachine.is(STATES.ANALISANDO_POST) && !this.stateMachine.is(STATES.BUSCANDO_POST) && !this.stateMachine.is(STATES.PROXIMO_POST)) {
                // Pode chegar aqui de PROXIMO_POST ou BUSCANDO_POST
                // Ajustar estado se necessário
            }

            // Se estamos em RECUPERACAO_DE_ERRO, transitar para PROXIMO_POST primeiro
            if (this.stateMachine.is(STATES.RECUPERACAO_DE_ERRO)) {
                this.stateMachine.transition(STATES.PROXIMO_POST);
            }

            // Agora podemos ir para ANALISANDO_POST
            if (this.stateMachine.is(STATES.BUSCANDO_POST) || this.stateMachine.is(STATES.PROXIMO_POST)) {
                this.stateMachine.transition(STATES.ANALISANDO_POST);
            }

            // Extrair posts visíveis
            let posts = [];
            try {
                posts = await this.navigator.extractVisiblePosts();
            } catch (e) {
                this.logger.log(`Erro ao extrair posts: ${e.message}`, 'error');
                recoveryAttempts++;
                continue;
            }

            if (posts.length === 0) {
                this.logger.log('Nenhum post encontrado neste scroll. Continuando...', 'warning');
                await scrollFeed(page);
                continue;
            }

            // Processar cada post
            let postsProcessed = 0;
            for (const postData of posts) {
                if (!this.isRunning) break;
                if (postsProcessed >= MAX_POSTS_PER_SCROLL) break;

                const processed = await this._processPost(page, postData, keyword);
                if (processed) postsProcessed++;

                // Verificar estado — se caímos em erro, tentar recuperar
                if (this.stateMachine.is(STATES.RECUPERACAO_DE_ERRO)) {
                    recoveryAttempts++;
                    const recovered = await this._recoverError(page, `https://www.threads.net/search?q=${encodeURIComponent(keyword)}`);
                    if (!recovered) break;
                    // Após recuperação, parar este scroll e fazer novo
                    break;
                }
            }

            // Scroll para próximos posts
            if (this.isRunning) {
                await scrollFeed(page);
            }
        }

        // Garantir estado consistente ao final da keyword
        if (this.stateMachine.is(STATES.ANALISANDO_POST) || this.stateMachine.is(STATES.PROXIMO_POST)) {
            this.stateMachine.transition(STATES.BUSCANDO_POST);
        }
    }

    // =========================================================
    //  Processamento de um Post Individual
    // =========================================================

    async _processPost(page, postData, keyword) {
        const { id: elementId, text, authorName } = postData;

        // Filtros de deduplicação
        if (text.length < 15) return false;
        if (this.navigator.wasInteracted(elementId)) {
            this.logger.log(`Pulo: Post "${elementId}" já interagido anteriormente.`);
            return false;
        }
        if (this.navigator.isAuthorProcessedInSession(authorName)) {
            this.logger.log(`Pulo: @${authorName} já interagido nesta sessão.`);
            return false;
        }

        this.logger.log(`\n👤 Analisando post de @${authorName}...`);

        // Análise com IA
        let aiResult;
        try {
            aiResult = await analyzeThreadWithAI(
                text, authorName, this.config,
                (m, t) => this.logger.log(m, t)
            );
        } catch (e) {
            this.logger.log(`Erro na IA: ${e.message}`, 'error');
            return false;
        }

        if (!aiResult.approved || !aiResult.actions) {
            return false; // Post rejeitado pela IA, não é um erro
        }

        // Marcar imediatamente para evitar processamento duplo se demorar
        this.navigator.markAsInteracted(elementId, authorName);

        // Encontrar o elemento no DOM do Puppeteer
        const threadElement = await page.$(`#${elementId}`);
        if (!threadElement) {
            this.logger.log(`Elemento #${elementId} não encontrado no DOM (scroll pode ter movido). Pulando.`, 'warning');
            return false;
        }

        // Executar interação com controle de estado
        try {
            const success = await interactWithThread(
                page,
                threadElement,
                aiResult.actions,
                this.logger,
                this.stateMachine,
                this.navigator
            );

            if (success) {
                // Transição para PROXIMO_POST após sucesso
                if (this.stateMachine.is(STATES.FECHANDO_COMENTARIOS) || this.stateMachine.is(STATES.ANALISANDO_POST)) {
                    this.stateMachine.transition(STATES.PROXIMO_POST);
                }
                await randomDelay(2000, 5000); // Pausa humana entre interações
                return true;
            } else {
                this.stateMachine.forceError();
                return false;
            }

        } catch (e) {
            this.logger.log(`Erro durante interação com @${authorName}: ${e.message}`, 'error');
            await this.logger.captureScreenshot(page, `interaction_error_${authorName}`);
            this.stateMachine.forceError();
            return false;
        }
    }

    // =========================================================
    //  Recuperação de Erro
    // =========================================================

    /**
     * Tenta recuperar o bot de um estado de erro.
     * Estratégias em ordem:
     * 1. Fechar modais abertos
     * 2. Navegar de volta ao feed/busca
     * 3. Aguardar e tentar novamente
     * 
     * @returns {Promise<boolean>} true se recuperou, false se deve abandonar
     */
    async _recoverError(page, returnUrl = 'https://www.threads.net/') {
        this.logger.log('🔧 Iniciando procedimento de recuperação de erro...', 'warning');

        try {
            // 1. Fechar modais
            await forceCloseModal(page, this.logger);
            await randomDelay(1000, 2000);

            // 2. Capturar screenshot do estado atual
            await this.logger.captureScreenshot(page, 'recovery_state');

            // 3. Voltar para uma URL conhecida
            await page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await randomDelay(2000, 4000);

            // 4. Verificar se a página carregou normalmente
            const isValid = await this.navigator.isOnValidFeed().catch(() => false);

            if (isValid) {
                this.logger.log('✅ Recuperação bem-sucedida. Retomando...', 'success');
                // Transitar de RECUPERACAO_DE_ERRO para PROXIMO_POST
                this.stateMachine.transition(STATES.PROXIMO_POST);
                return true;
            }

            this.logger.log('⚠️ Recuperação parcial — feed não detectado mas continuando.', 'warning');
            this.stateMachine.transition(STATES.PROXIMO_POST);
            return true;

        } catch (e) {
            this.logger.log(`❌ Falha na recuperação: ${e.message}`, 'error');
            this.stateMachine.transition(STATES.IDLE);
            return false;
        }
    }
}

module.exports = ThreadsBotEngine;

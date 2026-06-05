/**
 * navigator.js — Navegação Inteligente com Histórico
 *
 * Responsabilidades:
 * - Manter histórico persistente de posts já comentados (por URL/ID)
 * - Manter histórico de sessão de @usernames interagidos
 * - Extrair posts do feed diferenciando de comentários existentes
 * - Retornar ao feed de forma confiável após comentar
 * - Fechar modais abertos antes de navegar
 */

const fs = require('fs');
const path = require('path');
const { randomDelay } = require('../bot/utils');

const HISTORY_FILE = path.join(__dirname, 'interacted_posts.json');

// Seletores para posts no feed (excluindo comentários e respostas)
// O Threads usa article para cada post principal no feed
const POST_SELECTORS = [
    // Posts principais na página de resultados de busca
    'div[data-pressable-container="true"]:not(article *)',
    // Fallback: articles no feed  
    'article[role="article"]',
];

class Navigator {
    /**
     * @param {import('puppeteer').Page} page
     * @param {import('./logger')} logger
     */
    constructor(page, logger) {
        this.page = page;
        this.logger = logger;
        // Histórico persistente: URLs/IDs de posts comentados
        this.interactedPosts = this._loadHistory();
        // Histórico de sessão: @usernames (evita spam na mesma sessão)
        this.sessionAuthors = new Set();
    }

    // =========================================================
    //  Histórico Persistente
    // =========================================================

    _loadHistory() {
        try {
            if (fs.existsSync(HISTORY_FILE)) {
                const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
                this.logger.log(`Navigator: Histórico carregado — ${data.length} posts já interagidos.`);
                return new Set(data);
            }
        } catch (e) {
            this.logger.log(`Navigator: Falha ao carregar histórico: ${e.message}`, 'warning');
        }
        return new Set();
    }

    _saveHistory() {
        try {
            const arr = [...this.interactedPosts];
            // Manter apenas os últimos 5000 registros para não crescer infinitamente
            const trimmed = arr.slice(-5000);
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
        } catch (e) {
            this.logger.log(`Navigator: Falha ao salvar histórico: ${e.message}`, 'warning');
        }
    }

    /**
     * Marca um post como interagido
     * @param {string} postId - URL ou ID único do post
     */
    markAsInteracted(postId, authorName = null) {
        this.interactedPosts.add(postId);
        if (authorName) this.sessionAuthors.add(authorName);
        this._saveHistory();
        this.logger.log(`Navigator: Post marcado como interagido: ${postId}`);
    }

    /**
     * Verifica se um post já foi interagido
     */
    wasInteracted(postId) {
        return this.interactedPosts.has(postId);
    }

    /**
     * Verifica se já interagimos com um autor nesta sessão
     */
    isAuthorProcessedInSession(authorName) {
        return this.sessionAuthors.has(authorName);
    }

    // =========================================================
    //  Extração de Posts do Feed
    // =========================================================

    /**
     * Extrai posts visíveis na tela atual, diferenciando de comentários.
     * Retorna array de { id, text, authorName, elementId }
     */
    async extractVisiblePosts() {
        const posts = await this.page.evaluate(() => {
            const results = [];

            // Estratégia 1: div[data-pressable-container="true"] que são filhos diretos do feed
            // O Threads renderiza posts como containers pressionáveis no nível superior
            const containers = Array.from(
                document.querySelectorAll('div[data-pressable-container="true"]')
            );

            containers.forEach((el, idx) => {
                // Ignorar se estiver dentro de um article que já é filho de outro post (reply/comment)
                const parentContainer = el.parentElement &&
                    el.parentElement.closest('div[data-pressable-container="true"]');
                if (parentContainer) return; // é um sub-elemento, não um post principal

                // Ignorar modais e dialogs abertos
                if (el.closest('[role="dialog"]') || el.closest('[aria-modal="true"]')) return;

                // Dar um ID único para podermos referenciar depois
                if (!el.id) el.id = `_thread_post_${Date.now()}_${idx}`;

                const textContent = (el.innerText || '').trim();
                if (textContent.length < 10) return; // Muito curto para ser um post real

                // Extrair autor: o Threads coloca o username em um link /@username
                let authorName = 'unknown';
                const authorLink = el.querySelector('a[href*="/@"]');
                if (authorLink) {
                    const match = authorLink.getAttribute('href').match(/\/@([^/?]+)/);
                    if (match) authorName = match[1];
                }

                results.push({
                    id: el.id,
                    text: textContent,
                    authorName,
                    elementId: el.id,
                });
            });

            return results;
        });

        this.logger.log(`Navigator: ${posts.length} posts extraídos da tela atual.`);
        return posts;
    }

    // =========================================================
    //  Navegação
    // =========================================================

    /**
     * Fecha modais abertos (dialog, aria-modal) antes de navegar.
     * Tenta pressionar Escape primeiro, depois botões de cancelar.
     */
    async closeOpenModals() {
        try {
            // Verificar se há modal aberto
            const hasModal = await this.page.evaluate(() => {
                return !!(
                    document.querySelector('[aria-modal="true"]') ||
                    document.querySelector('[role="dialog"]')
                );
            });

            if (!hasModal) return true;

            this.logger.log('Navigator: Modal detectado. Tentando fechar...', 'warning');

            // Tentativa 1: Escape
            await this.page.keyboard.press('Escape');
            await randomDelay(800, 1200);

            // Verificar se fechou
            const stillOpen = await this.page.evaluate(() => {
                return !!(
                    document.querySelector('[aria-modal="true"]') ||
                    document.querySelector('[role="dialog"]')
                );
            });

            if (!stillOpen) {
                this.logger.log('Navigator: Modal fechado com Escape.', 'success');
                return true;
            }

            // Tentativa 2: Botão Cancelar/Cancel/Descartar/Discard
            await this.page.evaluate(() => {
                const texts = ['cancelar', 'cancel', 'descartar', 'discard', 'fechar', 'close'];
                const btns = Array.from(document.querySelectorAll('[role="button"], button'));
                const btn = btns.find(b => {
                    const t = (b.innerText || b.textContent || '').toLowerCase().trim();
                    return texts.some(txt => t === txt);
                });
                if (btn) btn.click();
            });
            await randomDelay(800, 1200);

            // Verificar de novo — pode aparecer outro dialog pedindo confirmação de descarte
            await this.page.evaluate(() => {
                const texts = ['descartar', 'discard', 'confirmar', 'confirm'];
                const btns = Array.from(document.querySelectorAll('[role="button"], button'));
                const btn = btns.find(b => {
                    const t = (b.innerText || b.textContent || '').toLowerCase().trim();
                    return texts.some(txt => t === txt);
                });
                if (btn) btn.click();
            });
            await randomDelay(600, 1000);

            this.logger.log('Navigator: Modal fechado por botão.', 'success');
            return true;

        } catch (e) {
            this.logger.log(`Navigator: Erro ao fechar modal: ${e.message}`, 'warning');
            return false;
        }
    }

    /**
     * Retorna ao feed após comentar.
     * Usa goBack() se possível, senão navega para a busca atual.
     * @param {string} [fallbackUrl] - URL para navegar se goBack falhar
     */
    async returnToFeed(fallbackUrl = 'https://www.threads.net/') {
        this.logger.log('Navigator: Retornando ao feed...', 'action');

        try {
            // Fechar qualquer modal pendente primeiro
            await this.closeOpenModals();
            await randomDelay(500, 1000);

            await this.page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await randomDelay(2000, 3500);

            this.logger.log('Navigator: Feed restaurado com sucesso.', 'success');
            return true;
        } catch (e) {
            this.logger.log(`Navigator: Falha ao retornar ao feed: ${e.message}`, 'error');
            return false;
        }
    }

    /**
     * Scroll suave no feed para carregar mais posts
     * @param {number} pixels - Quantidade de pixels para rolar
     */
    async scroll(pixels = 800) {
        const scrollAmount = pixels + Math.floor(Math.random() * 400);
        await this.page.mouse.wheel({ deltaY: scrollAmount });
        await randomDelay(1500, 3000);
        this.logger.log(`Navigator: Scroll de ${scrollAmount}px executado.`);
    }

    /**
     * Verifica se a página atual parece um feed válido do Threads
     */
    async isOnValidFeed() {
        return await this.page.evaluate(() => {
            const url = window.location.href;
            const isThreads = url.includes('threads.net');
            const hasContent = document.querySelectorAll('div[data-pressable-container="true"]').length > 0;
            return isThreads && hasContent;
        });
    }
}

module.exports = Navigator;

/**
 * focus_manager.js — Sistema Inteligente de Foco
 *
 * Responsabilidades:
 * - Identificar o campo de comentário correto dentro do modal de resposta
 * - Verificar que o campo está focado e vazio antes de digitar
 * - Limpar conteúdo inesperado automaticamente
 * - Garantir cursor no final do campo
 * - Diferenciar: campo de comentário, campos de resposta a comentários, campos somente leitura
 */

const { randomDelay } = require('../bot/utils');

// Seletores em ordem de prioridade — do mais específico para o mais genérico
// IMPORTANTE: O Threads renderiza o campo de resposta INLINE no feed (sem modal/dialog).
// Por isso o seletor genérico vem PRIMEIRO — é o que o Threads usa atualmente.
const COMMENT_FIELD_SELECTORS = [
    // 1. Campo inline após clicar em Responder (sem modal — comportamento atual do Threads)
    'div[contenteditable="true"][role="textbox"]:not(article *)',
    // 2. Fallback: campo dentro de modal/dialog (caso o Threads mude o comportamento)
    'div[aria-modal="true"] div[contenteditable="true"][role="textbox"]',
    // 3. Fallback final: dialog genérico
    'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
];

// Seletores que NÃO devem ser focados (elementos somente leitura ou de terceiros)
const FORBIDDEN_SELECTORS = [
    'article div[contenteditable="true"]',     // comentário existente de terceiro
    'div[data-testid="post-composer"] div[contenteditable="true"]', // criação de post (não comentário)
];

class FocusManager {
    /**
     * @param {import('puppeteer').Page} page
     * @param {import('./logger')} logger
     */
    constructor(page, logger) {
        this.page = page;
        this.logger = logger;
    }

    /**
     * Encontra, valida e foca o campo correto de comentário.
     * Limpa qualquer conteúdo existente inesperado.
     * 
     * @returns {Promise<import('puppeteer').ElementHandle|null>} Elemento focado ou null se falhar
     */
    async validateAndFocusCommentField() {
        this.logger.log('FocusManager: Buscando campo de comentário correto...', 'action');

        for (const selector of COMMENT_FIELD_SELECTORS) {
            try {
                const field = await this.page.$(selector);
                if (!field) continue;

                // Verificar que não é um campo proibido
                const isForbidden = await this._isForbiddenField(field);
                if (isForbidden) {
                    this.logger.log(`FocusManager: Campo ignorado (proibido): ${selector}`, 'warning');
                    continue;
                }

                // Verificar visibilidade
                const isVisible = await this._isVisible(field);
                if (!isVisible) {
                    this.logger.log(`FocusManager: Campo não visível: ${selector}`, 'warning');
                    continue;
                }

                this.logger.logAction({ action: 'FOCUS_FIELD', element: selector, result: 'FOUND' });

                // Clicar para focar
                await field.click();
                await randomDelay(300, 600);

                // Confirmar que o campo está realmente focado
                const isFocused = await this._confirmFocus(field);
                if (!isFocused) {
                    this.logger.log(`FocusManager: Campo encontrado mas não focou: ${selector}`, 'warning');
                    // Tentar forçar foco via JavaScript
                    await this.page.evaluate(el => el.focus(), field);
                    await randomDelay(200, 400);
                }

                // Verificar e limpar conteúdo existente
                const existingContent = await this._getFieldContent(field);
                if (existingContent && existingContent.trim().length > 0) {
                    this.logger.log(`FocusManager: Campo tem conteúdo inesperado: "${existingContent.substring(0, 50)}". Limpando...`, 'warning');
                    await this._clearField(field);
                    await randomDelay(200, 400);
                }

                // Posicionar cursor no final
                await this._moveCursorToEnd(field);

                this.logger.log('FocusManager: Campo correto focado e pronto para digitação.', 'success');
                return field;

            } catch (e) {
                this.logger.log(`FocusManager: Erro ao tentar seletor "${selector}": ${e.message}`, 'warning');
                continue;
            }
        }

        this.logger.log('FocusManager: FALHA — Nenhum campo de comentário válido encontrado.', 'error');
        return null;
    }

    /**
     * Verifica se o elemento está na lista de campos proibidos
     */
    async _isForbiddenField(element) {
        return await this.page.evaluate((el, forbiddenSelectors) => {
            return forbiddenSelectors.some(sel => {
                try {
                    return el.closest && el.closest('article') !== null;
                } catch {
                    return false;
                }
            });
        }, element, FORBIDDEN_SELECTORS);
    }

    /**
     * Verifica se o elemento está visível na viewport
     */
    async _isVisible(element) {
        return await this.page.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0'
            );
        }, element);
    }

    /**
     * Confirma se o elemento é o activeElement atual
     */
    async _confirmFocus(element) {
        return await this.page.evaluate(el => document.activeElement === el, element);
    }

    /**
     * Lê o conteúdo textual do campo
     */
    async _getFieldContent(element) {
        return await this.page.evaluate(el => el.innerText || el.textContent || '', element);
    }

    /**
     * Limpa o conteúdo do campo usando Ctrl+A + Delete
     */
    async _clearField(element) {
        await element.click();
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await randomDelay(100, 200);
        await this.page.keyboard.press('Delete');
        await randomDelay(100, 200);
        // Segunda passagem com Backspace para garantir limpeza completa
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');

        this.logger.logAction({ action: 'CLEAR_FIELD', result: 'OK' });
    }

    /**
     * Move o cursor para o final do conteúdo
     */
    async _moveCursorToEnd(element) {
        await this.page.evaluate(el => {
            el.focus();
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false); // collapse to end
            selection.removeAllRanges();
            selection.addRange(range);
        }, element);
    }

    /**
     * Verifica se o cursor está no final do campo após digitação
     * @returns {Promise<boolean>}
     */
    async isCursorAtEnd(element) {
        return await this.page.evaluate(el => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return false;
            const range = selection.getRangeAt(0);
            // Cria range do inicio do elemento até o cursor
            const preRange = range.cloneRange();
            preRange.selectNodeContents(el);
            preRange.setEnd(range.endContainer, range.endOffset);
            const textBeforeCursor = preRange.toString();
            const totalText = el.innerText || el.textContent || '';
            // Cursor está no final se o texto antes = texto total
            return textBeforeCursor.trimEnd() === totalText.trimEnd();
        }, element);
    }
}

module.exports = FocusManager;

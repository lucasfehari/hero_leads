/**
 * comment_writer.js — Digitação Humana Segura com Validação
 *
 * Responsabilidades:
 * - Digitar texto em chunks com delay humano variável
 * - Verificar texto digitado vs texto esperado após cada chunk
 * - Corrigir divergências automaticamente (limpar + redigitar)
 * - Não avançar se o texto final estiver incorreto
 * - Garantir cursor no final antes de submeter
 */

const { randomDelay } = require('../bot/utils');

const MAX_RETRIES = 3;
const CHUNK_SIZE_MIN = 4;
const CHUNK_SIZE_MAX = 9;
const CHAR_DELAY_MIN = 35;
const CHAR_DELAY_MAX = 90;

class CommentWriter {
    /**
     * @param {import('puppeteer').Page} page
     * @param {import('./logger')} logger
     * @param {import('./focus_manager')} focusManager
     */
    constructor(page, logger, focusManager) {
        this.page = page;
        this.logger = logger;
        this.focusManager = focusManager;
    }

    /**
     * Digita o texto no campo focado com validação completa.
     * 
     * @param {import('puppeteer').ElementHandle} field - Campo já focado
     * @param {string} text - Texto a ser digitado
     * @returns {Promise<boolean>} true se o texto foi digitado e validado com sucesso
     */
    async typeWithValidation(field, text) {
        if (!text || text.trim().length === 0) {
            this.logger.log('CommentWriter: Texto vazio recebido. Abortando digitação.', 'warning');
            return false;
        }

        // Sanitizar texto — remover quebras de linha que podem causar envio acidental
        const sanitizedText = text.replace(/\n/g, ' ').trim();

        this.logger.logAction({
            action: 'TYPE_START',
            text: sanitizedText,
            element: 'comment_field',
        });

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            this.logger.log(`CommentWriter: Tentativa ${attempt}/${MAX_RETRIES} de digitação...`);

            // Limpar campo antes de cada tentativa
            await this._clearField(field);
            await randomDelay(200, 400);

            // Garantir foco antes de digitar
            const isFocused = await this.page.evaluate(el => document.activeElement === el, field);
            if (!isFocused) {
                this.logger.log('CommentWriter: Campo perdeu foco. Refocando...', 'warning');
                await field.click();
                await randomDelay(200, 300);
            }

            // Digitar em chunks
            const success = await this._typeInChunks(field, sanitizedText);
            if (!success) {
                this.logger.log(`CommentWriter: Falha na digitação em chunks (tentativa ${attempt}).`, 'warning');
                continue;
            }

            // Validação final: comparar texto esperado com texto real no campo
            await randomDelay(300, 600);
            const actualText = await this._getFieldText(field);
            
            if (this._textsMatch(sanitizedText, actualText)) {
                // Posicionar cursor no final antes de submeter
                await this.focusManager._moveCursorToEnd(field);
                
                this.logger.logAction({
                    action: 'TYPE_COMPLETE',
                    text: sanitizedText,
                    result: 'OK',
                });
                return true;
            }

            this.logger.log(
                `CommentWriter: Divergência detectada!\n  Esperado: "${sanitizedText.substring(0, 80)}"\n  Obtido:   "${(actualText || '').substring(0, 80)}"`,
                'warning'
            );

            if (attempt < MAX_RETRIES) {
                this.logger.log('CommentWriter: Reescrevendo texto...', 'info');
                await randomDelay(500, 1000);
            }
        }

        this.logger.logAction({
            action: 'TYPE_FAILED',
            text: sanitizedText,
            result: 'FAIL',
            reason: `Texto divergente após ${MAX_RETRIES} tentativas`,
        });
        return false;
    }

    /**
     * Digita o texto completo em chunks aleatórios com delay humano.
     * Verifica parcialmente após cada chunk para detectar falhas cedo.
     */
    async _typeInChunks(field, text) {
        let position = 0;
        let chunksTyped = 0;

        while (position < text.length) {
            // Tamanho aleatório do chunk
            const chunkSize = CHUNK_SIZE_MIN + Math.floor(Math.random() * (CHUNK_SIZE_MAX - CHUNK_SIZE_MIN + 1));
            const chunk = text.substring(position, position + chunkSize);

            try {
                // Delay humano antes do chunk (simula pausa entre palavras)
                if (chunksTyped > 0) await randomDelay(80, 300);

                // Digitar o chunk caractere por caractere com delay variável
                for (const char of chunk) {
                    await this.page.keyboard.type(char, {
                        delay: CHAR_DELAY_MIN + Math.floor(Math.random() * (CHAR_DELAY_MAX - CHAR_DELAY_MIN)),
                    });
                }

                position += chunk.length;
                chunksTyped++;

                // A cada 3 chunks, fazer uma verificação parcial
                if (chunksTyped % 3 === 0) {
                    const partialText = await this._getFieldText(field);
                    const expectedPartial = text.substring(0, position);
                    
                    if (!this._textsMatch(expectedPartial, partialText)) {
                        this.logger.log(
                            `CommentWriter: Divergência parcial após ${chunksTyped} chunks. Abortando chunk loop.`,
                            'warning'
                        );
                        return false;
                    }
                }

            } catch (e) {
                this.logger.log(`CommentWriter: Erro ao digitar chunk "${chunk}": ${e.message}`, 'error');
                return false;
            }
        }

        return true;
    }

    /**
     * Limpa o campo com Ctrl+A + Backspace
     */
    async _clearField(field) {
        try {
            await field.click();
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await randomDelay(80, 150);
            await this.page.keyboard.press('Backspace');
            await randomDelay(100, 200);
        } catch (e) {
            // Silencioso — pode estar vazio
        }
    }

    /**
     * Lê o texto atual do campo
     */
    async _getFieldText(field) {
        try {
            return await this.page.evaluate(el => (el.innerText || el.textContent || '').trim(), field);
        } catch {
            return '';
        }
    }

    /**
     * Compara dois textos de forma tolerante (normaliza espaços e unicode)
     */
    _textsMatch(expected, actual) {
        if (!expected && !actual) return true;
        if (!expected || !actual) return false;
        
        const normalize = str => str
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width chars

        return normalize(expected) === normalize(actual);
    }
}

module.exports = CommentWriter;

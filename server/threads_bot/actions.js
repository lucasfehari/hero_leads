/**
 * actions.js — Ações Robustas do Threads Bot
 *
 * Cada ação:
 * 1. Verifica o estado da máquina antes de executar
 * 2. Usa FocusManager para validar foco antes de digitar
 * 3. Usa CommentWriter para digitar com validação
 * 4. Valida o resultado antes de avançar
 * 5. Registra tudo no Logger
 */

const { randomDelay } = require('../bot/utils');
const FocusManager = require('./focus_manager');
const CommentWriter = require('./comment_writer');

// Seletores para o botão de Reply/Responder (abre o campo inline)
const REPLY_BUTTON_SELECTORS = [
    'svg[aria-label="Reply"]',
    'svg[aria-label="Responder"]',
    'svg[aria-label="Resposta"]',
];

// Seletores para o botão Publicar/Post dentro do modal
const PUBLISH_BUTTON_TEXTS = ['post', 'publicar', 'postar', 'reply', 'responder'];

// Seletores para o botão de Like
const LIKE_BUTTON_SELECTORS = [
    'svg[aria-label="Like"]',
    'svg[aria-label="Curtir"]',
    'svg[aria-label="Gostei"]',
];

// O Threads renderiza o campo de comentário inline (sem modal/dialog)
// após clicar em Responder. Estes seletores cobrem esse campo inline.
const COMMENT_FIELD_SELECTORS = [
    // Campo inline que aparece após clicar em Responder (sem modal)
    'div[contenteditable="true"][role="textbox"]',
    // Fallback: dentro de modal se algum dia mudar
    'div[aria-modal="true"] div[contenteditable="true"][role="textbox"]',
    'div[role="dialog"] div[contenteditable="true"]',
];

// Timeout para esperar o campo de comentário aparecer
const MODAL_OPEN_TIMEOUT = 6000;
// Timeout para esperar confirmação de publicação
const PUBLISH_CONFIRM_TIMEOUT = 12000;
// Max retries para abrir modal
const MODAL_OPEN_RETRIES = 3;

/**
 * Navega para a URL de busca de uma keyword
 */
const searchThreads = async (page, keyword, logCallback) => {
    logCallback(`🔍 Buscando no Threads: "${keyword}"`);
    try {
        const url = `https://www.threads.net/search?q=${encodeURIComponent(keyword)}&serp_type=default`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(3000, 5000);
        logCallback(`✅ Busca executada: "${keyword}"`);
    } catch (error) {
        logCallback(`❌ Erro durante busca: ${error.message}`, 'error');
        throw error; // Propagar para o motor tratar como erro de estado
    }
};

/**
 * Scroll humanizado no feed
 */
const scrollFeed = async (page, pixels = 800) => {
    const scrollAmount = pixels + Math.floor(Math.random() * 400);
    await page.mouse.wheel({ deltaY: scrollAmount });
    await randomDelay(1500, 3000);
};

/**
 * Curtir um thread
 */
const likeThread = async (page, threadElement, logger) => {
    for (const sel of LIKE_BUTTON_SELECTORS) {
        try {
            const likeBtn = await threadElement.$(sel);
            if (!likeBtn) continue;

            // Verificar se já está curtido (evitar descurtir)
            const isAlreadyLiked = await page.evaluate(el => {
                // Threads pinta o coração de vermelho quando curtido
                const parent = el.closest('[role="button"]');
                if (!parent) return false;
                const style = window.getComputedStyle(el);
                return style.fill === 'rgb(255, 72, 88)' || style.color === 'rgb(255, 72, 88)';
            }, likeBtn);

            if (isAlreadyLiked) {
                logger.log('Post já estava curtido. Pulando curtida.', 'info');
                return true;
            }

            await likeBtn.click();
            logger.logAction({ action: 'LIKE', element: sel, result: 'OK' });
            await randomDelay(1000, 2500);
            return true;

        } catch (e) {
            // Tentar próximo seletor
        }
    }
    logger.log('Botão de Like não encontrado.', 'warning');
    return false;
};

/**
 * Abre o campo de comentário de um thread (inline ou modal).
 *
 * O Threads NÃO abre um modal separado para respostas — após clicar em
 * "Responder", o campo contenteditable aparece diretamente no feed.
 * A função detecta qualquer variante (inline ou modal).
 *
 * Retorna true se o campo ficou disponível para digitação.
 */
const openCommentModal = async (page, threadElement, logger) => {
    // Seletor combinado: campo inline ou dentro de modal/dialog
    const fieldSelector = COMMENT_FIELD_SELECTORS.join(', ');

    for (let attempt = 1; attempt <= MODAL_OPEN_RETRIES; attempt++) {
        logger.log(`Abrindo modal de comentário (tentativa ${attempt}/${MODAL_OPEN_RETRIES})...`, 'action');

        // Verificar se o campo já está visível (de tentativa anterior)
        try {
            const existingField = await page.$(fieldSelector);
            if (existingField) {
                const isVisible = await page.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }, existingField);
                if (isVisible) {
                    logger.log('Campo de comentário já está visível.', 'success');
                    return true;
                }
            }
        } catch (e) { /* continuar */ }

        // Tentar cada seletor de botão Reply
        for (const sel of REPLY_BUTTON_SELECTORS) {
            try {
                const replyBtn = await threadElement.$(sel);
                if (!replyBtn) continue;

                // Rolar até o botão para garantir visibilidade
                await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), replyBtn);
                await randomDelay(400, 700);

                // Clicar no elemento pai clickável (o SVG em si pode não ser clicável)
                const clicked = await page.evaluate(el => {
                    const btn = el.closest('[role="button"]') || el.parentElement;
                    if (btn) { btn.click(); return true; }
                    el.click();
                    return true;
                }, replyBtn);

                if (!clicked) continue;
                logger.logAction({ action: 'CLICK_REPLY', element: sel, result: 'CLICKED' });

                // Aguardar campo de comentário aparecer (inline ou modal)
                try {
                    await page.waitForSelector(fieldSelector, { visible: true, timeout: MODAL_OPEN_TIMEOUT });
                    logger.log('Campo de comentário aberto com sucesso.', 'success');
                    await randomDelay(600, 1200);
                    return true;
                } catch (e) {
                    logger.log(`Campo não apareceu após clicar em ${sel}: ${e.message}`, 'warning');
                }
            } catch (e) {
                // Tentar próximo seletor
            }
        }

        if (attempt < MODAL_OPEN_RETRIES) {
            logger.log(`Aguardando antes de tentar abrir o modal novamente...`, 'info');
            await randomDelay(1500, 2500);
        }
    }

    logger.log('FALHA: Não foi possível abrir o modal de comentário.', 'error');
    return false;
};

/**
 * Clica no botão de Enviar/Publicar a resposta.
 *
 * O Threads usa um botão com SVG aria-label="Responder" (rotacionado 90°)
 * como botão de submit da resposta inline. Não há texto "Publicar" visível.
 * Tenta múltiplas estratégias em ordem de confiabilidade.
 *
 * Retorna true se clicou com sucesso.
 */
const clickPublishButton = async (page, logger) => {
    try {
        // Aguardar o campo ter conteúdo (campo vazio = botão desabilitado/inexistente)
        await randomDelay(400, 800);

        // Estratégia 1: botão de submit inline do Threads
        // É um [role="button"] que contém svg[aria-label="Responder"] com rotate(90deg)
        const clickedInlineSend = await page.evaluate(() => {
            // Procurar SVG de envio (aria-label="Responder" com transform rotate)
            const svgs = Array.from(document.querySelectorAll('svg[aria-label="Responder"], svg[aria-label="Reply"]'));
            for (const svg of svgs) {
                const style = svg.getAttribute('style') || '';
                const parentStyle = (svg.parentElement && svg.parentElement.getAttribute('style')) || '';
                // O botão de ENVIAR tem rotate(90deg), o de abrir reply NÃO tem
                if (style.includes('rotate') || parentStyle.includes('rotate')) {
                    const btn = svg.closest('[role="button"]');
                    if (btn) { btn.click(); return 'inline-send'; }
                }
            }
            return null;
        });

        if (clickedInlineSend) {
            logger.logAction({ action: 'CLICK_PUBLISH', result: `CLICKED (${clickedInlineSend})` });
            return true;
        }

        // Estratégia 2: botão com texto Publicar/Post (modais antigos)
        await page.waitForFunction(() => {
            const btns = Array.from(document.querySelectorAll('[role="button"], button'));
            const pubBtn = btns.find(b => {
                const text = (b.innerText || b.textContent || '').toLowerCase().trim();
                return ['post', 'publicar', 'postar', 'reply', 'responder'].some(t => text === t);
            });
            return pubBtn && !pubBtn.disabled && pubBtn.getAttribute('aria-disabled') !== 'true';
        }, { timeout: 4000 }).catch(() => null);

        const clickedText = await page.evaluate((texts) => {
            const btns = Array.from(document.querySelectorAll('[role="button"], button'));
            const pubBtn = btns.find(b => {
                const text = (b.innerText || b.textContent || '').toLowerCase().trim();
                return texts.some(t => text === t);
            });
            if (pubBtn) { pubBtn.click(); return true; }
            return false;
        }, PUBLISH_BUTTON_TEXTS);

        if (clickedText) {
            logger.logAction({ action: 'CLICK_PUBLISH', result: 'CLICKED (text-button)' });
            return true;
        }

        // Estratégia 3: Enter no campo de texto
        logger.log('Botão de envio não encontrado — tentando Enter no campo.', 'warning');
        const fieldSelector = COMMENT_FIELD_SELECTORS.join(', ');
        const field = await page.$(fieldSelector);
        if (field) {
            await field.press('Enter');
            logger.logAction({ action: 'CLICK_PUBLISH', result: 'CLICKED (Enter key)' });
            return true;
        }

        logger.log('Botão Publicar não encontrado ou desabilitado.', 'warning');
        return false;

    } catch (e) {
        logger.log(`Erro ao clicar em Publicar: ${e.message}`, 'error');
        return false;
    }
};

/**
 * Valida que o comentário foi publicado com sucesso.
 * Aguarda o modal fechar E verifica que não houve erro de rede.
 * @returns {'success'|'partial'|'failed'}
 */
const validateCommentPublished = async (page, logger) => {
    logger.log('Validando publicação do comentário...', 'action');

    try {
        // Para respostas inline, o sinal de sucesso é o campo de texto sumir
        // OU o campo ser esvaziado. Também detecta modal fechando (caso antigo).
        await page.waitForFunction(() => {
            // Caso 1: modal/dialog fechou
            const modal = document.querySelector('[aria-modal="true"]') || document.querySelector('[role="dialog"]');
            if (!modal) return true;

            // Caso 2: campo de comentário sumiu ou foi esvaziado (inline)
            const field = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!field) return true;
            const content = (field.innerText || '').trim();
            return content.length === 0;
        }, { timeout: PUBLISH_CONFIRM_TIMEOUT });

        logger.log('✅ Comentário publicado com sucesso.', 'success');
        await randomDelay(1000, 2000);
        return 'success';

    } catch (e) {
        // Verificar se há mensagem de erro na página
        const errorMsg = await page.evaluate(() => {
            const errorEls = document.querySelectorAll('[role="alert"], [aria-live="polite"]');
            for (const el of errorEls) {
                const text = (el.innerText || '').trim();
                if (text.length > 0) return text;
            }
            return null;
        });

        if (errorMsg) {
            logger.log(`❌ Erro na publicação detectado: "${errorMsg}"`, 'error');
            return 'failed';
        }

        logger.log('⚠️ Timeout ao aguardar confirmação — publicação incerta.', 'warning');
        return 'partial';
    }
};

/**
 * Força o fechamento de qualquer modal aberto.
 * Usado em recuperação de erro e após publicação.
 */
const forceCloseModal = async (page, logger) => {
    logger.log('Forçando fechamento de modal...', 'warning');

    // Tentativa 1: Escape
    await page.keyboard.press('Escape');
    await randomDelay(700, 1200);

    // Verificar se fechou
    const stillOpen = await page.evaluate(() => {
        return !!(document.querySelector('[aria-modal="true"]') || document.querySelector('[role="dialog"]'));
    });

    if (!stillOpen) return true;

    // Tentativa 2: Botão Cancelar
    await page.evaluate(() => {
        const texts = ['cancelar', 'cancel', 'fechar', 'close', 'descartar', 'discard'];
        const btns = Array.from(document.querySelectorAll('[role="button"], button'));
        const btn = btns.find(b => texts.some(t => (b.innerText || '').toLowerCase().trim() === t));
        if (btn) btn.click();
    });
    await randomDelay(700, 1200);

    // Tentativa 3: Confirmar descarte se solicitado
    await page.evaluate(() => {
        const texts = ['descartar', 'discard', 'confirmar', 'confirm'];
        const btns = Array.from(document.querySelectorAll('[role="button"], button'));
        const btn = btns.find(b => texts.some(t => (b.innerText || '').toLowerCase().trim() === t));
        if (btn) btn.click();
    });
    await randomDelay(500, 1000);

    return true;
};

/**
 * Função principal de interação com um thread.
 * Integra todos os sistemas: estado, foco, digitação, validação.
 * 
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').ElementHandle} threadElement
 * @param {{ shouldLike: boolean, shouldComment: boolean, customComment: string }} actions
 * @param {import('./logger')} logger
 * @param {import('./state_machine').StateMachine} stateMachine
 * @param {import('./navigator')} navigator
 * @returns {Promise<boolean>} true se a interação foi bem sucedida
 */
const interactWithThread = async (page, threadElement, actions, logger, stateMachine, navigator) => {
    const { STATES } = require('./state_machine');
    
    // ── LIKE ──────────────────────────────────────────────────
    if (actions.shouldLike) {
        try {
            await likeThread(page, threadElement, logger);
            await randomDelay(800, 2000);
        } catch (e) {
            logger.log(`Falha ao curtir: ${e.message}`, 'warning');
            // Não fatal — continuar para o comentário
        }
    }

    // ── COMENTÁRIO ────────────────────────────────────────────
    if (!actions.shouldComment || !actions.customComment) {
        return true; // Nada mais a fazer
    }

    // Transição para ABRINDO_COMENTARIOS
    stateMachine.transition(STATES.ABRINDO_COMENTARIOS);

    // 1. Abrir o modal de comentário
    const modalOpened = await openCommentModal(page, threadElement, logger);
    if (!modalOpened) {
        logger.log('Não foi possível abrir o modal. Disparando recuperação.', 'error');
        await logger.captureScreenshot(page, 'modal_open_fail');
        return false;
    }

    // 2. Criar instâncias dos sistemas de foco e digitação
    const focusManager = new FocusManager(page, logger);
    const commentWriter = new CommentWriter(page, logger, focusManager);

    // Transição para ESCREVENDO_COMENTARIO
    stateMachine.transition(STATES.ESCREVENDO_COMENTARIO);

    // 3. Validar e focar o campo correto
    const field = await focusManager.validateAndFocusCommentField();
    if (!field) {
        logger.log('Campo de comentário não encontrado. Disparando recuperação.', 'error');
        await logger.captureScreenshot(page, 'focus_fail');
        await forceCloseModal(page, logger);
        return false;
    }

    // 4. Digitar com validação
    const typed = await commentWriter.typeWithValidation(field, actions.customComment);
    if (!typed) {
        logger.log('Falha na digitação após todas as tentativas. Abortando comentário.', 'error');
        await logger.captureScreenshot(page, 'typing_fail');
        await forceCloseModal(page, logger);
        return false;
    }

    // Pausa humana antes de publicar
    await randomDelay(1000, 2500);

    // 5. Clicar em Publicar
    const publishClicked = await clickPublishButton(page, logger);
    if (!publishClicked) {
        logger.log('Botão Publicar não encontrado. Abortando.', 'error');
        await logger.captureScreenshot(page, 'publish_btn_fail');
        await forceCloseModal(page, logger);
        return false;
    }

    // Transição para VALIDANDO_COMENTARIO
    stateMachine.transition(STATES.VALIDANDO_COMENTARIO);

    // 6. Validar que o comentário foi publicado
    const publishResult = await validateCommentPublished(page, logger);

    if (publishResult === 'failed') {
        await logger.captureScreenshot(page, 'publish_validation_fail');
        await forceCloseModal(page, logger);
        return false;
    }

    if (publishResult === 'partial') {
        // Incerto — forçar fechamento e continuar (melhor que travar)
        await forceCloseModal(page, logger);
    }

    // Transição para FECHANDO_COMENTARIOS
    stateMachine.transition(STATES.FECHANDO_COMENTARIOS);

    logger.log('✅ Interação completa com o thread.', 'success');
    return true;
};

module.exports = {
    searchThreads,
    scrollFeed,
    interactWithThread,
    forceCloseModal,
};

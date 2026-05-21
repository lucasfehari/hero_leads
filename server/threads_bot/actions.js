const { randomDelay } = require('../bot/utils');

const searchThreads = async (page, keyword, logCallback) => {
    logCallback(`Searching Threads for keyword: "${keyword}"`);
    try {
        // Direct navigation to search results is the most reliable method
        await page.goto(`https://www.threads.net/search?q=${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 5000);
        logCallback(`Search executed for: ${keyword}. Waiting for results...`);
    } catch (error) {
        logCallback(`Error during search: ${error.message}`, 'error');
    }
};

const scrollFeed = async (page) => {
    await page.mouse.wheel({ deltaY: 800 + Math.random() * 400 });
    await randomDelay(2000, 4000);
};

const interactWithThread = async (page, threadElement, actions, logCallback) => {
    // actions = { shouldLike, shouldComment, customComment }
    
    if (actions.shouldLike) {
        try {
            // Find like button within this specific thread element
            const likeBtn = await threadElement.$('svg[aria-label="Like"], svg[aria-label="Curtir"]');
            if (likeBtn) {
                // Check if already liked by seeing if it's filled or red (Threads uses red for liked)
                // We'll just click it if found
                await likeBtn.click();
                logCallback(`[Action] Liked a thread.`, 'success');
                await randomDelay(1000, 3000);
            }
        } catch (e) {
            logCallback(`Failed to like thread.`, 'warning');
        }
    }

    if (actions.shouldComment && actions.customComment) {
        try {
            const replyBtn = await threadElement.$('svg[aria-label="Reply"], svg[aria-label="Responder"]');
            if (replyBtn) {
                await replyBtn.click();
                await randomDelay(1500, 2500);
                
                // Focus the textbox specifically before typing
                const textBox = await page.$('div[contenteditable="true"][role="textbox"]');
                if (textBox) {
                    await textBox.click();
                    await randomDelay(500, 1000);
                }

                // Now type in the contenteditable div
                await page.keyboard.type(actions.customComment, { delay: 50 });
                await randomDelay(1500, 3000);
                
                // Find the post/reply button
                const posted = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('div[role="button"]'));
                    const pubBtn = btns.find(b => b.innerText && (b.innerText.trim() === 'Post' || b.innerText.trim() === 'Publicar' || b.innerText.trim() === 'Postar'));
                    if (pubBtn) {
                        pubBtn.click();
                        return true;
                    }
                    return false;
                });

                if (posted) {
                    logCallback(`[Action] Clicou em Publicar o comentário.`, 'success');
                } else {
                    logCallback(`[Action] Aviso: Botão Publicar não encontrado.`, 'warning');
                }

                // Wait for the modal to close indicating success
                try {
                    await page.waitForFunction(() => {
                        return !document.querySelector('div[aria-modal="true"][role="dialog"]');
                    }, { timeout: 8000 });
                } catch (e) {
                    logCallback(`Aviso: Modal de comentário travou na tela. Forçando fechamento...`, 'warning');
                    
                    // Force close by clicking Cancelar
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('div[role="button"], div'));
                        const cancelBtn = btns.find(b => b.innerText && (b.innerText.trim() === 'Cancelar' || b.innerText.trim() === 'Cancel'));
                        if (cancelBtn) cancelBtn.click();
                    });

                    await randomDelay(1000, 2000);
                    
                    // If it asks for confirmation to discard
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('div[role="button"], span'));
                        const discard = btns.find(b => b.innerText && (b.innerText.trim() === 'Descartar' || b.innerText.trim() === 'Discard'));
                        if (discard) discard.click();
                    });
                }
                
                await randomDelay(2000, 4000);
            }
        } catch (e) {
            logCallback(`Failed to reply to thread: ${e.message}`, 'warning');
        }
    }
};

module.exports = {
    searchThreads,
    scrollFeed,
    interactWithThread
};

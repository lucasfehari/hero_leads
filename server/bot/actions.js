const { randomDelay, humanType, humanMove, smartClick, autoScroll } = require('./utils');

// Multi-language Dictionaries
const TEXTS = {
    FOLLOW: ['follow', 'seguir', 'suivre', 'folgen', 'segui'],
    FOLLOWING: ['following', 'seguindo', 'abbonato', 'abonné', 'gefolgt', 'requested', 'solicitado'],
    MESSAGE: ['message', 'enviar mensagem', 'mensagem', 'mensaje', 'enviar mensaje', 'contacter', 'nachricht', 'messaggio'],
    LIKE: ['like', 'curtir', 'aimer', 'gefällt mir', 'mi piace', 'me gusta'],
    UNLIKE: ['unlike', 'descurtir', 'je n\'aime plus', 'gefällt mir nicht mehr', 'non mi piace più', 'ya no me gusta'],
    COMMENT: ['comment', 'comentar', 'comentario', 'kommentieren', 'commenta'],
    NOT_NOW: ['not now', 'agora não', 'ahora no', 'plus tard', 'jetzt nicht', 'non ora']
};

const likePost = async (page) => {
    try {
        // Generate generic selector for all languages
        const likeSelectors = TEXTS.LIKE.map(t => `svg[aria-label="${t}" i]`).join(',');
        const likeBtn = await page.$(likeSelectors);

        if (likeBtn) {
            const clickable = await likeBtn.evaluateHandle(el => {
                return el.closest('button') || el.closest('div[role="button"]');
            });

            if (clickable) {
                await humanMove(page); // Move mouse before clicking
                await clickable.click();
                await randomDelay(500, 1000);
                return true;
            }
        } else {
            // Already liked?
            // Some languages put the aria-label on the svg, some on the parent.
            const unlikeSelectors = TEXTS.UNLIKE.map(t => `svg[aria-label="${t}" i]`).join(',');
            const unlikeBtn = await page.$(unlikeSelectors);
            if (unlikeBtn) return 'already_liked';
        }
    } catch (e) {
        console.error("Error liking:", e);
    }
    return false;
};

const commentPost = async (page, message) => {
    try {
        // 1. Find comment text area
        // It's usually a textarea with aria-label="Add a comment..." or similar
        const commentSelector = 'textarea[aria-label="Add a comment…"], textarea[aria-label="Adicione um comentário..."], textarea';

        // Sometimes we need to click the comment button first to focus/reveal
        // <svg aria-label="Comment" ...>

        const commentIcon = await page.$('svg[aria-label="Comment"], svg[aria-label="Comentar"]');
        if (commentIcon) {
            const clickable = await commentIcon.evaluateHandle(el => el.closest('button') || el.closest('div[role="button"]'));
            if (clickable) await clickable.click();
            await randomDelay(1000, 2000);
        }

        const textarea = await page.$(commentSelector);

        if (textarea) {
            await textarea.click();
            await randomDelay(500, 1500);
            await humanType(page, message);
            await randomDelay(1000, 2000);

            // Press Enter to post (works on desktop usually) or find "Post" button
            await page.keyboard.press('Enter');

            // Verify if posted? 
            // Often a "Posting..." text appears. 
            await randomDelay(2000, 4000);
            return true;
        }
    } catch (e) {
        console.error("Error commenting:", e);
    }
    return false;
};

const followUser = async (page) => {
    try {
        // 1. Find and Click based on Multi-Language Dictionary
        const followBtn = await page.evaluateHandle((texts) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => {
                const text = b.textContent.toLowerCase().trim();
                return texts.includes(text);
            });
        }, TEXTS.FOLLOW);

        if (followBtn && followBtn.asElement()) {
            await humanMove(page);
            await followBtn.click();

            // 2. OBSERVE: Did the button change?
            const success = await page.evaluate(async (followingTexts) => {
                return new Promise((resolve) => {
                    const checkInterval = setInterval(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const clickedState = buttons.some(b => {
                            const t = b.textContent.toLowerCase().trim();
                            return followingTexts.some(ft => t.includes(ft));
                        });

                        if (clickedState) {
                            clearInterval(checkInterval);
                            resolve(true);
                        }
                    }, 500);

                    setTimeout(() => {
                        clearInterval(checkInterval);
                        resolve(false);
                    }, 5000);
                });
            }, TEXTS.FOLLOWING);

            if (success) {
                return true;
            } else {
                console.log("Clicked Follow, but state didn't change.");
                return false;
            }
        }
    } catch (e) {
        console.error("Error following:", e);
    }
    return false;
};

const sendDM = async (page, username, message) => {
    try {
        // 1. Find Message Button
        const msgBtn = await page.evaluateHandle((texts) => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
            return buttons.find(b => {
                const text = b.textContent.toLowerCase().trim();
                return texts.some(t => text === t || text.includes(t)); // Loose match for 'Send Message'
            });
        }, TEXTS.MESSAGE);

        if (!msgBtn || !msgBtn.asElement()) {
            console.log("Msg button not found.");
            return false;
        }

        // 2. Click and OBSERVE
        await humanMove(page);

        const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => { });
        await msgBtn.click();
        await navPromise;

        // Wait loop for Chat Interface
        let chatOpen = false;
        for (let i = 0; i < 20; i++) {
            // Check for the "Maximize" / "Open Chat" icon (The one user sent)
            // It's usually an SVG with specific path or aria-label
            // We'll broaden the search for clickable SVGs in the chat area if input isn't found

            const expandIcon = await page.$('svg[aria-label="Maximize"], svg[aria-label="Open Chat"], svg[aria-label="Abrir bate-papo"]');
            if (expandIcon) {
                const clickable = await expandIcon.evaluateHandle(el => el.closest('button') || el.closest('div[role="button"]'));
                if (clickable) {
                    await clickable.click();
                    await randomDelay(1000, 2000);
                }
            }

            // Check inputs
            const input = await page.$('div[contenteditable="true"], textarea');
            // We can also check aria-label="Message..." if needed

            if (input) {
                chatOpen = true;
                break;
            }

            // Check for popups (Notifications)
            const notNowSelectors = TEXTS.NOT_NOW.map(t => `button ::-p-text(${t})`).join(',');
            // Puppeteer pseudo-selector might act weird with variables, doing manual evaluate is safer
            const notNowBtn = await page.evaluateHandle((texts) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => texts.some(t => b.innerText.toLowerCase().includes(t)));
            }, TEXTS.NOT_NOW);

            if (notNowBtn && notNowBtn.asElement()) {
                await notNowBtn.click();
                await randomDelay(1000, 2000);
            }
            await randomDelay(500, 500);
        }

        if (chatOpen) {
            // CHECK: Do we have previous conversation history?
            const hasHistory = await page.evaluate(() => {
                const bubbles = document.querySelectorAll('div[role="row"]');
                return bubbles.length > 0;
            });

            if (hasHistory) {
                console.log("Chat history detected. We already talked to this person. Skipping.");
                return 'already_chatted';
            }

            // Found it! React immediately (with human typing delay)
            const input = await page.$('div[contenteditable="true"], textarea[placeholder*="Message"], textarea[placeholder*="Mensagem"]');
            if (input) {
                await input.click();
                await randomDelay(1000, 2500); // "Thinking what to type"

                await humanType(page, message);
                await randomDelay(1500, 3000); // "Scanning for typos"

                await page.keyboard.press('Enter');

                // VERIFICATION: Wait for message to actually send
                try {
                    // Instagram usually shows the message in a bubble after sending
                    // or the "Sending..." text disappears.
                    // We wait for the input to clear or a new bubble to appear.

                    await page.evaluate(async () => {
                        return new Promise(resolve => {
                            // Check every 500ms if a new message bubble appeared at the bottom
                            const check = setInterval(() => {
                                const bubbles = document.querySelectorAll('div[role="row"]');
                                if (bubbles.length > 0) {
                                    // A simple heuristic: if there are bubbles, we assume success after a few seconds
                                    // A more robust check would be to see if the last bubble contains our text
                                    clearInterval(check);
                                    resolve(true);
                                }
                            }, 500);

                            // Timeout after 10s
                            setTimeout(() => {
                                clearInterval(check);
                                resolve(true); // Proceed anyway to avoid stuck bot
                            }, 10000);
                        });
                    });

                    // Extra safety pause to ensure network request completes
                    await randomDelay(2000, 4000);

                } catch (e) {
                    console.log("Error waiting for DM send verification:", e);
                }

                return true;
            } else {
                console.log("Waited 10s, but chat input never appeared. Moving on.");
                return false;
            }
        } else {
            console.log("Waited 10s, but chat input never appeared. Moving on.");
            return false;
        }

    } catch (e) {
        console.error("Error sending DM:", e);
    }
    return false;
};

module.exports = { likePost, commentPost, followUser, sendDM };

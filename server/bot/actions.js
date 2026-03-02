const { randomDelay, humanType, humanMove, smartClick, autoScroll } = require('./utils');

// Multi-language Dictionaries
const TEXTS = {
    FOLLOW: ['follow', 'seguir', 'suivre', 'folgen', 'segui'],
    FOLLOWING: ['following', 'seguindo', 'abbonato', 'abonné', 'gefolgt', 'requested', 'solicitado'],
    MESSAGE: ['message', 'enviar mensagem', 'mensagem', 'mensaje', 'enviar mensaje', 'contacter', 'nachricht', 'messaggio'],
    LIKE: ['like', 'curtir', 'aimer', 'gefällt mir', 'mi piace', 'me gusta'],
    UNLIKE: ['unlike', 'descurtir', 'je n\'aime plus', 'gefällt mir nicht mehr', 'non mi piace più', 'ya no me gusta'],
    COMMENT: ['comment', 'comentar', 'comentario', 'kommentieren', 'commenta'],
    NOT_NOW: ['not now', 'agora não', 'ahora no', 'plus tard', 'jetzt nicht', 'non ora'],
    MIC: [
        // Português
        'clipe de voz', 'clipes de voz', 'mensagem de voz', 'áudio',
        // Inglês
        'voice clip', 'voice message', 'audio clip', 'hold to record',
        // Espanhol / Francês / Italiano / Alemão
        'mensaje de voz', 'message vocal', 'messaggio vocale', 'sprachnachricht',
        // Genérico (amplo, mas ainda útil)
        'mic', 'microphone', 'microfone', 'micrófono'
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// LIKE / COMMENT / FOLLOW (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const likePost = async (page) => {
    try {
        const likeSelectors = TEXTS.LIKE.map(t => `svg[aria-label="${t}" i]`).join(',');
        const likeBtn = await page.$(likeSelectors);
        if (likeBtn) {
            const clickable = await likeBtn.evaluateHandle(el =>
                el.closest('button') || el.closest('div[role="button"]')
            );
            if (clickable) {
                await humanMove(page);
                await clickable.click();
                await randomDelay(500, 1000);
                return true;
            }
        } else {
            const unlikeSelectors = TEXTS.UNLIKE.map(t => `svg[aria-label="${t}" i]`).join(',');
            const unlikeBtn = await page.$(unlikeSelectors);
            if (unlikeBtn) return 'already_liked';
        }
    } catch (e) { console.error('Error liking:', e); }
    return false;
};

const commentPost = async (page, message) => {
    try {
        const commentIcon = await page.$('svg[aria-label="Comment"], svg[aria-label="Comentar"]');
        if (commentIcon) {
            const clickable = await commentIcon.evaluateHandle(el => el.closest('button') || el.closest('div[role="button"]'));
            if (clickable) await clickable.click();
            await randomDelay(1000, 2000);
        }
        const textarea = await page.$('textarea[aria-label="Add a comment…"], textarea[aria-label="Adicione um comentário..."], textarea');
        if (textarea) {
            await textarea.click();
            await randomDelay(500, 1500);
            await humanType(page, message);
            await randomDelay(1000, 2000);
            await page.keyboard.press('Enter');
            await randomDelay(2000, 4000);
            return true;
        }
    } catch (e) { console.error('Error commenting:', e); }
    return false;
};

const followUser = async (page) => {
    try {
        const followBtn = await page.evaluateHandle((texts) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => texts.includes(b.textContent.toLowerCase().trim()));
        }, TEXTS.FOLLOW);

        if (followBtn && followBtn.asElement()) {
            await humanMove(page);
            await followBtn.click();
            const success = await page.evaluate(async (followingTexts) => {
                return new Promise((resolve) => {
                    const iv = setInterval(() => {
                        const clicked = Array.from(document.querySelectorAll('button'))
                            .some(b => followingTexts.some(ft => b.textContent.toLowerCase().trim().includes(ft)));
                        if (clicked) { clearInterval(iv); resolve(true); }
                    }, 500);
                    setTimeout(() => { clearInterval(iv); resolve(false); }, 5000);
                });
            }, TEXTS.FOLLOWING);
            return success;
        }
    } catch (e) { console.error('Error following:', e); }
    return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// FIND MIC BUTTON — 3-strategy cascade
// ─────────────────────────────────────────────────────────────────────────────
const findMicButton = async (page) => {
    // Labels que indicam botões de chamada — devem ser IGNORADOS
    const callLabels = [
        'audio call', 'video call', 'chamada de audio', 'chamada de voz',
        'chamada de vídeo', 'iniciar chamada', 'start voice call', 'start video call',
        'ligar', 'fazer chamada'
    ];

    // ── Estratégia 1: aria-label com .includes() amplo ───────────────────────
    const s1 = await page.evaluateHandle((micTexts, callLabels) => {
        for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
            const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
            if (callLabels.some(c => label.includes(c))) continue;
            if (micTexts.some(t => label.includes(t.toLowerCase()))) {
                // Subir até o botão clicável real
                const clickable = el.closest('div[role="button"]') || el.closest('button');
                if (clickable) {
                    const r = clickable.getBoundingClientRect();
                    if (r.width > 0 && r.width < 80 && r.height > 0 && r.height < 80) {
                        return clickable;
                    }
                }
                // Se não achou clickable pequeno mas o próprio el é clicável
                const elRect = el.getBoundingClientRect();
                if (elRect.width > 0) return el.closest('div[role="button"]') || el.closest('button') || el;
            }
        }
        return null;
    }, TEXTS.MIC, callLabels);

    if (s1 && s1.asElement()) {
        console.log('[MIC] ✅ Estratégia 1: Encontrado via aria-label.');
        return s1;
    }

    // ── Estratégia 2: SVG path fragment (ícone de microfone) ─────────────────
    const micPathFragments = [
        'M12 15.745a4 4',
        'M12 1a4 4 0 0 0-4 4v7',
        'a4 4 0 0 1 8 0v5',
        'M12 18.25a6.25',
        'M19 11a7 7',    // microfone alternativo
    ];

    for (const frag of micPathFragments) {
        const s2 = await page.evaluateHandle((f) => {
            const match = Array.from(document.querySelectorAll('path'))
                .find(p => (p.getAttribute('d') || '').includes(f));
            if (!match) return null;
            return match.closest('div[role="button"]') || match.closest('button') || match.closest('svg');
        }, frag);

        if (s2 && s2.asElement()) {
            console.log(`[MIC] ✅ Estratégia 2: Encontrado via SVG path: "${frag}"`);
            return s2;
        }
    }

    // ── Estratégia 3: Posicional — primeiro ícone à direita do input ─────────
    const s3 = await page.evaluateHandle(() => {
        const input = document.querySelector(
            'div[contenteditable="true"], textarea, div[role="textbox"]'
        );
        if (!input) return null;
        const inputRect = input.getBoundingClientRect();

        // Candidatos: botões pequenos com SVG à direita do input, mesmo nível vertical
        const candidates = Array.from(document.querySelectorAll('div[role="button"], button'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return (
                    r.width > 0 && r.width < 70 &&
                    r.height > 0 && r.height < 70 &&
                    r.left >= inputRect.right - 5 &&
                    Math.abs((r.top + r.height / 2) - (inputRect.top + inputRect.height / 2)) < 25 &&
                    el.querySelector('svg')
                );
            })
            .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

        console.log('[MIC Posicional] Candidatos:', JSON.stringify(
            candidates.map(el => ({
                label: el.getAttribute('aria-label') || '',
                x: Math.round(el.getBoundingClientRect().left)
            }))
        ));

        return candidates[0] || null;
    });

    if (s3 && s3.asElement()) {
        console.log('[MIC] ✅ Estratégia 3: Encontrado via posição (primeiro botão à direita do input).');
        return s3;
    }

    console.log('[MIC] ❌ Microfone não encontrado em nenhuma estratégia.');
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// FIND SEND BUTTON — mirrors findMicButton, 3-strategy cascade
// ─────────────────────────────────────────────────────────────────────────────
const findSendButton = async (page) => {
    // The exact SVG path fragment from the user's HTML DOM of the audio send button.
    // This is UNIQUE to the audio send arrow — the text send button has a different path.
    const SEND_PATH_FRAGMENT = 'M22.513 3.576';

    // ── Strategy 1 (PRIMARY): SVG path fragment — most specific, avoids false positives ──
    const s1 = await page.evaluateHandle((frag) => {
        const match = Array.from(document.querySelectorAll('path'))
            .find(p => (p.getAttribute('d') || '').startsWith(frag));
        if (!match) return null;
        return match.closest('div[role="button"]') || match.closest('button') || match.closest('svg');
    }, SEND_PATH_FRAGMENT);

    if (s1 && s1.asElement()) {
        console.log('[SEND] ✅ Estratégia 1: Encontrado via SVG path fragment (mais específico).');
        return s1;
    }

    // ── Strategy 2: SVG <title>Send</title> ───────────────────────────────────
    const s2 = await page.evaluateHandle(() => {
        const titles = Array.from(document.querySelectorAll('svg title'));
        const sendTitle = titles.find(t => t.textContent.trim().toLowerCase() === 'send');
        if (!sendTitle) return null;
        return sendTitle.closest('div[role="button"]') || sendTitle.closest('button');
    });

    if (s2 && s2.asElement()) {
        console.log('[SEND] ✅ Estratégia 2: Encontrado via SVG <title>Send</title>.');
        return s2;
    }

    // ── Strategy 3: Positional — rightmost small button to the right of input ─
    const s3 = await page.evaluateHandle(() => {
        const input = document.querySelector('div[contenteditable="true"], textarea, div[role="textbox"]');
        if (!input) return null;
        const inputRect = input.getBoundingClientRect();

        const candidates = Array.from(document.querySelectorAll('div[role="button"], button'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return (
                    r.width > 0 && r.width < 120 &&
                    r.height > 0 &&
                    r.left >= inputRect.right - 10 &&
                    Math.abs((r.top + r.height / 2) - (inputRect.top + inputRect.height / 2)) < 40 &&
                    el.querySelector('svg')
                );
            })
            .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left); // rightmost first

        return candidates[0] || null;
    });

    if (s3 && s3.asElement()) {
        console.log('[SEND] ✅ Estratégia 3: Encontrado via posição (botão à direita do input).');
        return s3;
    }

    console.log('[SEND] ❌ Botão Enviar não encontrado em nenhuma estratégia.');
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SEND AUDIO
// ─────────────────────────────────────────────────────────────────────────────
const sendAudioHelper = async (page, audioPath) => {
    const filename = audioPath.split('/').pop().split('\\').pop();

    try {
        console.log(`[AUDIO] Injecting stream for: ${filename}`);

        // ── Read audio SERVER-SIDE, pass as base64 data URL ──────────────────
        // fetch('http://localhost:3000/...') FAILS from instagram.com due to CORS.
        // Solution: read file in Node.js → base64 → data URL → pass to evaluate.
        // data: URLs bypass CORS entirely — no cross-origin request is made.
        const fs = require('fs');
        if (!fs.existsSync(audioPath)) {
            console.error(`[AUDIO] ❌ File not found: ${audioPath}`);
            return false;
        }
        const audioBuffer = fs.readFileSync(audioPath);
        const base64Audio = audioBuffer.toString('base64');
        console.log(`[AUDIO] Audio loaded: ${Math.round(audioBuffer.length / 1024)}KB`);

        // Inject getUserMedia override — decode audio with atob(), NO fetch()
        // (Instagram's CSP blocks fetch() to data: URLs via connect-src)
        await page.evaluate(async (b64) => {
            window.__audioBase64__ = b64;
            window.__audioDuration__ = null;

            // Decode base64 → ArrayBuffer without any fetch() call (CSP-safe)
            function base64ToArrayBuffer(base64) {
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return bytes.buffer;
            }

            navigator.mediaDevices.getUserMedia = async (constraints) => {
                if (constraints && constraints.audio && window.__audioBase64__) {
                    try {
                        const buf = base64ToArrayBuffer(window.__audioBase64__);
                        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
                        const audioBuf = await ctx.decodeAudioData(buf);
                        const src = ctx.createBufferSource();
                        src.buffer = audioBuf;
                        const dest = ctx.createMediaStreamDestination();
                        src.connect(dest);
                        src.start(0);
                        window.__audioDuration__ = audioBuf.duration;
                        console.log('[INJ] ✅ Audio injected via atob, duration:', audioBuf.duration);
                        return dest.stream;
                    } catch (e) {
                        console.error('[INJ] ❌ Injection error:', e.message);
                    }
                }
                return new MediaStream();
            };
            console.log('[INJ] getUserMedia override ready (atob mode).');
        }, base64Audio);

        // Find and click mic
        console.log('[AUDIO] Looking for Mic button...');
        const micBtn = await findMicButton(page);

        if (micBtn && micBtn.asElement()) {
            const micBox = await micBtn.boundingBox();
            if (!micBox) {
                console.log('[AUDIO] ❌ Sem bounding box no botão mic.');
                return false;
            }

            // ── STRATEGY: micBtn.click() → page.mouse.down() (the only proven approach) ──
            // Background: dispatchEvent synthetic events don't trigger getUserMedia on Instagram.
            // Only real CDP input events (via page.mouse.*) work.
            // Sequence: click() opens recording UI → mouse.down() at same coords 
            //           triggers getUserMedia → wait duration → mouse.up() releases = shows Send btn

            await micBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
            await randomDelay(600, 900); // DOM stabilization

            // Re-fetch coords after scroll to avoid stale bounding box
            const box = await micBtn.boundingBox();
            if (!box) {
                console.log('[AUDIO] ❌ Elemento mic ficou stale ou invisível após scroll.');
                return false;
            }
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;

            // Make sure the page has absolute focus to avoid background pausing
            await page.bringToFront();

            // Step 1: Native Puppeteer click to open recording UI
            await page.mouse.move(cx, cy, { steps: 5 });
            await randomDelay(200, 400);
            await micBtn.click();
            console.log('[AUDIO] 🖱️ Mic clicado (abre recording UI)...');
            await randomDelay(400, 600); // Small wait for recording UI to appear

            // Step 2: CDP mouse.down at same position to activate getUserMedia
            await page.mouse.move(cx, cy, { steps: 3 });
            await page.mouse.down();
            console.log('[AUDIO] 🎙️ Mic PRESSIONADO via CDP — aguardando getUserMedia...');

            // Poll for getUserMedia — fires when Instagram starts using the mic
            let duration = null;
            for (let i = 0; i < 12; i++) {
                await randomDelay(500, 500);
                duration = await page.evaluate(() => window.__audioDuration__);
                if (duration && duration > 0) break;
            }

            if (!duration || duration < 1) {
                console.log('[AUDIO] ⚠️ getUserMedia não disparou — usando 5s fallback.');
                duration = 5;
            } else {
                console.log(`[AUDIO] ✅ Áudio injetado! Duração: ${Math.round(duration)}s`);
            }

            // Step 3: Hold for the full audio duration and wiggle the mouse to prevent auto-pause
            console.log(`[AUDIO] Gravando por ${Math.round(duration)}s... (hold ativo)`);
            const targetTime = Date.now() + (duration * 1000) + 800; // Add small buffer

            try {
                while (Date.now() < targetTime) {
                    // Micro-movements (wiggle) to simulate human finger and prevent Instagram UI idle timeout
                    const wiggleX = cx + (Math.random() * 2 - 1); // -1 to +1 px
                    const wiggleY = cy + (Math.random() * 2 - 1); // -1 to +1 px
                    await page.mouse.move(wiggleX, wiggleY, { steps: 2 });
                    await randomDelay(100, 200);
                }
            } catch (wiggleErr) {
                // Page may have navigated during hold — not fatal, continue to release
                console.log(`[AUDIO] ⚠️ Wiggle loop encerrado (${wiggleErr.message}). Prosseguindo para envio...`);
            }

            // Step 4: Release mouse — triggers UI to show Send
            await page.mouse.up().catch(() => { });
            console.log('[AUDIO] 🛑 Mic SOLTO — aguardando botão Enviar...');

            await randomDelay(1200, 1800);

            // ─────────────────────────────────────────────────────────────
            // FIND & CLICK SEND — using findSendButton (same as findMicButton)
            // ─────────────────────────────────────────────────────────────

            // Poll until the Send button appears (up to 12 × 500ms = 6s)
            let sendBtn = null;
            for (let i = 0; i < 12; i++) {
                await randomDelay(400, 500);
                sendBtn = await findSendButton(page);
                if (sendBtn && sendBtn.asElement()) break;
            }

            if (!sendBtn || !sendBtn.asElement()) {
                console.log('[AUDIO] ❌ Botão Enviar não detectado — abortando envio.');
                return false;
            }

            console.log('[AUDIO] ✅ Botão Enviar detectado. Executando clique humano...');

            await sendBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
            await randomDelay(500, 800);

            const boxSend = await sendBtn.boundingBox();
            if (!boxSend) {
                console.log('[AUDIO] ❌ BoundingBox inválido no botão enviar.');
                return false;
            }

            const sx = boxSend.x + boxSend.width / 2;
            const sy = boxSend.y + boxSend.height / 2;

            // Human-like click (down + up separately, not instant)
            await page.mouse.move(sx, sy, { steps: 6 });
            await randomDelay(250, 450);
            await page.mouse.down();
            await randomDelay(80, 150);
            await page.mouse.up();

            console.log('[AUDIO] 📨 Send clicado com sucesso. Aguardando confirmação...');

            // ─────────────────────────────────────────
            // CONFIRM: Wait for recording UI to DISAPPEAR
            // (Unambiguous proof the audio was sent and the recording bar closed)
            // ─────────────────────────────────────────

            try {
                // The recording UI always has an X (cancel) button visible during recording.
                // When the audio is sent, that UI closes — the cancel button vanishes.
                await page.waitForFunction(() => {
                    // Check the recording cancel button is gone (X circle button left of the timer)
                    const cancelBtn = Array.from(document.querySelectorAll('[aria-label]')).find(el => {
                        const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
                        return lbl.includes('cancel') || lbl.includes('cancelar') || lbl.includes('excluir');
                    });
                    // Also check the recording timer slider is gone
                    const recSlider = document.querySelector('div[role="slider"]');
                    return !cancelBtn && !recSlider;
                }, { timeout: 15000 });
                console.log('[AUDIO] ✅ UI de gravação fechou — áudio enviado com sucesso!');
            } catch {
                console.log('[AUDIO] ⚠️ Timeout esperando UI de gravação fechar. O áudio pode ter sido enviado mesmo assim.');
            }

            // Buffer final real antes de permitir fechamento
            await randomDelay(5000, 8000);
            return true;

        } else {
            const visibleLabels = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[aria-label]'))
                    .map(el => ({ tag: el.tagName, label: el.getAttribute('aria-label'), w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) }))
                    .filter(x => x.w > 0 && x.h > 0)
            );
            console.log('[AUDIO] ❌ Microfone não encontrado. Labels visíveis:');
            console.table(visibleLabels);
            return false;
        }

    } catch (e) {
        console.error('[AUDIO] Erro em sendAudioHelper:', e);
    }
    return false;
};



// ─────────────────────────────────────────────────────────────────────────────
// SEND DM — main entry point
// ─────────────────────────────────────────────────────────────────────────────
const sendDM = async (page, username, message, audios = []) => {
    try {
        // 1. Find Message Button on profile
        const msgBtn = await page.evaluateHandle((texts) => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
            return buttons.find(b => {
                const text = b.textContent.toLowerCase().trim();
                return texts.some(t => text === t || text.includes(t));
            });
        }, TEXTS.MESSAGE);

        if (!msgBtn || !msgBtn.asElement()) {
            console.log('[DM] Message button not found on profile.');
            return false;
        }

        // 2. Click Message button
        await humanMove(page);
        const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => { });
        await msgBtn.click();
        await navPromise;

        // 3. Wait for chat input (dismiss popups)
        let chatOpen = false;
        for (let i = 0; i < 20; i++) {
            const notNowBtn = await page.evaluateHandle((texts) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => texts.some(t => (b.innerText || '').toLowerCase().includes(t)));
            }, TEXTS.NOT_NOW);
            if (notNowBtn && notNowBtn.asElement()) {
                await notNowBtn.click();
                await randomDelay(1000, 2000);
            }

            const input = await page.$('div[contenteditable="true"], textarea, div[role="textbox"]');
            if (input) { chatOpen = true; break; }
            await randomDelay(500, 500);
        }

        if (!chatOpen) {
            console.log('[DM] Chat window did not open.');
            return false;
        }

        // 4. Audio message
        const isAudio = message.trim().startsWith('@audio');
        const audioConfig = isAudio && audios ? audios.find(a => a.id === message.trim()) : null;

        if (isAudio) {
            if (!audioConfig || !audioConfig.path) {
                console.log(`[DM] Audio config not found for: ${message}`);
                return false;
            }
            console.log(`[DM] Chat opened. Identified audio command for file: ${audioConfig.path}.`);
            console.log('[DM] Clicking input field once to ensure chat bar is focused (without typing) to make mic visible...');
            const chatInputForFocus = await page.$('div[contenteditable="true"], textarea, div[role="textbox"]');
            if (chatInputForFocus) {
                await chatInputForFocus.click();
                await randomDelay(500, 1000); // give UI time to expand icons if needed
                console.log('[DM] Input field clicked.');
            } else {
                console.log('[DM] Warning: Input field not found for click focus.');
            }

            console.log('[DM] Proceeding to sendAudioHelper...');
            const audioSent = await sendAudioHelper(page, audioConfig.path);

            if (audioSent) {
                console.log('[DM] Audio sent successfully. Waiting extra time for upload to finish...');
                await randomDelay(8000, 12000); // CRITICAL: Wait for upload before closing/moving on
            }

            return audioSent;
        }

        // 5. Text message
        const INPUT_SEL = 'div[contenteditable="true"], textarea, div[role="textbox"]';
        const input = await page.$(INPUT_SEL);

        if (input) {
            // Bring the element into view and focus it so execCommand targets it
            await input.evaluate(el => { el.scrollIntoView(); el.focus(); });
            await page.focus(INPUT_SEL);           // Puppeteer-level focus
            await new Promise(r => setTimeout(r, 400));

            await humanType(page, message);
            await new Promise(r => setTimeout(r, 1000));

            // Try to click the explicit Send button first (safer than Enter for React)
            const SEND_LABELS = ['send message', 'send', 'enviar mensagem', 'enviar'];
            const sentViaBtn = await page.evaluate((labels) => {
                for (const el of Array.from(document.querySelectorAll('[aria-label], button, div[role="button"]'))) {
                    const lbl = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase().trim();
                    if (labels.some(s => lbl === s || lbl.includes(s))) {
                        const btn = el.closest('button') || el.closest('div[role="button"]') || el;
                        btn.click();
                        return true;
                    }
                }
                return false;
            }, SEND_LABELS);

            if (!sentViaBtn) {
                // Fallback: Enter key
                await page.keyboard.press('Enter');
            }

            await new Promise(r => setTimeout(r, 2500));
            console.log('[DM] ✅ Text message sent.');
            return true;
        }

        console.log('[DM] Chat input not found after chat opened.');
        return false;

    } catch (e) {
        console.error('[DM] Error sending DM:', e);
        return false;
    }
};

module.exports = { likePost, commentPost, followUser, sendDM };
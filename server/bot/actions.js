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
        // PT-BR confirmado no DOM — aria-label primário
        'clipe de voz',
        // Português (outros)
        'clipes de voz', 'mensagem de voz', 'áudio',
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
        // Try clicking the comment icon SVG first (opens comment box if closed)
        const commentIcon = await page.$('svg[aria-label="Comment"], svg[aria-label="Comentar"]');
        if (commentIcon) {
            const clickable = await commentIcon.evaluateHandle(el => el.closest('button') || el.closest('div[role="button"]'));
            if (clickable && clickable.asElement()) await clickable.click();
            await randomDelay(1000, 2000);
        }

        // Instagram (2024+) uses a contenteditable div instead of textarea
        // Try all known selectors in order
        const COMMENT_SELECTORS = [
            'textarea[aria-label="Add a comment…"]',
            'textarea[aria-label="Adicione um comentário..."]',
            'div[aria-label="Add a comment…"][contenteditable]',
            'div[aria-label="Adicione um comentário..."][contenteditable]',
            'div[aria-label="Comment"][contenteditable]',
            'textarea',
            'div[contenteditable="true"]',
        ];

        let commentField = null;
        for (const sel of COMMENT_SELECTORS) {
            commentField = await page.$(sel);
            if (commentField) { console.log(`[COMMENT] Field found via: ${sel}`); break; }
        }

        if (commentField) {
            await commentField.click();
            await randomDelay(500, 1500);
            await humanType(page, message);
            await randomDelay(1000, 2000);
            await page.keyboard.press('Enter');
            await randomDelay(2000, 4000);
            return true;
        }
        console.log('[COMMENT] Comment field not found.');
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
        'M12 15.745a4 4',       // path principal do mic (PT-BR confirmado)
        'M19.5 10.671v.897',    // path do arco superior (confirmado no DOM)
        'M12 1a4 4 0 0 0-4 4v7',
        'a4 4 0 0 1 8 0v5',
        'M12 18.25a6.25',
        'M19 11a7 7',           // microfone alternativo
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
// FIND SEND BUTTON — 4-strategy cascade (PT-BR + EN)
// ─────────────────────────────────────────────────────────────────────────────
const findSendButton = async (page) => {

    // ── Estratégia 1 (PRIMÁRIA): aria-label "Enviar" ou "Send" no div pai ────
    // O Instagram PT-BR coloca aria-label="Enviar" no div[role="button"] pai,
    // NÃO dentro do SVG. Esta estratégia acerta direto no elemento clicável real.
    const s1 = await page.evaluateHandle(() => {
        const labels = ['enviar', 'send'];
        for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
            const lbl = (el.getAttribute('aria-label') || '').toLowerCase().trim();
            if (labels.includes(lbl)) {
                const btn = el.closest('div[role="button"]') || el.closest('button') || el;
                const r = btn.getBoundingClientRect();
                if (r.width > 0 && r.width < 120 && r.height > 0) return btn;
            }
        }
        return null;
    });

    if (s1 && s1.asElement()) {
        console.log('[SEND] ✅ Estratégia 1: Encontrado via aria-label Enviar/Send.');
        return s1;
    }

    // ── Estratégia 2: SVG path fragment confirmado no DOM ────────────────────
    const s2 = await page.evaluateHandle(() => {
        const frag = 'M22.513 3.576';
        const match = Array.from(document.querySelectorAll('path'))
            .find(p => (p.getAttribute('d') || '').startsWith(frag));
        if (!match) return null;
        return match.closest('div[role="button"]') || match.closest('button');
    });

    if (s2 && s2.asElement()) {
        console.log('[SEND] ✅ Estratégia 2: Encontrado via SVG path fragment.');
        return s2;
    }

    // ── Estratégia 3: SVG <title> Send ou Enviar (bilingue) ──────────────────
    const s3 = await page.evaluateHandle(() => {
        const validTitles = ['send', 'enviar'];
        const title = Array.from(document.querySelectorAll('svg title'))
            .find(t => validTitles.includes(t.textContent.trim().toLowerCase()));
        if (!title) return null;
        return title.closest('div[role="button"]') || title.closest('button');
    });

    if (s3 && s3.asElement()) {
        console.log('[SEND] ✅ Estratégia 3: Encontrado via SVG title Send/Enviar.');
        return s3;
    }

    // ── Estratégia 4: Posicional — botão com SVG mais à direita na tela ──────
    const s4 = await page.evaluateHandle(() => {
        const candidates = Array.from(document.querySelectorAll('div[role="button"], button'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.width < 120 && r.height > 0 && el.querySelector('svg');
            })
            .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
        return candidates[0] || null;
    });

    if (s4 && s4.asElement()) {
        console.log('[SEND] ✅ Estratégia 4: Encontrado via posição (rightmost button).');
        return s4;
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
// CLICK EXPAND BUTTON — obrigatório antes de buscar o microfone
// ─────────────────────────────────────────────────────────────────────────────
const clickExpandButton = async (page) => {
    // Estratégia 1: aria-label="Expandir" (PT) ou "Expand" (EN) ou variantes
    const expandLabels = ['expandir', 'expand', 'more options', 'mais opcoes', 'mais', 'more'];

    const s1 = await page.evaluateHandle((labels) => {
        for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
            const lbl = (el.getAttribute('aria-label') || '').toLowerCase().trim();
            if (labels.some(l => lbl === l || lbl.includes(l))) {
                const btn = el.closest('div[role="button"]') || el.closest('button') || el;
                const r = btn.getBoundingClientRect();
                if (r.width > 0 && r.width < 80 && r.height > 0) return btn;
            }
        }
        return null;
    }, expandLabels);

    if (s1 && s1.asElement()) {
        await s1.click();
        console.log('[EXPAND] Estrategia 1: Expandir clicado via aria-label.');
        await randomDelay(700, 1000);
        return true;
    }

    // Estrategia 2: SVG title Expandir/Expand
    const s2 = await page.evaluateHandle(() => {
        const titles = Array.from(document.querySelectorAll('svg title'));
        const t = titles.find(el => ['expandir', 'expand'].includes(el.textContent.trim().toLowerCase()));
        if (!t) return null;
        return t.closest('div[role="button"]') || t.closest('button');
    });

    if (s2 && s2.asElement()) {
        await s2.click();
        console.log('[EXPAND] Estrategia 2: Expandir clicado via SVG title.');
        await randomDelay(700, 1000);
        return true;
    }

    // Estrategia 3: SVG path fragments do icone expandir/chevron
    const expandPaths = ['M10 20H4', 'M8 12l4 4 4-4', 'M9 18l6-6-6-6', 'M10.75 16.82', 'M5 12h14'];
    for (const frag of expandPaths) {
        const s3 = await page.evaluateHandle((f) => {
            const match = Array.from(document.querySelectorAll('path'))
                .find(p => (p.getAttribute('d') || '').includes(f));
            if (!match) return null;
            return match.closest('div[role="button"]') || match.closest('button');
        }, frag);

        if (s3 && s3.asElement()) {
            await s3.click();
            console.log(`[EXPAND] Estrategia 3: Expandir clicado via SVG path: "${frag}".`);
            await randomDelay(700, 1000);
            return true;
        }
    }

    // Estrategia 4: Posicional — botao com SVG a ESQUERDA do input (expand fica a esquerda do campo de texto)
    const s4 = await page.evaluateHandle(() => {
        const input = document.querySelector('div[contenteditable="true"], textarea, div[role="textbox"]');
        if (!input) return null;
        const inputRect = input.getBoundingClientRect();

        const candidates = Array.from(document.querySelectorAll('div[role="button"], button'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return (
                    r.width > 0 && r.width < 70 &&
                    r.height > 0 && r.height < 70 &&
                    r.right <= inputRect.left + 5 &&
                    Math.abs((r.top + r.height / 2) - (inputRect.top + inputRect.height / 2)) < 30 &&
                    el.querySelector('svg')
                );
            })
            .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);

        console.log('[EXPAND Posicional] Candidatos a esquerda do input:', JSON.stringify(
            candidates.map(el => ({
                label: el.getAttribute('aria-label') || '',
                x: Math.round(el.getBoundingClientRect().left)
            }))
        ));

        return candidates[0] || null;
    });

    if (s4 && s4.asElement()) {
        await s4.click();
        console.log('[EXPAND] Estrategia 4: Expandir clicado via posicao (botao mais a esquerda do input).');
        await randomDelay(700, 1000);
        return true;
    }

    // DIAGNOSTICO: logar todos os botoes visiveis para debug
    const visibleButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[aria-label], button, div[role="button"]'))
            .map(el => ({
                tag: el.tagName,
                label: el.getAttribute('aria-label') || (el.textContent || '').trim().substring(0, 30),
                w: Math.round(el.offsetWidth),
                h: Math.round(el.offsetHeight),
                x: Math.round(el.getBoundingClientRect().left)
            }))
            .filter(x => x.w > 0 && x.h > 0 && x.w < 120)
    );
    console.log('[EXPAND] Botao Expandir NAO encontrado. Botoes visiveis:');
    console.table(visibleButtons);
    return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// WAIT CHAT LOADED — polling até Loading... sumir do DOM
// ─────────────────────────────────────────────────────────────────────────────
const waitChatLoaded = async (page, timeout = 20000) => {
    console.log('[CHAT] Aguardando chat carregar completamente...');
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const ready = await page.evaluate(() => {
            const loadingEls = Array.from(document.querySelectorAll('[aria-label]'))
                .filter(el => {
                    const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
                    return lbl === 'loading...' && el.offsetWidth > 0;
                });
            const hasInput = !!document.querySelector(
                'div[contenteditable="true"], textarea, div[role="textbox"]'
            );
            return loadingEls.length === 0 && hasInput;
        });
        if (ready) {
            console.log('[CHAT] ✅ Chat carregado.');
            return true;
        }
        await randomDelay(500, 500);
    }
    console.log('[CHAT] ⚠️ Timeout aguardando chat — continuando mesmo assim.');
    return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// OPEN DM VIA INBOX SEARCH — Estratégia definitiva
// Navega diretamente para /direct/inbox/, usa o campo de busca da barra lateral
// para pesquisar o username, valida o resultado e abre o chat.
//
// Fluxo baseado no DOM real do Instagram:
//   1. Abre /direct/inbox/
//   2. Preenche input[name="searchInput"] com o username
//   3. Aguarda resultados (servidor + render)
//   4. Clica no resultado SOMENTE se o username bater
//   5. Chat abre — segue para o envio da mensagem
// ─────────────────────────────────────────────────────────────────────────────
const openDMViaInboxSearch = async (page, username) => {
    try {
        console.log(`[DM] Abrindo inbox global para buscar @${username}...`);

        // 1. Navegar para o inbox geral
        if (!page.url().includes('/direct/')) {
            await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'networkidle2' });
            await randomDelay(2500, 4000); // Esperar o inbox carregar completamente
        }

        // 2. Encontrar o campo de busca da barra lateral
        const searchInput = await page.waitForSelector(
            'input[name="searchInput"], input[placeholder="Pesquisa"], input[placeholder="Search"]',
            { timeout: 8000 }
        ).catch(() => null);

        if (!searchInput) {
            console.log('[DM] ❌ Campo de busca do inbox não encontrado.');
            return false;
        }

        // Limpar campo antes de digitar
        await searchInput.click({ clickCount: 3 });
        await randomDelay(300, 600);
        await searchInput.type(username, { delay: 80 + Math.random() * 60 });
        console.log(`[DM] Pesquisando por: ${username}`);

        // 3. Aguardar resultados carregarem (simular leitura humana + latência do servidor)
        await randomDelay(2000, 3500);

        // 4. Encontrar o resultado correto que corresponde EXATAMENTE ao username
        // O resultado é um div[role="button"] contendo spans com o username
        const clicked = await page.evaluate((uname) => {
            const lowerTarget = uname.toLowerCase();

            // Tenta encontrar o resultado que contém exatamente o username como texto
            const allButtons = Array.from(document.querySelectorAll('div[role="button"], a[role="link"]'));

            for (const btn of allButtons) {
                // Procura spans dentro do botão que contenham o username
                const spans = Array.from(btn.querySelectorAll('span'));
                const usernameMatch = spans.some(span => {
                    const txt = (span.textContent || '').trim().toLowerCase();
                    return txt === lowerTarget;
                });

                if (usernameMatch) {
                    btn.click();
                    return true;
                }
            }

            // Fallback: pega o primeiro resultado visível (mais relevante da busca)
            const firstResult = document.querySelector(
                '[role="listitem"] div[role="button"], [role="list"] > div[role="button"]'
            );
            if (firstResult) {
                firstResult.click();
                return 'fallback';
            }

            return false;
        }, username);

        if (!clicked) {
            console.log(`[DM] ❌ Nenhum resultado encontrado para @${username}.`);
            return false;
        }

        if (clicked === 'fallback') {
            console.log(`[DM] ⚠️ Clicou no primeiro resultado (fallback) para @${username}.`);
        } else {
            console.log(`[DM] ✅ Resultado exato para @${username} encontrado e clicado.`);
        }

        // 5. Aguardar o chat abrir (simula tempo de carregamento do servidor)
        await randomDelay(2000, 3500);

        // 6. Verificar se o campo de mensagem apareceu
        const inputVisible = await page.waitForSelector(
            'div[contenteditable="true"], textarea, div[role="textbox"]',
            { timeout: 8000 }
        ).catch(() => null);

        if (inputVisible) {
            console.log(`[DM] ✅ Chat com @${username} aberto com sucesso!`);
            return true;
        }

        console.log('[DM] ❌ Campo de mensagem não apareceu após clicar no resultado.');
        return false;

    } catch (e) {
        console.error('[DM] Erro na estratégia InboxSearch:', e.message);
        return false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SEND DM — Ponto de entrada principal
// ─────────────────────────────────────────────────────────────────────────────
const sendDM = async (page, username, message, audios = []) => {
    try {
        const currentUrl = page.url();

        // Se já estiver numa thread específica com esta pessoa, pular abertura
        const alreadyInThread = currentUrl.includes('/direct/t/');

        if (!alreadyInThread) {
            console.log(`[DM] Iniciando abertura do chat para @${username}...`);
            const opened = await openDMViaInboxSearch(page, username);
            if (!opened) {
                console.log(`[DM] ❌ Não foi possível abrir o chat com @${username}.`);
                return false;
            }
        } else {
            console.log(`[DM] Já está na thread do chat — pulando abertura.`);
            await randomDelay(500, 1000);
        }

        // ── Dispensar popups (notificações, cookies, etc.) ──────────────────
        const notNowBtn = await page.evaluateHandle((texts) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => texts.some(t => (b.innerText || '').toLowerCase().includes(t)));
        }, TEXTS.NOT_NOW);
        if (notNowBtn && notNowBtn.asElement()) {
            await notNowBtn.click();
            await randomDelay(1000, 1500);
        }

        // ── 4. Áudio ────────────────────────────────────────────────────────
        const isAudio = message.trim().startsWith('@audio');
        const audioConfig = isAudio && audios ? audios.find(a => a.id === message.trim()) : null;

        if (isAudio) {
            if (!audioConfig || !audioConfig.path) {
                console.log(`[DM] Audio config not found for: ${message}`);
                return false;
            }
            console.log(`[DM] Chat opened. Identified audio command for file: ${audioConfig.path}.`);
            await waitChatLoaded(page);

            const chatInputForFocus = await page.$('div[contenteditable="true"], textarea, div[role="textbox"]');
            if (chatInputForFocus) {
                await chatInputForFocus.click();
                await randomDelay(500, 800);
            }

            await clickExpandButton(page);
            await randomDelay(800, 1200);

            const audioSent = await sendAudioHelper(page, audioConfig.path);
            if (audioSent) {
                await randomDelay(8000, 12000);
            }
            return audioSent;
        }

        // ── 5. Mensagem de texto ─────────────────────────────────────────────
        // BUG FIX: Aguardar o chat carregar ANTES de buscar o campo de input.
        // Sem isso, o seletor genérico pode acertar o campo de busca do inbox
        // que ainda está visível enquanto o chat carrega em paralelo.
        await waitChatLoaded(page);

        // BUG FIX: Seletor específico do campo de mensagem do chat.
        // Prioriza o campo dentro da área de chat (não o de busca na sidebar).
        // O Instagram coloca o input de mensagem dentro de um section[role] ou
        // dentro de um div com aria-label relacionado a mensagem.
        const CHAT_INPUT_SELECTORS = [
            // Seletor mais específico: contenteditable dentro da área principal de chat
            'div[role="main"] div[contenteditable="true"]',
            'section div[contenteditable="true"]',
            // aria-label específicos do campo de mensagem
            'div[aria-label="Message"][contenteditable="true"]',
            'div[aria-label="Mensagem"][contenteditable="true"]',
            'div[aria-label="Mensaje"][contenteditable="true"]',
            'div[aria-placeholder][contenteditable="true"]',
            // Fallback genérico (por último)
            'div[contenteditable="true"]',
            'textarea',
        ];

        let input = null;
        for (const sel of CHAT_INPUT_SELECTORS) {
            const el = await page.$(sel);
            if (!el) continue;
            // Verificar que está visível e não é o campo de busca do inbox
            const isValid = await page.evaluate(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;
                // Rejeitar se for filho do input de busca lateral
                const sidebar = el.closest('[aria-label="Chats"], [aria-label="Direct"]');
                if (sidebar && el.tagName !== 'TEXTAREA') return false;
                return true;
            }, el);
            if (isValid) {
                input = el;
                console.log(`[DM] Campo de texto encontrado via: ${sel}`);
                break;
            }
        }

        if (input) {
            // BUG FIX: Foco único e direto — sem chamar evaluate+focus E page.focus E click
            // em sequência, o que causa 3 eventos separados no React e reseta o estado.
            // Uma única chamada click() do Puppeteer é suficiente e mais confiável.
            await input.scrollIntoView();
            await randomDelay(200, 400);
            await input.click();
            await randomDelay(400, 700);

            await humanType(page, message);
            await randomDelay(800, 1200);

            // BUG FIX: Busca do botão Enviar com correspondência EXATA de aria-label.
            // Antes usava lbl.includes(s) que acertava botões de chamada, share,
            // 'send request', etc. Agora usa findSendButton com as mesmas estratégias
            // robustas usadas pelo sistema de áudio.
            const sendBtn = await findSendButton(page);
            if (sendBtn && sendBtn.asElement()) {
                await sendBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
                await randomDelay(200, 400);
                await sendBtn.click();
                console.log('[DM] ✅ Mensagem enviada via botão Enviar (findSendButton).');
            } else {
                // Fallback: Enter (funciona na maioria dos casos quando o campo está focado)
                console.log('[DM] Botão Enviar não encontrado — usando Enter como fallback.');
                await page.keyboard.press('Enter');
            }

            await randomDelay(2000, 3000);
            console.log('[DM] ✅ Mensagem de texto enviada.');
            return true;
        }

        console.log('[DM] ❌ Campo de texto não encontrado após abrir o chat.');
        return false;

    } catch (e) {
        console.error('[DM] Error sending DM:', e);
        return false;
    }
};


module.exports = { likePost, commentPost, followUser, sendDM, clickExpandButton };
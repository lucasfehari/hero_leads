// Helper functions

const randomDelay = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, ms));
};

const humanType = async (page, text) => {
    // Instagram's chat input is a React-managed contenteditable div.
    // page.keyboard.type() dispatches keydown/keyup but React's synthetic event
    // system does NOT listen to those — it listens to InputEvent.
    // Solution: use document.execCommand('insertText') which fires the correct
    // InputEvent that React intercepts and updates state with.

    const inserted = await page.evaluate((t) => {
        const el = document.activeElement;
        if (!el || el === document.body) return false;

        // Make sure the element is actually a text input or contenteditable
        const isEditable = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('role') === 'textbox';
        if (!isEditable) return false;

        // Clear existing content first
        el.focus();

        // Primary: execCommand (triggers React InputEvent)
        if (document.execCommand('selectAll', false, null)) {
            document.execCommand('delete', false, null);
        }
        const ok = document.execCommand('insertText', false, t);
        if (ok) return true;

        // Fallback: dispatch a paste-style InputEvent manually
        const ev = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: t,
        });
        el.dispatchEvent(ev);
        return false;
    }, text);

    if (!inserted) {
        // Last resort: clipboard paste via Puppeteer CDPSession
        console.log('[TYPE] execCommand failed, trying clipboard paste...');
        try {
            // Write to clipboard via CDP
            const client = await page.createCDPSession();
            await client.send('Input.insertText', { text });
            await client.detach();
        } catch (e) {
            // Ultra fallback: type character by character
            console.log('[TYPE] CDP insertText failed, falling back to keyboard.type()');
            for (const char of text) {
                await page.keyboard.type(char, { delay: 50 + Math.random() * 80 });
            }
        }
    }
};


/*
 * Human Scroll
 * Scrolls with variable speed, pauses, and occasional scroll-ups (reading).
 */
const autoScroll = async (page) => {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100;

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;

                // Randomize scroll distance
                const randomScroll = Math.floor(Math.random() * 150) + 50;

                // 10% chance to scroll UP (Reading something again)
                if (Math.random() < 0.1 && window.scrollY > 200) {
                    window.scrollBy(0, -100);
                } else {
                    window.scrollBy(0, randomScroll);
                }

                totalHeight += randomScroll;

                if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 3000) { // Limit scroll depth
                    clearInterval(timer);
                    resolve();
                }
            }, Math.floor(Math.random() * 400) + 200); // Random interval 200-600ms
        });
    });
};

/*
 * Bezier Curve Mouse Movement
 * Simulates organic hand movement rather than straight lines.
 */
const humanMove = async (page) => {
    // We start from a random position or current position if possible
    // Puppeteer doesn't track current mouse pos easily without storage, so we assume random move.

    const width = 1280; // Standard viewport width
    const height = 800;

    // Target: Random point on screen
    const targetX = Math.floor(Math.random() * width * 0.8) + (width * 0.1);
    const targetY = Math.floor(Math.random() * height * 0.8) + (height * 0.1);

    const startX = Math.random() * width;
    const startY = Math.random() * height;

    // Two Control Points for Cubic Bezier (More complex curve)
    const cp1X = Math.random() * width;
    const cp1Y = Math.random() * height;
    const cp2X = Math.random() * width;
    const cp2Y = Math.random() * height;

    const steps = 30 + Math.floor(Math.random() * 20); // 30-50 steps

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;

        // Cubic Bezier Formula
        // B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)t^2*P2 + t^3*P3
        const cx = 3 * (1 - t) * (1 - t) * t * cp1X + 3 * (1 - t) * t * t * cp2X;
        const cy = 3 * (1 - t) * (1 - t) * t * cp1Y + 3 * (1 - t) * t * t * cp2Y;

        const x = Math.pow(1 - t, 3) * startX + cx + Math.pow(t, 3) * targetX;
        const y = Math.pow(1 - t, 3) * startY + cy + Math.pow(t, 3) * targetY;

        await page.mouse.move(x, y);

        // Micro-pause (friction)
        if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, Math.random() * 5));
        }
    }
};

// Scroll inside a specific element (like a modal)
const scrollElement = async (page, selector) => {
    await page.evaluate(async (sel) => {
        const el = document.querySelector(sel);
        if (el) {
            el.scrollBy({ top: 500, behavior: 'smooth' });
        }
    }, selector);
};

// Smart Click: Move to element with curve, hover, pause, then click
const smartClick = async (page, elementHandle) => {
    if (!elementHandle) return;

    try {
        const box = await elementHandle.boundingBox();
        if (box) {
            // Target: Center of element + slight noise
            const targetX = box.x + (box.width / 2) + (Math.random() * 10 - 5);
            const targetY = box.y + (box.height / 2) + (Math.random() * 10 - 5);

            // Current mouse pos is unknown, so we move *to* the target in steps
            // Ideally we'd valid current mouse pos but Puppeteer tracks it internally.
            // Let's just use move with steps which is linear, but better than instant.
            // For true human, we'd calculate curve from last known pos.

            await page.mouse.move(targetX, targetY, { steps: 25 });

            // Hover / "Confirming"
            await randomDelay(400, 1000);

            await elementHandle.click();
        } else {
            // Fallback if no bounding box
            await elementHandle.click();
        }
    } catch (e) {
        console.error("Smart click failed, using standard click:", e);
        try { await elementHandle.click(); } catch (err) { }
    }
};

function spinText(text) {
    if (!text) return '';
    let msg = text.replace(/\{([^{}]+)\}/g, (_, content) => {
        const choices = content.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
    
    if (msg.includes('|')) {
        const choices = msg.split('|');
        msg = choices[Math.floor(Math.random() * choices.length)].trim();
    }
    
    return msg;
}

/**
 * Replaces template variables with real profile data.
 * This runs on EVERY message before sending — works in both AI and non-AI mode.
 *
 * Supported variables:
 *   {nome}          → First name extracted from displayName (fallback: @username)
 *   {nome_completo} → Full display name
 *   {usuario}       → @username
 *   {nicho}         → First meaningful phrase from bio (best-effort niche)
 *   {bio}           → First 100 chars of bio
 *
 * Example template:
 *   "Oi {nome}! Vi seu perfil de {nicho} e adorei o conteudo!"
 *   → "Oi Mariana! Vi seu perfil de instrutora de pilates e adorei o conteudo!"
 */
function applyTemplateVars(template, username, profileContext = {}) {
    if (!template) return '';
    const { displayName = '', bioStub = '' } = profileContext;

    // Extract first name (first word of displayName, letters only, fallback to @username)
    const rawFirstName = (displayName || '').split(/\s+/)[0] || '';
    const firstName = rawFirstName.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').trim() || username;

    // Niche: first logical phrase from bio (before line breaks or common separators)
    // Strips emojis and keeps clean readable text
    const bioCleaned = (bioStub || '').replace(/[\r\n]+/g, ' ').trim();
    const nichoMatch = bioCleaned.match(/^([^|\u2022\u00B7|/\\\u00B7\-\u2013\u2014\n]{3,50})/);
    const nicho = nichoMatch
        ? nichoMatch[1].replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim()
        : '';

    return template
        .replace(/\{nome\}/gi,          firstName)
        .replace(/\{nome_completo\}/gi, displayName || `@${username}`)
        .replace(/\{usuario\}/gi,       `@${username}`)
        .replace(/\{nicho\}/gi,         nicho)
        .replace(/\{bio\}/gi,           bioCleaned.substring(0, 100));
}

module.exports = { randomDelay, humanType, autoScroll, humanMove, scrollElement, smartClick, spinText, applyTemplateVars };

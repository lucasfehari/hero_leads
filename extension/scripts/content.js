// --- INSTAGRAM DOM AUTOMATION ---
const TEXTS = {
    FOLLOW: ['follow', 'seguir', 'suivre', 'folgen', 'segui'],
    FOLLOWING: ['following', 'seguindo', 'abbonato', 'abonné', 'gefolgt', 'requested', 'solicitado'],
    MESSAGE: ['message', 'enviar mensagem', 'mensagem', 'mensaje', 'enviar mensaje'],
    LIKE: ['like', 'curtir', 'aimer', 'gefällt mir', 'mi piace', 'me gusta'],
    UNLIKE: ['unlike', 'descurtir', 'je n\'aime plus', 'gefällt mir nicht mehr', 'non mi piace più'],
    NOT_NOW: ['not now', 'agora não', 'ahora no'],
    SEND_LABELS: ['send message', 'send', 'enviar mensagem', 'enviar']
};

function randomDelay(min, max) {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)));
}

// Escuta comandos do Background Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'GATHER_LEADS') {
        gatherLeads().then(leads => {
            chrome.runtime.sendMessage({ action: 'LEADS_GATHERED', leads });
        });
        sendResponse({ received: true });
    }

    if (request.command === 'PROCESS_PROFILE') {
        processProfile(request.config).then(() => {
            chrome.runtime.sendMessage({ action: 'PROFILE_PROCESSED' });
        }).catch(err => {
            chrome.runtime.sendMessage({ action: 'BOT_ERROR', message: err.message });
        });
        sendResponse({ received: true });
    }
});

// Fase 1: Pegar links da Hashtag
async function gatherLeads() {
    console.log('[BOT] Coletando leads da página de Hashtag...');
    let leads = new Set();
    let scrollAttempts = 0;

    while (leads.size < 25 && scrollAttempts < 10) {
        document.querySelectorAll('a[href*="/p/"]').forEach(a => {
            leads.add(a.href);
        });
        window.scrollBy(0, 800);
        await randomDelay(1500, 3000);
        scrollAttempts++;
    }

    // In a real bot doing cold DM by tags, you usually extract the authors of the posts
    // But since Instagram Hashtag page doesn't show authors easily without clicking, 
    // the V1 strategy is to visit the /p/ url, click like, and maybe DM the author if possible,
    // OR just return the post URLs and process them directly.
    return Array.from(leads);
}

// Fase 2: Interact with Profile / Post
async function processProfile(config) {
    console.log('[BOT] Inciando processamento na página...', config);
    await randomDelay(2000, 4000);

    // Se vier um post invés de perfil...
    if (window.location.href.includes('/p/')) {
        await processPostAsLead(config);
        return;
    }

    // Ações de Perfil Regular (se a URL fosse de usuário direto)
    if (config.doFollow) await clickFollow();
    if (config.doLike) await likeLatestPost();
    if (config.dmMessage) await sendDM(config.dmMessage);
}


async function processPostAsLead(config) {
    // 1. Like the post
    if (config.doLike) {
        await clickLike();
    }

    // 2. Try to follow the author from the post header
    if (config.doFollow) {
        const followBtn = Array.from(document.querySelectorAll('button')).find(
            b => TEXTS.FOLLOW.includes(b.textContent.toLowerCase().trim())
        );
        if (followBtn) {
            followBtn.click();
            await randomDelay(1000, 2000);
        }
    }

    // 3. To send a DM, we need to go to the author profile first
    if (config.dmMessage) {
        // Find author link (Usually an <a> tag in the header not starting with /explore /reels)
        const links = Array.from(document.querySelectorAll('a'));
        const authorLink = links.find(a => {
            const href = a.getAttribute('href');
            return href && href.startsWith('/') && href.split('/').length === 3 && !href.includes('/explore/') && !href.includes('/p/');
        });

        if (authorLink) {
            console.log(`[BOT] Indo para perfil do autor: ${authorLink.href}`);
            authorLink.click();
            await randomDelay(4000, 6000); // aguarda spa navigation
            await sendDM(config.dmMessage);
        } else {
            console.log('[BOT] Link do autor não encontrado no post.');
        }
    }
}

// -- AÇÕEs ATÔMICAS --

async function clickLike() {
    const likeSelectors = TEXTS.LIKE.map(t => `svg[aria-label="${t}" i]`).join(',');
    const likeBtn = document.querySelector(likeSelectors);
    if (likeBtn) {
        const clickable = likeBtn.closest('button') || likeBtn.closest('div[role="button"]');
        if (clickable) {
            clickable.click();
            console.log('[BOT] Post Curtido.');
            await randomDelay(1500, 2500);
        }
    }
}

async function clickFollow() {
    const followBtn = Array.from(document.querySelectorAll('button')).find(
        b => TEXTS.FOLLOW.includes(b.textContent.toLowerCase().trim())
    );
    if (followBtn) {
        followBtn.click();
        console.log('[BOT] Perfil Seguido.');
        await randomDelay(1500, 2500);
    }
}

async function sendDM(message) {
    // 1. Encontra e clica no botão "Enviar Mensagem" no perfil
    const msgBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(b => {
        const text = (b.textContent || '').toLowerCase().trim();
        return TEXTS.MESSAGE.some(t => text === t || text.includes(t));
    });

    if (!msgBtn) {
        console.log('[BOT] Botão de mensagem não encontrado.');
        return;
    }

    msgBtn.click();
    console.log('[BOT] Abrindo chat...');
    await randomDelay(5000, 8000); // Espera chat carregar

    // 2. Lida com popups "Not Now" (Notificações)
    const notNowBtn = Array.from(document.querySelectorAll('button')).find(
        b => TEXTS.NOT_NOW.some(t => (b.innerText || '').toLowerCase().includes(t))
    );
    if (notNowBtn) {
        notNowBtn.click();
        await randomDelay(1000, 2000);
    }

    // 3. Encontra Input Box do chat
    const input = document.querySelector('div[contenteditable="true"], textarea, div[role="textbox"]');
    if (!input) {
        console.log('[BOT] Input de texto do chat não encontrado.');
        return;
    }

    // 4. Input Text Bypass (Simulating Human Typing for React)
    input.focus();
    document.execCommand('insertText', false, message);
    await randomDelay(1500, 2500);

    // 5. Clica no botão Enviar (via Label SVG ou Botão texto)
    const sentViaBtn = Array.from(document.querySelectorAll('[aria-label], button, div[role="button"]')).find(el => {
        const lbl = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase().trim();
        if (TEXTS.SEND_LABELS.some(s => lbl === s || lbl.includes(s))) {
            return true;
        }
        return false;
    });

    if (sentViaBtn) {
        const btn = sentViaBtn.closest('button') || sentViaBtn.closest('div[role="button"]') || sentViaBtn;
        btn.click();
        console.log('[BOT] Mensagem enviada via clique no botão.');
    } else {
        // Fallback: Keyboard shortcut (Enter) fails often in isolated content scripts mapped to React, 
        // mas tentamos se o botão não for achado.
        const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        input.dispatchEvent(ev);
        console.log('[BOT] Mensagem enviada via tecla Enter (fallback).');
    }

    await randomDelay(2000, 3000);
}

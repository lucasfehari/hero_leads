const { saveSession, loadSession } = require('../db/sessions_db');

const saveCookies = async (page, profileName) => {
    const cookies = await page.cookies();

    let username = null;
    let profilePic = null;

    try {
        const data = await page.evaluate(() => {
            const img = document.querySelector('img[alt*="profile picture"]') || document.querySelector('img[alt*="foto de perfil"]');
            // Threads username is usually in the URL of the profile link or title, but we can do a best effort
            const profileLink = document.querySelector('a[href^="/@"]');
            let user = null;
            if (profileLink) {
                user = profileLink.getAttribute('href').replace('/', '').replace('@', '');
            }
            return {
                pic: img ? img.src : null,
                user: user
            };
        });
        profilePic = data.pic;
        username = data.user;
    } catch (e) {
        console.log('[Threads Login] Error extracting profile info:', e.message);
    }

    saveSession(profileName, cookies, username, profilePic);
    console.log(`[Threads Login] Session saved to DB: ${profileName}`);
};

const loadCookies = async (page, profileName) => {
    const cookies = loadSession(profileName);
    if (cookies && cookies.length > 0) {
        await page.setCookie(...cookies);
        return true;
    }
    return false;
};

const loginToThreads = async (page, logCallback, profileName = 'default') => {
    logCallback(`Checking for existing Instagram/Threads session (profile: ${profileName})...`);
    
    await loadCookies(page, profileName);
    await page.goto('https://www.threads.net/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000)); // wait for react to render modals

    logCallback('Verifying Threads session...');
    
    // Auto-click the modal button if it exists
    const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
        const loginBtn = buttons.find(b => b.innerText && (b.innerText.toLowerCase().includes('continuar com o instagram') || b.innerText.toLowerCase().includes('entrar com o instagram') || b.innerText.toLowerCase().includes('log in with instagram')));
        if (loginBtn) {
            loginBtn.click();
            return true;
        }
        return false;
    });

    if (clicked) {
        logCallback('Modal de login detectado. Clicando em "Continuar com o Instagram"...', 'info');
        await new Promise(r => setTimeout(r, 5000)); // wait for login to process
    }

    // Verify we are actually logged in
    const isLoggedIn = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
        const loginBtn = buttons.find(b => b.innerText && (b.innerText.toLowerCase().includes('continuar com o instagram') || b.innerText.toLowerCase().includes('entrar com o instagram')));
        if (loginBtn) return false; // Button is still there!

        const createSvg = document.querySelector('svg[aria-label="Create"], svg[aria-label="Criar"], svg[aria-label="Home"], svg[aria-label="Página inicial"]');
        if (createSvg) return true;
        
        return window.location.pathname !== '/login';
    });

    if (isLoggedIn) {
        logCallback('Session verified! Logged into Threads.');
        await saveCookies(page, profileName);
        return true;
    }

    logCallback('Atenção: Por favor, clique em "Continuar com Instagram" manualmente na janela do navegador que abriu.', 'warning');

    try {
        // Wait until the modal disappears and URL is correct
        await page.waitForFunction(() => {
            if (window.location.pathname === '/login') return false;
            const btns = Array.from(document.querySelectorAll('div[role="button"]'));
            const btn = btns.find(b => b.innerText && (b.innerText.toLowerCase().includes('continuar com o instagram') || b.innerText.toLowerCase().includes('entrar com o instagram')));
            if (btn) return false;
            return true;
        }, { timeout: 300000 });
        
        logCallback('Threads login detectado!');
        await new Promise(r => setTimeout(r, 3000));
        await saveCookies(page, profileName);
        return true;
    } catch (e) {
        logCallback('Login timed out.', 'error');
        return false;
    }
};

module.exports = { loginToThreads, saveCookies };

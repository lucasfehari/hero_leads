const { saveSession, loadSession } = require('../db/sessions_db');

/**
 * Active profile name — set by the bot engine when starting
 */
let activeProfile = 'default';

const setActiveProfile = (name) => { activeProfile = name; };
const getActiveProfile = () => activeProfile;

const saveCookies = async (page, profileName) => {
    const name = profileName || activeProfile;
    const cookies = await page.cookies();
    saveSession(name, cookies);
    console.log(`[Login] Session saved to DB: ${name}`);
};

const loadCookies = async (page, profileName) => {
    const name = profileName || activeProfile;
    const cookies = loadSession(name);
    if (cookies && cookies.length > 0) {
        await page.setCookie(...cookies);
        return true;
    }
    return false;
};

const login = async (page, logCallback, profileName) => {
    const name = profileName || activeProfile;
    logCallback(`Checking for existing session (profile: ${name})...`);
    const hasCookies = await loadCookies(page, name);

    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });

    if (hasCookies) {
        logCallback('Cookies loaded. Verifying session...');
        try {
            await page.waitForSelector('svg[aria-label="Home"], svg[aria-label="Página inicial"], svg[aria-label="Início"]', { timeout: 5000 });
            logCallback('Session verified! Logged in.');
            return true;
        } catch (e) {
            logCallback('Session invalid or expired.', 'warning');
        }
    }

    logCallback('Manual login required. Please log in within the browser window.', 'warning');

    try {
        await page.waitForSelector('svg[aria-label="Home"], svg[aria-label="Página inicial"], svg[aria-label="Início"]', { timeout: 300000 });
        logCallback('Login detected!');
        await saveCookies(page, name);
        return true;
    } catch (e) {
        logCallback('Login timed out.', 'error');
        return false;
    }
};

module.exports = { login, saveCookies, setActiveProfile, getActiveProfile };

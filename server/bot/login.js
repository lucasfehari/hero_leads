const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '../cookies.json');

const saveCookies = async (page) => {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
};

const loadCookies = async (page) => {
    if (fs.existsSync(COOKIES_PATH)) {
        const cookiesString = fs.readFileSync(COOKIES_PATH);
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        return true;
    }
    return false;
};

const login = async (page, logCallback) => {
    logCallback('Checking for existing session...');
    const hasCookies = await loadCookies(page);

    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });

    if (hasCookies) {
        logCallback('Cookies loaded. Verifying session...');
        try {
            await page.waitForSelector('svg[aria-label="Home"]', { timeout: 5000 });
            logCallback('Session verified! Logged in.');
            return true;
        } catch (e) {
            logCallback('Session invalid or expired.', 'warning');
        }
    }

    logCallback('Manual login required. Please log in within the browser window.', 'warning');

    // Wait for user to log in manually by checking for a specific element that appears after login
    try {
        await page.waitForSelector('svg[aria-label="Home"]', { timeout: 300000 }); // 5 minutes to login
        logCallback('Login detected!');
        await saveCookies(page);
        return true;
    } catch (e) {
        logCallback('Login timed out.', 'error');
        return false;
    }
};

module.exports = { login, saveCookies };

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const botService = require('./bot');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // Allow frontend dev server
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Store connected clients for log streaming
let connectedClients = [];

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    connectedClients.push(socket);

    socket.on('disconnect', () => {
        connectedClients = connectedClients.filter(c => c !== socket);
    });
});

// Function to broadcast logs to frontend
const broadcastLog = (message, type = 'info') => {
    const logEntry = { timestamp: new Date().toISOString(), message, type };
    io.emit('log', logEntry);
    console.log(`[${type.toUpperCase()}] ${message}`);
};

// Profile Management
const PROFILES_DIR = path.join(__dirname, 'profiles');
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR);

app.get('/api/profiles', (req, res) => {
    try {
        const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
        res.json({ profiles: files.map(f => f.replace('.json', '')) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/profiles/active', (req, res) => {
    const { profile } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile name required' });

    const source = path.join(PROFILES_DIR, `${profile}.json`);
    const target = path.join(__dirname, 'cookies.json');

    if (fs.existsSync(source)) {
        fs.copyFileSync(source, target);
        console.log(`[System] Switched to profile: ${profile}`);
        res.json({ success: true, active: profile });
    } else {
        res.status(404).json({ error: 'Profile not found' });
    }
});

app.post('/api/profiles/login', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Profile name required' });

    console.log(`[System] Launching browser for new profile: ${name}`);

    try {
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        const { executablePath } = require('puppeteer');
        puppeteer.use(StealthPlugin());

        const browser = await puppeteer.launch({
            headless: false,
            executablePath: executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-infobars', '--window-position=0,0']
        });

        const page = await browser.newPage();

        // CLEAR DATA (Cookies/Storage) to ensure clean login
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });

        console.log(`[System] Waiting for user to login to ${name}...`);

        // Wait for 'Home' icon or Timeout
        try {
            await page.waitForSelector('svg[aria-label="Home"], svg[aria-label="Página inicial"], svg[aria-label="Início"]', { timeout: 300000 }); // 5 mins
        } catch (e) {
            await browser.close();
            return res.status(408).json({ error: 'Login timeout or closed.' });
        }

        // Extract Cookies
        const cookies = await page.cookies();

        // Save to Profile
        const filePath = path.join(PROFILES_DIR, `${name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));

        await browser.close();

        console.log(`[System] Profile ${name} saved successfully.`);
        res.json({ success: true, profile: name });

    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/profiles', (req, res) => {
    const { name, cookies } = req.body;
    if (!name || !cookies) return res.status(400).json({ error: 'Name and Cookies required' });
    try {
        const filePath = path.join(PROFILES_DIR, `${name}.json`);
        fs.writeFileSync(filePath, typeof cookies === 'string' ? cookies : JSON.stringify(cookies, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// APIs
app.post('/api/start', async (req, res) => {
    try {
        const config = req.body;
        broadcastLog('Starting bot with config: ' + JSON.stringify(config));
        await botService.start(config, broadcastLog);
        res.json({ status: 'started' });
    } catch (error) {
        broadcastLog('Error starting bot: ' + error.message, 'error');
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop', async (req, res) => {
    try {
        await botService.stop();
        broadcastLog('Bot stopped by user.');
        res.json({ status: 'stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Google Maps Bot
const googleMapsBot = require('./bot/google_maps');

app.post('/api/google-maps/start', async (req, res) => {
    try {
        const config = req.body;
        broadcastLog('Starting Google Maps Bot with query: ' + config.query);

        // Run asynchronously
        googleMapsBot.start(config, broadcastLog, (data) => {
            // Send extracted data to frontend
            io.emit('maps-data', data);
        });

        res.json({ status: 'started' });
    } catch (error) {
        broadcastLog('Error starting Maps Bot: ' + error.message, 'error');
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/google-maps/stop', async (req, res) => {
    try {
        await googleMapsBot.stop();
        broadcastLog('Google Maps Bot stopped by user.');
        res.json({ status: 'stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Google Maps Profile Management (Session Folders) ---
const PROFILES_DATA_DIR = path.join(__dirname, '../profiles_data');
if (!fs.existsSync(PROFILES_DATA_DIR)) fs.mkdirSync(PROFILES_DATA_DIR);

app.get('/api/maps/profiles', (req, res) => {
    try {
        if (!fs.existsSync(PROFILES_DATA_DIR)) fs.mkdirSync(PROFILES_DATA_DIR);
        const files = fs.readdirSync(PROFILES_DATA_DIR, { withFileTypes: true });
        const profiles = files.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
        res.json({ profiles });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/maps/profiles/login', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Profile name required' });

    console.log(`[System] Opening browser for Maps Profile: ${name}`);

    try {
        const userDataDir = path.join(PROFILES_DATA_DIR, name);
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());

        // Try to find system Chrome (More trusted by Google)
        let execPath = require('puppeteer').executablePath(); // Default to bundled if nothing found
        const os = require('os');

        if (os.platform() === 'win32') {
            const possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    execPath = p;
                    console.log(`[System] Found and using System Chrome: ${p}`);
                    break;
                }
            }
        }

        // Launch NON-HEADLESS for user interaction
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: userDataDir,
            executablePath: execPath,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-position=0,0',
                '--window-size=1280,800',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();

        // Go to StackOverflow Login (Redirects to Google OAuth) - Less strict than direct Google login
        await page.goto('https://stackoverflow.com/users/login', { waitUntil: 'networkidle2' });
        console.log(`[System] Navigate to StackOverflow Login. Please click 'Log in with Google'.`);

        // We don't automate login here, we just wait for the user to close the browser
        console.log(`[System] Waiting for user to close browser for profile ${name}...`);

        // Wait for browser close
        await new Promise(resolve => browser.on('disconnected', resolve));

        console.log(`[System] Browser closed. Profile ${name} updated.`);
        res.json({ success: true, profile: name });

    } catch (e) {
        console.error("Maps Login Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- WhatsApp Module ---
const whatsappService = require('./whatsapp');

// Initialize WhatsApp (starts client and QR generation)
// We pass 'io' to allow the service to emit events to frontend
const waClient = whatsappService.init(io);

// List all saved sessions
app.get('/api/whatsapp/sessions', (req, res) => {
    res.json({ sessions: waClient.listSessions(), current: waClient.currentSession });
});

// Switch to a named session (creates new client/QR if no saved auth)
app.post('/api/whatsapp/sessions/switch', async (req, res) => {
    try {
        const { session } = req.body;
        if (!session) return res.status(400).json({ error: 'Session name required' });
        const result = await waClient.switchSession(session);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a session (cannot delete active)
app.delete('/api/whatsapp/sessions/:name', (req, res) => {
    try {
        const result = waClient.deleteSession(req.params.name);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start a campaign — messages can be string or array
app.post('/api/whatsapp/start', (req, res) => {
    try {
        const { numbers, messages, message, config } = req.body;
        const msgs = messages || (message ? [message] : null);
        if (!numbers || !msgs) return res.status(400).json({ error: 'Numbers and messages required' });

        const result = waClient.startCampaign(numbers, msgs, config);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ status: waClient.getStatus() });
});

app.get('/api/whatsapp/warmup', (req, res) => {
    try {
        const { getSessionWarmup, getHourlyCount } = require('./whatsapp/anti-ban');
        const session = waClient.currentSession;
        const warmupInfo = getSessionWarmup(session, null);
        const hourlyCount = getHourlyCount(session);
        res.json({ ...warmupInfo, hourlyCount, session });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Opt-out config — leitura
app.get('/api/whatsapp/optout-config', (req, res) => {
    res.json(waClient.optOutConfig);
});

// Opt-out config — atualização em tempo real (sem reiniciar)
app.post('/api/whatsapp/optout-config', (req, res) => {
    try {
        const { enabled, autoReply, replyMessage, keywords } = req.body;
        if (typeof enabled === 'boolean') waClient.optOutConfig.enabled = enabled;
        if (typeof autoReply === 'boolean') waClient.optOutConfig.autoReply = autoReply;
        if (typeof replyMessage === 'string') waClient.optOutConfig.replyMessage = replyMessage;
        if (Array.isArray(keywords)) waClient.optOutConfig.keywords = keywords;
        res.json({ success: true, config: waClient.optOutConfig });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

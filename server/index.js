require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const botService = require('./bot');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const igRouter = require('./instagram/routes');
const igWorker = require('./instagram/worker');
const { removeInteraction } = require('./bot/history_db');
const historyDb = require('./bot/history_db');
const mapsDb = require('./db/maps_db');
const sessionsDb = require('./db/sessions_db');
const ThreadsBotEngine = require('./threads_bot/index');

const threadsBotService = new ThreadsBotEngine();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // Aceita qualquer porta local (localhost ou 127.0.0.1)
        origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
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

// Pass 'io' via app so routers can access it
app.set('io', io);

// Function to broadcast logs to frontend
const broadcastLog = (message, type = 'info') => {
    const logEntry = { timestamp: new Date().toISOString(), message, type };
    io.emit('log', logEntry);
    console.log(`[${type.toUpperCase()}] ${message}`);
};

// Profile Management — SQLite-backed session store
app.get('/api/profiles', (req, res) => {
    try {
        const rows = sessionsDb.listSessions(); 
        const profiles = rows.map(row => {
            let isExpired = false;
            let expiresAt = null;
            try {
                const cookies = JSON.parse(row.cookies);
                const sessionIdCookie = cookies.find(c => c.name === 'sessionid');
                if (sessionIdCookie && sessionIdCookie.expires) {
                    expiresAt = sessionIdCookie.expires * 1000; // Convert to JS ms
                    isExpired = expiresAt < Date.now();
                } else {
                    isExpired = true; // Missing sessionid means invalid
                }
            } catch (e) {
                isExpired = true;
            }
            return {
                name: row.name,
                username: row.username,
                profile_pic: row.profile_pic,
                updated_at: row.updated_at,
                expiresAt,
                isExpired
            };
        });
        res.json({ profiles });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.post('/api/profiles/active', (req, res) => {
    const { profile } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile name required' });
    const cookies = sessionsDb.loadSession(profile);
    if (!cookies) return res.status(404).json({ error: 'Profile not found in DB' });
    // Inform the bot engine which profile to use on next start
    const { setActiveProfile } = require('./bot/login');
    setActiveProfile(profile);
    console.log(`[System] Switched to profile: ${profile}`);
    res.json({ success: true, active: profile });
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

        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });

        console.log(`[System] Waiting for user to login to ${name}...`);

        try {
            await page.waitForSelector('svg[aria-label="Home"], svg[aria-label="Página inicial"], svg[aria-label="Início"]', { timeout: 300000 });
        } catch (e) {
            await browser.close();
            return res.status(408).json({ error: 'Login timeout or closed.' });
        }

        const cookies = await page.cookies();
        
        let username = null;
        let profilePic = null;
        try {
            const data = await page.evaluate(() => {
                const img = document.querySelector('img[alt$="profile picture"]');
                return {
                    pic: img ? img.src : null,
                    user: window._sharedData?.config?.viewer?.username || null
                };
            });
            profilePic = data.pic;
            username = data.user;
        } catch (e) {}

        sessionsDb.saveSession(name, cookies, username, profilePic);
        await browser.close();

        console.log(`[System] Profile ${name} saved to DB.`);
        res.json({ success: true, profile: name });

    } catch (e) {
        console.error('Login Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/profiles/login-threads', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Profile name required' });

    console.log(`[System] Launching browser for Threads login: ${name}`);

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

        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        await page.goto('https://www.threads.net/login', { waitUntil: 'networkidle2' });

        console.log(`[System] Waiting for user to login to Threads (${name})...`);

        try {
            // Wait for URL to NOT be /login
            await page.waitForFunction('!window.location.href.includes("/login")', { timeout: 300000 });
            await new Promise(r => setTimeout(r, 4000));
        } catch (e) {
            await browser.close();
            return res.status(408).json({ error: 'Login timeout or closed.' });
        }

        const cookies = await page.cookies();
        
        let username = null;
        let profilePic = null;
        try {
            const data = await page.evaluate(() => {
                const img = document.querySelector('img[alt*="profile picture"]') || document.querySelector('img[alt*="foto de perfil"]');
                const profileLink = document.querySelector('a[href^="/@"]');
                let user = null;
                if (profileLink) {
                    user = profileLink.getAttribute('href').replace('/', '').replace('@', '');
                }
                return { pic: img ? img.src : null, user: user };
            });
            profilePic = data.pic;
            username = data.user;
        } catch (e) {}

        sessionsDb.saveSession(name, cookies, username, profilePic);
        await browser.close();

        console.log(`[System] Threads Profile ${name} saved to DB.`);
        res.json({ success: true, profile: name });

    } catch (e) {
        console.error('Threads Login Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/profiles', (req, res) => {
    const { name, cookies } = req.body;
    if (!name || !cookies) return res.status(400).json({ error: 'Name and Cookies required' });
    try {
        const parsed = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
        sessionsDb.saveSession(name, parsed);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/profiles/:name', (req, res) => {
    try {
        sessionsDb.deleteSession(req.params.name);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// APIs
// Set up multer for bot audio uploads
const BOT_AUDIOS_DIR = path.join(__dirname, 'uploads', 'bot_audios');
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
if (!fs.existsSync(BOT_AUDIOS_DIR)) fs.mkdirSync(BOT_AUDIOS_DIR);

const botAudioStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, BOT_AUDIOS_DIR),
    filename: (req, file, cb) => {
        // NOTE: req.body is NOT populated yet when filename() is called,
        // because multer processes the file stream before text fields.
        // Use a pure random name; the response returns the filename so the
        // frontend can associate it with the correct audio slot.
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'audio-' + uniqueSuffix + '.webm');
    }
});
const uploadBotAudio = multer({ storage: botAudioStorage });

app.post('/api/bot/upload-audio', uploadBotAudio.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    // Now req.body.id IS available (after multer finishes)
    const slotId = req.body.id || 'unknown';
    res.json({ success: true, path: req.file.path, filename: req.file.filename, slotId });
});

app.post('/api/bot/test-ai', async (req, res) => {
    const { key, model } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Chave não fornecida' });
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model || "openai/gpt-4o-mini",
                messages: [{ role: "user", content: "Responda apenas com a palavra 'OK'" }]
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) {
            res.json({ success: true, reply: data.choices[0].message.content });
        } else {
            res.json({ success: false, error: data.error?.message || JSON.stringify(data) });
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Gerar mensagens personalizadas com I.A para cada lead do Maps (paralelo, sem limite)
app.post('/api/ai/generate-messages', async (req, res) => {
    const { leads, prompt, companyContext, key, model } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Chave OpenRouter não configurada. Vá em Global Settings.' });
    if (!leads || !Array.isArray(leads) || leads.length === 0) return res.status(400).json({ success: false, error: 'Nenhum lead fornecido.' });
    if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, error: 'Prompt não fornecido.' });

    const llmModel = model || 'openai/gpt-4o-mini';
    const BATCH_SIZE = 8; // Processar 8 em paralelo

    const systemPrompt = [
        'Você é um consultor de vendas sênior especializado em prospecção B2B.',
        companyContext ? `\nContexto da empresa que você representa:\n${companyContext}` : '',
        '\nSua tarefa: analisar os dados de cada empresa prospectada e criar uma mensagem de abordagem no WhatsApp.',
        '\nRegras importantes:',
        '- A mensagem deve ser natural, como se um humano estivesse escrevendo',
        '- Use os dados da empresa para personalizar ao máximo (mencione o nome, localização, segmento)',
        '- Se a empresa tiver site, sugira que viu o site deles',
        '- Se tiver avaliações, mencione a reputação positiva deles (se aplicável)',
        '- Seja direto e objetivo — máximo 3-4 parágrafos curtos',
        '- NÃO use emojis em excesso, no máximo 1-2 por mensagem',
        '- Se você achar mais humano enviar o texto dividido em VÁRIAS mensagens separadas (como um humano enviaria no WhatsApp), use o separador "|||" entre elas. Exemplo: "Oi fulano! Tudo bem? ||| Vi que você tem uma empresa de..."',
        '- Responda APENAS com a mensagem, sem aspas, sem prefixo, sem explicações extras',
    ].join('');

    // Gera a mensagem para um lead específico
    const generateForLead = async (lead, idx) => {
        const nome = lead.name || lead.title || 'prezado(a)';
        const empresa = lead.name || lead.title || '';
        const endereco = lead.address || '';
        const telefone = lead.phoneFormatted || lead.phone || '';
        const segmento = lead.query || lead.category || '';
        const site = lead.website || '';
        const email = lead.email || '';
        const instagram = lead.instagram || '';
        const rating = lead.rating ? `${lead.rating} estrelas` : '';
        const reviews = lead.reviews_count || lead.reviewsCount || '';

        // Montar contexto rico da empresa
        const leadContext = [
            `Empresa: ${empresa}`,
            endereco ? `Localização: ${endereco}` : '',
            segmento ? `Segmento / Busca: ${segmento}` : '',
            site ? `Site: ${site}` : 'Não tem site próprio',
            email ? `Email: ${email}` : '',
            instagram ? `Instagram: @${instagram}` : '',
            rating ? `Avaliação no Google: ${rating}${reviews ? ` (${reviews} avaliações)` : ''}` : '',
        ].filter(Boolean).join('\n');

        // Substituir variáveis no prompt do usuário
        const userPrompt = prompt
            .replace(/\{nome\}/gi, nome)
            .replace(/\{empresa\}/gi, empresa)
            .replace(/\{endereco\}/gi, endereco)
            .replace(/\{telefone\}/gi, telefone)
            .replace(/\{segmento\}/gi, segmento)
            .replace(/\{site\}/gi, site)
            .replace(/\{rating\}/gi, rating)
            .replace(/\{email\}/gi, email)
            .replace(/\{instagram\}/gi, instagram);

        const finalUserPrompt = `${userPrompt}\n\n--- Dados da empresa para personalizar a mensagem ---\n${leadContext}`;

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: llmModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: finalUserPrompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.72
                })
            });
            const data = await response.json();
            const message = data.choices?.[0]?.message?.content?.trim() || '';
            return { leadId: lead.id, phone: telefone, name: nome, message, success: !!message, idx };
        } catch (e) {
            return { leadId: lead.id, phone: telefone, name: nome, message: '', success: false, error: e.message, idx };
        }
    };

    // Processar em batches paralelos
    const results = new Array(leads.length);
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map((lead, batchIdx) => generateForLead(lead, i + batchIdx)));
        batchResults.forEach(r => { results[r.idx] = r; });
    }

    res.json({ success: true, results, total: leads.length });
});


// Audio library — list all saved audios

app.get('/api/bot/audios', (req, res) => {
    try {
        const files = fs.readdirSync(BOT_AUDIOS_DIR)
            .filter(f => /\.(webm|mp3|wav|ogg|mp4|m4a)$/i.test(f))
            .map(f => {
                const stat = fs.statSync(path.join(BOT_AUDIOS_DIR, f));
                return { filename: f, path: path.join(BOT_AUDIOS_DIR, f), size: (stat.size / 1024).toFixed(1) + ' KB', createdAt: stat.birthtimeMs };
            })
            .sort((a, b) => b.createdAt - a.createdAt);
        res.json({ audios: files });
    } catch { res.json({ audios: [] }); }
});

// Serve individual audio file by filename
app.get('/api/bot/audios/file/:filename', (req, res) => {
    const filePath = path.join(BOT_AUDIOS_DIR, path.basename(req.params.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(filePath);
});

// Delete an audio file from the library
app.delete('/api/bot/audios/:filename', (req, res) => {
    try {
        const filePath = path.join(BOT_AUDIOS_DIR, path.basename(req.params.filename));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve the audios so Puppeteer can fetch them for the fake media stream
app.use('/api/bot/media', express.static(BOT_AUDIOS_DIR));


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

app.post('/api/threads/start', async (req, res) => {
    try {
        const config = req.body;
        broadcastLog('Starting Threads bot with config: ' + JSON.stringify(config));
        // Start in background
        threadsBotService.start(config, broadcastLog).catch(e => console.error(e));
        res.json({ status: 'started' });
    } catch (error) {
        broadcastLog('Error starting Threads bot: ' + error.message, 'error');
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/threads/stop', async (req, res) => {
    try {
        await threadsBotService.stop();
        broadcastLog('Threads Bot stopped by user.');
        res.json({ status: 'stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// History API
const HISTORY_FILE = path.join(__dirname, 'db', 'history.jsonl');

// History API — SQLite por Perfil
app.get('/api/history/profiles', (req, res) => {
    try { res.json({ profiles: historyDb.getProfiles() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/history', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const profile = req.query.profile || null;
        res.json(historyDb.getHistory({ profile, page, limit }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/history/:username', (req, res) => {
    try {
        const { username } = req.params;
        const profile = req.query.profile || 'default';
        historyDb.removeInteraction(username, profile);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Google Maps Bot
const googleMapsBot = require('./bot/google_maps');

app.post('/api/google-maps/start', async (req, res) => {
    try {
        const config = req.body;
        const rawQueries = config.queries || config.query;
        const queries = Array.isArray(rawQueries) ? rawQueries : [rawQueries];
        broadcastLog('Starting Google Maps Bot with queries: ' + queries.join(' | '));

        // Run asynchronously
        googleMapsBot.start({ ...config, queries }, broadcastLog, (data, currentQuery) => {
            // Persist to SQLite
            const lead = { ...data, query: currentQuery };
            mapsDb.saveLead(lead);
            // Send to frontend in realtime
            io.emit('maps-data', lead);
        });

        res.json({ status: 'started' });
    } catch (error) {
        broadcastLog('Error starting Maps Bot: ' + error.message, 'error');
        res.status(500).json({ error: error.message });
    }
});

// -- Google Maps Leads DB API --

// Listar leads com paginação e filtro por busca
app.get('/api/maps/leads', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const query = req.query.query || '';
        const hasWebsite = req.query.hasWebsite || 'all';
        const minStars = parseFloat(req.query.minStars) || 0;
        const minReviews = parseInt(req.query.minReviews) || 0;
        res.json(mapsDb.getLeads({ page, limit, query, hasWebsite, minStars, minReviews }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Validar números de WhatsApp em lote
app.post('/api/maps/validate-whatsapp', async (req, res) => {
    try {
        const { leads, countryCode } = req.body;
        if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'Lista de leads requerida.' });
        if (!waClient.isConnected) return res.status(400).json({ error: 'WhatsApp não está conectado para validar.' });

        // Extrair telefones validos e preparar
        const toValidate = [];
        const leadMap = {};
        for (let lead of leads) {
            if (lead.phone) {
                let num = lead.phone.replace(/\D/g, '');
                if (num.startsWith('0')) num = num.substring(1);
                if (countryCode && !(num.startsWith(countryCode) && num.length >= countryCode.length + 10)) {
                    num = countryCode + num;
                }
                toValidate.push(num);
                leadMap[num] = lead.id;
            } else {
                mapsDb.updateWhatsappStatus(lead.id, false);
            }
        }

        const validResults = await waClient.validateNumbers(toValidate);

        // Atualizar DB
        let validCount = 0;
        for (let r of validResults) {
            const leadId = leadMap[r.original] || leadMap[r.clean];
            if (leadId) {
                mapsDb.updateWhatsappStatus(leadId, r.isValid);
                if (r.isValid) validCount++;
            }
        }

        res.json({ success: true, totalValidated: validResults.length, validCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Deletar lead específico por id
app.delete('/api/maps/leads/:id', (req, res) => {
    try {
        const ok = mapsDb.deleteLead(parseInt(req.params.id));
        res.json({ success: ok });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Limpar todos os leads (ou por query)
app.delete('/api/maps/leads', (req, res) => {
    try {
        mapsDb.clearLeads(req.query.query || null);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
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

// Rename/label a session
app.patch('/api/whatsapp/sessions/:name/rename', (req, res) => {
    try {
        const { label } = req.body;
        if (!label) return res.status(400).json({ error: 'Label required' });
        const result = waClient.renameSession(req.params.name, label);
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


// --- Instagram Social Media Module ---
app.use('/api/ig', igRouter);
igWorker.start(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

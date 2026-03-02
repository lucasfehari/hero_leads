const { Client, LocalAuth } = require('whatsapp-web.js');
const MessageQueue = require('./queue');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SESSIONS_DIR = path.join(__dirname, '../../whatsapp_sessions');
const DB_PATH = path.join(__dirname, '../../whatsapp_sessions/wa_sessions_meta.db');

// ── SQLite metadata for WA sessions ──────────────────────────────────────────
// We can't store the FULL session (it's Chromium state) but we CAN store display metadata
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const metaDb = new Database(DB_PATH);
metaDb.exec(`
    CREATE TABLE IF NOT EXISTS session_meta (
        name        TEXT PRIMARY KEY,
        phone       TEXT,
        label       TEXT,
        status      TEXT DEFAULT 'disconnected',
        last_seen   TEXT
    );
`);

const saveMeta = (name, data) => {
    metaDb.prepare(`
        INSERT INTO session_meta (name, phone, label, status, last_seen)
        VALUES (@name, @phone, @label, @status, @last_seen)
        ON CONFLICT(name) DO UPDATE SET
            phone     = COALESCE(excluded.phone,     phone),
            label     = COALESCE(excluded.label,     label),
            status    = excluded.status,
            last_seen = excluded.last_seen
    `).run({
        name,
        phone: data.phone || null,
        label: data.label || null,
        status: data.status || 'disconnected',
        last_seen: new Date().toISOString()
    });
};

const getMeta = (name) => metaDb.prepare(`SELECT * FROM session_meta WHERE name = ?`).get(name) || { name };
const getAllMeta = () => metaDb.prepare(`SELECT * FROM session_meta`).all();

// ─────────────────────────────────────────────────────────────────────────────
class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.client = null;
        this.queue = null;
        this.isConnected = false;
        this.currentSession = 'default';

        this.optOutConfig = {
            enabled: true,
            autoReply: true,
            replyMessage: 'Tudo bem! Você foi removido da nossa lista e não receberá mais mensagens. 👋',
            keywords: [
                'sair', 'parar', 'stop', 'cancelar', 'descadastrar',
                'remover', 'nao quero', 'não quero', 'chega', 'para',
                'unsubscribe', 'block', 'bloquear', 'stp', 'quit'
            ]
        };

        if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        this.createClient('default');
    }

    createClient(sessionName) {
        if (this.client) {
            try { this.client.destroy(); } catch (e) { /* ignore */ }
        }

        this.currentSession = sessionName;
        this.isConnected = false;

        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionName,
                dataPath: SESSIONS_DIR
            }),
            puppeteer: {
                headless: true,
                protocolTimeout: 60000,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-blink-features=AutomationControlled'
                ]
            }
        });

        this.queue = new MessageQueue(
            () => this.client,
            () => this.currentSession
        );

        this.queue.onStatus((status) => {
            this.io.emit('wa-queue-status', status);
        });

        this.initialize();
    }

    initialize() {
        this.client.on('qr', (qr) => {
            console.log('QR recebido para sessão:', this.currentSession);
            saveMeta(this.currentSession, { status: 'scan_qr' });
            this.io.emit('wa-qr', qr);
        });

        this.client.on('ready', async () => {
            console.log('WhatsApp Client is ready! Session:', this.currentSession);
            this.isConnected = true;

            // Captura o número de telefone da sessão conectada
            let phone = null;
            try {
                const info = this.client.info;
                phone = info?.wid?.user || info?.me?.user || null;
                if (phone) phone = '+' + phone;
            } catch (e) { /* ignore */ }

            saveMeta(this.currentSession, { status: 'connected', phone });
            this.io.emit('wa-status', { status: 'connected', session: this.currentSession, phone });
        });

        this.client.on('authenticated', () => {
            console.log('WhatsApp Authenticated. Session:', this.currentSession);
            saveMeta(this.currentSession, { status: 'authenticated' });
            this.io.emit('wa-status', { status: 'authenticated', session: this.currentSession });
        });

        this.client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
            saveMeta(this.currentSession, { status: 'error' });
            this.io.emit('wa-status', { status: 'error', message: msg });
        });

        this.client.on('disconnected', (reason) => {
            console.log('Client was logged out', reason);
            this.isConnected = false;
            saveMeta(this.currentSession, { status: 'disconnected' });
            this.io.emit('wa-status', { status: 'disconnected' });
        });

        // ── Opt-Out automático ───────────────────────────────────────────────
        this.client.on('message', async (msg) => {
            if (msg.fromMe) return;
            if (!this.optOutConfig.enabled) return;

            const body = (msg.body || '').toLowerCase().trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            const isOptOut = this.optOutConfig.keywords.some(kw => {
                const kw_norm = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return body === kw_norm || body.startsWith(kw_norm + ' ') || body.endsWith(' ' + kw_norm);
            });

            if (!isOptOut) return;

            const number = msg.from;
            const rawNumber = number.replace('@c.us', '');
            const { saveBadNumber } = require('./anti-ban');
            saveBadNumber(this.currentSession, number);

            console.log(`[Opt-Out] ${rawNumber} solicitou remoção. Adicionado à blacklist.`);

            if (this.optOutConfig.autoReply && this.optOutConfig.replyMessage?.trim()) {
                try { await msg.reply(this.optOutConfig.replyMessage); } catch (e) { /* ignora */ }
            }

            this.io.emit('wa-optout', {
                number: rawNumber,
                session: this.currentSession,
                message: msg.body,
                timestamp: new Date().toISOString()
            });
        });

        console.log(`Initializing WhatsApp Client (session: ${this.currentSession})...`);
        this.client.initialize();
    }

    listSessions() {
        try {
            if (!fs.existsSync(SESSIONS_DIR)) return [];
            const entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
            const folderSessions = entries
                .filter(e => e.isDirectory() && e.name.startsWith('session-'))
                .map(e => e.name.replace('session-', ''));

            const allMeta = getAllMeta();
            const metaMap = Object.fromEntries(allMeta.map(m => [m.name, m]));

            return folderSessions.map(s => ({
                name: s,
                phone: metaMap[s]?.phone || null,
                label: metaMap[s]?.label || s,
                status: s === this.currentSession
                    ? (this.isConnected ? 'connected' : metaMap[s]?.status || 'connecting')
                    : metaMap[s]?.status || 'disconnected',
                active: s === this.currentSession,
                last_seen: metaMap[s]?.last_seen || null
            }));
        } catch (e) {
            return [];
        }
    }

    async switchSession(sessionName) {
        if (sessionName === this.currentSession && this.isConnected) {
            return { success: false, error: 'Already on this session' };
        }
        this.io.emit('wa-status', { status: 'switching', session: sessionName });
        this.createClient(sessionName);
        return { success: true, session: sessionName };
    }

    deleteSession(sessionName) {
        if (sessionName === this.currentSession) {
            return { success: false, error: 'Cannot delete the active session. Switch first.' };
        }
        const sessionPath = path.join(SESSIONS_DIR, `session-${sessionName}`);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            metaDb.prepare(`DELETE FROM session_meta WHERE name = ?`).run(sessionName);
            return { success: true };
        }
        return { success: false, error: 'Session not found' };
    }

    renameSession(sessionName, label) {
        metaDb.prepare(`
            INSERT INTO session_meta (name, label) VALUES (?, ?)
            ON CONFLICT(name) DO UPDATE SET label = excluded.label
        `).run(sessionName, label);
        return { success: true };
    }

    getStatus() {
        const meta = getMeta(this.currentSession);
        return {
            connected: this.isConnected,
            session: this.currentSession,
            phone: meta?.phone || null,
            label: meta?.label || this.currentSession,
            sessions: this.listSessions()
        };
    }

    startCampaign(numbers, messages, config) {
        if (!this.isConnected) throw new Error('WhatsApp not connected');
        const messagesArray = Array.isArray(messages) ? messages : [messages];
        this.queue.setConfig(config);
        this.queue.addToQueue(numbers, messagesArray);
        return { success: true, message: 'Campaign started' };
    }
}

let instance = null;

module.exports = {
    init: (io) => {
        if (!instance) instance = new WhatsAppService(io);
        return instance;
    },
    getInstance: () => instance
};

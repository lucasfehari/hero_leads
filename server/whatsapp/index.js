const { Client, LocalAuth } = require('whatsapp-web.js');
const MessageQueue = require('./queue');
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../../whatsapp_sessions');

class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.client = null;
        this.queue = null;
        this.isConnected = false;
        this.currentSession = 'default';

        // Configurações de opt-out (atualizadas via API)
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

        // Ensure sessions directory exists
        if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

        this.createClient('default');
    }

    createClient(sessionName) {
        // Destroy previous client if exists
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
            this.io.emit('wa-qr', qr);
        });

        this.client.on('ready', () => {
            console.log('WhatsApp Client is ready! Session:', this.currentSession);
            this.isConnected = true;
            this.io.emit('wa-status', { status: 'connected', session: this.currentSession });
        });

        this.client.on('authenticated', () => {
            console.log('WhatsApp Authenticated. Session:', this.currentSession);
            this.io.emit('wa-status', { status: 'authenticated', session: this.currentSession });
        });

        this.client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
            this.io.emit('wa-status', { status: 'error', message: msg });
        });

        this.client.on('disconnected', (reason) => {
            console.log('Client was logged out', reason);
            this.isConnected = false;
            this.io.emit('wa-status', { status: 'disconnected' });
        });

        // ── Opt-Out automático ───────────────────────────────────────────────────────────
        this.client.on('message', async (msg) => {
            // Só processa mensagens recebidas (não enviadas por nós)
            if (msg.fromMe) return;

            // Verifica se opt-out está ativo
            if (!this.optOutConfig.enabled) return;

            const body = (msg.body || '').toLowerCase().trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos

            const isOptOut = this.optOutConfig.keywords.some(kw => {
                const kw_norm = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return body === kw_norm || body.startsWith(kw_norm + ' ') || body.endsWith(' ' + kw_norm);
            });

            if (!isOptOut) return;

            const number = msg.from; // ex: '5511999999999@c.us'
            const rawNumber = number.replace('@c.us', '');

            // Salva na blacklist da sessão atual
            const { saveBadNumber } = require('./anti-ban');
            saveBadNumber(this.currentSession, number);

            console.log(`[Opt-Out] ${rawNumber} solicitou remoção. Adicionado à blacklist.`);

            // Resposta automática (somente se ativada e configurada)
            if (this.optOutConfig.autoReply && this.optOutConfig.replyMessage?.trim()) {
                try { await msg.reply(this.optOutConfig.replyMessage); } catch (e) { /* ignora erro de resposta */ }
            }

            // Notifica o frontend em tempo real
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
            return entries
                .filter(e => e.isDirectory() && e.name.startsWith('session-'))
                .map(e => e.name.replace('session-', ''));
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
        // Prevent deleting active session
        if (sessionName === this.currentSession) {
            return { success: false, error: 'Cannot delete the active session. Switch first.' };
        }
        const sessionPath = path.join(SESSIONS_DIR, `session-${sessionName}`);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            return { success: true };
        }
        return { success: false, error: 'Session not found' };
    }

    getStatus() {
        return {
            connected: this.isConnected,
            session: this.currentSession,
            sessions: this.listSessions()
        };
    }

    startCampaign(numbers, messages, config) {
        if (!this.isConnected) throw new Error('WhatsApp not connected');
        // messages can be a string or array
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

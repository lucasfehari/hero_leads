/**
 * logger.js — Sistema de Observabilidade do Threads Bot
 * 
 * Responsabilidades:
 * - Logs estruturados com tipo, contexto e timestamp
 * - Gravação em arquivo rotacionado por sessão
 * - Captura de screenshots automática em caso de erro
 */

const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'debug_screenshots');
const LOGS_DIR = path.join(__dirname, 'debug_logs');

class Logger {
    /**
     * @param {Function} uiCallback - Função para emitir logs para o painel web (m, type)
     */
    constructor(uiCallback) {
        this.uiCallback = uiCallback || (() => {});
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFilePath = null;
        this._ensureDirs();
        this._initLogFile();
    }

    _ensureDirs() {
        if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    _initLogFile() {
        this.logFilePath = path.join(LOGS_DIR, `session_${this.sessionId}.log`);
        this._writeToFile(`=== THREADS BOT SESSION STARTED: ${new Date().toISOString()} ===\n`);
    }

    _writeToFile(text) {
        try {
            fs.appendFileSync(this.logFilePath, text + '\n', 'utf8');
        } catch (e) {
            // silently fail — log file writes should never crash the bot
        }
    }

    /**
     * Log genérico
     * @param {string} message
     * @param {'info'|'success'|'warning'|'error'|'state'|'action'} type
     * @param {Object} [context] - Dados extras para gravar no arquivo de log
     */
    log(message, type = 'info', context = null) {
        const timestamp = new Date().toISOString();
        const prefix = {
            info:    '  ℹ️ ',
            success: '  ✅',
            warning: '  ⚠️ ',
            error:   '  ❌',
            state:   '  🔄',
            action:  '  🖱️ ',
        }[type] || '  ';

        const uiMessage = `${prefix} ${message}`;
        this.uiCallback(uiMessage, type);

        const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}` +
            (context ? ` | CTX: ${JSON.stringify(context)}` : '');
        this._writeToFile(logLine);
    }

    /**
     * Log estruturado de uma ação específica
     */
    logAction({ action, element = null, text = null, result = null, reason = null }) {
        const parts = [`ACTION=${action}`];
        if (element) parts.push(`ELEMENT=${element}`);
        if (text)    parts.push(`TEXT="${text.substring(0, 60)}${text.length > 60 ? '…' : ''}"`);
        if (result)  parts.push(`RESULT=${result}`);
        if (reason)  parts.push(`REASON=${reason}`);

        this.log(parts.join(' | '), result === 'FAIL' ? 'error' : 'action');
    }

    /**
     * Captura screenshot e salva em disco
     * @param {import('puppeteer').Page} page
     * @param {string} reason - Motivo do screenshot (usado no nome do arquivo)
     * @returns {string|null} Caminho do arquivo salvo
     */
    async captureScreenshot(page, reason = 'error') {
        try {
            const sanitized = reason.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
            const filename = `${sanitized}_${this.sessionId}_${Date.now()}.png`;
            const filepath = path.join(SCREENSHOTS_DIR, filename);
            await page.screenshot({ path: filepath, fullPage: false });
            this.log(`📸 Screenshot salvo: ${filename}`, 'info');
            return filepath;
        } catch (e) {
            this.log(`Falha ao capturar screenshot: ${e.message}`, 'warning');
            return null;
        }
    }

    /**
     * Log de transição de estado
     */
    logStateTransition(from, to) {
        this.log(`Estado: ${from} → ${to}`, 'state');
    }

    /**
     * Encerra a sessão de log
     */
    close() {
        this._writeToFile(`\n=== SESSION ENDED: ${new Date().toISOString()} ===`);
    }
}

module.exports = Logger;

/**
 * Instagram History — Banco local SQLite por Perfil
 *
 * Cada perfil (cookie/conta) tem seu próprio histórico isolado.
 * Substitui o arquivo JSONL simples que misturava todos os perfis.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'instagram_history.db');
const db = new Database(DB_PATH);

// Tabela única com coluna "profile" para separar por conta
db.exec(`
    CREATE TABLE IF NOT EXISTS ig_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        profile     TEXT    NOT NULL DEFAULT 'default',
        username    TEXT    NOT NULL,
        actions     TEXT,
        date        TEXT    DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_user ON ig_history(profile, username);
    CREATE INDEX IF NOT EXISTS idx_profile ON ig_history(profile);
`);

// Set em memória por perfil — para lookup O(1) durante o scraping
const visitedByProfile = {};

// Carregar todos os registros na memória ao iniciar
const rows = db.prepare('SELECT profile, username FROM ig_history').all();
for (const row of rows) {
    if (!visitedByProfile[row.profile]) visitedByProfile[row.profile] = new Set();
    visitedByProfile[row.profile].add(row.username.toLowerCase());
}
console.log(`[InstaHistory DB] Loaded ${rows.length} records across ${Object.keys(visitedByProfile).length} profile(s).`);

// ── API pública ───────────────────────────────────────────────────────────────

const hasInteracted = (username, profile = 'default') => {
    if (!username) return false;
    const set = visitedByProfile[profile];
    return set ? set.has(username.toLowerCase()) : false;
};

const recordInteraction = (username, actions = [], profile = 'default') => {
    if (!username) return;
    const userLower = username.toLowerCase();
    if (!visitedByProfile[profile]) visitedByProfile[profile] = new Set();
    if (visitedByProfile[profile].has(userLower)) return; // Já registrado

    visitedByProfile[profile].add(userLower);

    db.prepare(`
        INSERT OR IGNORE INTO ig_history (profile, username, actions)
        VALUES (?, ?, ?)
    `).run(profile, userLower, JSON.stringify(actions));
};

const removeInteraction = (username, profile = 'default') => {
    if (!username) return;
    const userLower = username.toLowerCase();
    if (visitedByProfile[profile]) visitedByProfile[profile].delete(userLower);
    db.prepare('DELETE FROM ig_history WHERE profile = ? AND username = ?').run(profile, userLower);
};

// Listar com paginação por perfil
const getHistory = ({ profile = null, page = 1, limit = 20 } = {}) => {
    const offset = (page - 1) * limit;
    const where = profile ? 'WHERE profile = ?' : '';
    const params = profile ? [profile] : [];

    const total = db.prepare(`SELECT COUNT(*) as c FROM ig_history ${where}`).get(...params).c;
    const rows = db.prepare(
        `SELECT * FROM ig_history ${where} ORDER BY date DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return { history: rows, total, pages: Math.ceil(total / limit), page };
};

// Listar perfis únicos registrados
const getProfiles = () => {
    return db.prepare('SELECT DISTINCT profile, COUNT(*) as count FROM ig_history GROUP BY profile').all();
};

module.exports = { hasInteracted, recordInteraction, removeInteraction, getHistory, getProfiles };

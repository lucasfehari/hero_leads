const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'instagram_sessions.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        name        TEXT PRIMARY KEY,
        cookies     TEXT NOT NULL,
        updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
    );
`);

/**
 * Save (upsert) cookies for a profile.
 * @param {string} name  - Profile name (e.g. "filazilla")
 * @param {Array}  cookies - Array of Puppeteer cookie objects
 */
const saveSession = (name, cookies) => {
    db.prepare(`
        INSERT INTO sessions (name, cookies, updated_at)
        VALUES (?, ?, datetime('now','localtime'))
        ON CONFLICT(name) DO UPDATE SET
            cookies    = excluded.cookies,
            updated_at = excluded.updated_at
    `).run(name, JSON.stringify(cookies));
};

/**
 * Load cookies for a profile. Returns parsed Array or null.
 * @param {string} name
 * @returns {Array|null}
 */
const loadSession = (name) => {
    const row = db.prepare(`SELECT cookies FROM sessions WHERE name = ?`).get(name);
    if (!row) return null;
    try { return JSON.parse(row.cookies); } catch { return null; }
};

/**
 * List all saved profile names.
 * @returns {string[]}
 */
const listSessions = () => {
    return db.prepare(`SELECT name, updated_at FROM sessions ORDER BY updated_at DESC`).all();
};

/**
 * Delete a profile session.
 * @param {string} name
 */
const deleteSession = (name) => {
    db.prepare(`DELETE FROM sessions WHERE name = ?`).run(name);
};

module.exports = { saveSession, loadSession, listSessions, deleteSession };

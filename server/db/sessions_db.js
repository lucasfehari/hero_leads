const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(require('os').homedir(), '.browzebot');
const DB_PATH = path.join(DB_DIR, 'instagram_sessions.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        name        TEXT PRIMARY KEY,
        cookies     TEXT NOT NULL,
        username    TEXT,
        profile_pic TEXT,
        updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
    );
`);

try {
    db.exec(`ALTER TABLE sessions ADD COLUMN username TEXT;`);
    db.exec(`ALTER TABLE sessions ADD COLUMN profile_pic TEXT;`);
} catch (e) {
    // Columns might already exist
}

/**
 * Save (upsert) cookies for a profile.
 * @param {string} name  - Profile name (e.g. "filazilla")
 * @param {Array}  cookies - Array of Puppeteer cookie objects
 */
const saveSession = (name, cookies, username = null, profilePic = null) => {
    // If username and profilePic are provided, update them. Otherwise, keep existing if possible, 
    // but the easiest is just coalesce or do a conditional update. We'll do a simple update:
    db.prepare(`
        INSERT INTO sessions (name, cookies, username, profile_pic, updated_at)
        VALUES (?, ?, ?, ?, datetime('now','localtime'))
        ON CONFLICT(name) DO UPDATE SET
            cookies    = excluded.cookies,
            username   = coalesce(excluded.username, sessions.username),
            profile_pic = coalesce(excluded.profile_pic, sessions.profile_pic),
            updated_at = excluded.updated_at
    `).run(name, JSON.stringify(cookies), username, profilePic);
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
    return db.prepare(`SELECT name, username, profile_pic, updated_at, cookies FROM sessions ORDER BY updated_at DESC`).all();
};

/**
 * Delete a profile session.
 * @param {string} name
 */
const deleteSession = (name) => {
    db.prepare(`DELETE FROM sessions WHERE name = ?`).run(name);
};

module.exports = { saveSession, loadSession, listSessions, deleteSession };

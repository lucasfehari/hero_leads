const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'db');
const DB_PATH = path.join(DB_DIR, 'maps_leads.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Criar tabela se não existir
db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        phone       TEXT,
        website     TEXT,
        address     TEXT,
        rating      TEXT,
        query       TEXT,
        scraped_at  TEXT    DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_name ON leads(name);
    CREATE INDEX IF NOT EXISTS idx_query ON leads(query);
`);

const saveLead = (lead) => {
    // Evitar duplicatas pelo nome + telefone
    const existing = db.prepare(
        `SELECT id FROM leads WHERE name = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))`
    ).get(lead.name, lead.phone || null, lead.phone || null);

    if (existing) return { inserted: false, id: existing.id };

    const stmt = db.prepare(`
        INSERT INTO leads (name, phone, website, address, rating, query)
        VALUES (@name, @phone, @website, @address, @rating, @query)
    `);
    const result = stmt.run({
        name: lead.name || '',
        phone: lead.phone || null,
        website: lead.website || null,
        address: lead.address || null,
        rating: lead.rating || null,
        query: lead.query || null,
    });
    return { inserted: true, id: result.lastInsertRowid };
};

const getLeads = ({ page = 1, limit = 20, query = '' } = {}) => {
    const offset = (page - 1) * limit;
    const where = query ? `WHERE query LIKE ?` : '';
    const params = query ? [`%${query}%`] : [];

    const total = db.prepare(`SELECT COUNT(*) as c FROM leads ${where}`).get(...params).c;
    const rows = db.prepare(
        `SELECT * FROM leads ${where} ORDER BY scraped_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return { leads: rows, total, pages: Math.ceil(total / limit) };
};

const deleteLead = (id) => {
    const r = db.prepare(`DELETE FROM leads WHERE id = ?`).run(id);
    return r.changes > 0;
};

const clearLeads = (query = null) => {
    if (query) {
        db.prepare(`DELETE FROM leads WHERE query = ?`).run(query);
    } else {
        db.prepare(`DELETE FROM leads`).run();
    }
};

module.exports = { saveLead, getLeads, deleteLead, clearLeads };

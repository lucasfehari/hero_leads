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

// Try to alter table to add columns for older DBs, ignoring error if they exist.
try { db.exec('ALTER TABLE leads ADD COLUMN rating_stars REAL;'); } catch (e) { }
try { db.exec('ALTER TABLE leads ADD COLUMN review_count INTEGER;'); } catch (e) { }
try { db.exec('ALTER TABLE leads ADD COLUMN email TEXT;'); } catch (e) { }
try { db.exec('ALTER TABLE leads ADD COLUMN instagram TEXT;'); } catch (e) { }

const saveLead = (lead) => {
    // Evitar duplicatas pelo nome + telefone
    const existing = db.prepare(
        `SELECT id FROM leads WHERE name = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))`
    ).get(lead.name, lead.phone || null, lead.phone || null);

    if (existing) return { inserted: false, id: existing.id };

    const stmt = db.prepare(`
        INSERT INTO leads (name, phone, website, address, rating, query, rating_stars, review_count, email, instagram)
        VALUES (@name, @phone, @website, @address, @rating, @query, @rating_stars, @review_count, @email, @instagram)
    `);
    const result = stmt.run({
        name: lead.name || '',
        phone: lead.phone || null,
        website: lead.website || null,
        address: lead.address || null,
        rating: lead.rating || null,
        query: lead.query || null,
        rating_stars: lead.rating_stars || null,
        review_count: lead.review_count || null,
        email: lead.email || null,
        instagram: lead.instagram || null,
    });
    return { inserted: true, id: result.lastInsertRowid };
};

const getLeads = ({ page = 1, limit = 20, query = '', hasWebsite = 'all', minStars = 0, minReviews = 0 } = {}) => {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    const params = [];

    if (query) {
        whereConditions.push(`query LIKE ?`);
        params.push(`%${query}%`);
    }

    if (hasWebsite === 'yes') {
        whereConditions.push(`website IS NOT NULL AND website != ''`);
    } else if (hasWebsite === 'no') {
        whereConditions.push(`(website IS NULL OR website = '')`);
    }

    if (minStars > 0) {
        whereConditions.push(`rating_stars >= ?`);
        params.push(minStars);
    }

    if (minReviews > 0) {
        whereConditions.push(`review_count >= ?`);
        params.push(minReviews);
    }

    const where = whereConditions.length > 0 ? `WHERE ` + whereConditions.join(' AND ') : '';

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

const updateWhatsappStatus = (id, isValid) => {
    db.prepare(`UPDATE leads SET whatsapp_valid = ? WHERE id = ?`).run(isValid ? 1 : 0, id);
};

module.exports = { saveLead, getLeads, deleteLead, clearLeads, updateWhatsappStatus };

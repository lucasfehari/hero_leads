const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const IG_DIR = path.join(require('os').homedir(), '.browzebot');
const COOKIES_DIR = path.join(IG_DIR, 'cookies');

if (!fs.existsSync(COOKIES_DIR)) fs.mkdirSync(COOKIES_DIR, { recursive: true });

const db = new Database(path.join(IG_DIR, 'instagram.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS ig_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT,
    cookie_file TEXT,
    status TEXT DEFAULT 'disconnected',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ig_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    post_type TEXT DEFAULT 'single',
    aspect_ratio TEXT DEFAULT '1:1',
    media_files TEXT DEFAULT '[]',
    media_path TEXT,
    media_type TEXT DEFAULT 'image',
    caption TEXT DEFAULT '',
    hashtags TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    scheduled_at TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    published_at TEXT,
    error_msg TEXT,
    FOREIGN KEY (account_id) REFERENCES ig_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ig_post_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    message TEXT,
    level TEXT DEFAULT 'info',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migrations: adiciona colunas se não existirem (safe no-op se já existem) ──
const postColumns = db.prepare("PRAGMA table_info(ig_posts)").all().map(c => c.name);
if (!postColumns.includes('post_type')) db.exec("ALTER TABLE ig_posts ADD COLUMN post_type TEXT DEFAULT 'single'");
if (!postColumns.includes('aspect_ratio')) db.exec("ALTER TABLE ig_posts ADD COLUMN aspect_ratio TEXT DEFAULT '1:1'");
if (!postColumns.includes('media_files')) db.exec("ALTER TABLE ig_posts ADD COLUMN media_files TEXT DEFAULT '[]'");

// ── Novas colunas para integração com a Instagram Graph API ──────────────
// ig_user_id: O ID numérico do Instagram na API (diferente do @username)
// access_token: Token de acesso com permissão instagram_business_content_publish
// token_expires_at: Data ISO de expiração do token (tokens de longa duração duram ~60 dias)
// publish_method: 'api' (Graph API) ou 'puppeteer' (automação de browser — legacy)
const accColumns = db.prepare("PRAGMA table_info(ig_accounts)").all().map(c => c.name);
if (!accColumns.includes('ig_user_id')) db.exec("ALTER TABLE ig_accounts ADD COLUMN ig_user_id TEXT");
if (!accColumns.includes('access_token')) db.exec("ALTER TABLE ig_accounts ADD COLUMN access_token TEXT");
if (!accColumns.includes('token_expires_at')) db.exec("ALTER TABLE ig_accounts ADD COLUMN token_expires_at TEXT");
if (!accColumns.includes('publish_method')) db.exec("ALTER TABLE ig_accounts ADD COLUMN publish_method TEXT DEFAULT 'puppeteer'");

module.exports = { db, COOKIES_DIR };


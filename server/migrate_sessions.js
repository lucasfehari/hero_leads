// Script de migração: move as sessões JSON antigas para o banco de dados SQLite
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, 'db', 'instagram_sessions.db'));

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        name TEXT PRIMARY KEY,
        cookies TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
`);

const profilesDir = path.join(__dirname, 'profiles');

if (!fs.existsSync(profilesDir)) {
    console.log('Pasta server/profiles não encontrada — nada a fazer.');
    process.exit(0);
}

const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
    console.log('Nenhum arquivo .json encontrado para migrar.');
} else {
    for (const f of files) {
        const name = f.replace('.json', '');
        const cookies = fs.readFileSync(path.join(profilesDir, f), 'utf8');
        db.prepare(
            `INSERT OR REPLACE INTO sessions (name, cookies, updated_at) VALUES (?, ?, datetime('now','localtime'))`
        ).run(name, cookies);
        console.log(`✅ Migrado: ${name}`);
    }
}

const rows = db.prepare('SELECT name, updated_at FROM sessions').all();
console.log('\nSessões no banco de dados:');
rows.forEach(r => console.log(` - ${r.name} (${r.updated_at})`));
console.log('\nMigração concluída!');

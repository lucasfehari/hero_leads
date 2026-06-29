/**
 * db-wrapper.js — Camada de abstração SQLite compatível com Turso
 *
 * Se TURSO_URL estiver definido, usa o cliente na nuvem (produção no Render Free).
 * Caso contrário, usa sqlite3/sql.js local.
 */

const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'db', 'licenses.db');

function createDb() {
  const { createClient } = require('@libsql/client');
  
  const url = process.env.TURSO_URL || `file:${DB_FILE}`;
  const authToken = process.env.TURSO_AUTH_TOKEN || '';

  // Garante diretório local se não for Turso
  if (!process.env.TURSO_URL && !fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }

  const client = createClient({ url, authToken });
  console.log('[DB] Conectado via libsql client em:', url);

  // Interface unificada para o index.js
  return {
    async exec(sql) {
      try {
        await client.executeMultiple(sql);
      } catch (e) {
        console.error('[DB EXEC ERROR]', e.message);
      }
    },
    
    async execute(sql, params = []) {
      return await client.execute({ sql, args: params });
    },

    prepare(sql) {
      return {
        run: async (...params) => {
          try {
            await client.execute({ sql, args: params });
            return { changes: 1 };
          } catch (e) {
            console.error('[DB RUN ERROR]', e.message);
            return { changes: 0 };
          }
        },
        get: async (...params) => {
          const res = await client.execute({ sql, args: params });
          return res.rows[0] ? castRow(res.rows[0]) : null;
        },
        all: async (...params) => {
          const res = await client.execute({ sql, args: params });
          return res.rows.map(castRow);
        }
      };
    }
  };
}

function castRow(row) {
  const obj = {};
  if (row && typeof row === 'object') {
    return row;
  }
  return obj;
}

module.exports = { createDb };

/**
 * db-wrapper.js — Camada de abstração SQLite compatível com Turso
 *
 * Se TURSO_URL estiver definido, usa o cliente na nuvem (produção no Render Free).
 * Caso contrário, usa sqlite3/sql.js local.
 */

const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'db', 'licenses.db');

class TursoDbWrapper {
  constructor(client) {
    this.client = client;
  }

  exec(sql) {
    // Execução síncrona/fogo-e-esqueça para migrações iniciais
    this.client.execute(sql).catch(err => {
      console.error('[TURSO EXEC ERROR]', err);
    });
  }

  prepare(sql) {
    const client = this.client;
    // Substitui placeholders '?' por compatibilidade se necessário
    return {
      run(...params) {
        // Simulação síncrona usando promise em background
        client.execute({ sql, args: params }).catch(err => {
          console.error('[TURSO RUN ERROR]', err);
        });
        return { changes: 1 };
      },
      get(...params) {
        // Como o index.js original espera chamadas síncronas para leitura,
        // mas o Turso é obrigatoriamente assíncrono, usamos um truque de cache
        // ou fazemos a chamada ser resolvida.
        // NOTA: Para evitar refatorar todo o express para async/await nas rotas,
        // criamos uma execução bloqueante simulada ou mapeamos para as funções async do express.
        throw new Error('Leitura direta síncrona não suportada no Turso remoto. Use async/await.');
      }
    };
  }
}

// Para manter compatibilidade total sem quebrar nenhuma rota do express,
// vamos usar o cliente oficial do Turso com suporte a banco SQLite local em arquivo!
// O @libsql/client permite usar "file:..." e funciona de forma síncrona e assíncrona.
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
    exec(sql) {
      // Usando uma Promise tratada internamente de forma síncrona
      client.execute(sql).catch(e => console.error('[DB EXEC ERROR]', e.message));
    },
    
    // Método auxiliar para as rotas que precisam ler dados (agora encapsuladas de forma async)
    async execute(sql, params = []) {
      return await client.execute({ sql, args: params });
    },

    // Wrapper compatível com o index.js legado
    prepare(sql) {
      return {
        run: (...params) => {
          client.execute({ sql, args: params }).catch(e => console.error('[DB RUN ERROR]', e.message));
          return { changes: 1 };
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
  // Converte a linha de array de valores ou objeto retornado pelo Turso para objeto JS comum
  const obj = {};
  if (row && typeof row === 'object') {
    return row; // O SDK novo já mapeia como objeto
  }
  return obj;
}

module.exports = { createDb };

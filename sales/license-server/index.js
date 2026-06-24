require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4444;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-secreto';
const CAKTO_SECRET = process.env.CAKTO_SECRET || '';

// ─── Banco de Dados ──────────────────────────────────────────────────────────
const dbPath = path.join(__dirname, 'db', 'licenses.db');
if (!fs.existsSync(path.join(__dirname, 'db'))) {
  fs.mkdirSync(path.join(__dirname, 'db'));
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT UNIQUE NOT NULL,
    email       TEXT NOT NULL,
    name        TEXT,
    plan        TEXT DEFAULT 'lifetime',
    status      TEXT DEFAULT 'active',
    machine_id  TEXT,
    activations INTEGER DEFAULT 0,
    max_devices INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    expires_at  TEXT,
    cakto_order TEXT,
    notes       TEXT
  );

  CREATE TABLE IF NOT EXISTS activation_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    machine_id  TEXT NOT NULL,
    action      TEXT NOT NULL,
    ip          TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Nodemailer ──────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendLicenseEmail(email, name, licenseKey) {
  if (!process.env.SMTP_USER) return; // pula se email não configurado

  const serverUrl = process.env.SERVER_URL || 'http://localhost:4444';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0a0a0f; color: #e2e8f0; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background: #12121f; border-radius: 16px; overflow: hidden; border: 1px solid rgba(99,102,241,0.2); }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 40px; text-align: center; }
        .header h1 { margin: 0; color: white; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 15px; }
        .body { padding: 40px; }
        .body h2 { color: #c4b5fd; font-size: 18px; margin-bottom: 8px; }
        .body p { color: #94a3b8; line-height: 1.7; }
        .key-box { background: #1e1e2e; border: 1px solid #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .key-box .label { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
        .key-box .key { font-family: 'Courier New', monospace; font-size: 20px; font-weight: 700; color: #a5b4fc; letter-spacing: 2px; word-break: break-all; }
        .steps { background: #1e1e2e; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .step { display: flex; gap: 16px; margin-bottom: 16px; }
        .step-num { background: #6366f1; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
        .step-text { color: #cbd5e1; font-size: 14px; line-height: 1.6; }
        .cta { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; }
        .footer { border-top: 1px solid #1e1e2e; padding: 24px 40px; text-align: center; color: #475569; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚡ Browze Bot</h1>
          <p>Sua chave de licença está pronta!</p>
        </div>
        <div class="body">
          <h2>Olá, ${name || 'bem-vindo'}! 👋</h2>
          <p>Obrigado pela sua compra. Abaixo está sua chave de licença exclusiva para ativar o <strong>Browze Bot</strong>.</p>
          
          <div class="key-box">
            <div class="label">Sua Chave de Licença</div>
            <div class="key">${licenseKey}</div>
          </div>

          <div class="steps">
            <div class="step">
              <div class="step-num">1</div>
              <div class="step-text"><strong>Baixe o Browze Bot</strong> pelo link que está na área de membros do curso.</div>
            </div>
            <div class="step">
              <div class="step-num">2</div>
              <div class="step-text"><strong>Instale e abra</strong> o aplicativo no seu computador.</div>
            </div>
            <div class="step">
              <div class="step-num">3</div>
              <div class="step-text"><strong>Cole a chave acima</strong> na tela de ativação e clique em "Ativar".</div>
            </div>
          </div>

          <p style="color: #ef4444; font-size: 13px;">⚠️ Guarde esta chave em local seguro. Ela é pessoal e intransferível.</p>
        </div>
        <div class="footer">
          Browze Bot © ${new Date().getFullYear()} · Qualquer dúvida, responda este email.
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Browze Bot" <${process.env.SMTP_USER}>`,
    to: email,
    subject: '⚡ Sua chave de licença do Browze Bot chegou!',
    html,
  });
}

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Middleware de autenticação admin
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

// Gera chave no formato: BROWZE-XXXX-XXXX-XXXX-XXXX
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `BROWZE-${segment()}-${segment()}-${segment()}-${segment()}`;
}

// ─── ROTAS PÚBLICAS ───────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Browze Bot License Server', version: '1.0.0' });
});

// Validar licença (chamado pelo app Electron)
app.post('/validate', (req, res) => {
  const { key, machine_id } = req.body;

  if (!key || !machine_id) {
    return res.status(400).json({ valid: false, error: 'Chave e machine_id são obrigatórios' });
  }

  const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);

  if (!license) {
    return res.json({ valid: false, error: 'Licença não encontrada' });
  }

  if (license.status !== 'active') {
    return res.json({ valid: false, error: `Licença ${license.status === 'revoked' ? 'revogada' : 'expirada'}` });
  }

  // Verificar expiração
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    db.prepare("UPDATE licenses SET status = 'expired' WHERE key = ?").run(key);
    return res.json({ valid: false, error: 'Licença expirada' });
  }

  // Verificar machine_id
  if (license.machine_id && license.machine_id !== machine_id) {
    // Já ativada em outro dispositivo
    const activationCount = db.prepare(
      "SELECT COUNT(*) as count FROM activation_log WHERE license_key = ? AND action = 'activate'"
    ).get(key);

    if (activationCount.count >= license.max_devices) {
      // Logar tentativa
      db.prepare(
        "INSERT INTO activation_log (license_key, machine_id, action, ip) VALUES (?, ?, 'blocked', ?)"
      ).run(key, machine_id, req.ip);

      return res.json({ valid: false, error: 'Limite de dispositivos atingido. Entre em contato com o suporte.' });
    }
  }

  // Atualizar machine_id se for primeira ativação
  if (!license.machine_id) {
    db.prepare('UPDATE licenses SET machine_id = ?, activations = activations + 1 WHERE key = ?').run(machine_id, key);
    db.prepare("INSERT INTO activation_log (license_key, machine_id, action, ip) VALUES (?, ?, 'activate', ?)").run(key, machine_id, req.ip);
  } else {
    // Logar uso normal
    db.prepare("INSERT INTO activation_log (license_key, machine_id, action, ip) VALUES (?, ?, 'use', ?)").run(key, machine_id, req.ip);
  }

  res.json({
    valid: true,
    plan: license.plan,
    name: license.name,
    email: license.email,
    expires_at: license.expires_at,
  });
});

// ─── WEBHOOK CAKTO ────────────────────────────────────────────────────────────
app.post('/webhook/cakto', async (req, res) => {
  try {
    // Verificar assinatura do webhook (se Cakto enviar)
    // const signature = req.headers['x-cakto-signature'];
    // TODO: implementar verificação quando Cakto fornecer o método

    const payload = req.body;

    // Cakto envia diferentes eventos — só processar compra aprovada
    const event = payload.event || payload.type;
    if (!['purchase.approved', 'order.paid', 'sale.approved'].includes(event)) {
      return res.json({ received: true, action: 'ignored', event });
    }

    const customer = payload.customer || payload.buyer || {};
    const email = customer.email || payload.email;
    const name = customer.name || payload.name || email;
    const orderId = payload.order_id || payload.id || uuidv4();
    const productId = payload.product_id || payload.product?.id;

    if (!email) {
      return res.status(400).json({ error: 'Email do comprador não encontrado no webhook' });
    }

    // Verificar se já tem licença para este pedido
    const existing = db.prepare('SELECT * FROM licenses WHERE cakto_order = ?').get(orderId);
    if (existing) {
      return res.json({ received: true, action: 'duplicate', key: existing.key });
    }

    // Gerar licença
    const licenseKey = generateLicenseKey();

    db.prepare(`
      INSERT INTO licenses (key, email, name, plan, status, cakto_order)
      VALUES (?, ?, ?, 'lifetime', 'active', ?)
    `).run(licenseKey, email, name, orderId.toString());

    // Enviar email com a chave
    await sendLicenseEmail(email, name, licenseKey);

    console.log(`[VENDA] Nova licença gerada: ${licenseKey} → ${email}`);

    res.json({ received: true, action: 'license_created', key: licenseKey });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROTAS ADMIN ─────────────────────────────────────────────────────────────

// Listar todas as licenças
app.get('/admin/licenses', requireAdmin, (req, res) => {
  const { status, search, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM licenses';
  const params = [];

  const conditions = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (search) { conditions.push('(email LIKE ? OR name LIKE ? OR key LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

  query += ' ORDER BY created_at DESC';
  query += ` LIMIT ${parseInt(limit)} OFFSET ${(parseInt(page) - 1) * parseInt(limit)}`;

  const licenses = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;

  res.json({ licenses, total, page: parseInt(page), limit: parseInt(limit) });
});

// Criar licença manualmente
app.post('/admin/licenses', requireAdmin, async (req, res) => {
  const { email, name, plan = 'lifetime', max_devices = 1, expires_at, notes, send_email = true } = req.body;

  if (!email) return res.status(400).json({ error: 'Email obrigatório' });

  const licenseKey = generateLicenseKey();

  db.prepare(`
    INSERT INTO licenses (key, email, name, plan, status, max_devices, expires_at, notes)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(licenseKey, email, name || '', plan, max_devices, expires_at || null, notes || null);

  if (send_email) {
    try { await sendLicenseEmail(email, name, licenseKey); } catch (e) { console.warn('Email não enviado:', e.message); }
  }

  res.json({ success: true, key: licenseKey });
});

// Revogar licença
app.post('/admin/licenses/revoke/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  const result = db.prepare("UPDATE licenses SET status = 'revoked' WHERE key = ?").run(key);
  if (result.changes === 0) return res.status(404).json({ error: 'Licença não encontrada' });
  res.json({ success: true, message: `Licença ${key} revogada` });
});

// Reativar licença
app.post('/admin/licenses/activate/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  const result = db.prepare("UPDATE licenses SET status = 'active', machine_id = NULL, activations = 0 WHERE key = ?").run(key);
  if (result.changes === 0) return res.status(404).json({ error: 'Licença não encontrada' });
  res.json({ success: true, message: `Licença ${key} reativada e resetada` });
});

// Deletar licença
app.delete('/admin/licenses/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  db.prepare('DELETE FROM activation_log WHERE license_key = ?').run(key);
  const result = db.prepare('DELETE FROM licenses WHERE key = ?').run(key);
  if (result.changes === 0) return res.status(404).json({ error: 'Licença não encontrada' });
  res.json({ success: true });
});

// Estatísticas do dashboard
app.get('/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
  const active = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'active'").get().count;
  const revoked = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'revoked'").get().count;
  const today = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE date(created_at) = date('now')").get().count;
  const week = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE created_at >= datetime('now', '-7 days')").get().count;

  const recentSales = db.prepare(
    "SELECT key, email, name, plan, status, created_at FROM licenses ORDER BY created_at DESC LIMIT 10"
  ).all();

  res.json({ total, active, revoked, today, week, recentSales });
});

// Log de ativações
app.get('/admin/logs', requireAdmin, (req, res) => {
  const { key } = req.query;
  let query = 'SELECT * FROM activation_log';
  const params = [];
  if (key) { query += ' WHERE license_key = ?'; params.push(key); }
  query += ' ORDER BY created_at DESC LIMIT 100';
  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡ Browze Bot License Server rodando na porta ${PORT}`);
  console.log(`   Admin Panel: http://localhost:${PORT}/admin/stats`);
  console.log(`   Validate:    POST http://localhost:${PORT}/validate`);
  console.log(`   Webhook:     POST http://localhost:${PORT}/webhook/cakto\n`);
});

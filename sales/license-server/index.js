require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createDb } = require('./db-wrapper');

// ─── Verificação HMAC do Abacate Pay (nativa — sem deps externas) ─────────────
function verifyAbacateSignature(rawBody, headerSignature, secret) {
  if (!secret || !headerSignature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature));
  } catch {
    return false;
  }
}

const app = express();
const PORT = process.env.PORT || 4444;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-token-secreto';
const ABACATEPAY_WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET || '';

// db é inicializado de forma assíncrona — preenchido antes do app.listen
let db;

// ─── E-mail (Resend API) ──────────────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY || 're_R25WhQPF_EvpCbAbQVPZ7dpgxx6aGvWDt');

function planLabel(plan) {
  if (plan === 'monthly') return 'Mensal';
  if (plan === 'annual') return 'Anual';
  return 'Vitalício';
}

async function sendLicenseEmail(email, name, licenseKey, plan = 'lifetime') {
  // Apenas envia se tivermos uma key (o fallback acima garante que sim)

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
        .plan-badge { display: inline-block; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.4); color: #a5b4fc; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
        .steps { background: #1e1e2e; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .step { display: flex; gap: 16px; margin-bottom: 16px; }
        .step-num { background: #6366f1; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
        .step-text { color: #cbd5e1; font-size: 14px; line-height: 1.6; }
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
          <div style="text-align:center"><span class="plan-badge">Plano ${planLabel(plan)}</span></div>
          <p>Obrigado pela sua compra. Abaixo está sua chave de licença exclusiva para ativar o <strong>Browze Bot</strong>.</p>
          
          <div class="key-box">
            <div class="label">Sua Chave de Licença</div>
            <div class="key">${licenseKey}</div>
          </div>

          <div class="steps">
            <div class="step">
              <div class="step-num">1</div>
              <div class="step-text"><strong>Baixe o Browze Bot</strong> pelo link que está na área de membros.</div>
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

  const result = await resend.emails.send({
    from: 'Browze Bot <onboarding@resend.dev>',
    to: email,
    subject: `⚡ Sua chave de licença do Browze Bot chegou! (${planLabel(plan)})`,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

// ─── Helpers de Plano ─────────────────────────────────────────────────────────
function getExpiresAt(plan) {
  if (plan === 'monthly') {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  }
  if (plan === 'annual') {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }
  return null; // lifetime = sem expiração
}

// Mapear product_id / nome do produto ao plano
function detectPlan(payload) {
  const productId = (payload?.product?.id || payload?.product_id || '').toString().toLowerCase();
  const productName = (payload?.product?.name || payload?.product_name || '').toString().toLowerCase();
  const combined = productId + ' ' + productName;

  if (combined.includes('anual') || combined.includes('annual') || combined.includes('yearly')) return 'annual';
  if (combined.includes('mensal') || combined.includes('monthly') || combined.includes('month')) return 'monthly';
  return 'lifetime';
}

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors());

// JSON parser global — pula /webhook/abacatepay (precisa de raw body para HMAC)
app.use((req, res, next) => {
  if (req.path === '/webhook/abacatepay') return next();
  express.json()(req, res, next);
});

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

// Lógica central de criação de licença a partir de uma venda
async function createLicenseFromSale({ email, name, plan, orderId, notes }) {
  // Verificar se já existe licença para este pedido
  const existing = await db.prepare('SELECT * FROM licenses WHERE abacate_order = ?').get(orderId);
  if (existing) {
    return { duplicate: true, key: existing.key };
  }

  const licenseKey = generateLicenseKey();
  const expiresAt = getExpiresAt(plan);

  await db.prepare(`
    INSERT INTO licenses (key, email, name, plan, status, abacate_order, expires_at, notes)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(licenseKey, email, name || '', plan, orderId?.toString() || null, expiresAt, notes || null);

  // Enviar email com a chave
  try {
    await sendLicenseEmail(email, name, licenseKey, plan);
  } catch (e) {
    console.warn('[EMAIL]', e.message);
  }

  console.log(`[VENDA] Nova licença (${plan}): ${licenseKey} → ${email}`);
  return { duplicate: false, key: licenseKey };
}

// ─── ROTAS PÚBLICAS ───────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Browze Bot License Server', version: '2.0.0' });
});

// Validar licença (chamado pelo app Electron)
app.post('/validate', express.json(), async (req, res) => {
  const { key, machine_id } = req.body;

  if (!key || !machine_id) {
    return res.status(400).json({ valid: false, error: 'Chave e machine_id são obrigatórios' });
  }

  const license = await db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);

  if (!license) {
    return res.json({ valid: false, error: 'Licença não encontrada' });
  }

  if (license.status !== 'active') {
    return res.json({ valid: false, error: `Licença ${license.status === 'revoked' ? 'revogada' : 'expirada'}` });
  }

  // Verificar expiração
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    await db.prepare("UPDATE licenses SET status = 'expired' WHERE key = ?").run(key);
    return res.json({ valid: false, error: 'Licença expirada. Renove seu plano em browzebot.com.br' });
  }

  // Verificar machine_id
  if (license.machine_id && license.machine_id !== machine_id) {
    const activationCount = await db.prepare(
      "SELECT COUNT(*) as count FROM activation_log WHERE license_key = ? AND action = 'activate'"
    ).get(key);

    const maxDevices = license.max_devices || 1;
    if (activationCount.count >= maxDevices) {
      await db.prepare(
        "INSERT INTO activation_log (license_key, machine_id, action, ip) VALUES (?, ?, 'blocked', ?)"
      ).run(key, machine_id, req.ip);

      return res.json({ valid: false, error: 'Limite de dispositivos atingido. Entre em contato com o suporte.' });
    }
  }

  // Atualizar machine_id se for primeira ativação
  if (!license.machine_id) {
    await db.prepare('UPDATE licenses SET machine_id = ?, activations = activations + 1 WHERE key = ?').run(machine_id, key);
    await db.prepare("INSERT INTO activation_log (license_key, machine_id, action, ip) VALUES (?, ?, 'activate', ?)").run(key, machine_id, req.ip);
  } else {
    await db.prepare("INSERT INTO activation_log (license_key, machine_id, action, ip) VALUES (?, ?, 'use', ?)").run(key, machine_id, req.ip);
  }

  res.json({
    valid: true,
    plan: license.plan,
    name: license.name,
    email: license.email,
    expires_at: license.expires_at,
  });
});

// ─── WEBHOOK ABACATE PAY ──────────────────────────────────────────────────────
app.post('/webhook/abacatepay', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.headers['x-webhook-secret'] || req.headers['x-abacatepay-signature'] || '';
    if (ABACATEPAY_WEBHOOK_SECRET) {
      const valid = verifyAbacateSignature(req.body, signature, ABACATEPAY_WEBHOOK_SECRET);
      if (!valid) {
        console.warn('[WEBHOOK] Assinatura inválida');
        return res.status(401).json({ error: 'Assinatura inválida' });
      }
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    const event = (payload?.event || payload?.type || '').toLowerCase();

    const isPayment = [
      'billing.paid', 'billing_paid',
      'purchase.approved', 'order.paid', 'sale.approved',
    ].includes(event) || event.includes('paid') || event.includes('approved') || event === '';

    if (!isPayment) {
      return res.json({ received: true, action: 'ignored', event });
    }

    const billing = payload?.billing || payload;
    const customer = billing?.customer || payload?.customer || payload?.buyer || {};
    const email = customer.email || billing?.email || payload?.email;
    const name = customer.name || billing?.name || payload?.name || email;
    const orderId = billing?.id || payload?.order_id || payload?.id || uuidv4();
    const plan = detectPlan(payload);

    if (!email) {
      return res.status(400).json({ error: 'Email do comprador não encontrado' });
    }

    const result = await createLicenseFromSale({ email, name, plan, orderId });
    res.json({
      received: true,
      action: result.duplicate ? 'duplicate' : 'license_created',
      key: result.key,
      plan,
    });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROTAS ADMIN ─────────────────────────────────────────────────────────────

// Listar todas as licenças
app.get('/admin/licenses', requireAdmin, async (req, res) => {
  const { status, search, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM licenses';
  const params = [];

  const conditions = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (search) { conditions.push('(email LIKE ? OR name LIKE ? OR key LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

  query += ' ORDER BY created_at DESC';
  query += ` LIMIT ${parseInt(limit)} OFFSET ${(parseInt(page) - 1) * parseInt(limit)}`;

  const licenses = await db.prepare(query).all(...params);
  const totalRes = await db.prepare('SELECT COUNT(*) as count FROM licenses').get();
  const total = totalRes ? totalRes.count : 0;

  res.json({ licenses, total, page: parseInt(page), limit: parseInt(limit) });
});

// Criar licença manualmente
app.post('/admin/licenses', requireAdmin, async (req, res) => {
  const { email, name, plan = 'lifetime', max_devices = 1, expires_at, notes, send_email = true } = req.body;

  if (!email) return res.status(400).json({ error: 'Email obrigatório' });

  const licenseKey = generateLicenseKey();
  const expiresAt = expires_at || getExpiresAt(plan);

  await db.prepare(`
    INSERT INTO licenses (key, email, name, plan, status, max_devices, expires_at, notes)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(licenseKey, email, name || '', plan, max_devices, expiresAt, notes || null);

  if (send_email) {
    try { await sendLicenseEmail(email, name, licenseKey, plan); } catch (e) { console.warn('Email não enviado:', e.message); }
  }

  res.json({ success: true, key: licenseKey, plan, expires_at: expiresAt });
});

// Revogar licença
app.post('/admin/licenses/revoke/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const result = await db.prepare("UPDATE licenses SET status = 'revoked' WHERE key = ?").run(key);
  res.json({ success: true, message: `Licença ${key} revogada` });
});

// Reativar licença
app.post('/admin/licenses/activate/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  await db.prepare("UPDATE licenses SET status = 'active', machine_id = NULL, activations = 0 WHERE key = ?").run(key);
  res.json({ success: true, message: `Licença ${key} reativada e resetada` });
});

// Renovar plano (atualiza expires_at)
app.post('/admin/licenses/renew/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { plan } = req.body;
  const license = await db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  if (!license) return res.status(404).json({ error: 'Licença não encontrada' });

  const newPlan = plan || license.plan;
  const expiresAt = getExpiresAt(newPlan);

  await db.prepare("UPDATE licenses SET plan = ?, expires_at = ?, status = 'active' WHERE key = ?").run(newPlan, expiresAt, key);
  res.json({ success: true, plan: newPlan, expires_at: expiresAt });
});

// Deletar licença
app.delete('/admin/licenses/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  await db.prepare('DELETE FROM activation_log WHERE license_key = ?').run(key);
  await db.prepare('DELETE FROM licenses WHERE key = ?').run(key);
  res.json({ success: true });
});

// Estatísticas do dashboard
app.get('/admin/stats', requireAdmin, async (req, res) => {
  const tRes = await db.prepare('SELECT COUNT(*) as count FROM licenses').get();
  const total = tRes ? tRes.count : 0;
  
  const aRes = await db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'active'").get();
  const active = aRes ? aRes.count : 0;

  const rRes = await db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'revoked'").get();
  const revoked = rRes ? rRes.count : 0;

  const eRes = await db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'expired'").get();
  const expired = eRes ? eRes.count : 0;

  const tdRes = await db.prepare("SELECT COUNT(*) as count FROM licenses WHERE date(created_at) = date('now')").get();
  const today = tdRes ? tdRes.count : 0;

  const wRes = await db.prepare("SELECT COUNT(*) as count FROM licenses WHERE created_at >= datetime('now', '-7 days')").get();
  const week = wRes ? wRes.count : 0;

  const byPlan = await db.prepare("SELECT plan, COUNT(*) as count FROM licenses GROUP BY plan").all();
  const recentSales = await db.prepare(
    "SELECT key, email, name, plan, status, expires_at, created_at FROM licenses ORDER BY created_at DESC LIMIT 10"
  ).all();

  res.json({ total, active, revoked, expired, today, week, byPlan, recentSales });
});

// Log de ativações
app.get('/admin/logs', requireAdmin, async (req, res) => {
  const { key } = req.query;
  let query = 'SELECT * FROM activation_log';
  const params = [];
  if (key) { query += ' WHERE license_key = ?'; params.push(key); }
  query += ' ORDER BY created_at DESC LIMIT 100';
  const logs = await db.prepare(query).all(...params);
  res.json({ logs });
});

// ─── Simular venda manualmente (para testes) ──────────────────────────────────
app.post('/admin/simulate-sale', requireAdmin, async (req, res) => {
  const { email, name, plan = 'monthly' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });

  const result = await createLicenseFromSale({
    email,
    name: name || email,
    plan,
    orderId: `SIMULADO-${Date.now()}`,
    notes: 'Venda simulada manualmente',
  });

  res.json({ success: true, ...result, plan });
});

// ─── START (async: aguarda DB antes de ouvir) ────────────────────────────────
async function init() {
  db = await createDb();

  await db.exec(`
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
      abacate_order TEXT,
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

  try {
    await db.exec(`ALTER TABLE licenses RENAME COLUMN cakto_order TO abacate_order`);
  } catch (_) {}

  app.listen(PORT, () => {
    console.log(`\n⚡ Browze Bot License Server v2.0 rodando na porta ${PORT}`);
  });
}

init().catch(err => {
  console.error('Erro fatal ao iniciar o servidor:', err);
  process.exit(1);
});

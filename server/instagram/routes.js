const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, COOKIES_DIR } = require('./db');

// ── Media Upload (multer) ──────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB per file

// ── Upload endpoint (supports single OR multiple files) ───────────────────
router.post('/upload', upload.array('media', 10), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const files = req.files.map(file => ({
        path: file.path,
        filename: file.filename,
        mimetype: file.mimetype,
        mediaType: file.mimetype.startsWith('video') ? 'video' : 'image',
        originalName: file.originalname,
        size: file.size,
    }));

    res.json({ success: true, files });
});

// ── Serve uploaded media as static files ───────────────────────────────────
router.use('/media', express.static(UPLOADS_DIR));

// ── Account Management ─────────────────────────────────────────────────────
router.get('/accounts', (req, res) => {
    try {
        const accounts = db.prepare('SELECT * FROM ig_accounts ORDER BY created_at DESC').all();
        res.json({ accounts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/accounts', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const cookieFile = path.join(COOKIES_DIR, `${Date.now()}_${name.replace(/\s+/g, '_')}.json`);

    const result = db.prepare(
        'INSERT INTO ig_accounts (name, cookie_file, status) VALUES (?, ?, ?)'
    ).run(name, cookieFile, 'disconnected');

    const accountId = result.lastInsertRowid;

    // Trigger browser login in background (non-blocking)
    triggerInstagramLogin(accountId, name, cookieFile, req.app.get('io'))
        .catch(err => console.error('[IG] Login error:', err));

    res.json({ success: true, id: accountId, name, status: 'logging_in' });
});

router.post('/accounts/:id/login', async (req, res) => {
    const account = db.prepare('SELECT * FROM ig_accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Trigger browser login in background
    triggerInstagramLogin(account.id, account.name, account.cookie_file, req.app.get('io'))
        .catch(err => console.error('[IG] Re-login error:', err));

    res.json({ success: true, message: 'Browser opened for login' });
});

router.get('/accounts/:id/status', async (req, res) => {
    const account = db.prepare('SELECT * FROM ig_accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const isValid = await checkSessionValid(account.cookie_file);
    const status = isValid ? 'connected' : 'disconnected';

    db.prepare('UPDATE ig_accounts SET status = ? WHERE id = ?').run(status, account.id);
    res.json({ id: account.id, status });
});

router.delete('/accounts/:id', (req, res) => {
    const account = db.prepare('SELECT * FROM ig_accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    if (account.cookie_file && fs.existsSync(account.cookie_file)) {
        fs.unlinkSync(account.cookie_file);
    }

    db.prepare('DELETE FROM ig_accounts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ── Post Management ────────────────────────────────────────────────────────
router.get('/posts', (req, res) => {
    try {
        let query = `
            SELECT p.*, a.name as account_name 
            FROM ig_posts p 
            LEFT JOIN ig_accounts a ON p.account_id = a.id
            WHERE 1=1
        `;
        const params = [];

        if (req.query.account_id) {
            query += ' AND p.account_id = ?';
            params.push(req.query.account_id);
        }
        if (req.query.status) {
            query += ' AND p.status = ?';
            params.push(req.query.status);
        }

        query += ' ORDER BY p.scheduled_at ASC, p.created_at DESC';
        const posts = db.prepare(query).all(...params);
        res.json({ posts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/posts', (req, res) => {
    try {
        const { account_id, post_type, aspect_ratio, media_files, media_path, media_type, caption, hashtags, notes, scheduled_at, status } = req.body;
        if (!account_id) return res.status(400).json({ error: 'account_id is required' });

        // media_files is an array; store as JSON string
        const mediaFilesJson = Array.isArray(media_files) ? JSON.stringify(media_files) : (media_files || '[]');
        // legacy single-file compat: derive from first item if media_path not given
        const files = JSON.parse(mediaFilesJson);
        const legacyPath = media_path || (files[0]?.path ?? null);
        const legacyType = media_type || (files[0]?.mediaType ?? 'image');

        const result = db.prepare(`
            INSERT INTO ig_posts (account_id, post_type, aspect_ratio, media_files, media_path, media_type, caption, hashtags, notes, scheduled_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            account_id,
            post_type || 'single',
            aspect_ratio || '1:1',
            mediaFilesJson,
            legacyPath,
            legacyType,
            caption || '',
            hashtags || '',
            notes || '',
            scheduled_at || null,
            status || 'draft'
        );

        const post = db.prepare('SELECT * FROM ig_posts WHERE id = ?').get(result.lastInsertRowid);
        res.json({ success: true, post });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/posts/:id', (req, res) => {
    try {
        const { caption, hashtags, notes, scheduled_at, status, post_type, aspect_ratio, media_files, media_path, media_type } = req.body;
        const post = db.prepare('SELECT * FROM ig_posts WHERE id = ?').get(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.status === 'published') return res.status(400).json({ error: 'Cannot edit a published post' });

        const mediaFilesJson = media_files !== undefined
            ? (Array.isArray(media_files) ? JSON.stringify(media_files) : media_files)
            : post.media_files;

        const files = JSON.parse(mediaFilesJson || '[]');
        const legacyPath = media_path ?? (files[0]?.path ?? post.media_path);
        const legacyType = media_type ?? (files[0]?.mediaType ?? post.media_type);

        db.prepare(`
            UPDATE ig_posts SET
                post_type = ?, aspect_ratio = ?, media_files = ?,
                caption = ?, hashtags = ?, notes = ?, scheduled_at = ?, status = ?,
                media_path = ?, media_type = ?
            WHERE id = ?
        `).run(
            post_type ?? post.post_type,
            aspect_ratio ?? post.aspect_ratio,
            mediaFilesJson,
            caption ?? post.caption,
            hashtags ?? post.hashtags,
            notes ?? post.notes,
            scheduled_at ?? post.scheduled_at,
            status ?? post.status,
            legacyPath,
            legacyType,
            req.params.id
        );

        const updated = db.prepare('SELECT * FROM ig_posts WHERE id = ?').get(req.params.id);
        res.json({ success: true, post: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/posts/:id', (req, res) => {
    try {
        const post = db.prepare('SELECT * FROM ig_posts WHERE id = ?').get(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.status === 'publishing') return res.status(400).json({ error: 'Post is currently publishing' });

        db.prepare('DELETE FROM ig_posts WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/posts/:id/logs', (req, res) => {
    try {
        const logs = db.prepare('SELECT * FROM ig_post_logs WHERE post_id = ? ORDER BY created_at ASC').all(req.params.id);
        res.json({ logs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Helper: Trigger Instagram Login via Puppeteer ─────────────────────────
async function triggerInstagramLogin(accountId, name, cookieFile, io) {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    const { executablePath } = require('puppeteer');

    console.log(`[IG] Opening browser for account: ${name}`);
    if (io) io.emit('ig-account-status', { id: accountId, status: 'logging_in' });

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-infobars', '--window-size=400,700']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 700 });

    // Clear cookies for fresh login
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');

    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });

    console.log(`[IG] Waiting for user to log in to "${name}"...`);

    try {
        // Wait up to 5 minutes for the home page indicator
        await page.waitForSelector('svg[aria-label="Home"], svg[aria-label="Página inicial"], svg[aria-label="Início"], a[href="/"]', { timeout: 300000 });
    } catch {
        await browser.close();
        db.prepare('UPDATE ig_accounts SET status = ? WHERE id = ?').run('disconnected', accountId);
        if (io) io.emit('ig-account-status', { id: accountId, status: 'disconnected', name });
        return;
    }

    // Try to grab username from page
    let username = null;
    try {
        username = await page.evaluate(() => {
            const meta = document.querySelector('meta[property="al:ios:url"]');
            if (meta) {
                const match = meta.content.match(/user\?id=(\w+)/);
                if (match) return null;
            }
            // Try nav link
            const links = [...document.querySelectorAll('a[href^="/"]')];
            const profileLink = links.find(l => l.href.match(/instagram\.com\/[^/]+\/?$/) && !l.href.includes('explore'));
            return profileLink ? profileLink.href.split('/').filter(Boolean).pop() : null;
        });
    } catch { /* ignore */ }

    const cookies = await page.cookies();
    fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));

    db.prepare('UPDATE ig_accounts SET status = ?, username = ? WHERE id = ?')
        .run('connected', username, accountId);

    await browser.close();
    console.log(`[IG] Account "${name}" saved successfully.`);
    if (io) io.emit('ig-account-status', { id: accountId, status: 'connected', name, username });
}

// ── Helper: Check session validity ────────────────────────────────────────
async function checkSessionValid(cookieFile) {
    if (!cookieFile || !fs.existsSync(cookieFile)) return false;
    try {
        const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
        const sessionCookie = cookies.find(c => c.name === 'sessionid');
        if (!sessionCookie) return false;

        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());
        const { executablePath } = require('puppeteer');

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setCookie(...cookies);
        await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 15000 });

        const isLoggedIn = await page.evaluate(() => {
            return !document.querySelector('input[name="username"]');
        });

        await browser.close();
        return isLoggedIn;
    } catch {
        return false;
    }
}

module.exports = router;

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { spawn, execFile, execFileSync } = require('child_process');
const { randomBytes } = require('crypto');
const multer = require('multer');
const clipsDb = require('./db');
const { generateAssFile, generateAssFromSegments, generatePlaceholderAss } = require('./subtitles');
const { runRetentionPipeline } = require('./retention');

// ── Dirs ──────────────────────────────────────────────────────────────────────
const CLIPS_DIR = path.join(require('os').homedir(), '.browzebot', '../uploads/clips');
const THUMBS_DIR = path.join(CLIPS_DIR, 'thumbs');
const YT_DIR = path.join(CLIPS_DIR, 'yt');
const SUBS_DIR = path.join(CLIPS_DIR, 'subs');
const FRAMES_DIR = path.join(CLIPS_DIR, 'frames');
[CLIPS_DIR, THUMBS_DIR, YT_DIR, SUBS_DIR, FRAMES_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, CLIPS_DIR),
    filename: (req, file, cb) => {
        const u = Date.now() + '-' + randomBytes(4).toString('hex');
        cb(null, u + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 2000 * 1024 * 1024 } });

// ── Static serving ────────────────────────────────────────────────────────────
router.use('/files', express.static(CLIPS_DIR));

// ── FFmpeg path ───────────────────────────────────────────────────────────────
const FFMPEG = require('ffmpeg-static');
let FFPROBE = 'ffprobe';
try { FFPROBE = require('ffprobe-static').path; } catch(e) {}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function jobId() {
    return 'job_' + Date.now() + '_' + randomBytes(3).toString('hex');
}

function getVideoDuration(filePath) {
    return new Promise(resolve => {
        const probe = fs.existsSync(FFPROBE) ? FFPROBE : 'ffprobe';
        execFile(probe, [
            '-v', 'quiet', '-print_format', 'json',
            '-show_streams', '-show_format', filePath
        ], (err, stdout) => {
            if (err) return resolve({ duration: 0, width: 1920, height: 1080 });
            try {
                const data = JSON.parse(stdout);
                const dur = parseFloat(data.format?.duration) || 0;
                const vs = data.streams?.find(s => s.codec_type === 'video');
                resolve({ duration: dur, width: vs?.width || 1920, height: vs?.height || 1080, hasVideo: !!vs });
            } catch { resolve({ duration: 0, width: 1920, height: 1080 }); }
        });
    });
}

function extractFrame(videoPath, outputPath, atSecond = 3) {
    return new Promise(resolve => {
        spawn(FFMPEG, [
            '-ss', String(Math.max(0, atSecond)),
            '-i', videoPath,
            '-frames:v', '1',
            '-vf', 'scale=960:-1',
            '-y', outputPath
        ]).on('close', code => resolve(code === 0 && fs.existsSync(outputPath)));
    });
}

function extractAudio(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
        const proc = spawn(FFMPEG, [
            '-i', videoPath,
            '-vn',
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            '-y', outputPath
        ]);
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d; });
        proc.on('close', code => {
            if (code === 0) resolve(outputPath);
            else reject(new Error('FFmpeg audio extract failed: ' + stderr.slice(-300)));
        });
    });
}

function generateThumbnail(videoPath, outputPath, atSec = null, clipDuration = null) {
    // Pick a smart timestamp: 15% into the clip (but at least 0.5s, avoid black frames at start)
    let ts = atSec;
    if (ts === null) {
        ts = clipDuration ? Math.max(0.5, clipDuration * 0.15) : 1.5;
    }
    return new Promise(resolve => {
        const proc = spawn(FFMPEG, [
            '-ss', String(Math.max(0, ts)),
            '-i', videoPath,
            '-frames:v', '1',
            '-vf', 'scale=540:-1',
            '-y', outputPath
        ]);
        proc.on('close', code => {
            if (code === 0) return resolve(true);
            // Fallback: try from the very beginning if timestamp was out of range
            spawn(FFMPEG, [
                '-i', videoPath,
                '-frames:v', '1',
                '-vf', 'scale=540:-1',
                '-y', outputPath
            ]).on('close', c2 => resolve(c2 === 0));
        });
    });
}

// ── Snap clip timestamps to nearest word boundary ─────────────────────────────
// Prevents cutting in the middle of a spoken word by finding the nearest silence
function snapToWordBoundary(rawStart, rawEnd, words, maxSnapSec = 1.5) {
    if (!words || words.length < 2) return { start: rawStart, end: rawEnd, snapped: false };
    
    const PADDING = 0.12; // 120ms audio breath room
    let bestStart = rawStart;
    let bestEnd   = rawEnd;
    let startSnapped = false;
    let endSnapped   = false;

    // Build list of silence gaps (between words)
    const gaps = [];
    for (let i = 0; i < words.length - 1; i++) {
        const gapStart = words[i].end;
        const gapEnd   = words[i + 1].start;
        if (gapEnd - gapStart > 0.05) { // only real gaps > 50ms
            gaps.push({ mid: (gapStart + gapEnd) / 2, start: gapStart, end: gapEnd });
        }
    }

    // Snap START: find nearest silence gap within maxSnapSec of rawStart
    let bestStartDist = maxSnapSec;
    for (const gap of gaps) {
        const dist = Math.abs(gap.mid - rawStart);
        if (dist < bestStartDist) {
            bestStartDist = dist;
            // Start the clip slightly before the next word (after gap)
            bestStart = Math.max(0, gap.end - PADDING);
            startSnapped = true;
        }
    }

    // Snap END: find nearest silence gap within maxSnapSec of rawEnd
    let bestEndDist = maxSnapSec;
    for (const gap of gaps) {
        const dist = Math.abs(gap.mid - rawEnd);
        if (dist < bestEndDist) {
            bestEndDist = dist;
            // End the clip just after the last word finishes (before gap)
            bestEnd = gap.start + PADDING;
            endSnapped = true;
        }
    }

    // Sanity check: ensure clip has minimum duration
    if (bestEnd - bestStart < 3) {
        bestStart = rawStart;
        bestEnd   = rawEnd;
        startSnapped = false;
        endSnapped   = false;
    }

    return { start: bestStart, end: bestEnd, snapped: startSnapped || endSnapped, startSnapped, endSnapped };
}

async function callAI(userPrompt, systemPrompt, key, model, imageBase64 = null) {
    const cleanKey = (key || '').replace(/\s+/g, '');
    if (!cleanKey) throw new Error('Chave OpenRouter vazia. Abra \u2699\ufe0f Global Settings e salve sua chave novamente.');

    const messages = [{ role: 'system', content: systemPrompt }];
    if (imageBase64) {
        messages.push({
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'low' } },
                { type: 'text', text: userPrompt }
            ]
        });
    } else {
        messages.push({ role: 'user', content: userPrompt });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'openai/gpt-4o-mini', messages, max_tokens: 2500, temperature: 0.8 })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Build FFmpeg filter_complex — circle webcam layout ───────────────────────
async function buildFFmpegArgs(opts) {
    const { inputPath, outputPath, startSec, endSec, aspectRatio, webcam, assFile, srcW, srcH } = opts;
    const duration = endSec - startSec;

    let outW, outH;
    if (aspectRatio === '9:16')     { outW = 1080; outH = 1920; }
    else if (aspectRatio === '1:1') { outW = 1080; outH = 1080; }
    else                            { outW = 1920; outH = 1080; }

    const args = ['-ss', String(startSec), '-i', inputPath, '-t', String(duration)];
    let filterParts = [];

    if (webcam && webcam.position) {
        // Resolve webcam pixel coordinates
        let wcX, wcY, wcW, wcH;
        if (webcam.relX != null) {
            wcX = Math.round(webcam.relX * srcW);
            wcY = Math.round(webcam.relY * srcH);
            wcW = Math.round(webcam.relW * srcW);
            wcH = Math.round(webcam.relH * srcH);
        } else {
            wcW = Math.round(srcW * 0.27);
            wcH = Math.round(srcH * 0.30);
            const pos = webcam.position;
            wcX = pos.includes('right') ? srcW - wcW : 0;
            wcY = pos.includes('bottom') ? srcH - wcH : 0;
        }

        // Make square crop centered on webcam region
        const squareSide = Math.min(wcW, wcH);
        const sqX = Math.max(0, wcX + Math.round((wcW - squareSide) / 2));
        const sqY = Math.max(0, wcY + Math.round((wcH - squareSide) / 2));

        // Generate masks for alphamerge (super fast instead of geq per frame)
        const maskDir = path.join(require('os').homedir(), '.browzebot', '../../uploads/frames');
        if (!fs.existsSync(maskDir)) fs.mkdirSync(maskDir, { recursive: true });

        if (aspectRatio === '9:16') {
            // Layout: top 65% = screen, bottom 35% = dark strip + circle face
            const mainH   = Math.round(outH * 0.65);
            const stripH  = outH - mainH;
            const circleD = Math.round(stripH * 0.72);  // circle = 72% of strip height
            const borderW = Math.max(4, Math.round(circleD * 0.04));
            const outerD  = circleD + borderW * 2;
            const r       = circleD / 2;
            const ro      = outerD / 2;

            const maskPath = path.join(maskDir, `mask_${circleD}.png`);
            const ringPath = path.join(maskDir, `ring_${outerD}.png`);
            
            if (!fs.existsSync(maskPath)) {
                execFileSync(FFMPEG, ['-f', 'lavfi', '-i', `color=c=black:s=${circleD}x${circleD}`, '-filter_complex', `format=rgba,geq=r=255:g=255:b=255:a='255*lte(sqrt(pow(X-${r},2)+pow(Y-${r},2)),${r}-1)'`, '-vframes', '1', '-y', maskPath]);
            }
            if (!fs.existsSync(ringPath)) {
                execFileSync(FFMPEG, ['-f', 'lavfi', '-i', `color=c=white:s=${outerD}x${outerD}`, '-filter_complex', `format=rgba,geq=r=255:g=255:b=255:a='255*lte(sqrt(pow(X-${ro},2)+pow(Y-${ro},2)),${ro})'`, '-vframes', '1', '-y', ringPath]);
            }

            // Insert image inputs to args
            args.splice(4, 0, '-i', maskPath, '-i', ringPath);

            // ① Screen: optionally remove webcam column, scale to top region
            const removeCol = opts.removeWebcamFromBg !== false;
            const mainSrcX = removeCol ? (webcam.position.includes('right') ? 0 : wcW) : 0;
            const mainSrcW = removeCol ? Math.max(1, srcW - wcW) : srcW;
            filterParts.push(
                `[0:v]crop=${mainSrcW}:${srcH}:${mainSrcX}:0,scale=${outW}:${mainH}:force_original_aspect_ratio=increase,crop=${outW}:${mainH},setsar=1[main]`
            );

            // ② Face: square crop → scale → alphamerge with mask
            filterParts.push(
                `[0:v]crop=${squareSide}:${squareSide}:${sqX}:${sqY},scale=${circleD}:${circleD},format=rgba[face_square]`,
                `[face_square][1:v]alphamerge[face_circle]`
            );

            // ③ Dark strip background
            filterParts.push(`color=0x0d1117:${outW}x${stripH}[strip_bg]`);

            // ④ Compose ring + face on strip, centered
            const ringX = Math.round((outW - outerD) / 2);
            const ringY = Math.round((stripH - outerD) / 2);
            filterParts.push(
                `[strip_bg][2:v]overlay=${ringX}:${ringY}[strip_ring]`,
                `[strip_ring][face_circle]overlay=${ringX + borderW}:${ringY + borderW}:format=auto[strip]`
            );

            // ⑤ Stack vertically: webcam strip on top, tutorial screen on bottom
            filterParts.push(`[strip][main]vstack=inputs=2[outv_raw]`);

        } else {
            // 1:1 / 16:9: full scale + circle overlaid in corner
            const circleD = Math.round(Math.min(outW, outH) * 0.22);
            const borderW = Math.max(3, Math.round(circleD * 0.04));
            const outerD  = circleD + borderW * 2;
            const r       = circleD / 2;
            const ro      = outerD / 2;
            const pos     = webcam.position || 'bottom-right';
            const margin  = 24;
            const cX = pos.includes('right') ? outW - outerD - margin : margin;
            const cY = pos.includes('bottom') ? outH - outerD - margin : margin;

            const maskPath = path.join(maskDir, `mask_${circleD}.png`);
            const ringPath = path.join(maskDir, `ring_${outerD}.png`);
            
            if (!fs.existsSync(maskPath)) {
                execFileSync(FFMPEG, ['-f', 'lavfi', '-i', `color=c=black:s=${circleD}x${circleD}`, '-filter_complex', `format=rgba,geq=r=255:g=255:b=255:a='255*lte(sqrt(pow(X-${r},2)+pow(Y-${r},2)),${r}-1)'`, '-vframes', '1', '-y', maskPath]);
            }
            if (!fs.existsSync(ringPath)) {
                execFileSync(FFMPEG, ['-f', 'lavfi', '-i', `color=c=white:s=${outerD}x${outerD}`, '-filter_complex', `format=rgba,geq=r=255:g=255:b=255:a='255*lte(sqrt(pow(X-${ro},2)+pow(Y-${ro},2)),${ro})'`, '-vframes', '1', '-y', ringPath]);
            }

            args.splice(4, 0, '-i', maskPath, '-i', ringPath);

            filterParts.push(
                `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},setsar=1[bg]`,
                `[0:v]crop=${squareSide}:${squareSide}:${sqX}:${sqY},scale=${circleD}:${circleD},format=rgba[face_square]`,
                `[face_square][1:v]alphamerge[face_circle]`,
                `[bg][2:v]overlay=${cX}:${cY}[with_ring]`,
                `[with_ring][face_circle]overlay=${cX + borderW}:${cY + borderW}:format=auto[outv_raw]`
            );
        }

    } else {
        // No webcam — simple scale + center crop
        filterParts.push(
            `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},setsar=1[outv_raw]`
        );
    }

    // Burn subtitles
    if (assFile && fs.existsSync(assFile)) {
        const escapedAss = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
        filterParts.push(`[outv_raw]ass='${escapedAss}'[outv]`);
    } else {
        const last = filterParts[filterParts.length - 1];
        filterParts[filterParts.length - 1] = last.replace('[outv_raw]', '[outv]');
    }

    args.push(
        '-filter_complex', filterParts.join(';'),
        '-map', '[outv]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outputPath
    );

    return args;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Upload video file ─────────────────────────────────────────────────────────
router.post('/upload', (req, res) => {
    // Wrap multer so errors return JSON instead of HTML
    upload.single('video')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: `Arquivo muito grande. Limite: 2000MB.` });
            }
            return res.status(400).json({ error: err.message || 'Erro no upload.' });
        }
        if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado.' });
        const info = await getVideoDuration(req.file.path);
        res.json({
            success: true,
            path: req.file.path,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            duration: info.duration,
            width: info.width,
            height: info.height
        });
    });
});

// ── Find yt-dlp binary ────────────────────────────────────────────────────────
function findYtDlp() {
    const candidates = [
        '/opt/homebrew/bin/yt-dlp',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        'yt-dlp'
    ];
    for (const c of candidates) {
        if (c === 'yt-dlp') return c; // fallback to PATH
        if (fs.existsSync(c)) return c;
    }
    return 'yt-dlp';
}
const YT_DLP = findYtDlp();

// ── Download from YouTube / other platforms ───────────────────────────────────
router.post('/download-yt', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL é obrigatória.' });

    const io = req.app.get('io');
    const jid = jobId();
    const ts = Date.now();
    const outputTemplate = path.join(YT_DIR, `yt_${ts}.%(ext)s`);

    res.json({ success: true, jobId: jid, message: 'Download iniciado.' });
    if (io) io.emit('clips-log', { type: 'info', message: '🎬 Baixando com yt-dlp...' });

    const ytProc = spawn(YT_DLP, [
        url,
        '-f', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
        '--no-playlist',
        '--newline',
        '--no-warnings',
        '--ffmpeg-location', FFMPEG
    ]);

    let ytTitle = 'video';
    ytProc.stdout.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
        const pm = line.match(/(\d+\.?\d*)%/);
        if (pm && io) io.emit('clips-yt-progress', { jobId: jid, percent: parseFloat(pm[1]) });
        const tm = line.match(/\[download\] Destination: (.+)/);
        if (tm) ytTitle = path.basename(tm[1]).replace(/\.\w+$/, '');
        if (io) io.emit('clips-log', { type: 'info', message: line });
    });

    ytProc.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg && io) io.emit('clips-log', { type: 'warning', message: msg });
    });

    ytProc.on('close', async code => {
        // Find what yt-dlp actually wrote (may be .mp4, .mkv, .webm…)
        const findFile = () => {
            const now = Date.now();
            try {
                const files = fs.readdirSync(YT_DIR)
                    .filter(f => /\.(mp4|mkv|webm|mov|avi)$/i.test(f))
                    .map(f => ({ full: path.join(YT_DIR, f), t: fs.statSync(path.join(YT_DIR, f)).mtimeMs }))
                    .filter(({ t }) => now - t < 180000)
                    .sort((a, b) => b.t - a.t);
                return files.length ? files[0].full : null;
            } catch { return null; }
        };

        let actualFile = findFile();

        // Remux to mp4 if needed (fast copy, no re-encode)
        if (actualFile && !actualFile.endsWith('.mp4')) {
            const remuxed = actualFile.replace(/\.\w+$/, '.mp4');
            if (io) io.emit('clips-log', { type: 'info', message: '🔄 Remuxando para MP4...' });
            try {
                await new Promise((resolve, reject) => {
                    const proc = spawn(FFMPEG, ['-i', actualFile, '-c', 'copy', '-y', remuxed]);
                    proc.on('close', c => {
                        if (c === 0 && fs.existsSync(remuxed)) {
                            try { fs.unlinkSync(actualFile); } catch {}
                            resolve();
                        } else reject(new Error('Remux falhou'));
                    });
                });
                actualFile = remuxed;
            } catch (e) {
                if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ Remux falhou: ${e.message}` });
            }
        }

        if ((code === 0 || code === 1) && actualFile && fs.existsSync(actualFile)) {
            const info = await getVideoDuration(actualFile);
            
            if (!info.hasVideo) {
                try { fs.unlinkSync(actualFile); } catch {}
                if (io) io.emit('clips-yt-error', { jobId: jid, error: 'O vídeo baixado não possui imagem (erro no formato do YouTube).' });
                return;
            }

            if (io) {
                io.emit('clips-yt-done', {
                    jobId: jid, path: actualFile,
                    filename: path.basename(actualFile),
                    title: ytTitle, duration: info.duration,
                    width: info.width, height: info.height, url
                });
                io.emit('clips-log', { type: 'success', message: `✅ Download OK! Duração: ${Math.round(info.duration)}s (${info.width}x${info.height})` });
            }
        } else {
            if (io) io.emit('clips-yt-error', { jobId: jid, error: `Falha no download (código: ${code}).` });
        }
    });
});

// ── Provide frame preview for mask editor ─────────────────────────────────────
router.get('/preview', async (req, res) => {
    const videoPath = req.query.path;
    if (!videoPath || !fs.existsSync(videoPath)) return res.status(404).send('Not found');

    const framePath = path.join(FRAMES_DIR, `preview_${Date.now()}.jpg`);
    const info = await getVideoDuration(videoPath);
    const atSec = Math.min(10, Math.max(1, info.duration * 0.1));

    const ok = await extractFrame(videoPath, framePath, atSec);
    if (ok) {
        res.sendFile(framePath, () => {
            try { fs.unlinkSync(framePath); } catch {}
        });
    } else {
        res.status(500).send('Erro ao extrair frame');
    }
});

// ── Stream local video directly by absolute path ──────────────────────────────
router.get('/stream', (req, res) => {
    const videoPath = req.query.path;
    if (!videoPath || !fs.existsSync(videoPath)) return res.status(404).send('Not found');
    res.sendFile(videoPath);
});

// ── Detect webcam/face via AI Vision ─────────────────────────────────────────
router.post('/webcam-detect', async (req, res) => {
    const { videoPath, key, model } = req.body;
    if (!videoPath || !fs.existsSync(videoPath)) return res.status(400).json({ error: 'Arquivo não encontrado.' });
    if (!key) return res.status(400).json({ detected: false, reason: 'Sem chave AI' });

    const visionModel = 'openai/gpt-4o'; // gpt-4o-mini does NOT support vision on OpenRouter

    try {
        // Get video duration to sample frames at good positions
        const info = await getVideoDuration(videoPath);
        const dur = info.duration || 60;

        // Sample at 10%, 25%, 40%, 60% of video to maximize chance of catching face
        const samplePoints = [0.10, 0.25, 0.40, 0.60].map(p => Math.max(2, Math.round(dur * p)));

        const systemPrompt = `Você é um especialista em análise de layout de vídeos para edição profissional.
Sua tarefa é detectar se há uma pessoa/apresentador visível no frame (webcam overlay, face cam, talking head, etc).
Seja GENEROSO na detecção — mesmo rostos pequenos, parcialmente visíveis ou em cantos contam.
Retorne APENAS JSON válido, sem markdown, sem explicação.`;

        const userPrompt = `Analise este frame de vídeo cuidadosamente.

PROCURE por:
- Uma janela de webcam com o rosto do apresentador (comum em tutoriais)
- Uma "facecam" ou "talking head" em qualquer canto do vídeo
- Qualquer pessoa visível que não seja o conteúdo principal da tela

Se encontrar uma pessoa/rosto:
{
  "hasFace": true,
  "position": "bottom-right",
  "confidence": 85,
  "relX": 0.72,
  "relY": 0.60,
  "relW": 0.28,
  "relH": 0.40,
  "description": "Apresentador no canto inferior direito em janela de webcam"
}

Valores relX/relY/relW/relH são proporções de 0 a 1 (posição e tamanho relativos ao frame).
Posições: top-left, top-right, bottom-left, bottom-right

Se absolutamente não há nenhuma pessoa visível:
{ "hasFace": false, "position": null, "confidence": 95 }

Retorne APENAS o JSON.`;

        // Try each frame until we detect a face
        let framePaths = [];
        let result = { hasFace: false };

        for (const atSec of samplePoints) {
            const framePath = path.join(FRAMES_DIR, `frame_${Date.now()}_${atSec}.jpg`);
            framePaths.push(framePath);

            const ok = await extractFrame(videoPath, framePath, atSec);
            if (!ok) continue;

            // Scale frame down for faster API transfer (max 960px wide)
            const scaledPath = framePath.replace('.jpg', '_s.jpg');
            await new Promise(resolve => {
                spawn(FFMPEG, ['-i', framePath, '-vf', 'scale=960:-1', '-q:v', '3', '-y', scaledPath])
                    .on('close', () => resolve());
            });
            framePaths.push(scaledPath);

            const imgPath = fs.existsSync(scaledPath) ? scaledPath : framePath;
            const imageBase64 = fs.readFileSync(imgPath).toString('base64');

            try {
                const aiResp = await callAI(userPrompt, systemPrompt, key, visionModel, imageBase64);
                const jsonMatch = aiResp.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.hasFace && parsed.confidence >= 60) {
                        result = parsed;
                        break; // Found a face — stop checking more frames
                    }
                    // Keep trying if no face found yet
                }
            } catch (aiErr) {
                // If vision model fails, try next frame
                console.error('[webcam-detect] AI error:', aiErr.message);
            }
        }

        // Cleanup all frames
        for (const fp of framePaths) try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}

        return res.json({ success: true, ...result });
    } catch (e) {
        res.json({ detected: false, reason: e.message });
    }
});


// ── Transcribe audio with Whisper ─────────────────────────────────────────────
router.post('/transcribe', async (req, res) => {
    const { videoPath, openaiKey, startSec = 0, endSec = 60 } = req.body;
    if (!videoPath || !fs.existsSync(videoPath)) return res.status(400).json({ error: 'Arquivo não encontrado.' });
    if (!openaiKey) return res.status(400).json({ error: 'Chave OpenAI necessária para transcrição.' });

    try {
        const audioPath = path.join(SUBS_DIR, `audio_${Date.now()}.wav`);

        // Extract clip audio segment
        await new Promise((resolve, reject) => {
            const proc = spawn(FFMPEG, [
                '-ss', String(startSec),
                '-i', videoPath,
                '-t', String(endSec - startSec),
                '-vn', '-ar', '16000', '-ac', '1',
                '-c:a', 'pcm_s16le', '-y', audioPath
            ]);
            let err = '';
            proc.stderr.on('data', d => { err += d; });
            proc.on('close', code => code === 0 ? resolve() : reject(new Error(err.slice(-200))));
        });

        // Call Whisper API
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', fs.createReadStream(audioPath), { filename: 'audio.wav', contentType: 'audio/wav' });
        form.append('model', 'whisper-1');
        form.append('response_format', 'verbose_json');
        form.append('timestamp_granularities[]', 'word');

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, ...form.getHeaders() },
            body: form
        });

        const transcriptionData = await whisperRes.json();
        try { fs.unlinkSync(audioPath); } catch {}

        if (transcriptionData.error) {
            return res.status(400).json({ error: transcriptionData.error.message });
        }

        res.json({
            success: true,
            text: transcriptionData.text,
            words: transcriptionData.words || [],
            segments: transcriptionData.segments || []
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// ── Transcribe full video — OpenAI Whisper OR Groq (free) ────────────────────
async function transcribeVideo(videoPath, { openaiKey, groqKey, huggingKey }, io) {
    // Remove all whitespace to avoid HTTP header splitting bugs
    const oaKey  = (openaiKey  || '').replace(/\s+/g, '');
    const gqKey  = (groqKey    || '').replace(/\s+/g, '');
    const hfKey  = (huggingKey || '').replace(/\s+/g, '');

    const useOpenAI  = !!oaKey;
    const useGroq    = !oaKey && !!gqKey;
    const useHF      = !oaKey && !gqKey && !!hfKey;

    if (!useOpenAI && !useGroq && !useHF) return null;

    const provider  = useOpenAI ? 'OpenAI Whisper' : useGroq ? 'Groq Whisper (grátis)' : 'HuggingFace Whisper (grátis)';
    const audioOutPath = path.join(SUBS_DIR, `full_audio_${Date.now()}.mp3`);

    try {
        if (io) io.emit('clips-log', { type: 'info', message: `🎙️ Transcrevendo com ${provider}...` });

        // Extract audio — 32kbps mono to stay under API limits
        await new Promise((resolve, reject) => {
            const proc = spawn(FFMPEG, [
                '-i', videoPath, '-vn',
                '-ar', '16000', '-ac', '1',
                '-b:a', '32k', '-y', audioOutPath
            ]);
            let err = '';
            proc.stderr.on('data', d => { err += d; });
            proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg audio: ' + err.slice(-200))));
        });

        const fileSizeMB = fs.statSync(audioOutPath).size / 1024 / 1024;
        if (io) io.emit('clips-log', { type: 'info', message: `🎙️ Áudio extraído (${fileSizeMB.toFixed(1)}MB) — enviando para ${provider}...` });

        // Read file into buffer — required for native FormData + Blob (form-data npm + fetch = multipart EOF bug)
        const audioBuffer = fs.readFileSync(audioOutPath);
        try { fs.unlinkSync(audioOutPath); } catch {}

        let words = [], text = '', segments = [];

        if (useOpenAI || useGroq) {
            // ── OpenAI / Groq Whisper (compatible API) ────────────────────────
            const apiUrl    = useOpenAI
                ? 'https://api.openai.com/v1/audio/transcriptions'
                : 'https://api.groq.com/openai/v1/audio/transcriptions';
            const apiKey    = useOpenAI ? oaKey : gqKey;
            const modelName = useOpenAI ? 'whisper-1' : 'whisper-large-v3';

            // CRITICAL: use native FormData + Blob — NOT form-data npm package
            const formData = new FormData();
            formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
            formData.append('model', modelName);
            formData.append('response_format', 'verbose_json');
            formData.append('timestamp_granularities[]', 'word');
            formData.append('timestamp_granularities[]', 'segment');
            formData.append('language', 'pt');

            const whisperRes = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` }, // NO Content-Type — fetch sets boundary automatically
                body: formData
            });

            const data = await whisperRes.json();
            if (data.error) {
                if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ ${provider}: ${data.error.message} — continuando sem transcrição` });
                return null;
            }

            text     = data.text || '';
            segments = data.segments || [];
            words    = data.words || [];

            // Groq puts words inside segments
            if (!words.length && segments.length) {
                words = segments.flatMap(seg => seg.words || []);
            }
            // Fallback: approximate word timestamps from segment timing
            if (!words.length && segments.length) {
                words = segments.flatMap(seg => {
                    const ws = (seg.text || '').trim().split(/\s+/).filter(Boolean);
                    if (!ws.length) return [];
                    const dur = (seg.end - seg.start) / ws.length;
                    return ws.map((w, i) => ({ word: w, start: seg.start + i * dur, end: seg.start + (i + 1) * dur }));
                });
            }

        } else {
            // ── HuggingFace Inference API (100% gratuito) ─────────────────────
            // Uses openai/whisper-large-v3 on HF — returns text + chunks with timestamps
            const hfRes = await fetch(
                'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${hfKey}`,
                        'Content-Type': 'audio/mpeg'
                    },
                    body: audioBuffer
                }
            );

            // HF may return 503 if model is loading — retry once after 10s
            if (hfRes.status === 503) {
                if (io) io.emit('clips-log', { type: 'info', message: '🤗 HuggingFace: modelo carregando, aguardando 15s...' });
                await new Promise(r => setTimeout(r, 15000));
                const retry = await fetch(
                    'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
                    {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'audio/mpeg' },
                        body: audioBuffer
                    }
                );
                const d = await retry.json();
                text = d.text || '';
            } else {
                const d = await hfRes.json();
                if (d.error) {
                    if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ HuggingFace: ${d.error} — sem transcrição` });
                    return null;
                }
                text = d.text || d[0]?.generated_text || '';
            }

            // HF doesn't return word timestamps — approximate from words
            if (text) {
                const ws = text.trim().split(/\s+/).filter(Boolean);
                // We don't have duration here but use a rough estimate
                const totalSec = fileSizeMB * 30; // ~30s/MB at 32kbps
                const dur = totalSec / Math.max(ws.length, 1);
                words = ws.map((w, i) => ({ word: w, start: i * dur, end: (i + 1) * dur }));
                segments = [{ text, start: 0, end: totalSec }];
            }
        }

        if (io) io.emit('clips-log', { type: 'success', message: `✅ Transcrição concluída via ${provider}: ${words.length} palavras.` });
        return { text, words, segments };

    } catch (e) {
        try { if (fs.existsSync(audioOutPath)) fs.unlinkSync(audioOutPath); } catch {}
        if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ Transcrição falhou (${provider}): ${e.message}` });
        return null;
    }
}

// ── Local Whisper transcription (no API key needed) ───────────────────────────
const TRANSCRIBE_PY = path.join(require('os').homedir(), '.browzebot', 'transcribe.py');

function checkLocalWhisper() {
    return new Promise(resolve => {
        const proc = spawn('python3', ['-c', 'import faster_whisper; print("ok")']);
        let out = '';
        proc.stdout.on('data', d => { out += d; });
        proc.on('close', code => resolve(code === 0 && out.includes('ok')));
    });
}

async function transcribeLocal(audioPath, modelSize = 'small', io) {
    return new Promise((resolve, reject) => {
        const proc = spawn('python3', [TRANSCRIBE_PY, audioPath, modelSize]);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => { stdout += d; });
        proc.stderr.on('data', d => {
            const line = d.toString().trim();
            if (line && io) {
                const msg = line.replace('[WHISPER] ', '');
                io.emit('clips-log', { type: 'info', message: `🖥️ ${msg}` });
            }
            stderr += line;
        });

        proc.on('close', code => {
            if (code === 0 && stdout.trim()) {
                try { resolve(JSON.parse(stdout)); }
                catch { reject(new Error('JSON inválido do Whisper local')); }
            } else {
                try {
                    const parsed = JSON.parse(stdout);
                    reject(new Error(parsed.error || stderr));
                } catch { reject(new Error(stderr || 'Whisper local falhou')); }
            }
        });
    });
}

// ── GET /whisper-status — check if faster-whisper is installed ─────────────────
router.get('/whisper-status', async (req, res) => {
    const installed = await checkLocalWhisper();
    res.json({ installed });
});

// ── POST /whisper-install — install faster-whisper via pip ─────────────────────
router.post('/whisper-install', async (req, res) => {
    const io = req.app.get('io');
    res.json({ success: true, message: 'Instalação iniciada...' });

    if (io) io.emit('clips-log', { type: 'info', message: '📦 Instalando faster-whisper (pode levar 1-2 minutos)...' });

    const proc = spawn('pip3', ['install', 'faster-whisper', '--break-system-packages', '--quiet']);

    proc.stdout.on('data', d => {
        if (io) io.emit('clips-log', { type: 'info', message: d.toString().trim() });
    });
    proc.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg && io) io.emit('clips-log', { type: 'info', message: msg });
    });

    proc.on('close', async code => {
        if (code === 0) {
            const ok = await checkLocalWhisper();
            if (io) io.emit(ok ? 'whisper-installed' : 'whisper-install-error', {
                message: ok ? '✅ faster-whisper instalado com sucesso!' : '❌ Instalação falhou — tente: pip3 install faster-whisper'
            });
            if (io) io.emit('clips-log', { type: ok ? 'success' : 'error',
                message: ok ? '✅ Whisper local pronto! Transcrição offline ativada.' : '❌ Instalação falhou.'
            });
        } else {
            if (io) io.emit('clips-log', { type: 'error', message: '❌ pip3 falhou. Tente instalar manualmente: pip3 install faster-whisper' });
        }
    });
});

// ── Generate clips with AI ────────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
    const {
        videoPath, videoName, videoUrl,
        prompt, clipDuration, clipCount, style, aspectRatio,
        webcam, burnSubtitles, subtitleStyle,
        removeWebcamFromBg,
        openaiKey, groqKey, huggingKey, whisperModel,
        key, model,
        // ✨ Smart processing options
        snapWords = true,
        removeFillers = true,
        advancedEditing = false,
        silenceBuffer = 0.15,
        // 🎬 Retention Editing
        retentionEdit = false,
        retentionSilenceThreshold = 0.5,
        retentionRemoveBreaths    = true,
        retentionDetectErrors     = true,
    } = req.body;

    if (!videoPath || !fs.existsSync(videoPath)) return res.status(400).json({ error: 'Arquivo não encontrado.' });
    const cleanKey = (key || '').replace(/\s+/g, '');
    if (!cleanKey) return res.status(400).json({ error: 'Chave OpenRouter não configurada. Abra ⚙️ Global Settings e salve sua chave sk-or-v1-...' });

    const io = req.app.get('io');
    const jid = jobId();
    const numClips = Math.min(Math.max(parseInt(clipCount) || 5, 1), 20);
    const clipLen = Math.min(Math.max(parseInt(clipDuration) || 30, 5), 180);
    const ratio = aspectRatio || '9:16';
    const videoLabel = videoName || path.basename(videoPath);

    const videoInfo = await getVideoDuration(videoPath);
    const totalDuration = videoInfo.duration || 600;

    clipsDb.saveJob({ job_id: jid, source_path: videoPath, source_name: videoLabel, source_url: videoUrl || null, duration: totalDuration, prompt });
    res.json({ success: true, jobId: jid, message: 'Geração iniciada.' });

    // ── Step 1: Transcribe ────────────────────────────────────────────────────
    let transcription = null;

    // Try local Whisper first (offline, no API key)
    const localOk = await checkLocalWhisper();
    if (localOk) {
        if (io) io.emit('clips-log', { type: 'info', message: `🖥️ Transcrevendo localmente com Whisper (${whisperModel || 'small'})...` });
        const audioOutPath = path.join(SUBS_DIR, `full_audio_${Date.now()}.mp3`);
        try {
            await new Promise((resolve, reject) => {
                const proc = spawn(FFMPEG, ['-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k', '-y', audioOutPath]);
                let err = '';
                proc.stderr.on('data', d => { err += d; });
                proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg: ' + err.slice(-100))));
            });
            transcription = await transcribeLocal(audioOutPath, whisperModel || 'small', io);
            try { fs.unlinkSync(audioOutPath); } catch {}
            if (transcription?.words?.length) {
                if (io) io.emit('clips-log', { type: 'success', message: `✅ Whisper local: ${transcription.words.length} palavras transcritas!` });
            }
        } catch (e) {
            try { if (fs.existsSync(audioOutPath)) fs.unlinkSync(audioOutPath); } catch {}
            if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ Whisper local falhou: ${e.message} — tentando API...` });
        }
    }

    // Fallback: API providers (Groq / HuggingFace / OpenAI)
    if (!transcription && (openaiKey || groqKey || huggingKey)) {
        transcription = await transcribeVideo(videoPath, { openaiKey, groqKey, huggingKey }, io);
    } else if (!transcription && !localOk) {
        if (io) io.emit('clips-log', { type: 'warning', message: '⚠️ Sem transcrição — instale Whisper Local em ⚙️ Global Settings para transcrição offline.' });
    }

    const transcriptText = transcription?.text || '';
    const hasTranscript  = transcriptText.length > 50;

    // ── Step 1.5: Retention Edit (se ativado) ────────────────────────────────
    let retentionStats = null;
    let workingVideoPath = videoPath;    // pode ser substituído pelo vídeo editado
    let workingWords    = transcription?.words || [];

    if (retentionEdit && transcription?.words?.length > 10) {
        try {
            const retOutPath = path.join(CLIPS_DIR, `retention_${jid}.mp4`);
            if (io) io.emit('clips-log', { type: 'info', message: '🎬 Modo Alta Retenção ativado — iniciando pipeline de edição...' });

            const retResult = await runRetentionPipeline({
                videoPath:          videoPath,
                words:              transcription.words,
                transcript:         transcriptText,
                outputPath:         retOutPath,
                videoDuration:      totalDuration,
                key:                cleanKey,
                model:              model || 'openai/gpt-4o-mini',
                io,
                silenceThreshold:   retentionSilenceThreshold,
                removeBreaths:      retentionRemoveBreaths,
                detectErrors:       retentionDetectErrors,
                removeRepetitions:  retentionDetectErrors,
                removeFillers,
            });

            workingVideoPath = retResult.editedVideoPath;
            workingWords     = retResult.remappedWords;
            retentionStats   = retResult.stats;

            // Update transcript text from remapped words for AI
            const remappedText = retResult.remappedWords.map(w => w.word).join(' ');
            if (remappedText.length > 50) {
                transcription = { ...transcription, text: remappedText, words: retResult.remappedWords };
            }
        } catch (retErr) {
            if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ Retention Edit falhou: ${retErr.message} — continuando sem edição de retenção` });
        }
    }

    // ── Step 2: AI moment selection ───────────────────────────────────────────
    const styleGuides = {
        viral:  'TikTok/Reels VIRAL: título direto e específico ao conteúdo, linguagem natural mas impactante, máximo 1 emoji.',
        reels:  'Instagram REELS: título criativo refletindo o conteúdo real, tom engajador, hashtags do tema na legenda.',
        shorts: 'YouTube SHORTS: título SEO com palavras-chave reais do vídeo, CTA no final da legenda.',
        neutro: 'Profissional: título objetivo e descritivo, legenda informativa e clara.'
    };

    const systemPrompt = `Você é um editor de vídeo especialista em clips virais para redes sociais.

REGRAS ABSOLUTAS:
1. Retorne APENAS JSON válido. Zero markdown. Zero explicação. Só o JSON.
2. Títulos e legendas DEVEM ser específicos ao conteúdo real — nunca genéricos.
3. PROIBIDO usar: "INCRÍVEL REVELAÇÃO", "CHOCANTE", "NINGUÉM ESPERAVA", "VAI MUDAR TUDO", "IMPOSSÍVEL", "QUE QUEBRA REGRAS", "TENSÃO QUE VIRA VITÓRIA" e similares clichês de IA.
4. O título deve soar como algo que um criador humano escreveria sobre ESTE vídeo específico.
5. Estilo: ${styleGuides[style] || styleGuides.viral}`;

    const transcriptSection = hasTranscript
        ? `\n\nTRANSCRIÇÃO DO VÍDEO:\n"""\n${transcriptText.slice(0, 10000)}\n"""\n\nSELECIONE os ${numClips} trechos onde acontece algo mais impactante, didático ou interessante com base no que foi FALADO. Os timestamps devem corresponder exatamente ao que foi dito naquela posição da transcrição.`
        : `\n\nSem transcrição disponível. Distribua ${numClips} clips ao longo dos ${Math.round(totalDuration)}s e crie títulos baseados no tema "${prompt || videoLabel}". Evite clichês.`;

    const userPrompt = advancedEditing
      ? `Vídeo: "${videoLabel}"
Duração: ${Math.round(totalDuration)}s
Tema: "${prompt || 'momentos mais valiosos'}"
Quantidade: ${numClips} clips${transcriptSection}

INSTRUÇÃO ESPECIAL DE EDIÇÃO AVANÇADA (STITCHING):
Para cada clip, ao invés de escolher um bloco contínuo, você deve montar um "Frankenstein" perfeito. Escolha 2 a 4 trechos (segmentos) diferentes que, quando tocados em sequência, formam um único vídeo coeso, dinâmico e direto ao ponto. Remova silêncios longos, explicações chatas ou desvios de assunto. Junte a melhor introdução com o melhor recheio e conclusão.

JSON exato (sem nada antes ou depois):
{
  "clips": [
    {
      "title": "Título específico",
      "caption": "Legenda autêntica",
      "hook": "Primeira frase",
      "score": 85,
      "whyViral": "Razão",
      "segments": [
        { "start": 12.5, "end": 18.0 },
        { "start": 25.0, "end": 40.5 }
      ]
    }
  ]
}`
      : `Vídeo: "${videoLabel}"
Duração: ${Math.round(totalDuration)}s (${(totalDuration / 60).toFixed(1)} min)
Tema: "${prompt || 'momentos mais valiosos'}"
Duração de cada clip: ${clipLen}s
Quantidade: ${numClips} clips${transcriptSection}

JSON exato (sem nada antes ou depois):
{
  "clips": [
    {
      "start": 15.5,
      "end": ${15.5 + clipLen},
      "title": "Título específico e natural",
      "caption": "Legenda autêntica",
      "hook": "Primeira frase",
      "score": 85,
      "whyViral": "Razão de engajamento"
    }
  ]
}`;

    if (io) {
        io.emit('clips-log', { type: 'info', message: `🤖 I.A. analisando${hasTranscript ? ' com transcrição real' : ' via OpenRouter'}...` });
        io.emit('clips-stage', { stage: 'ai', label: 'IA selecionando momentos...' });
    }

    let aiClips = [];
    try {
        const aiResp = await callAI(userPrompt, systemPrompt, cleanKey, model || 'openai/gpt-4o-mini');
        const jsonMatch = aiResp.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiClips = JSON.parse(jsonMatch[0]).clips || [];
        if (io) {
            io.emit('clips-log', { type: 'success', message: `✅ I.A. selecionou ${aiClips.length} momentos. Iniciando cortes...` });
            io.emit('clips-stage', { stage: 'cutting', label: `Cortando ${aiClips.length} clips...` });
        }
    } catch (e) {
        if (io) io.emit('clips-log', { type: 'error', message: '❌ Erro na análise IA: ' + e.message });
        clipsDb.updateJobStatus(jid, 'error');
        return;
    }

    if (!aiClips.length) {
        clipsDb.updateJobStatus(jid, 'error');
        if (io) io.emit('clips-log', { type: 'error', message: '❌ Nenhum clip retornado pela IA.' });
        return;
    }

    // ── Step 3: Process each clip ─────────────────────────────────────────────
    for (let i = 0; i < aiClips.length; i++) {
        const clip = aiClips[i];
        
        let currentInputPath = videoPath;
        let actualDur = 0;
        let clipWords = [];
        let renderStartSec = 0;
        
        // ✨ Handle Advanced Editing (Stitching segments)
        if (advancedEditing && clip.segments && clip.segments.length > 0) {
            if (io) io.emit('clips-log', { type: 'info', message: `✂️ Costurando ${clip.segments.length} trechos dinamicamente...` });
            
            let fcParts = [];
            let currentTimeline = 0;
            let vMaps = '';

            for (let sIdx = 0; sIdx < clip.segments.length; sIdx++) {
                const seg = clip.segments[sIdx];
                let sStart = parseFloat(seg.start) || 0;
                let sEnd   = Math.min(parseFloat(seg.end) || (sStart + clipLen), totalDuration);

                // Word snapping for this segment
                if (snapWords && transcription?.words?.length) {
                    const snapped = snapToWordBoundary(sStart, sEnd, transcription.words, 1.5);
                    if (snapped.snapped) {
                        sStart = snapped.start;
                        sEnd   = Math.min(snapped.end, totalDuration);
                    }
                }
                
                const sDur = sEnd - sStart;
                
                // Map words to new continuous stitched timeline
                if (transcription?.words?.length) {
                    const segWords = transcription.words.filter(w => parseFloat(w.start) >= (sStart - 0.5) && parseFloat(w.end) <= (sEnd + 0.5));
                    for (const w of segWords) {
                        clipWords.push({
                            word: w.word,
                            start: Math.max(0, parseFloat(w.start) - sStart) + currentTimeline,
                            end: Math.max(0, parseFloat(w.end) - sStart) + currentTimeline
                        });
                    }
                }

                fcParts.push(`[0:v]trim=start=${sStart}:end=${sEnd},setpts=PTS-STARTPTS[v${sIdx}]`);
                fcParts.push(`[0:a]atrim=start=${sStart}:end=${sEnd},asetpts=PTS-STARTPTS[a${sIdx}]`);
                vMaps += `[v${sIdx}][a${sIdx}]`;

                actualDur += sDur;
                currentTimeline += sDur;
            }

            fcParts.push(`${vMaps}concat=n=${clip.segments.length}:v=1:a=1[outv][outa]`);
            const stitchedFile = path.join(CLIPS_DIR, `stitched_${jid}_c${i}.mp4`);
            
            // Concat segments flawlessly using filter_complex
            await new Promise((resolve, reject) => {
                const proc = spawn(FFMPEG, [
                    '-i', videoPath,
                    '-filter_complex', fcParts.join(';'),
                    '-map', '[outv]', '-map', '[outa]',
                    '-c:v', 'libx264', '-preset', 'superfast', '-crf', '18',
                    '-c:a', 'aac', '-b:a', '128k',
                    '-y', stitchedFile
                ]);
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d; });
                proc.on('close', code => code === 0 ? resolve() : reject(new Error('Falha no stitching FFmpeg: ' + stderr.slice(-200))));
            });

            currentInputPath = stitchedFile;
            renderStartSec = 0; // stitched file starts at 0
            
        } else {
            // Normal single segment fallback
            let startSec = parseFloat(clip.start) || 0;
            let endSec = Math.min(parseFloat(clip.end) || (startSec + clipLen), totalDuration);

            if (snapWords && transcription?.words?.length) {
                const snapped = snapToWordBoundary(startSec, endSec, transcription.words, 1.5);
                if (snapped.snapped) {
                    const startDiff = Math.abs(snapped.start - startSec).toFixed(2);
                    const endDiff   = Math.abs(snapped.end   - endSec  ).toFixed(2);
                    if (io && (snapped.startSnapped || snapped.endSnapped)) {
                        io.emit('clips-log', { type: 'info', message: `🔧 Clip ${i+1}: corte ajustado para pausa (±${startDiff}s inicio / ±${endDiff}s fim)` });
                    }
                    startSec = snapped.start;
                    endSec   = Math.min(snapped.end, totalDuration);
                }
            }

            actualDur = endSec - startSec;
            renderStartSec = startSec;
            
            if (transcription?.words?.length) {
                clipWords = transcription.words
                    .filter(w => parseFloat(w.start) >= (startSec - 0.5) && parseFloat(w.end) <= (endSec + 0.5))
                    .map(w => ({
                        word: w.word,
                        start: Math.max(0, parseFloat(w.start) - startSec),
                        end: Math.max(0, parseFloat(w.end) - startSec)
                    }));
            }
        }

        const clipFilename = `${jid}_c${i + 1}_${Date.now()}.mp4`;
        const clipOutputPath = path.join(CLIPS_DIR, clipFilename);
        const thumbFilename = `${jid}_t${i + 1}.jpg`;
        const thumbOutputPath = path.join(THUMBS_DIR, thumbFilename);

        if (io) {
            const timeInfo = advancedEditing && clip.segments 
                ? `${clip.segments.length} trechos costurados`
                : `${renderStartSec.toFixed(1)}s → ${(renderStartSec + actualDur).toFixed(1)}s`;
            io.emit('clips-log', { type: 'info', message: `✂️ Cortando ${i + 1}/${aiClips.length}: "${clip.title}" (${timeInfo})` });
            io.emit('clips-progress', { jobId: jid, current: i, total: aiClips.length, title: clip.title });
            io.emit('clips-stage', { stage: 'clip', label: `🎬 Clip ${i + 1}/${aiClips.length}: ${clip.title.slice(0, 35)}...` });
        }

        const clipResult = clipsDb.saveClip({
            job_id: jid, source_path: videoPath, source_name: videoLabel, source_url: videoUrl || null,
            start_sec: renderStartSec, end_sec: renderStartSec + actualDur, duration: actualDur,
            title: clip.title || `Clip ${i + 1}`, caption: clip.caption || '',
            aspect_ratio: ratio, status: 'processing', score: clip.score || 0
        });
        const clipId = clipResult.lastInsertRowid;

        try {
            // Smart thumbnail: 15% into clip to avoid black frames
            await generateThumbnail(currentInputPath, thumbOutputPath, null, actualDur);

            let assFilePath = null;
            if (burnSubtitles) {
                const assFilename = `${jid}_c${i + 1}.ass`;
                assFilePath = path.join(SUBS_DIR, assFilename);

                let sStyle = subtitleStyle || {};
                if (ratio === '9:16' && !sStyle.position) sStyle.position = 'middle-center';

                if (clipWords.length > 3) {
                    // Unified engine: generateAssFile handles removeFillers via opts
                    const wordCount = clipWords.length;
                    if (io) io.emit('clips-stage', { stage: 'subtitles', label: `📝 Gerando legendas (${wordCount} palavras)...` });
                    generateAssFile(clipWords, assFilePath, ratio, sStyle, { removeFillers });
                    if (io) io.emit('clips-log', {
                        type: 'success',
                        message: `📝 Legendas: ${wordCount} palavras${removeFillers ? ' (muletas removidas)' : ''}`
                    });
                } else {
                    generatePlaceholderAss(0, actualDur, clip.title, clip.caption, assFilePath, ratio, sStyle);
                    if (io) io.emit('clips-log', { type: 'info', message: `📝 Clip ${i + 1}: legenda via IA (sem transcrição neste trecho)` });
                }

            }

            const ffArgs = await buildFFmpegArgs({
                inputPath: currentInputPath, outputPath: clipOutputPath,
                startSec: renderStartSec, endSec: renderStartSec + actualDur, aspectRatio: ratio,
                webcam: webcam || null, assFile: assFilePath,
                srcW: videoInfo.width, srcH: videoInfo.height,
                removeWebcamFromBg: removeWebcamFromBg !== false
            });

            await new Promise((resolve, reject) => {
                const proc = spawn(FFMPEG, ffArgs);
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d; });
                proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg: ' + stderr.trim().split('\n').slice(-5).join('\n'))));
            });

            if (assFilePath && fs.existsSync(assFilePath)) try { fs.unlinkSync(assFilePath); } catch {}

            clipsDb.updateClip(clipId, { status: 'done', output_path: clipOutputPath, thumbnail: thumbOutputPath });

            if (io) {
                io.emit('clips-clip-done', {
                    jobId: jid, clipId, index: i, total: aiClips.length,
                    title: clip.title, caption: clip.caption,
                    hook: clip.hook, score: clip.score, whyViral: clip.whyViral,
                    outputUrl: `/api/clips/files/${clipFilename}`,
                    thumbnailUrl: `/api/clips/files/thumbs/${thumbFilename}`,
                    startSec: renderStartSec, endSec: renderStartSec + actualDur, duration: actualDur
                });
                io.emit('clips-log', { type: 'success', message: `✅ Clip ${i + 1}/${aiClips.length} pronto: "${clip.title}"` });
            }
        } catch (err) {
            clipsDb.updateClip(clipId, { status: 'error' });
            if (io) io.emit('clips-log', { type: 'error', message: `❌ Erro clip ${i + 1}: ${err.message}` });
        }
    }

    clipsDb.updateJobStatus(jid, 'done');
    if (io) {
        io.emit('clips-job-done', { jobId: jid, total: aiClips.length });
        io.emit('clips-stage', { stage: 'done', label: `🎉 ${aiClips.length} clips prontos!` });
        io.emit('clips-log', { type: 'success', message: `🎉 Concluído! ${aiClips.length} clips prontos.` });
    }
});

// ── CRUD Routes ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try { res.json({ clips: clipsDb.listClips(req.query.job_id || null) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/jobs', (req, res) => {
    try { res.json({ jobs: clipsDb.listJobs() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', (req, res) => {
    try {
        const { title, caption, approved, status } = req.body;
        clipsDb.updateClip(parseInt(req.params.id), { title, caption, approved, status });
        res.json({ success: true, clip: clipsDb.getClip(parseInt(req.params.id)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
    try {
        const clip = clipsDb.getClip(parseInt(req.params.id));
        if (clip) {
            [clip.output_path, clip.thumbnail].forEach(f => { if (f && fs.existsSync(f)) try { fs.unlinkSync(f); } catch {} });
        }
        clipsDb.deleteClip(parseInt(req.params.id));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/jobs/:jobId', (req, res) => {
    try {
        const clips = clipsDb.listClips(req.params.jobId);
        clips.forEach(c => {
            [c.output_path, c.thumbnail].forEach(f => { if (f && fs.existsSync(f)) try { fs.unlinkSync(f); } catch {} });
        });
        clipsDb.deleteJob(req.params.jobId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/download/:id', (req, res) => {
    try {
        const clip = clipsDb.getClip(parseInt(req.params.id));
        if (!clip || !clip.output_path || !fs.existsSync(clip.output_path)) {
            return res.status(404).json({ error: 'Clip não encontrado.' });
        }
        const safeName = (clip.title || 'clip').replace(/[^a-z0-9]/gi, '_').slice(0, 50) + '.mp4';
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Content-Type', 'video/mp4');
        fs.createReadStream(clip.output_path).pipe(res);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

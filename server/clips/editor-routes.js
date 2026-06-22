/**
 * editor-routes.js — Gatilho de Edição Inteligente
 * POST /api/editor/analyze   — transcreve + detecta falhas → lista de segmentos
 * POST /api/editor/export    — gera cortes limpos + EDL + ZIP para download
 * GET  /api/editor/jobs      — lista jobs
 * DELETE /api/editor/jobs/:id
 */

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const multer   = require('multer');
const archiver = require('archiver');
const FFMPEG   = require('ffmpeg-static');
let FFPROBE = 'ffprobe';
try { FFPROBE = require('ffprobe-static').path; } catch {}

const db = require('./db');
const { generateSmartCaptions, buildAssHeader, toAssTime } = require('./subtitles');

// ── Dirs ──────────────────────────────────────────────────────────────────────
const EDITOR_DIR = path.join(__dirname, '../uploads/editor');
const EDITOR_EXPORT_DIR = path.join(EDITOR_DIR, 'exports');
[EDITOR_DIR, EDITOR_EXPORT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, EDITOR_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + randomBytes(4).toString('hex') + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 4000 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────
function jobId() { return 'edit_' + Date.now() + '_' + randomBytes(3).toString('hex'); }

function getVideoInfo(filePath) {
    return new Promise(resolve => {
        const proc = spawn(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath]);
        let out = '';
        proc.stdout.on('data', d => { out += d; });
        proc.on('close', () => {
            try {
                const data = JSON.parse(out);
                const dur = parseFloat(data.format?.duration) || 0;
                const vs = data.streams?.find(s => s.codec_type === 'video');
                resolve({ duration: dur, width: vs?.width || 1920, height: vs?.height || 1080, hasVideo: !!vs });
            } catch { resolve({ duration: 0, width: 1920, height: 1080, hasVideo: false }); }
        });
    });
}

// ── FILLERS list (match subtitles.js) ─────────────────────────────────────────
const FILLERS = new Set([
    'tipo','ahn','ééé','éé','é','ã','ãn','então','né','sabe','certo','assim',
    'bem','hm','hmm','hum','ah','ahh','oh','oi','olha','bom','ok','okay',
    'mmm','pois','cê','tô','tá','tava','saca','cara','mano','galera'
]);

// ── Transcribe (shared with routes.js pattern) ─────────────────────────────────
const TRANSCRIBE_PY = path.join(__dirname, 'transcribe.py');
const SUBS_DIR = path.join(__dirname, '../uploads/clips/subs');
if (!fs.existsSync(SUBS_DIR)) fs.mkdirSync(SUBS_DIR, { recursive: true });

function transcribeLocalAudio(audioPath, modelSize = 'small', io) {
    return new Promise((resolve, reject) => {
        const proc = spawn('python3', [TRANSCRIBE_PY, audioPath, modelSize]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => { stdout += d; });
        proc.stderr.on('data', d => {
            const line = d.toString().trim();
            if (line && io) io.emit('editor-log', { type: 'info', message: `🖥️ ${line.replace('[WHISPER] ', '')}` });
            stderr += line;
        });
        proc.on('close', code => {
            if (code === 0 && stdout.trim()) {
                try { resolve(JSON.parse(stdout)); }
                catch { reject(new Error('JSON inválido do Whisper local')); }
            } else {
                try { const p = JSON.parse(stdout); reject(new Error(p.error || stderr)); }
                catch { reject(new Error(stderr || 'Whisper local falhou')); }
            }
        });
    });
}

async function transcribeViaAPI(videoPath, { openaiKey, groqKey }, io) {
    const oaKey = (openaiKey || '').replace(/\s+/g, '');
    const gqKey = (groqKey || '').replace(/\s+/g, '');
    if (!oaKey && !gqKey) return null;

    const useOpenAI = !!oaKey;
    const provider  = useOpenAI ? 'OpenAI Whisper' : 'Groq Whisper';
    const apiUrl    = useOpenAI ? 'https://api.openai.com/v1/audio/transcriptions' : 'https://api.groq.com/openai/v1/audio/transcriptions';
    const apiKey    = useOpenAI ? oaKey : gqKey;
    const modelName = useOpenAI ? 'whisper-1' : 'whisper-large-v3';

    const audioPath = path.join(SUBS_DIR, `editor_audio_${Date.now()}.mp3`);
    try {
        if (io) io.emit('editor-log', { type: 'info', message: `🎙️ Extraindo áudio para ${provider}...` });
        await new Promise((resolve, reject) => {
            const proc = spawn(FFMPEG, ['-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k', '-y', audioPath]);
            let err = '';
            proc.stderr.on('data', d => { err += d; });
            proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg: ' + err.slice(-100))));
        });

        const buf = fs.readFileSync(audioPath);
        try { fs.unlinkSync(audioPath); } catch {}

        const formData = new FormData();
        formData.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
        formData.append('model', modelName);
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        formData.append('timestamp_granularities[]', 'segment');
        formData.append('language', 'pt');

        const resp = await fetch(apiUrl, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: formData });
        const data = await resp.json();
        if (data.error) throw new Error(data.error.message);

        let words = data.words || [];
        const segments = data.segments || [];
        if (!words.length && segments.length) words = segments.flatMap(s => s.words || []);
        if (!words.length && segments.length) {
            words = segments.flatMap(seg => {
                const ws = (seg.text || '').trim().split(/\s+/).filter(Boolean);
                const dur = (seg.end - seg.start) / Math.max(ws.length, 1);
                return ws.map((w, i) => ({ word: w, start: seg.start + i * dur, end: seg.start + (i + 1) * dur }));
            });
        }

        if (io) io.emit('editor-log', { type: 'success', message: `✅ ${provider}: ${words.length} palavras transcritas!` });
        return { text: data.text || '', words, segments };
    } catch (e) {
        try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {}
        if (io) io.emit('editor-log', { type: 'warning', message: `⚠️ ${provider} falhou: ${e.message}` });
        return null;
    }
}

// ── Core: Detect errors in transcript ────────────────────────────────────────
function detectErrors(words, silenceThresh = 1.5, removeFillers = true) {
    const segments   = [];  // { start, end, type: 'keep'|'cut', reason }
    const cutMarkers = [];  // ranges to cut: { start, end, reason }

    if (!words || !words.length) return { segments: [], cutMarkers: [] };

    // 1. Mark filler words
    if (removeFillers) {
        for (const w of words) {
            const clean = w.word.trim().toLowerCase().replace(/[^a-záéíóúâêôãõüç]/gi, '');
            if (FILLERS.has(clean)) {
                cutMarkers.push({ start: w.start, end: w.end, reason: `muleta: "${w.word.trim()}"` });
            }
        }
    }

    // 2. Detect silences between words
    for (let i = 0; i < words.length - 1; i++) {
        const gap = words[i + 1].start - words[i].end;
        if (gap >= silenceThresh) {
            cutMarkers.push({
                start: words[i].end,
                end: words[i + 1].start,
                reason: `silêncio de ${gap.toFixed(2)}s`
            });
        }
    }

    // 3. Detect exact word repetitions (gaguejo/repetição)
    for (let i = 1; i < words.length; i++) {
        const curr = words[i].word.trim().toLowerCase();
        const prev = words[i - 1].word.trim().toLowerCase();
        if (curr === prev && curr.length > 2) {
            // Cut the repeated word
            cutMarkers.push({
                start: words[i - 1].start,
                end: words[i].end,
                reason: `repetição: "${words[i].word.trim()}"`
            });
        }
    }

    // 4. Detect phrase repetitions (if a 3+ word sequence repeats)
    for (let i = 0; i < words.length - 5; i++) {
        const phrase = words.slice(i, i + 3).map(w => w.word.trim().toLowerCase()).join(' ');
        for (let j = i + 3; j < words.length - 2; j++) {
            const cmp = words.slice(j, j + 3).map(w => w.word.trim().toLowerCase()).join(' ');
            if (phrase === cmp) {
                // Cut the first occurrence
                cutMarkers.push({
                    start: words[i].start,
                    end: words[i + 2].end,
                    reason: `repetição de frase: "${phrase}"`
                });
                break;
            }
        }
    }

    // Merge overlapping cut markers
    const sorted = cutMarkers.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const c of sorted) {
        if (merged.length && c.start <= merged[merged.length - 1].end + 0.1) {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, c.end);
            merged[merged.length - 1].reason += ` + ${c.reason}`;
        } else {
            merged.push({ ...c });
        }
    }

    // Build keep segments from the gaps between cut markers
    const totalStart = words[0].start;
    const totalEnd   = words[words.length - 1].end;
    let cursor = totalStart;

    for (const cut of merged) {
        if (cursor < cut.start - 0.05) {
            segments.push({ start: cursor, end: cut.start, type: 'keep' });
        }
        segments.push({ start: cut.start, end: cut.end, type: 'cut', reason: cut.reason });
        cursor = cut.end;
    }
    if (cursor < totalEnd) {
        segments.push({ start: cursor, end: totalEnd, type: 'keep' });
    }

    return { segments, cutMarkers: merged };
}

// ── Generate EDL (CMX3600) ────────────────────────────────────────────────────
function generateEDL(keepSegments, videoName = 'SOURCE') {
    function toEdlTime(sec) {
        const fps = 30;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const f = Math.round((sec % 1) * fps);
        return [h,m,s,f].map(n => String(n).padStart(2,'0')).join(':');
    }

    let edl = `TITLE: ${videoName}\nFCM: NON-DROP FRAME\n\n`;
    let timelinePos = 0;

    keepSegments.forEach((seg, i) => {
        const dur = seg.end - seg.start;
        const srcIn  = toEdlTime(seg.start);
        const srcOut = toEdlTime(seg.end);
        const recIn  = toEdlTime(timelinePos);
        const recOut = toEdlTime(timelinePos + dur);
        edl += `${String(i + 1).padStart(3, '0')}  AX  V  C  ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
        timelinePos += dur;
    });

    return edl;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/editor/upload — upload video
router.post('/upload', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    const info = await getVideoInfo(req.file.path);
    if (!info.hasVideo) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ error: 'Arquivo não possui imagem de vídeo.' });
    }
    res.json({
        success: true,
        path: req.file.path,
        name: req.file.originalname,
        duration: info.duration,
        width: info.width,
        height: info.height
    });
});

// POST /api/editor/analyze — transcribe + detect errors
router.post('/analyze', async (req, res) => {
    const {
        videoPath, videoName,
        silenceThresh = 1.5,
        removeFillers = true,
        openaiKey, groqKey, whisperModel
    } = req.body;

    if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(400).json({ error: 'Arquivo não encontrado.' });
    }

    const io  = req.app.get('io');
    const jid = jobId();
    const info = await getVideoInfo(videoPath);

    db.saveEditJob({
        job_id: jid,
        source_path: videoPath,
        source_name: videoName || path.basename(videoPath),
        duration: info.duration,
        silence_thresh: silenceThresh,
        remove_fillers: removeFillers
    });

    res.json({ success: true, jobId: jid, message: 'Análise iniciada.' });

    // Step 1: Transcribe
    let transcription = null;
    const audioPath = path.join(SUBS_DIR, `editor_audio_${Date.now()}.mp3`);

    // Try local Whisper first
    try {
        const localCheck = await new Promise(resolve => {
            const p = spawn('python3', ['-c', 'import faster_whisper; print("ok")']);
            let o = ''; p.stdout.on('data', d => { o += d; });
            p.on('close', code => resolve(code === 0 && o.includes('ok')));
        });

        if (localCheck) {
            if (io) io.emit('editor-log', { type: 'info', message: `🖥️ Transcrevendo com Whisper local (${whisperModel || 'small'})...` });
            await new Promise((resolve, reject) => {
                const proc = spawn(FFMPEG, ['-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k', '-y', audioPath]);
                let err = ''; proc.stderr.on('data', d => { err += d; });
                proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg: ' + err.slice(-100))));
            });
            transcription = await transcribeLocalAudio(audioPath, whisperModel || 'small', io);
            try { fs.unlinkSync(audioPath); } catch {}
        }
    } catch (e) {
        try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {}
        if (io) io.emit('editor-log', { type: 'warning', message: `⚠️ Whisper local falhou: ${e.message} — tentando API...` });
    }

    // Fallback to API
    if (!transcription) {
        transcription = await transcribeViaAPI(videoPath, { openaiKey, groqKey }, io);
    }

    if (!transcription || !transcription.words?.length) {
        db.updateEditJob(jid, { status: 'error' });
        if (io) io.emit('editor-error', { jobId: jid, error: 'Não foi possível transcrever o vídeo. Instale Whisper Local em ⚙️ Configurações.' });
        return;
    }

    if (io) io.emit('editor-log', { type: 'info', message: `🔍 Detectando erros, silêncios e repetições...` });

    // Step 2: Detect errors
    const { segments } = detectErrors(transcription.words, parseFloat(silenceThresh), removeFillers);

    const keepCount = segments.filter(s => s.type === 'keep').length;
    const cutCount  = segments.filter(s => s.type === 'cut').length;
    const savedTime = segments.filter(s => s.type === 'cut').reduce((acc, s) => acc + (s.end - s.start), 0);

    db.updateEditJob(jid, {
        status: 'done',
        segments_json: JSON.stringify(segments),
        transcript_json: JSON.stringify(transcription.words)
    });

    if (io) {
        io.emit('editor-done', {
            jobId: jid,
            segments,
            words: transcription.words,
            stats: {
                totalWords: transcription.words.length,
                keepSegments: keepCount,
                cutSegments: cutCount,
                savedSeconds: Math.round(savedTime),
                totalDuration: info.duration
            }
        });
        io.emit('editor-log', {
            type: 'success',
            message: `✅ Análise concluída! ${cutCount} erros detectados. Você economiza ${Math.round(savedTime)}s de corte manual.`
        });
    }
});

// POST /api/editor/export — generate clean cuts + EDL + ZIP
router.post('/export', async (req, res) => {
    const { jobId: jid, segments, videoPath, videoName, burnSubtitles = false, subtitleStyle = {} } = req.body;

    if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(400).json({ error: 'Arquivo de vídeo não encontrado.' });
    }

    const io = req.app.get('io');
    const keepSegs = (segments || []).filter(s => s.type === 'keep');

    if (!keepSegs.length) {
        return res.status(400).json({ error: 'Nenhum segmento para exportar.' });
    }

    const exportId  = 'export_' + Date.now();
    const exportDir = path.join(EDITOR_EXPORT_DIR, exportId);
    fs.mkdirSync(exportDir, { recursive: true });

    res.json({ success: true, exportId, message: 'Exportação iniciada...' });
    if (io) io.emit('editor-log', { type: 'info', message: `📦 Gerando ${keepSegs.length} cortes limpos...` });

    // Retrieve transcript words if available for subtitles
    let transcriptWords = [];
    if (jid) {
        const job = db.getEditJob(jid);
        if (job?.transcript_json) {
            try { transcriptWords = JSON.parse(job.transcript_json); } catch {}
        }
    }

    const outputFiles = [];

    for (let i = 0; i < keepSegs.length; i++) {
        const seg = keepSegs[i];
        const filename = `Corte_${String(i + 1).padStart(2, '0')}.mp4`;
        const outPath  = path.join(exportDir, filename);
        const dur      = seg.end - seg.start;

        if (io) io.emit('editor-export-progress', { current: i + 1, total: keepSegs.length, filename });

        try {
            // Burn subtitles if requested
            let assPath = null;
            if (burnSubtitles && transcriptWords.length) {
                const segWords = transcriptWords
                    .filter(w => parseFloat(w.start) >= seg.start - 0.1 && parseFloat(w.end) <= seg.end + 0.1)
                    .map(w => ({ ...w, start: Math.max(0, parseFloat(w.start) - seg.start), end: Math.max(0, parseFloat(w.end) - seg.start) }));

                if (segWords.length > 2) {
                    assPath = path.join(exportDir, `Corte_${String(i + 1).padStart(2, '0')}.ass`);
                    generateSmartCaptions(segWords, assPath, '9:16', subtitleStyle);
                }
            }

            // Build FFmpeg args — use -c copy for instant cut when no subtitles
            let ffArgs;
            if (assPath) {
                ffArgs = [
                    '-ss', String(seg.start),
                    '-i', videoPath,
                    '-t', String(dur),
                    '-vf', `ass=${assPath.replace(/\\/g, '/')}`,
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                    '-c:a', 'aac', '-b:a', '128k',
                    '-y', outPath
                ];
            } else {
                ffArgs = [
                    '-ss', String(seg.start),
                    '-i', videoPath,
                    '-t', String(dur),
                    '-c', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    '-y', outPath
                ];
            }

            await new Promise((resolve, reject) => {
                const proc = spawn(FFMPEG, ffArgs);
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d; });
                proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg: ' + stderr.trim().split('\n').slice(-3).join(' '))));
            });

            // Clean up ass
            if (assPath && fs.existsSync(assPath)) try { fs.unlinkSync(assPath); } catch {}

            outputFiles.push({ filename, path: outPath });
            if (io) io.emit('editor-log', { type: 'success', message: `✅ ${filename} gerado (${dur.toFixed(1)}s)` });
        } catch (e) {
            if (io) io.emit('editor-log', { type: 'error', message: `❌ Erro em ${filename}: ${e.message}` });
        }
    }

    // Generate EDL
    const edlContent = generateEDL(keepSegs, videoName || path.basename(videoPath));
    const edlPath    = path.join(exportDir, 'timeline.edl');
    fs.writeFileSync(edlPath, edlContent, 'utf8');

    // Generate info TXT
    const infoPath = path.join(exportDir, 'LEIA-ME.txt');
    fs.writeFileSync(infoPath, `Pack de Cortes Inteligentes
Gerado em: ${new Date().toLocaleString('pt-BR')}
Vídeo original: ${videoName || path.basename(videoPath)}

Arquivos:
${outputFiles.map((f, i) => `  Corte_${String(i+1).padStart(2,'0')}.mp4`).join('\n')}
  timeline.edl — Abra no Premiere/DaVinci para montar automaticamente

Como usar o .edl:
  Premiere Pro: File > Import > selecione timeline.edl
  DaVinci Resolve: File > Import Timeline > EDL
`, 'utf8');

    // Zip everything
    const zipPath = path.join(EDITOR_EXPORT_DIR, `${exportId}.zip`);
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 0 } }); // level 0 = no compression (faster for video)
        archive.on('error', reject);
        output.on('close', resolve);
        archive.pipe(output);
        archive.directory(exportDir, false);
        archive.finalize();
    });

    // Clean up raw files (keep only zip)
    try {
        outputFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
        try { fs.unlinkSync(edlPath); } catch {}
        try { fs.unlinkSync(infoPath); } catch {}
        try { fs.rmdirSync(exportDir); } catch {}
    } catch {}

    if (io) {
        io.emit('editor-export-ready', {
            exportId,
            downloadUrl: `/api/editor/download/${exportId}`,
            count: outputFiles.length
        });
        io.emit('editor-log', { type: 'success', message: `🎉 Pack pronto! ${outputFiles.length} cortes limpos prontos para baixar.` });
    }
});

// GET /api/editor/download/:exportId
router.get('/download/:exportId', (req, res) => {
    const zipPath = path.join(EDITOR_EXPORT_DIR, `${req.params.exportId}.zip`);
    if (!fs.existsSync(zipPath)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.setHeader('Content-Disposition', 'attachment; filename="Pack_de_Cortes.zip"');
    res.setHeader('Content-Type', 'application/zip');
    fs.createReadStream(zipPath).pipe(res);
});

// GET /api/editor/jobs
router.get('/jobs', (req, res) => {
    try { res.json({ jobs: db.listEditJobs() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/editor/jobs/:jobId
router.delete('/jobs/:jobId', (req, res) => {
    try {
        db.deleteEditJob(req.params.jobId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

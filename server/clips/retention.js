/**
 * retention.js — Motor de Edição de Alta Retenção
 * Jump Cut + Dead Air Removal + Semantic Error Detection
 */

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const FFMPEG = require('ffmpeg-static');

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 1 — Detecção Acústica por Timestamps Whisper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analisa gaps entre palavras e marca silêncios/respirações para remoção.
 * @param {Array} words  — [{word, start, end}]
 * @param {Object} opts
 * @returns {Array} removedSpans — [{from, to, reason}] em segundos do vídeo original
 */
function analyzeAcousticGaps(words, opts = {}) {
  const {
    silenceThreshold  = 0.5,   // gaps > X segundos são silêncios removíveis
    breathThreshold   = 0.18,  // gaps 0.18–silenceThreshold são respirações
    minRemainingGap   = 0.08,  // gap mínimo preservado após remoção (natural)
    removeBreaths     = true,
  } = opts;

  const removedSpans = [];

  for (let i = 0; i < words.length - 1; i++) {
    const gapStart = words[i].end;
    const gapEnd   = words[i + 1].start;
    const gap      = gapEnd - gapStart;

    if (gap >= silenceThreshold) {
      // Silêncio longo: remover mas preservar minRemainingGap
      removedSpans.push({
        from:   gapStart + minRemainingGap,
        to:     gapEnd   - minRemainingGap,
        reason: `silence(${gap.toFixed(2)}s)`,
        type:   'silence',
      });
    } else if (removeBreaths && gap >= breathThreshold && gap < silenceThreshold) {
      // Respiração: remover completamente
      removedSpans.push({
        from:   gapStart,
        to:     gapEnd,
        reason: `breath(${gap.toFixed(2)}s)`,
        type:   'breath',
      });
    }
  }

  // Filtrar spans inválidos (from >= to ou duração < 30ms)
  return removedSpans.filter(s => (s.to - s.from) >= 0.03);
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 2 — Análise Semântica por IA (erros, repetições, rodeios)
// ─────────────────────────────────────────────────────────────────────────────

const RETENTION_SYSTEM_PROMPT = `Você é um editor de vídeo especialista em retenção de audiência.
Sua tarefa: analisar a transcrição e identificar EXATAMENTE quais trechos devem ser REMOVIDOS para criar um vídeo ultra-dinâmico.

REMOVA obrigatoriamente:
1. Gaguejos e travamentos ("eu eu eu fui", "tipo ti- tipo")
2. Falsa partida ("então... na verdade o que eu quero dizer é...")
3. Correções auto-realizadas (versão errada + versão correta → manter só a correta)
4. Repetições da mesma ideia sem novo valor
5. Rodeios e introduções longas ("bom, então, bem, vamos falar sobre...")
6. Palavras de preenchimento excessivas (né, sabe, tipo, então, basicamente)
7. Justificativas desnecessárias que atrasam o ponto principal

NÃO remova:
- Ênfases legítimas (repetição intencional para impacto)
- Pausas dramáticas narrativas
- Transições necessárias para coerência

RETORNE APENAS JSON válido (sem markdown, sem explicação):
{
  "remove": [
    { "from_word": 12, "to_word": 17, "reason": "gaguejo" },
    { "from_word": 45, "to_word": 52, "reason": "repetição" }
  ]
}

Os índices from_word e to_word referem-se à lista de palavras fornecida (0-indexed, inclusivo).`;

async function callAI(prompt, key, model) {
  const cleanKey = (key || '').replace(/\s+/g, '');
  if (!cleanKey) throw new Error('Chave OpenRouter vazia');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      model:      model || 'openai/gpt-4o-mini',
      messages:   [
        { role: 'system', content: RETENTION_SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  2000,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Analisa o transcript em chunks de 400 palavras, detecta erros semânticos.
 * @returns {Array} wordSpansToRemove — [{from_word_abs, to_word_abs, reason}]
 */
async function analyzeSemanticErrors(words, { key, model, io }) {
  if (!key || words.length < 10) return [];

  const CHUNK_SIZE    = 400;
  const OVERLAP       = 40;
  const totalChunks   = Math.ceil(words.length / (CHUNK_SIZE - OVERLAP));
  const allRemovals   = [];

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const startIdx = Math.max(0, chunkIdx * (CHUNK_SIZE - OVERLAP));
    const endIdx   = Math.min(words.length, startIdx + CHUNK_SIZE);
    const chunk    = words.slice(startIdx, endIdx);

    if (io) io.emit('clips-stage', {
      stage: 'retention-ai',
      label: `🤖 IA analisando erros... bloco ${chunkIdx + 1}/${totalChunks}`,
    });

    // Build numbered word list for AI
    const wordList = chunk
      .map((w, i) => `${i}: "${w.word}"`)
      .join(', ');

    const userPrompt = `BLOCO ${chunkIdx + 1}/${totalChunks} — Palavras (índice: texto):\n[${wordList}]\n\nIdentifique SOMENTE os spans claramente problemáticos neste bloco. Retorne o JSON.`;

    try {
      const aiResp  = await callAI(userPrompt, key, model);
      const jsonMatch = aiResp.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      const removals = parsed.remove || [];

      // Convert chunk-relative indices to absolute word indices
      for (const r of removals) {
        const absFrom = startIdx + (r.from_word ?? r.from ?? 0);
        const absTo   = startIdx + (r.to_word   ?? r.to   ?? 0);
        // Skip spans that cross chunk boundaries (will be caught in adjacent chunk with overlap)
        if (absTo >= endIdx - OVERLAP && chunkIdx < totalChunks - 1) continue;
        if (absFrom < words.length && absTo < words.length) {
          allRemovals.push({ from_word: absFrom, to_word: absTo, reason: r.reason || 'semantic' });
        }
      }
    } catch (e) {
      if (io) io.emit('clips-log', { type: 'warning', message: `⚠️ IA chunk ${chunkIdx+1}: ${e.message}` });
    }
  }

  // Dedup & sort
  allRemovals.sort((a, b) => a.from_word - b.from_word);

  // Merge overlapping
  const merged = [];
  for (const r of allRemovals) {
    if (merged.length && r.from_word <= merged[merged.length - 1].to_word + 2) {
      merged[merged.length - 1].to_word = Math.max(merged[merged.length - 1].to_word, r.to_word);
    } else {
      merged.push({ ...r });
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Keep Segments from words + removed spans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte spans de palavras para spans de tempo, combina com gaps acústicos,
 * e retorna a lista final de segmentos a MANTER.
 */
function buildKeepSegments(words, acousticRemovals, semanticWordRemovals, videoDuration) {
  if (!words || words.length === 0) {
    return [{ start: 0, end: videoDuration }];
  }

  // Build a sorted list of time intervals to REMOVE
  const removeIntervals = [...acousticRemovals.map(r => ({ start: r.from, end: r.to }))];

  // Convert word-index removals → time intervals
  for (const sr of semanticWordRemovals) {
    const fromWord = words[Math.max(0, sr.from_word)];
    const toWord   = words[Math.min(words.length - 1, sr.to_word)];
    if (fromWord && toWord) {
      removeIntervals.push({
        start: fromWord.start - 0.02,  // small padding
        end:   toWord.end   + 0.05,
      });
    }
  }

  // Sort and merge remove intervals
  removeIntervals.sort((a, b) => a.start - b.start);
  const mergedRemove = [];
  for (const iv of removeIntervals) {
    if (mergedRemove.length && iv.start <= mergedRemove[mergedRemove.length - 1].end + 0.05) {
      mergedRemove[mergedRemove.length - 1].end = Math.max(mergedRemove[mergedRemove.length - 1].end, iv.end);
    } else {
      mergedRemove.push({ ...iv });
    }
  }

  // Build keep segments as the inverse
  const keepSegments = [];
  let cursor = 0;

  for (const rm of mergedRemove) {
    const segStart = Math.max(0, cursor);
    const segEnd   = Math.min(rm.start, videoDuration);
    if (segEnd - segStart >= 0.1) {
      keepSegments.push({ start: segStart, end: segEnd });
    }
    cursor = rm.end;
  }

  // Final segment to end of video
  if (cursor < videoDuration - 0.1) {
    keepSegments.push({ start: cursor, end: videoDuration });
  }

  return keepSegments.length > 0 ? keepSegments : [{ start: 0, end: videoDuration }];
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 3 — FFmpeg Concat Cirúrgico
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SEGMENTS_PER_PASS = 180; // FFmpeg pipe limit safety

async function concatBatch(inputPath, segments, outputPath, passLabel, io) {
  return new Promise((resolve, reject) => {
    const n = segments.length;
    const fc = [];

    for (let i = 0; i < n; i++) {
      const s = segments[i];
      const dur = s.end - s.start;
      // Audio crossfade: fade out 20ms at end, fade in 20ms at start (except first/last)
      const fadeOut  = i < n - 1 ? `,afade=t=out:st=${(dur - 0.02).toFixed(3)}:d=0.02` : '';
      const fadeIn   = i > 0     ? `,afade=t=in:st=0:d=0.02`                            : '';
      fc.push(`[0:v]trim=start=${s.start.toFixed(4)}:end=${s.end.toFixed(4)},setpts=PTS-STARTPTS[v${i}]`);
      fc.push(`[0:a]atrim=start=${s.start.toFixed(4)}:end=${s.end.toFixed(4)},asetpts=PTS-STARTPTS${fadeIn}${fadeOut}[a${i}]`);
    }

    const inputs = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join('');
    fc.push(`${inputs}concat=n=${n}:v=1:a=1[outv][outa]`);

    if (io) io.emit('clips-log', { type: 'info', message: `✂️ ${passLabel}: ${n} segmentos → FFmpeg...` });

    const proc = spawn(FFMPEG, [
      '-i', inputPath,
      '-filter_complex', fc.join(';'),
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg retention concat failed:\n${stderr.slice(-400)}`));
    });
  });
}

async function buildRetentionVideo(inputPath, keepSegments, outputPath, io) {
  if (keepSegments.length === 0) throw new Error('Nenhum segmento para manter.');

  if (keepSegments.length <= MAX_SEGMENTS_PER_PASS) {
    // Single pass
    if (io) io.emit('clips-stage', { stage: 'retention-cut', label: `✂️ Montando vídeo (${keepSegments.length} cortes)...` });
    await concatBatch(inputPath, keepSegments, outputPath, 'Passe único', io);
  } else {
    // Multi-pass: divide em lotes, concat lotes, concat resultado final
    const tmpDir   = path.dirname(outputPath);
    const batchFiles = [];
    const batches  = [];
    for (let i = 0; i < keepSegments.length; i += MAX_SEGMENTS_PER_PASS) {
      batches.push(keepSegments.slice(i, i + MAX_SEGMENTS_PER_PASS));
    }

    if (io) io.emit('clips-stage', { stage: 'retention-cut', label: `✂️ Montando em ${batches.length} passes...` });

    for (let bi = 0; bi < batches.length; bi++) {
      const batchPath = path.join(tmpDir, `_ret_batch_${bi}_${Date.now()}.mp4`);
      batchFiles.push(batchPath);
      await concatBatch(inputPath, batches[bi], batchPath, `Lote ${bi + 1}/${batches.length}`, io);
    }

    // Final concat of batch files via concat demuxer (much faster than filter_complex)
    const listPath = path.join(tmpDir, `_ret_list_${Date.now()}.txt`);
    fs.writeFileSync(listPath, batchFiles.map(f => `file '${f}'`).join('\n'), 'utf8');

    if (io) io.emit('clips-stage', { stage: 'retention-cut', label: '✂️ Finalizando concat dos lotes...' });

    await new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG, [
        '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c', 'copy', '-movflags', '+faststart',
        '-y', outputPath,
      ]);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d; });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('Concat lotes falhou: ' + stderr.slice(-200))));
    });

    // Cleanup temp files
    batchFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
    try { fs.unlinkSync(listPath); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Remap de Timestamps: original → retention-edited
// ─────────────────────────────────────────────────────────────────────────────

function remapTimestamps(words, keepSegments) {
  // Build cumulative offset map
  let newTime = 0;
  const timeline = keepSegments.map(seg => {
    const entry = { origStart: seg.start, origEnd: seg.end, newStart: newTime };
    newTime += (seg.end - seg.start);
    return entry;
  });

  function origToNew(t) {
    for (const seg of timeline) {
      if (t >= seg.origStart && t <= seg.origEnd) {
        return seg.newStart + (t - seg.origStart);
      }
    }
    return null; // word was removed
  }

  const remapped = [];
  for (const w of words) {
    const newStart = origToNew(w.start);
    const newEnd   = origToNew(w.end);
    if (newStart !== null && newEnd !== null) {
      remapped.push({ word: w.word, start: newStart, end: newEnd });
    }
  }
  return remapped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

function retentionStats(originalDuration, keepSegments) {
  const keptDuration = keepSegments.reduce((acc, s) => acc + (s.end - s.start), 0);
  const removedDuration = originalDuration - keptDuration;
  const removedPct = ((removedDuration / originalDuration) * 100).toFixed(1);
  return {
    originalDuration:  parseFloat(originalDuration.toFixed(1)),
    keptDuration:      parseFloat(keptDuration.toFixed(1)),
    removedDuration:   parseFloat(removedDuration.toFixed(1)),
    removedPercent:    parseFloat(removedPct),
    segmentCount:      keepSegments.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

async function runRetentionPipeline(params) {
  const {
    videoPath,
    words,
    transcript,
    outputPath,
    videoDuration,
    key,
    model,
    io,
    // opts
    silenceThreshold = 0.5,
    breathThreshold  = 0.18,
    removeBreaths    = true,
    removeFillers    = true,
    detectErrors     = true,
    removeRepetitions = true,
  } = params;

  if (io) {
    io.emit('clips-stage', { stage: 'retention', label: '🎬 Retention Edit — Analisando silêncios...' });
    io.emit('clips-log',   { type: 'info', message: '🎬 Iniciando Edição de Alta Retenção...' });
  }

  // ── Camada 1: Gaps acústicos ──────────────────────────────────────────────
  const acousticRemovals = analyzeAcousticGaps(words, {
    silenceThreshold,
    breathThreshold,
    removeBreaths,
  });

  if (io) io.emit('clips-log', {
    type: 'info',
    message: `🔇 Gaps detectados: ${acousticRemovals.filter(r=>r.type==='silence').length} silêncios, ${acousticRemovals.filter(r=>r.type==='breath').length} respirações`,
  });

  // ── Camada 2: Erros semânticos (IA) ──────────────────────────────────────
  let semanticRemovals = [];
  if ((detectErrors || removeRepetitions) && key && words.length > 10) {
    if (io) io.emit('clips-stage', { stage: 'retention-ai', label: '🤖 IA detectando erros e repetições...' });
    semanticRemovals = await analyzeSemanticErrors(words, { key, model, io });
    if (io) io.emit('clips-log', {
      type: 'info',
      message: `🤖 IA: ${semanticRemovals.length} trechos problemáticos identificados`,
    });
  }

  // ── Build keep segments ───────────────────────────────────────────────────
  const keepSegments = buildKeepSegments(words, acousticRemovals, semanticRemovals, videoDuration);
  const stats        = retentionStats(videoDuration, keepSegments);

  if (io) {
    io.emit('clips-log', { type: 'success', message: `✂️ Plano: manter ${keepSegments.length} segmentos — removendo ${stats.removedPercent}% do vídeo (${stats.removedDuration}s)` });
    io.emit('clips-retention-stats', stats);
  }

  // ── Camada 3: FFmpeg concat ───────────────────────────────────────────────
  await buildRetentionVideo(videoPath, keepSegments, outputPath, io);

  // ── Remap timestamps ──────────────────────────────────────────────────────
  const remappedWords = remapTimestamps(words, keepSegments);

  if (io) {
    io.emit('clips-stage', { stage: 'retention-done', label: `✅ Retention Edit concluído! ${stats.removedPercent}% removido` });
    io.emit('clips-log',   { type: 'success', message: `✅ Vídeo editado: ${stats.keptDuration}s (era ${stats.originalDuration}s — ${stats.removedPercent}% menor!)` });
  }

  return {
    editedVideoPath: outputPath,
    keepSegments,
    remappedWords,
    stats,
  };
}

module.exports = {
  runRetentionPipeline,
  analyzeAcousticGaps,
  analyzeSemanticErrors,
  buildKeepSegments,
  buildRetentionVideo,
  remapTimestamps,
  retentionStats,
};

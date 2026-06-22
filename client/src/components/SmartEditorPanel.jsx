import React, { useState, useRef, useCallback, useEffect } from 'react';

const API = 'http://localhost:3000/api/editor';

// ── Icons ─────────────────────────────────────────────────────────────────────
const Ico = {
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  brain:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
  pack:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
  cut:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  play:   <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  check:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>,
  x:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  captions: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 12h4"/><path d="M15 12h2"/><path d="M7 16h2"/><path d="M13 16h4"/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  undo:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>,
  trash:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
};

// ── Format seconds ─────────────────────────────────────────────────────────────
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

// ── Single log line ───────────────────────────────────────────────────────────
function LogLine({ entry }) {
  const colors = { error: '#ff6b6b', success: '#6bffb8', warning: '#ffd93d', info: '#aac8ff' };
  return (
    <div style={{ color: colors[entry.type] || '#aac8ff', fontSize: 12, lineHeight: 1.5 }}>
      {entry.message}
    </div>
  );
}

// ── Segment pill ──────────────────────────────────────────────────────────────
function SegmentPill({ seg, index, onToggle }) {
  const isKeep = seg.type === 'keep';
  const dur = (seg.end - seg.start).toFixed(1);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      borderRadius: 8, marginBottom: 4,
      background: isKeep ? 'rgba(107,255,184,0.07)' : 'rgba(255,107,107,0.07)',
      border: `1px solid ${isKeep ? 'rgba(107,255,184,0.2)' : 'rgba(255,107,107,0.2)'}`,
      transition: 'all 0.2s',
    }}>
      {/* Color indicator */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isKeep ? '#6bffb8' : '#ff6b6b',
        boxShadow: isKeep ? '0 0 6px #6bffb8' : '0 0 6px #ff6b6b',
      }}/>

      {/* Time range */}
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#888', minWidth: 120 }}>
        {fmt(seg.start)} → {fmt(seg.end)} <span style={{ color: '#555' }}>({dur}s)</span>
      </span>

      {/* Label */}
      <span style={{ flex: 1, fontSize: 12, color: isKeep ? '#6bffb8' : '#ff8888' }}>
        {isKeep ? '✅ Manter' : `✂️ Cortar — ${seg.reason || 'marcado para remoção'}`}
      </span>

      {/* Toggle button */}
      <button
        onClick={() => onToggle(index)}
        title={isKeep ? 'Marcar para cortar' : 'Manter este trecho'}
        style={{
          padding: '3px 8px', borderRadius: 5, fontSize: 11, border: 'none', cursor: 'pointer',
          background: isKeep ? 'rgba(255,107,107,0.2)' : 'rgba(107,255,184,0.2)',
          color: isKeep ? '#ff8888' : '#6bffb8',
        }}
      >
        {isKeep ? <>{Ico.x} Cortar</> : <>{Ico.undo} Manter</>}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function SmartEditorPanel({ socket, settings }) {
  const [step, setStep] = useState('idle'); // idle | uploading | analyzing | review | exporting | done
  const [videoFile, setVideoFile] = useState(null);   // { path, name, duration }
  const [logs, setLogs] = useState([]);
  const [segments, setSegments] = useState([]);
  const [stats, setStats] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [exportUrl, setExportUrl] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Config
  const [silenceThresh, setSilenceThresh] = useState(1.5);
  const [removeFillers, setRemoveFillers] = useState(true);
  const [burnSubtitles, setBurnSubtitles] = useState(false);

  const dropRef   = useRef();
  const logsRef   = useRef();
  const fileInput = useRef();

  const addLog = useCallback((entry) => {
    setLogs(prev => [...prev.slice(-200), entry]);
    setTimeout(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, 50);
  }, []);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    const onLog      = (d) => addLog(d);
    const onDone     = (d) => {
      setSegments(d.segments || []);
      setStats(d.stats);
      setJobId(d.jobId);
      setStep('review');
    };
    const onError    = (d) => { addLog({ type: 'error', message: `❌ ${d.error}` }); setStep('idle'); };
    const onProgress = (d) => addLog({ type: 'info', message: `📦 Gerando ${d.current}/${d.total}: ${d.filename}` });
    const onReady    = (d) => { setExportUrl(d.downloadUrl); setStep('done'); };

    socket.on('editor-log', onLog);
    socket.on('editor-done', onDone);
    socket.on('editor-error', onError);
    socket.on('editor-export-progress', onProgress);
    socket.on('editor-export-ready', onReady);

    return () => {
      socket.off('editor-log', onLog);
      socket.off('editor-done', onDone);
      socket.off('editor-error', onError);
      socket.off('editor-export-progress', onProgress);
      socket.off('editor-export-ready', onReady);
    };
  }, [socket, addLog]);

  // Upload video
  const handleFileSelect = useCallback(async (file) => {
    if (!file || !file.type.startsWith('video/')) {
      addLog({ type: 'error', message: '❌ Selecione um arquivo de vídeo.' }); return;
    }
    setStep('uploading');
    setLogs([]);
    setSegments([]);
    setStats(null);
    setExportUrl(null);
    addLog({ type: 'info', message: `📤 Enviando ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)...` });

    const form = new FormData();
    form.append('video', file);

    try {
      const r = await fetch(`${API}/upload`, { method: 'POST', body: form });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setVideoFile({ path: d.path, name: d.name || file.name, duration: d.duration });
      addLog({ type: 'success', message: `✅ Upload concluído! Duração: ${Math.round(d.duration)}s` });
      setStep('ready');
    } catch (e) {
      addLog({ type: 'error', message: `❌ Upload falhou: ${e.message}` });
      setStep('idle');
    }
  }, [addLog]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // Run analysis
  const runAnalysis = useCallback(async () => {
    if (!videoFile) return;
    setStep('analyzing');
    setLogs(prev => [...prev, { type: 'info', message: '─'.repeat(40) }]);
    addLog({ type: 'info', message: `🧠 Iniciando análise inteligente...` });

    try {
      await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: videoFile.path,
          videoName: videoFile.name,
          silenceThresh,
          removeFillers,
          openaiKey: settings?.openaiKey,
          groqKey: settings?.groqKey,
          whisperModel: settings?.whisperModel || 'small',
        })
      });
    } catch (e) {
      addLog({ type: 'error', message: `❌ Erro: ${e.message}` });
      setStep('ready');
    }
  }, [videoFile, silenceThresh, removeFillers, settings, addLog]);

  // Toggle segment keep/cut
  const toggleSegment = useCallback((idx) => {
    setSegments(prev => prev.map((s, i) => i === idx
      ? { ...s, type: s.type === 'keep' ? 'cut' : 'keep', reason: s.type === 'keep' ? 'marcado manualmente' : undefined }
      : s
    ));
  }, []);

  // Export pack
  const exportPack = useCallback(async () => {
    setStep('exporting');
    addLog({ type: 'info', message: '─'.repeat(40) });
    addLog({ type: 'info', message: '📦 Iniciando exportação do pack...' });
    try {
      await fetch(`${API}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          segments,
          videoPath: videoFile.path,
          videoName: videoFile.name,
          burnSubtitles,
          subtitleStyle: settings?.subtitleStyle || {}
        })
      });
    } catch (e) {
      addLog({ type: 'error', message: `❌ Erro: ${e.message}` });
      setStep('review');
    }
  }, [jobId, segments, videoFile, burnSubtitles, settings, addLog]);

  const keepSegs = segments.filter(s => s.type === 'keep');
  const cutSegs  = segments.filter(s => s.type === 'cut');
  const savedTime = cutSegs.reduce((acc, s) => acc + (s.end - s.start), 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* ── Upload zone ──────────────────────────────────────────────────────── */}
      {(step === 'idle' || step === 'uploading') && (
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => fileInput.current?.click()}
          style={{
            border: `2px dashed ${isDragOver ? '#a78bfa' : '#3a3a5c'}`,
            borderRadius: 14, padding: 40,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
            cursor: 'pointer', transition: 'all 0.2s',
            background: isDragOver ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.02)',
            minHeight: 180,
          }}
        >
          <div style={{ color: '#a78bfa', opacity: 0.8 }}>{Ico.upload}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>
              {step === 'uploading' ? 'Enviando...' : 'Arraste o vídeo bruto aqui'}
            </div>
            <div style={{ color: '#64748b', fontSize: 13 }}>
              ou clique para selecionar • MP4, MOV, MKV, WebM
            </div>
          </div>
          <input ref={fileInput} type="file" accept="video/*" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); }} />
        </div>
      )}

      {/* ── Video loaded — config + analyze ──────────────────────────────────── */}
      {(step === 'ready' || step === 'analyzing') && videoFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Video info */}
          <div style={{
            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
            borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10
          }}>
            <div style={{ color: '#a78bfa' }}>{Ico.cut}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{videoFile.name}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{Math.round(videoFile.duration)}s de vídeo bruto</div>
            </div>
            <button
              onClick={() => { setStep('idle'); setVideoFile(null); setLogs([]); }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
            >{Ico.x}</button>
          </div>

          {/* Config */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12
          }}>
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              ⚙️ Configurações
            </div>

            {/* Silence slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ color: '#c8d3e0', fontSize: 13, minWidth: 180 }}>
                ✂️ Cortar silêncios acima de
              </label>
              <input type="range" min="0.5" max="3" step="0.1" value={silenceThresh}
                onChange={e => setSilenceThresh(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#a78bfa' }} />
              <span style={{ color: '#a78bfa', fontWeight: 700, minWidth: 40, textAlign: 'right' }}>
                {silenceThresh.toFixed(1)}s
              </span>
            </div>

            {/* Remove fillers */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div onClick={() => setRemoveFillers(v => !v)} style={{
                width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
                background: removeFillers ? '#a78bfa' : '#334155', cursor: 'pointer', flexShrink: 0
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: removeFillers ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s'
                }}/>
              </div>
              <span style={{ color: '#c8d3e0', fontSize: 13 }}>
                Remover muletas das legendas <span style={{ color: '#64748b' }}>(tipo, ahn, né, sabe...)</span>
              </span>
            </label>

            {/* Burn subtitles */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div onClick={() => setBurnSubtitles(v => !v)} style={{
                width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
                background: burnSubtitles ? '#6bffb8' : '#334155', cursor: 'pointer', flexShrink: 0
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: burnSubtitles ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s'
                }}/>
              </div>
              <span style={{ color: '#c8d3e0', fontSize: 13 }}>
                Queimar legendas inteligentes nos cortes
              </span>
            </label>
          </div>

          {/* Analyze button */}
          <button
            onClick={runAnalysis}
            disabled={step === 'analyzing'}
            id="smart-editor-analyze-btn"
            style={{
              padding: '12px 20px', borderRadius: 10, border: 'none', cursor: step === 'analyzing' ? 'not-allowed' : 'pointer',
              background: step === 'analyzing' ? 'rgba(167,139,250,0.3)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: '#fff', fontWeight: 700, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: step === 'analyzing' ? 0.7 : 1, transition: 'all 0.2s',
            }}
          >
            {step === 'analyzing'
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> Analisando...</>
              : <>{Ico.brain} Analisar Vídeo com IA</>
            }
          </button>
        </div>
      )}

      {/* ── Review segments ───────────────────────────────────────────────────── */}
      {(step === 'review' || step === 'exporting' || step === 'done') && segments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Stats bar */}
          {stats && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8
            }}>
              {[
                { label: 'Trechos limpos', value: keepSegs.length, color: '#6bffb8' },
                { label: 'Erros detectados', value: cutSegs.length, color: '#ff6b6b' },
                { label: 'Tempo economizado', value: `${Math.round(savedTime)}s`, color: '#ffd93d' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '10px 14px', textAlign: 'center'
                }}>
                  <div style={{ color, fontWeight: 700, fontSize: 20 }}>{value}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Segment list */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: 12
          }}>
            <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              🎬 Segmentos — clique para inverter decisão
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {segments.map((seg, i) => (
                <SegmentPill key={i} seg={seg} index={i} onToggle={toggleSegment} />
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {(step === 'review') && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={runAnalysis}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer', fontSize: 13
                }}
              >
                🔄 Reanalisar
              </button>
              <button
                onClick={exportPack}
                id="smart-editor-export-btn"
                style={{
                  flex: 2, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #059669, #6bffb8)',
                  color: '#0f1117', fontWeight: 700, fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {Ico.pack} Exportar Pack ({keepSegs.length} cortes)
              </button>
            </div>
          )}

          {step === 'exporting' && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, background: 'rgba(107,255,184,0.08)',
              border: '1px solid rgba(107,255,184,0.2)', color: '#6bffb8',
              display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
              Gerando cortes limpos... aguarde
            </div>
          )}

          {step === 'done' && exportUrl && (
            <a
              href={`http://localhost:3000${exportUrl}`}
              download="Pack_de_Cortes.zip"
              id="smart-editor-download-btn"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '14px 20px', borderRadius: 10, textDecoration: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                color: '#fff', fontWeight: 700, fontSize: 16,
                boxShadow: '0 0 30px rgba(167,139,250,0.3)',
                animation: 'pulse-glow 2s ease-in-out infinite alternate',
              }}
            >
              {Ico.download} Baixar Pack de Cortes (.zip)
            </a>
          )}
        </div>
      )}

      {/* ── Logs ─────────────────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: 12, maxHeight: 180, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 1,
        }} ref={logsRef}>
          {logs.map((l, i) => <LogLine key={i} entry={l} />)}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-glow {
          from { box-shadow: 0 0 20px rgba(167,139,250,0.3); }
          to   { box-shadow: 0 0 40px rgba(167,139,250,0.7); }
        }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import WebcamMaskEditor from './WebcamMaskEditor';
import SmartEditorPanel from './SmartEditorPanel';
import SubtitleStyleEditor from './SubtitleStyleEditor';

const API = 'http://localhost:3000/api/clips';

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  scissors: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#FF0000">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  ),
  sparkles: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
      <path d="M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75z"/>
    </svg>
  ),
  webcam: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  captions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M7 12h4"/><path d="M15 12h2"/><path d="M7 16h2"/><path d="M13 16h4"/>
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
};

// ── Progress Ring ─────────────────────────────────────────────────────────────
function ProgressRing({ percent, size = 36, stroke = 3, color = '#a855f7' }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}/>
    </svg>
  );
}

// ── Score Badge ───────────────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const color = score >= 90 ? '#22c55e' : score >= 75 ? '#f59e0b' : '#94a3b8';
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
      ⚡{score}
    </span>
  );
}

// ── Rank Medal ───────────────────────────────────────────────────────────────────────
function RankMedal({ rank }) {
  if (rank === 1) return <span className="text-[11px]">🥇</span>;
  if (rank === 2) return <span className="text-[11px]">🥈</span>;
  if (rank === 3) return <span className="text-[11px]">🥉</span>;
  return null;
}



// ── Clip Card ──────────────────────────────────────────────────────────────────────
function ClipCard({ clip, rank, selected, onPlay, onApprove, onDelete }) {
  const isProcessing = clip.status === 'processing';
  const isDone = clip.status === 'done';
  const isError = clip.status === 'error';
  const isApproved = clip.approved === 1;

  return (
    <div
      onClick={() => isDone && onPlay(clip)}
      className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 group border ${
        selected ? 'border-purple-500 shadow-lg shadow-purple-500/20' :
        isError ? 'border-red-500/20' :
        'border-white/[0.06] hover:border-white/20'
      }`}
      style={{ background: 'rgba(10,16,30,0.9)' }}
    >
      {/* Thumbnail */}
      <div className="relative w-full bg-slate-900" style={{ aspectRatio: '9/16' }}>
        {clip.thumbnailUrl ? (
          <img src={`http://localhost:3000${clip.thumbnailUrl}`} alt="" className="w-full h-full object-cover"
            onError={e => { e.target.style.display='none'; }}/>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-8 h-8 text-slate-700">
              <rect x="2" y="2" width="20" height="20" rx="3"/><polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
          </div>
        )}
        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
            <ProgressRing percent={clip._progress || 35} size={40} color="#a855f7"/>
            <span className="text-xs text-purple-300 font-medium">Processando...</span>
          </div>
        )}
        {/* Error overlay */}
        {isError && (
          <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
        )}
        {/* Play button overlay */}
        {isDone && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
              {Icon.play}
            </div>
          </div>
        )}
        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-1 flex-col">
          {isApproved && <span className="text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">✓ Aprovado</span>}
          {isError && <span className="text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">✗ Erro</span>}
        </div>
        {/* Rank medal */}
        {rank && isDone && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
            <RankMedal rank={rank} />
          </div>
        )}
        {/* Score (only when no rank shown) */}
        {!rank && clip.score > 0 && (
          <div className="absolute top-2 right-2"><ScoreBadge score={clip.score}/></div>
        )}
        {clip.duration > 0 && (
          <div className="absolute bottom-2 right-2 text-[10px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
            {Math.round(clip.duration)}s
          </div>
        )}
        {/* Score bar at bottom */}
        {clip.score > 0 && isDone && (
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="h-full rounded-b" style={{
              width: `${clip.score}%`,
              background: clip.score >= 90 ? '#22c55e' : clip.score >= 75 ? '#f59e0b' : '#94a3b8',
              transition: 'width 0.6s ease'
            }}/>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-bold text-white leading-tight line-clamp-2">
          {clip.title || `Clip ${(clip.index ?? 0) + 1}`}
        </p>
        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{clip.caption}</p>

        {/* Actions — only show for done clips */}
        {isDone && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              onClick={e => { e.stopPropagation(); onApprove(clip); }}
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold transition-all ${
                isApproved
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 border border-white/5'
              }`}
            >
              {Icon.check} {isApproved ? 'Aprovado' : 'Aprovar'}
            </button>
            <a
              href={`${API}/download/${clip.id}`}
              download
              onClick={e => e.stopPropagation()}
              title="Baixar clip"
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400 border border-white/5 transition-all"
            >
              {Icon.download}
            </a>
            <button
              onClick={e => { e.stopPropagation(); if (window.confirm('Deletar este clip?')) onDelete(clip.id); }}
              title="Deletar clip"
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 border border-white/5 transition-all"
            >
              {Icon.trash}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick Prompt Chips ───────────────────────────────────────────────────────────
const PROMPT_CHIPS = [
  { icon: '💥', label: 'Momentos de impacto', text: 'Momentos mais impactantes e poderosos do vídeo' },
  { icon: '💡', label: 'Dicas práticas', text: 'Dicas práticas e acionáveis que o espectador pode aplicar' },
  { icon: '😂', label: 'Partes engraçadas', text: 'Momentos engraçados, humor e reações genuínas' },
  { icon: '🎯', label: 'Frases virais', text: 'Frases marcantes e citáveis que podem viralizar' },
  { icon: '❓', label: 'Perguntas e respostas', text: 'Perguntas feitas e respostas mais relevantes' },
  { icon: '📊', label: 'Dados e stats', text: 'Estatísticas, números e fatos surpreendentes' },
];

// ── Subtitle Quick Presets ─────────────────────────────────────────────────────
const SUBTITLE_QUICK_PRESETS = [
  { name: '🔥 Viral', style: { position: 'middle-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#FFE000', outlineColor: '#000000', bold: true, bicolor: false, fadeIn: true, fontName: 'arial-black' } },
  { name: '🥩 Bicolor', style: { position: 'middle-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#FFE000', biColor: '#FF6B6B', outlineColor: '#000000', bold: true, bicolor: true, fadeIn: true, fontName: 'arial-black' } },
  { name: '🔥 Fire', style: { position: 'middle-center', fontSize: 'large', textColor: '#FFD700', highlightColor: '#FF4500', outlineColor: '#4a0000', bold: true, bicolor: false, fadeIn: true, fontName: 'impact' } },
  { name: '🩶 Ice', style: { position: 'bottom-center', fontSize: 'large', textColor: '#E0F7FF', highlightColor: '#00FFFF', outlineColor: '#001a3a', bold: true, bicolor: false, fadeIn: true, fontName: 'arial-black' } },
  { name: '⚪ Clean', style: { position: 'bottom-center', fontSize: 'medium', textColor: '#FFFFFF', highlightColor: '#FFFFFF', outlineColor: '#000000', bold: false, bicolor: false, fadeIn: false, fontName: 'arial-black' } },
];

// ── Main Panel ─────────────────────────────────────────────────────────────────
export default function VideoClipsPanel({ socket }) {
  // ── addLog MUST be declared first so all handlers can use it ──────────────
  const [logs, setLogs] = useState([]);
  const addLog = useCallback((entry) => {
    setLogs(p => [...p.slice(-300), { timestamp: new Date().toISOString(), ...entry }]);
  }, []);

  // Panel mode
  const [panelMode, setPanelMode] = useState('clips');
  // Generation stage indicator
  const [genStage, setGenStage] = useState(null); // { stage, label }
  // Sort by score
  const [sortByScore, setSortByScore] = useState(false);

  // Smart processing options
  const [snapWords, setSnapWords]         = useState(true);
  const [removeFillers, setRemoveFillers] = useState(true);
  const [advancedEditing, setAdvancedEditing] = useState(false); // AI stitches multiple segments

  // Retention Editing
  const [retentionEdit, setRetentionEdit] = useState(false);
  const [retentionSilenceThreshold, setRetentionSilenceThreshold] = useState(0.4);
  const [retentionRemoveBreaths, setRetentionRemoveBreaths] = useState(true);
  const [retentionDetectErrors, setRetentionDetectErrors] = useState(true);

  // Subtitle style
  const [subtitleStyle, setSubtitleStyle] = useState({
    position: 'middle-center', fontSize: 'large',
    textColor: '#FFFFFF', highlightColor: '#FFE000', outlineColor: '#000000',
    bold: true, boxBackground: false, boxOpacity: 0.7
  });
  const [showSubtitleEditor, setShowSubtitleEditor] = useState(false);

  // Source
  const [sourceMode, setSourceMode] = useState('upload'); // 'upload' | 'youtube'
  const [ytUrl, setYtUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null); // { path, originalName, duration, width, height, url? }
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ytProgress, setYtProgress] = useState(0);
  const [isDownloadingYt, setIsDownloadingYt] = useState(false);
  const fileRef = useRef();

  // Config
  const [prompt, setPrompt] = useState('');
  const [clipDuration, setClipDuration] = useState(30);
  const [clipCount, setClipCount] = useState(5);
  const [style, setStyle] = useState('viral');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [webcamMode, setWebcamMode] = useState('auto'); // 'auto' | 'manual' | 'none'
  const [webcamPosition, setWebcamPosition] = useState('bottom-right');
  const [detectedWebcam, setDetectedWebcam] = useState(null);
  const [isDetectingWebcam, setIsDetectingWebcam] = useState(false);
  const [showMaskEditor, setShowMaskEditor] = useState(false);

  // Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, title: '' });

  // Clips
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [editingClip, setEditingClip] = useState(null);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const logsRef = useRef();

  // Read keys fresh on every render (they might change via settings modal)
  const openRouterKey = (localStorage.getItem('openRouterKey') || '').trim();
  const openRouterModel = (localStorage.getItem('openRouterModel') || 'openai/gpt-4o-mini').trim();
  const openaiKey = (localStorage.getItem('openaiKey') || '').trim();
  const groqKey = (localStorage.getItem('groqKey') || '').trim();
  const huggingKey = (localStorage.getItem('huggingKey') || '').trim();
  const whisperModel = (localStorage.getItem('whisperModel') || 'small').trim();

  // ── Socket listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('clips-log', (entry) => addLog(entry));

    socket.on('clips-yt-progress', ({ percent }) => setYtProgress(percent));

    socket.on('clips-yt-done', (data) => {
      setIsDownloadingYt(false);
      setYtProgress(0);
      setVideoFile({
        path: data.path,
        originalName: data.title || 'YouTube Video',
        duration: data.duration,
        width: data.width,
        height: data.height,
        url: data.url,   // marks it as a YT file
        source: 'youtube',
      });
      addLog({ type: 'success', message: `✅ YouTube baixado: ${data.title} (${Math.round(data.duration)}s)` });
    });

    socket.on('clips-yt-error', ({ error }) => {
      setIsDownloadingYt(false);
      setYtProgress(0);
      addLog({ type: 'error', message: '❌ ' + error });
    });

    socket.on('clips-progress', ({ current, total, title }) => {
      setGenProgress({ current, total, title });
    });

    socket.on('clips-stage', ({ stage, label }) => {
      setGenStage({ stage, label });
      // Clear stage after job is done
      if (stage === 'done') setTimeout(() => setGenStage(null), 3000);
    });

    socket.on('clips-clip-done', (clipData) => {
      const newClip = {
        id: clipData.clipId,
        title: clipData.title,
        caption: clipData.caption,
        hook: clipData.hook,
        score: clipData.score,
        whyViral: clipData.whyViral,
        outputUrl: clipData.outputUrl,
        thumbnailUrl: clipData.thumbnailUrl,
        startSec: clipData.startSec,
        endSec: clipData.endSec,
        duration: clipData.duration,
        status: 'done',
        approved: 0,
        index: clipData.index,
      };
      setClips(prev => {
        const exists = prev.find(c => c.id === clipData.clipId);
        if (exists) return prev.map(c => c.id === clipData.clipId ? newClip : c);
        return [...prev, newClip];
      });
      // Also update selectedClip if it's this clip
      setSelectedClip(prev => prev?.id === clipData.clipId ? newClip : prev);
    });

    socket.on('clips-job-done', () => {
      setIsGenerating(false);
      setGenProgress({ current: 0, total: 0, title: '' });
    });

    return () => {
      ['clips-log','clips-yt-progress','clips-yt-done','clips-yt-error','clips-progress','clips-stage','clips-clip-done','clips-job-done']
        .forEach(e => socket.off(e));
    };
  }, [socket, addLog]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Upload file ────────────────────────────────────────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return;

    // Validate it's a video
    if (!file.type.startsWith('video/')) {
      addLog({ type: 'error', message: '❌ Selecione um arquivo de vídeo (MP4, MOV, AVI...)' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    const form = new FormData();
    form.append('video', file);
    addLog({ type: 'info', message: `📤 Enviando "${file.name}" (${(file.size / 1024 / 1024).toFixed(0)}MB)...` });

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };

      const data = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('Resposta inválida do servidor')); }
        };
        xhr.onerror = () => reject(new Error('Erro de rede'));
        xhr.open('POST', `${API}/upload`);
        xhr.send(form);
      });

      if (data.success) {
        setVideoFile({
          path: data.path,
          originalName: data.originalName,
          duration: data.duration,
          width: data.width,
          height: data.height,
          source: 'upload',
        });
        addLog({ type: 'success', message: `✅ Upload concluído: "${data.originalName}" (${Math.round(data.duration)}s · ${data.width}×${data.height})` });
        if (webcamMode === 'auto') detectWebcam(data.path);
      } else {
        addLog({ type: 'error', message: '❌ Erro no upload: ' + (data.error || 'desconhecido') });
      }
    } catch (e) {
      addLog({ type: 'error', message: '❌ ' + e.message });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset input so same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ── YouTube download ────────────────────────────────────────────────────────
  const handleYouTubeDownload = async () => {
    const url = ytUrl.trim();
    if (!url) return;
    if (!url.includes('youtube') && !url.includes('youtu.be') && !url.includes('tiktok') && !url.includes('instagram') && !url.includes('vimeo')) {
      addLog({ type: 'error', message: '❌ URL não reconhecida. Suporte: YouTube, TikTok, Vimeo, Instagram.' });
      return;
    }
    setIsDownloadingYt(true);
    setYtProgress(0);
    addLog({ type: 'info', message: `🎬 Baixando: ${url}` });
    try {
      const res = await fetch(`${API}/download-yt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!data.success) {
        setIsDownloadingYt(false);
        addLog({ type: 'error', message: '❌ ' + (data.error || 'Falha ao iniciar download') });
      }
      // If success, we wait for socket 'clips-yt-done' to update state
    } catch (e) {
      setIsDownloadingYt(false);
      addLog({ type: 'error', message: '❌ Erro de rede: ' + e.message });
    }
  };

  // ── Detect webcam ──────────────────────────────────────────────────────────
  const detectWebcam = async (videoPath) => {
    if (!openRouterKey || !videoPath) return;
    setIsDetectingWebcam(true);
    addLog({ type: 'info', message: '🎥 Analisando vídeo com GPT-4o Vision (4 frames)...' });
    try {
      const res = await fetch(`${API}/webcam-detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath, key: openRouterKey, model: 'openai/gpt-4o' })
      });
      const data = await res.json();
      setDetectedWebcam(data);
      if (data.hasFace) {
        addLog({ type: 'success', message: `🎥 Rosto detectado: ${data.position} (confiança: ${data.confidence}%) — ${data.description || ''}` });
      } else {
        addLog({ type: 'warning', message: '📷 Nenhum rosto detectado nos frames analisados. Tente o modo Manual se tiver webcam.' });
      }
    } catch (e) {
      addLog({ type: 'warning', message: '⚠️ Detecção de webcam falhou: ' + e.message });
      setDetectedWebcam(null);
    }
    setIsDetectingWebcam(false);
  };


  // ── Get effective webcam config ────────────────────────────────────────────
  const getWebcamConfig = () => {
    if (webcamMode === 'none') return null;
    if (webcamMode === 'manual') return { position: webcamPosition };
    if (webcamMode === 'auto' && detectedWebcam?.hasFace) {
      return {
        position: detectedWebcam.position,
        relX: detectedWebcam.relX,
        relY: detectedWebcam.relY,
        relW: detectedWebcam.relW,
        relH: detectedWebcam.relH,
      };
    }
    return null;
  };

  // ── Generate clips ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!videoFile) {
      addLog({ type: 'error', message: '❌ Selecione ou baixe um vídeo primeiro.' });
      return;
    }
    if (!openRouterKey) {
      addLog({ type: 'error', message: '❌ Configure a chave OpenRouter em ⚙️ Global Settings.' });
      return;
    }

    setIsGenerating(true);
    setGenStage({ stage: 'start', label: 'Iniciando...' });
    setClips([]);
    setSelectedClip(null);
    setEditingClip(null);
    addLog({ type: 'info', message: `🤖 Iniciando: ${clipCount} cortes de ${clipDuration}s do vídeo "${videoFile.originalName}"` });

    try {
      const res = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: videoFile.path,
          videoName: videoFile.originalName,
          videoUrl: videoFile.url || null,
          videoDuration: videoFile.duration,
          prompt,
          clipDuration,
          clipCount,
          style,
          aspectRatio,
          burnSubtitles,
          webcam: getWebcamConfig(),
          whisperModel: whisperModel || 'small',
          openaiKey: openaiKey || null,
          groqKey: groqKey || null,
          huggingKey: huggingKey || null,
          key: openRouterKey,
          model: openRouterModel,
          // Smart processing
          snapWords,
          removeFillers,
          retentionEdit,
          retentionSilenceThreshold,
          retentionRemoveBreaths,
          retentionDetectErrors,
          subtitleStyle: burnSubtitles ? subtitleStyle : undefined,
        })
      });
      const data = await res.json();
      if (!data.success) {
        setIsGenerating(false);
        addLog({ type: 'error', message: '❌ ' + (data.error || 'Falha ao iniciar geração') });
      }
      // Success: isGenerating will be set to false by 'clips-job-done' socket event
    } catch (e) {
      setIsGenerating(false);
      addLog({ type: 'error', message: '❌ Erro de rede: ' + e.message });
    }
  };

  // ── Approve / delete ────────────────────────────────────────────────────────
  const handleApprove = async (clip) => {
    const newApproved = clip.approved === 1 ? 0 : 1;
    try {
      await fetch(`${API}/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: newApproved })
      });
      const updatedClip = { ...clip, approved: newApproved };
      setClips(p => p.map(c => c.id === clip.id ? updatedClip : c));
      setSelectedClip(prev => prev?.id === clip.id ? updatedClip : prev);
    } catch (e) {
      addLog({ type: 'error', message: '❌ Erro ao aprovar: ' + e.message });
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      setClips(p => p.filter(c => c.id !== id));
      if (selectedClip?.id === id) setSelectedClip(null);
    } catch (e) {
      addLog({ type: 'error', message: '❌ Erro ao deletar: ' + e.message });
    }
  };

  const handleApproveAll = async () => {
    const done = clips.filter(c => c.status === 'done' && c.approved === 0);
    if (!done.length) return;
    try {
      await Promise.all(done.map(c => fetch(`${API}/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: 1 })
      })));
      setClips(p => p.map(c => c.status === 'done' ? { ...c, approved: 1 } : c));
      setSelectedClip(prev => prev ? { ...prev, approved: 1 } : null);
      addLog({ type: 'success', message: `✅ ${done.length} clips aprovados.` });
    } catch (e) {
      addLog({ type: 'error', message: '❌ Erro ao aprovar todos: ' + e.message });
    }
  };

  // ── Save edit ────────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editingClip) return;
    try {
      await fetch(`${API}/${editingClip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingClip.title, caption: editingClip.caption })
      });
      const updated = { title: editingClip.title, caption: editingClip.caption };
      setClips(p => p.map(c => c.id === editingClip.id ? { ...c, ...updated } : c));
      setSelectedClip(prev => prev?.id === editingClip.id ? { ...prev, ...updated } : prev);
      setEditingClip(null);
      addLog({ type: 'success', message: `✏️ Clip editado com sucesso.` });
    } catch (e) {
      addLog({ type: 'error', message: '❌ Erro ao salvar edição: ' + e.message });
    }
  };

  // ── Copy caption ─────────────────────────────────────────────────────────
  const copyCaption = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    } catch {}
  };

  const approvedCount = clips.filter(c => c.approved === 1).length;
  const doneCount = clips.filter(c => c.status === 'done').length;
  const hasKey = !!openRouterKey;
  const canGenerate = !!videoFile && hasKey && !isGenerating;

  const settings = {
    openaiKey: (localStorage.getItem('openaiKey') || '').trim(),
    groqKey: (localStorage.getItem('groqKey') || '').trim(),
    whisperModel: (localStorage.getItem('whisperModel') || 'small').trim(),
    subtitleStyle: {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── Mode switcher tabs (clips / editor autônomo) ────────────────── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 16, paddingBottom: 0,
      }}>
        {[
          { id: 'clips', label: '✂️ Gerador de Clips' },
          { id: 'editor', label: '🧠 Gatilho de Edição' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPanelMode(id)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: 'none', borderBottom: panelMode === id ? '2px solid #a78bfa' : '2px solid transparent',
              color: panelMode === id ? '#a78bfa' : '#64748b',
              transition: 'all 0.2s', marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Smart Editor standalone panel ────────────────────────────── */}
      {panelMode === 'editor' && (
        <SmartEditorPanel socket={socket} settings={settings} />
      )}

      {/* ── Clips Generator (original layout) ──────────────────────────────── */}
      {panelMode === 'clips' && (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 h-full min-h-[calc(100vh-120px)]">

      {/* ══ LEFT PANEL — Config ══════════════════════════════════════════════ */}
      <div className="xl:col-span-3 flex flex-col gap-4">

        {/* Source selector */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(10,16,30,0.85)' }}>
          <div className="flex border-b border-white/[0.06]">
            {[['upload','📤 Upload'], ['youtube','▶️ YouTube']].map(([mode, label]) => (
              <button key={mode} onClick={() => setSourceMode(mode)}
                className={`flex-1 py-3 text-xs font-bold transition-all ${sourceMode === mode ? 'text-purple-400 bg-purple-500/10 border-b-2 border-purple-500' : 'text-slate-500 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {sourceMode === 'upload' ? (
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onDragEnter={e => e.preventDefault()}
                onClick={() => !isUploading && fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center transition-all group ${
                  isUploading ? 'border-purple-500/50 cursor-wait' : 'border-white/10 hover:border-purple-500/50 cursor-pointer'
                }`}
              >
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                  {Icon.upload}
                </div>

                {isUploading ? (
                  <div className="space-y-2">
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}/>
                    </div>
                    <p className="text-xs text-purple-400 font-medium">{uploadProgress}% enviando...</p>
                  </div>
                ) : videoFile && videoFile.source === 'upload' ? (
                  <div>
                    <p className="text-sm font-bold text-white truncate">{videoFile.originalName}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {Math.round(videoFile.duration)}s · {videoFile.width}×{videoFile.height}
                    </p>
                    <p className="text-[10px] text-purple-400 mt-2">Clique para trocar</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-300 font-medium">Arraste ou clique para enviar</p>
                    <p className="text-xs text-slate-600 mt-1">MP4, MOV, AVI, MKV — até 2000MB</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept="video/*" className="hidden"
                  onChange={e => { handleFileSelect(e.target.files[0]); }}/>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="url"
                    value={ytUrl}
                    onChange={e => setYtUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !isDownloadingYt && handleYouTubeDownload()}
                    placeholder="https://youtube.com/watch?v=..."
                    disabled={isDownloadingYt}
                    className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-purple-500/50 transition-all disabled:opacity-50"
                  />
                </div>

                {isDownloadingYt ? (
                  <div className="space-y-2">
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500 to-pink-500 rounded-full transition-all" style={{ width: `${ytProgress}%` }}/>
                    </div>
                    <p className="text-xs text-slate-400 text-center">{ytProgress.toFixed(0)}% baixando...</p>
                    <p className="text-[10px] text-slate-600 text-center">Aguarde — isso pode levar alguns minutos</p>
                  </div>
                ) : (
                  <button
                    onClick={handleYouTubeDownload}
                    disabled={!ytUrl.trim()}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                  >
                    {Icon.youtube} Baixar vídeo
                  </button>
                )}

                {/* Show downloaded YT video info */}
                {videoFile?.source === 'youtube' && !isDownloadingYt && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                    <p className="text-xs font-bold text-emerald-400 truncate">✅ {videoFile.originalName}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{Math.round(videoFile.duration)}s · {videoFile.width}×{videoFile.height}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* No key warning */}
          {!hasKey && (
            <div className="mx-4 mb-4 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
              ⚠️ Configure a chave <strong>OpenRouter</strong> em ⚙️ Global Settings para gerar clips.
            </div>
          )}
        </div>

        {/* Webcam Config */}
        <div className="rounded-2xl border border-white/[0.06] p-4 space-y-3" style={{ background: 'rgba(10,16,30,0.85)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-purple-400">{Icon.webcam}</span>
            <span className="text-xs font-bold text-white uppercase tracking-widest">Webcam / Face</span>
          </div>
          <div className="flex gap-1.5">
            {[['auto','🤖 Auto'], ['manual','✋ Manual'], ['none','❌ Sem']].map(([m, l]) => (
              <button key={m} onClick={() => setWebcamMode(m)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${webcamMode === m ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' : 'text-slate-500 border border-white/5 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>

          {webcamMode === 'auto' && (
            <div className="text-xs text-slate-500 bg-slate-900/50 rounded-lg p-3 space-y-1.5">
              {isDetectingWebcam ? (
                <div className="flex items-center gap-2 text-purple-400">
                  <span className="animate-spin inline-block">⟳</span> Analisando frame do vídeo...
                </div>
              ) : detectedWebcam ? (
                detectedWebcam.hasFace ? (
                  <div className="text-emerald-400 space-y-0.5">
                    <p className="font-bold">✅ Webcam detectada!</p>
                    <p>Posição: <span className="text-white font-medium">{detectedWebcam.position}</span></p>
                    <p>Confiança: <span className="text-white font-medium">{detectedWebcam.confidence}%</span></p>
                    {detectedWebcam.description && <p className="text-slate-400 text-[10px] mt-1">{detectedWebcam.description}</p>}
                  </div>
                ) : (
                  <p>📷 Sem webcam detectada — layout padrão será usado.</p>
                )
              ) : videoFile ? (
                <p>Clique em "Detectar" para analisar o vídeo.</p>
              ) : (
                <p>Envie um vídeo primeiro para detectar automaticamente.</p>
              )}
              {videoFile && !isDetectingWebcam && openRouterKey && (
                <button
                  onClick={() => detectWebcam(videoFile.path)}
                  className="text-purple-400 hover:text-purple-300 font-medium transition-colors text-[10px]"
                >
                  🔍 {detectedWebcam ? 'Re-detectar' : 'Detectar agora'}
                </button>
              )}
              {!openRouterKey && (
                <p className="text-amber-400/70 text-[10px]">⚠️ Chave OpenRouter necessária para detecção</p>
              )}
            </div>
          )}

          {webcamMode === 'manual' && (
            <div className="space-y-2">
              <p className="text-[10px] text-slate-500">Posição da webcam no vídeo original:</p>
              
              {!detectedWebcam || !detectedWebcam.relW ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {[['top-left','↖ Sup. Esq.'], ['top-right','↗ Sup. Dir.'], ['bottom-left','↙ Inf. Esq.'], ['bottom-right','↘ Inf. Dir.']].map(([pos, label]) => (
                      <button key={pos} onClick={() => setWebcamPosition(pos)}
                        className={`py-1.5 rounded-lg text-[10px] font-medium transition-all ${webcamPosition === pos ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' : 'text-slate-500 border border-white/5 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
              ) : (
                  <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 mb-2">
                      ✅ Máscara manual configurada.
                  </div>
              )}

              {videoFile && (
                  <button onClick={() => setShowMaskEditor(true)} className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2">
                      🔲 Abrir Prancheta Visual
                  </button>
              )}
            </div>
          )}

          {((webcamMode === 'auto' && detectedWebcam?.hasFace) || webcamMode === 'manual') && (
            <div className="text-[10px] text-slate-400 bg-purple-500/5 border border-purple-500/20 rounded-lg p-2.5">
              <p className="font-bold text-purple-300 mb-1">🎬 Layout inteligente ativado:</p>
              <p>• Tutorial/tela → 63% superior do vídeo</p>
              <p>• Webcam → 37% inferior, reposicionada</p>
              <p>• Legenda → queimada por cima de tudo</p>
            </div>
          )}
        </div>

        {/* Generation Config */}
        <div className="rounded-2xl border border-white/[0.06] p-4 space-y-4 flex-1" style={{ background: 'rgba(10,16,30,0.85)' }}>
          <div className="flex items-center gap-2">
            <span className="text-purple-400">{Icon.sparkles}</span>
            <span className="text-xs font-bold text-white uppercase tracking-widest">Configurações de Corte</span>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
              O que cortar? <span className="text-slate-700 normal-case">(opcional)</span>
            </label>
            {/* Quick Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PROMPT_CHIPS.map(chip => (
                <button key={chip.label}
                  onClick={() => setPrompt(chip.text)}
                  title={chip.text}
                  className={`text-[10px] font-medium px-2 py-1 rounded-lg border transition-all ${
                    prompt === chip.text
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-white/4 text-slate-500 border-white/[0.06] hover:text-white hover:border-white/20'
                  }`}
                >
                  {chip.icon} {chip.label}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ex: momentos mais impactantes, falas poderosas, partes engraçadas, dicas práticas..."
              rows={2}
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-purple-500/50 transition-all resize-none"
            />
          </div>

          {/* Clip Duration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Duração por clip</label>
              <span className="text-xs font-bold text-purple-400">{clipDuration}s</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[15, 30, 60, 90].map(d => (
                <button key={d} onClick={() => setClipDuration(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${clipDuration === d ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' : 'bg-white/5 text-slate-400 border border-white/5 hover:text-white'}`}>
                  {d}s
                </button>
              ))}
              <input
                type="number" value={clipDuration} min={5} max={180}
                onChange={e => setClipDuration(Math.max(5, Math.min(180, parseInt(e.target.value) || 30)))}
                className="w-16 bg-slate-900/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50 text-center"
                placeholder="…s"
              />
            </div>
          </div>

          {/* Clip Count */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantidade de clips</label>
              <span className="text-xs font-bold text-purple-400">{clipCount} clips</span>
            </div>
            <input type="range" min={1} max={20} value={clipCount}
              onChange={e => setClipCount(parseInt(e.target.value))}
              className="w-full accent-purple-500"/>
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>1</span><span>20</span></div>
          </div>

          {/* Style */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Estilo de legenda</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[['viral','🔥 Viral TikTok'], ['reels','📸 Reels'], ['shorts','▶️ Shorts'], ['neutro','📄 Neutro']].map(([s, l]) => (
                <button key={s} onClick={() => setStyle(s)}
                  className={`py-2 rounded-lg text-[10px] font-bold transition-all ${style === s ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' : 'text-slate-500 border border-white/5 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Proporção de saída</label>
            <div className="flex gap-1.5">
              {[['9:16','📱 9:16'], ['1:1','⬛ 1:1'], ['16:9','🖥 16:9']].map(([r, l]) => (
                <button key={r} onClick={() => setAspectRatio(r)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${aspectRatio === r ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' : 'text-slate-500 border border-white/5 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Burn Subtitles toggle */}
          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">{Icon.captions} Legendas virais</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Word-by-word queimado no vídeo</p>
              </div>
              <button
                onClick={() => setBurnSubtitles(p => !p)}
                className={`relative w-10 h-5 rounded-full transition-all ${burnSubtitles ? 'bg-purple-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${burnSubtitles ? 'left-5' : 'left-0.5'}`}/>
              </button>
            </div>

          {burnSubtitles && (
            <div className="mt-3">
              {/* Quick subtitle preset chips — always visible */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SUBTITLE_QUICK_PRESETS.map((p, idx) => (
                  <button key={p.name}
                    onClick={() => setSubtitleStyle(p.style)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg border transition-all bg-white/4 text-slate-400 border-white/[0.06] hover:text-white hover:border-purple-500/30 hover:bg-purple-500/10"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {/* Toggle for full editor */}
              <button
                onClick={() => setShowSubtitleEditor(p => !p)}
                className="w-full text-left text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center justify-between gap-2 transition-colors py-1"
              >
                <span>🎨 Personalizar estilo das legendas</span>
                <span style={{ transition: 'transform 0.2s', transform: showSubtitleEditor ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>

              {showSubtitleEditor && (
                <div className="mt-3 rounded-xl border border-purple-500/20 p-3" style={{ background: 'rgba(139,92,246,0.05)' }}>
                  <SubtitleStyleEditor value={subtitleStyle} onChange={setSubtitleStyle} />
                </div>
              )}

              {!showSubtitleEditor && (
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: subtitleStyle.textColor }}/>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: subtitleStyle.highlightColor }}/>
                    <span>{(subtitleStyle.position || 'middle-center').replace('-', ' ')} • {subtitleStyle.fontSize || 'large'}{subtitleStyle.bicolor ? ' • Bicolor' : ''}{subtitleStyle.fadeIn ? ' • Fade' : ''}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          {/* ✨ Smart Processing section */}
          <div className="border-t border-white/5 pt-3 space-y-2.5">
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1.5">
              ✨ Processamento Inteligente
            </p>

            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white flex items-center gap-1.5">
                  <span className="text-emerald-400 font-bold">▶</span> Alta Retenção (Retention Edit)
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Remove espaços mortos, respirações e erros antes de cortar.</p>
              </div>
              <button
                onClick={() => setRetentionEdit(p => !p)}
                className={`relative w-10 h-5 rounded-full transition-all ${retentionEdit ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${retentionEdit ? 'left-5' : 'left-0.5'}`}/>
              </button>
            </div>

            {retentionEdit && (
              <div className="pt-2 border-t border-white/10 space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400">Cortar silêncios acima de:</label>
                    <span className="text-[10px] font-bold text-white">{retentionSilenceThreshold.toFixed(1)}s</span>
                  </div>
                  <input type="range" min="0.2" max="1.5" step="0.1" value={retentionSilenceThreshold} onChange={e => setRetentionSilenceThreshold(Number(e.target.value))} className="w-full accent-emerald-500"/>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300">Remover respirações</span>
                  <input type="checkbox" checked={retentionRemoveBreaths} onChange={e => setRetentionRemoveBreaths(e.target.checked)} className="accent-emerald-500 w-3.5 h-3.5"/>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300">IA corrigir erros/repetições</span>
                  <input type="checkbox" checked={retentionDetectErrors} onChange={e => setRetentionDetectErrors(e.target.checked)} className="accent-emerald-500 w-3.5 h-3.5"/>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2 text-[10px] text-emerald-400">
                  ⚠️ Essa edição será feita no vídeo <b>antes</b> da seleção de clips. Vídeos longos podem demorar de 1 a 2 minutos extras.
                </div>
              </div>
            )}
          </div>

            {/* Snap to word boundaries */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white">🔧 Corte preciso (sem cortar palavras)</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Ajusta cortes para a pausa mais próxima</p>
              </div>
              <button
                onClick={() => setSnapWords(p => !p)}
                className={`relative w-10 h-5 rounded-full transition-all ${snapWords ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${snapWords ? 'left-5' : 'left-0.5'}`}/>
              </button>
            </div>

            {/* Remove fillers */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white">🧹 Remover muletas das legendas</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Oculta: tipo, ahn, né, sabe, ééé...</p>
              </div>
              <button
                onClick={() => setRemoveFillers(p => !p)}
                className={`relative w-10 h-5 rounded-full transition-all ${removeFillers ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${removeFillers ? 'left-5' : 'left-0.5'}`}/>
              </button>
            </div>

            {/* Advanced Editing (Stitching) */}
            <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
              <div>
                <p className="text-xs font-medium text-purple-300 flex items-center gap-1">✂️ Edição Avançada (Stitching)</p>
                <p className="text-[10px] text-slate-500 mt-0.5">IA escolhe tamanho, junta trechos e corta silêncios.</p>
              </div>
              <button
                onClick={() => setAdvancedEditing(p => !p)}
                className={`relative w-10 h-5 rounded-full transition-all ${advancedEditing ? 'bg-purple-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${advancedEditing ? 'left-5' : 'left-0.5'}`}/>
              </button>
            </div>

            {(snapWords || removeFillers || advancedEditing) && (
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5 text-[10px] text-emerald-400 space-y-0.5 mt-2">
                {snapWords && <p>✅ Cortes serão ajustados para pausas naturais da fala</p>}
                {removeFillers && burnSubtitles && <p>✅ Legendas não vão mostrar vícios de linguagem</p>}
                {advancedEditing && <p className="text-purple-300">⚠️ Clipe dinâmico: a IA juntará os melhores trechos, a duração do clipe pode variar.</p>}
              </div>
            )}
          </div>

          {burnSubtitles && !openaiKey && (
            <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
              ⚠️ Sem chave <strong>OpenAI</strong> a legenda usa o texto da IA (não sincroniza com a voz). Configure em ⚙️ Global Settings para precisão máxima.
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            title={!videoFile ? 'Selecione um vídeo primeiro' : !hasKey ? 'Configure a chave OpenRouter' : ''}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white"
            style={{
              background: canGenerate ? 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)' : 'rgba(100,100,100,0.3)',
              boxShadow: canGenerate ? '0 0 30px rgba(168,85,247,0.35)' : 'none',
            }}
          >
            {isGenerating ? (
              <>
                <ProgressRing
                  percent={genProgress.total ? Math.round((genProgress.current / genProgress.total) * 100) : 20}
                  size={20} stroke={2} color="white"
                />
                {genProgress.title ? `Cortando ${genProgress.current + 1}/${genProgress.total}...` : 'Analisando com I.A...'}
              </>
            ) : (
              <>{Icon.scissors} Gerar {clipCount} Cortes com I.A.</>
            )}
          </button>
        </div>
      </div>

      {/* ══ CENTER PANEL — Clips Gallery ════════════════════════════════════ */}
      <div className="xl:col-span-6 flex flex-col gap-4 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between h-8">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white">
              {clips.length > 0 ? `${doneCount} clips gerados` : 'Clips Gerados'}
            </h2>
            {clips.length > 0 && (
              <span className="text-xs text-slate-500">{approvedCount}/{doneCount} aprovados</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Stage indicator */}
            {isGenerating && genStage && (
              <span className="text-[10px] text-purple-300 flex items-center gap-1.5 max-w-[140px] truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse flex-shrink-0"/>
                {genStage.label}
              </span>
            )}
            {doneCount > 1 && (
              <button
                onClick={() => setSortByScore(p => !p)}
                title={sortByScore ? 'Ordenar por chegada' : 'Ordenar por score viral'}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                  sortByScore
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                {sortByScore ? '⚡ Score' : '↕ Score'}
              </button>
            )}
            {doneCount > 0 && (
              <button
                onClick={handleApproveAll}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
              >
                ✓ Aprovar Todos
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        {clips.length === 0 && !isGenerating ? (
          <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] border-dashed"
            style={{ background: 'rgba(10,16,30,0.5)' }}>
            <div className="text-center space-y-3 p-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-500/10 flex items-center justify-center" style={{ fontSize: 28 }}>✂️</div>
              <p className="text-slate-400 font-medium">Nenhum clip ainda</p>
              <p className="text-slate-600 text-sm max-w-xs">
                {!videoFile ? 'Envie um vídeo ou cole uma URL do YouTube.' : 'Configure e clique em "Gerar Cortes" para começar.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {isGenerating && clips.length === 0 && (
              <div className="flex items-center gap-3 p-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 mb-4">
                <ProgressRing
                  percent={genProgress.total ? Math.round((genProgress.current / genProgress.total) * 100) : 15}
                  size={36} color="#a855f7"
                />
                <div>
                  <p className="text-sm font-bold text-white">
                    {genStage?.label || (genProgress.title ? `Cortando: "${genProgress.title.slice(0, 30)}..."` : 'I.A. analisando os melhores momentos...')}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {genProgress.total > 0 ? `${genProgress.current}/${genProgress.total} clips` : 'Aguarde...'}
                  </p>
                </div>
              </div>
            )}
            {(() => {
              // Build scored + ranked list
              const displayClips = sortByScore
                ? [...clips].sort((a, b) => (b.score || 0) - (a.score || 0))
                : clips;
              // Map scores to ranks (among done clips only)
              const doneByScore = [...clips]
                .filter(c => c.status === 'done' && c.score > 0)
                .sort((a, b) => b.score - a.score)
                .map(c => c.id);
              return (
                <div className="grid grid-cols-2 gap-3">
                  {displayClips.map((clip, i) => {
                    const rank = doneByScore.indexOf(clip.id) + 1;
                    return (
                      <ClipCard
                        key={clip.id || i}
                        clip={clip}
                        rank={rank > 0 && rank <= 3 ? rank : null}
                        selected={selectedClip?.id === clip.id}
                        onPlay={setSelectedClip}
                        onApprove={handleApprove}
                        onDelete={handleDelete}
                      />
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ══ RIGHT PANEL — Preview + Logs ════════════════════════════════════ */}
      <div className="xl:col-span-3 flex flex-col gap-4 min-h-0">

        {/* Preview / Editor */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col" style={{ background: 'rgba(10,16,30,0.85)', minHeight: 200 }}>
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-bold text-white">Preview & Edição</span>
            {selectedClip && !editingClip && (
              <button
                onClick={() => setEditingClip({ id: selectedClip.id, title: selectedClip.title, caption: selectedClip.caption })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                title="Editar título e legenda"
              >
                {Icon.edit}
              </button>
            )}
          </div>

          {selectedClip ? (
            <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1">
              {/* Video player */}
              {selectedClip.outputUrl && (
                <div className="rounded-xl overflow-hidden bg-black"
                  style={{
                    aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : '16/9',
                    maxHeight: 280
                  }}>
                  <video
                    key={selectedClip.outputUrl}
                    src={`http://localhost:3000${selectedClip.outputUrl}`}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              {/* Edit form */}
              {editingClip?.id === selectedClip.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Título</label>
                    <input
                      value={editingClip.title}
                      onChange={e => setEditingClip(p => ({ ...p, title: e.target.value }))}
                      className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold focus:outline-none focus:border-purple-500/50 transition-all"
                      placeholder="Título do clip"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Legenda</label>
                    <textarea
                      value={editingClip.caption}
                      onChange={e => setEditingClip(p => ({ ...p, caption: e.target.value }))}
                      rows={4}
                      className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-purple-500/50 transition-all resize-none"
                      placeholder="Legenda para redes sociais"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all">
                      Salvar
                    </button>
                    <button onClick={() => setEditingClip(null)}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 border border-white/5 hover:text-white transition-all">
                      {Icon.x}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white leading-snug">{selectedClip.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {selectedClip.startSec?.toFixed(1)}s → {selectedClip.endSec?.toFixed(1)}s · {Math.round(selectedClip.duration)}s
                      </p>
                    </div>
                    {selectedClip.score > 0 && <ScoreBadge score={selectedClip.score}/>}
                  </div>

                  {/* Caption with copy */}
                  <div className="relative group/caption">
                    <p className="text-xs text-slate-300 leading-relaxed pr-6">{selectedClip.caption}</p>
                    <button
                      onClick={() => copyCaption(selectedClip.caption)}
                      title="Copiar legenda"
                      className="absolute top-0 right-0 p-1 rounded text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover/caption:opacity-100"
                    >
                      {copiedCaption ? '✓' : Icon.copy}
                    </button>
                  </div>

                  {selectedClip.hook && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                      <p className="text-[10px] font-bold text-yellow-400 mb-1">🎯 GANCHO</p>
                      <p className="text-xs text-yellow-200">{selectedClip.hook}</p>
                    </div>
                  )}
                  {selectedClip.whyViral && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2.5">
                      <p className="text-[10px] font-bold text-purple-400 mb-1">🔥 POR QUE VIRAL</p>
                      <p className="text-xs text-purple-200">{selectedClip.whyViral}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(selectedClip)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        selectedClip.approved
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-400 border border-white/5 hover:text-emerald-400 hover:border-emerald-500/20'
                      }`}
                    >
                      {Icon.check} {selectedClip.approved ? 'Aprovado' : 'Aprovar'}
                    </button>
                    <a
                      href={`${API}/download/${selectedClip.id}`}
                      download
                      title="Baixar clip"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/5 text-slate-400 border border-white/5 hover:text-blue-400 hover:border-blue-500/20 transition-all"
                    >
                      {Icon.download}
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <div className="text-4xl mb-3">🎬</div>
                <p className="text-slate-500 text-sm">Clique em um clip para ver o preview</p>
              </div>
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="rounded-2xl border border-white/[0.06] flex flex-col"
          style={{ background: 'rgba(10,16,30,0.85)', minHeight: 180, maxHeight: 260 }}>
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"/>
              Activity Log
            </span>
            <button onClick={() => setLogs([])} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
              Limpar
            </button>
          </div>
          <div ref={logsRef} className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-700 text-center py-4">Aguardando atividade...</p>
            ) : logs.map((log, i) => (
              <div key={i} className={`text-[10px] leading-relaxed font-mono flex gap-1.5 ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-emerald-400' :
                log.type === 'warning' ? 'text-yellow-400' :
                'text-slate-400'
              }`}>
                <span className="text-slate-700 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showMaskEditor && (
        <WebcamMaskEditor 
            videoFile={videoFile}
            initialConfig={detectedWebcam || null}
            onSave={(cfg) => {
                setDetectedWebcam(cfg);
                setWebcamPosition(cfg.position);
                setShowMaskEditor(false);
            }}
            onCancel={() => setShowMaskEditor(false)}
        />
      )}
      </div>
      )}
    </div>
  );
}

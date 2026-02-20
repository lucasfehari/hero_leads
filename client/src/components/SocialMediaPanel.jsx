import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Instagram, Plus, Trash2, RefreshCw, Upload, Calendar, Clock,
    CheckCircle, XCircle, AlertCircle, Send, FileText, Image,
    Video, Tag, Hash, ChevronLeft, ChevronRight, Edit2, X, Wifi, WifiOff, Layers
} from 'lucide-react';
import InstagramCalendar from './InstagramCalendar';

const API = 'http://localhost:3000/api/ig';

// ── Helpers ────────────────────────────────────────────────────────────────
const statusBadge = (status) => {
    const map = {
        scheduled: { color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', label: 'Agendado', Icon: Clock },
        draft: { color: 'bg-slate-500/20 text-slate-300 border border-slate-500/30', label: 'Rascunho', Icon: FileText },
        publishing: { color: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', label: 'Publicando...', Icon: RefreshCw },
        published: { color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', label: 'Publicado', Icon: CheckCircle },
        error: { color: 'bg-red-500/20 text-red-300 border border-red-500/30', label: 'Erro', Icon: XCircle },
    };
    const s = map[status] || map.draft;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
            <s.Icon className="w-3 h-3" />{s.label}
        </span>
    );
};

const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Account Card ───────────────────────────────────────────────────────────
function AccountCard({ account, onLogin, onRemove, onCheckStatus }) {
    const connected = account.status === 'connected';
    const loggingIn = account.status === 'logging_in';
    return (
        <div className="flex items-center justify-between bg-slate-900/60 border border-white/5 rounded-xl p-4 gap-4 hover:border-purple-500/20 transition-all">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${connected ? 'bg-emerald-500/20' : loggingIn ? 'bg-yellow-500/20' : 'bg-slate-700/60'}`}>
                    <Instagram className={`w-5 h-5 ${connected ? 'text-emerald-400' : loggingIn ? 'text-yellow-400' : 'text-slate-500'}`} />
                </div>
                <div className="min-w-0">
                    <p className="text-white font-semibold truncate">{account.name}</p>
                    {account.username && <p className="text-slate-500 text-xs truncate">@{account.username}</p>}
                    <div className="flex items-center gap-1 mt-0.5">
                        {connected
                            ? <><Wifi className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400 text-xs">Conectado</span></>
                            : loggingIn
                                ? <><RefreshCw className="w-3 h-3 text-yellow-400 animate-spin" /><span className="text-yellow-400 text-xs">Aguardando login...</span></>
                                : <><WifiOff className="w-3 h-3 text-slate-500" /><span className="text-slate-500 text-xs">Desconectado</span></>
                        }
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onCheckStatus(account.id)} title="Verificar sessão" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <RefreshCw className="w-4 h-4" />
                </button>
                {!connected && !loggingIn && (
                    <button onClick={() => onLogin(account.id)} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all">
                        Reconectar
                    </button>
                )}
                <button onClick={() => onRemove(account.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// ── Add Account Modal ──────────────────────────────────────────────────────
function AddAccountModal({ onClose, onAdded }) {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const handleAdd = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            const data = await res.json();
            if (data.success) { onAdded(data); onClose(); }
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass-panel rounded-2xl p-8 w-full max-w-md mx-4 space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-white font-bold text-lg">Adicionar Conta Instagram</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-2">
                    <label className="text-slate-400 text-sm font-medium">Nome da conta</label>
                    <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        placeholder="Ex: Loja XPTO, Clínica Y..."
                        className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all" />
                    <p className="text-slate-500 text-xs">Um browser será aberto para você fazer login no Instagram desta conta.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-sm">Cancelar</button>
                    <button onClick={handleAdd} disabled={loading || !name.trim()}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold transition-all disabled:opacity-50 text-sm">
                        {loading ? 'Abrindo browser...' : 'Adicionar & Fazer Login'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Aspect Ratios ──────────────────────────────────────────────────────────
const ASPECT_RATIOS = [
    { id: '1:1', label: 'Quadrado', pb: '100%' },
    { id: '4:5', label: 'Retrato', pb: '125%' },
    { id: '16:9', label: 'Paisagem', pb: '56.25%' },
];

// ── Instagram-style Media Preview Frame ────────────────────────────────────
function MediaPreviewFrame({ mediaItems, aspectRatio, previewIdx, setPreviewIdx }) {
    const ratio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];
    const item = mediaItems[previewIdx];

    return (
        <div className="relative w-full rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/5" style={{ paddingBottom: ratio.pb }}>
            <div className="absolute inset-0 flex items-center justify-center">
                {item ? (
                    item.mediaType === 'video'
                        ? <video src={item.preview} className="w-full h-full object-contain" muted autoPlay loop playsInline />
                        : <img src={item.preview} alt="Preview" className="w-full h-full object-contain" draggable={false} />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-600 select-none">
                        <Image className="w-10 h-10 opacity-20" />
                        <span className="text-xs">Prévia aparece aqui</span>
                    </div>
                )}
            </div>

            {/* Carousel navigation */}
            {mediaItems.length > 1 && (
                <>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {mediaItems.map((_, i) => (
                            <button key={i} onClick={() => setPreviewIdx(i)}
                                className={`rounded-full transition-all ${i === previewIdx ? 'bg-white w-3 h-1.5' : 'bg-white/40 w-1.5 h-1.5'}`} />
                        ))}
                    </div>
                    {previewIdx > 0 && (
                        <button onClick={() => setPreviewIdx(p => p - 1)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 z-10 transition-all backdrop-blur-sm">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                    {previewIdx < mediaItems.length - 1 && (
                        <button onClick={() => setPreviewIdx(p => p + 1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 z-10 transition-all backdrop-blur-sm">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full font-bold backdrop-blur-sm z-10">
                        {previewIdx + 1}/{mediaItems.length}
                    </div>
                </>
            )}

            {/* Uploading overlay */}
            {item?.uploading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 z-10">
                    <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                    <span className="text-white text-xs">Enviando...</span>
                </div>
            )}
        </div>
    );
}

// ── Thumbnail strip (drag to reorder) ─────────────────────────────────────
function MediaStrip({ mediaItems, previewIdx, setPreviewIdx, onReorder, onRemove }) {
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);

    const handleDragEnd = () => {
        if (dragging !== null && dragOver !== null && dragging !== dragOver) {
            const r = [...mediaItems];
            const [m] = r.splice(dragging, 1);
            r.splice(dragOver, 0, m);
            onReorder(r);
            setPreviewIdx(dragOver);
        }
        setDragging(null);
        setDragOver(null);
    };

    return (
        <div className="flex gap-2 flex-wrap">
            {mediaItems.map((item, i) => (
                <div key={i} draggable
                    onDragStart={() => setDragging(i)}
                    onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                    onDragEnd={handleDragEnd}
                    onClick={() => setPreviewIdx(i)}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden shrink-0 transition-all duration-150 border-2
                        ${i === previewIdx ? 'border-purple-500 shadow-lg shadow-purple-500/30' : 'border-transparent hover:border-purple-500/50'}
                        ${dragOver === i && dragging !== i ? 'opacity-40 ring-2 ring-purple-400' : ''}`}
                    style={{ width: 60, height: 60 }}>
                    {item.mediaType === 'video'
                        ? <div className="w-full h-full bg-slate-800 flex items-center justify-center"><Video className="w-4 h-4 text-slate-400" /></div>
                        : <img src={item.preview} alt="" className="w-full h-full object-cover" draggable={false} />
                    }
                    {item.uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                        </div>
                    )}
                    <button onClick={e => { e.stopPropagation(); onRemove(i); }}
                        className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 z-10">
                        <X className="w-2.5 h-2.5" />
                    </button>
                    {i === 0 && mediaItems.length > 1 && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] text-center py-0.5 font-bold">CAPA</div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Post Composer ──────────────────────────────────────────────────────────
const POST_TYPES = [
    { id: 'single', label: 'Foto / Vídeo', Icon: Image },
    { id: 'carousel', label: 'Carrossel', Icon: Layers },
    { id: 'reel', label: 'Reel', Icon: Video },
];

function PostComposer({ accounts, editingPost, onSaved, onCancel }) {
    const [postType, setPostType] = useState(editingPost?.post_type || 'single');
    const [aspectRatio, setAspectRatio] = useState(editingPost?.aspect_ratio || '1:1');
    const [previewIdx, setPreviewIdx] = useState(0);
    const [accountId, setAccountId] = useState(editingPost?.account_id || '');
    const [caption, setCaption] = useState(editingPost?.caption || '');
    const [hashtags, setHashtags] = useState(editingPost?.hashtags || '');
    const [hashtagInput, setHashtagInput] = useState('');
    const [notes, setNotes] = useState(editingPost?.notes || '');
    const [scheduledAt, setScheduledAt] = useState(editingPost?.scheduled_at ? editingPost.scheduled_at.slice(0, 16) : '');
    const [saving, setSaving] = useState(false);
    const fileRef = useRef();

    // Init media items from editing post
    const initMedia = () => {
        try {
            const files = JSON.parse(editingPost?.media_files || '[]');
            if (files.length > 0) return files.map(f => ({
                preview: `${API}/media/${f.filename || f.path?.split(/[/\\]/).pop()}`,
                path: f.path, filename: f.filename, mediaType: f.mediaType || 'image', uploading: false,
            }));
        } catch { }
        if (editingPost?.media_path) return [{
            preview: `${API}/media/${editingPost.media_path.split(/[/\\]/).pop()}`,
            path: editingPost.media_path, mediaType: editingPost.media_type || 'image', uploading: false,
        }];
        return [];
    };
    const [mediaItems, setMediaItems] = useState(initMedia);

    const maxFiles = postType === 'carousel' ? 10 : 1;
    const uploading = mediaItems.some(m => m.uploading);

    const handleFilesSelected = async (fileList) => {
        const toAdd = Array.from(fileList).slice(0, maxFiles - mediaItems.length);
        if (!toAdd.length) return;

        // Instant preview placeholders
        const placeholders = toAdd.map(f => ({
            preview: URL.createObjectURL(f),
            path: null, filename: null,
            mediaType: f.type.startsWith('video') ? 'video' : 'image',
            uploading: true, _file: f,
        }));

        setMediaItems(prev => {
            const next = [...prev, ...placeholders];
            setPreviewIdx(prev.length); // jump to first new
            return next;
        });

        // Upload individually
        for (const file of toAdd) {
            const fd = new FormData();
            fd.append('media', file);
            try {
                const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
                const data = await res.json();
                const up = data.files?.[0];
                if (up) {
                    setMediaItems(prev => prev.map(item =>
                        item._file === file
                            ? { ...item, path: up.path, filename: up.filename, mediaType: up.mediaType, uploading: false, _file: undefined }
                            : item
                    ));
                }
            } catch { setMediaItems(prev => prev.map(item => item._file === file ? { ...item, uploading: false } : item)); }
        }
    };

    const removeMedia = (idx) => {
        setMediaItems(prev => {
            const next = prev.filter((_, i) => i !== idx);
            setPreviewIdx(p => Math.min(p, Math.max(0, next.length - 1)));
            return next;
        });
    };

    const switchType = (type) => {
        setPostType(type);
        if (type !== 'carousel' && mediaItems.length > 1) setMediaItems([mediaItems[0]]);
    };

    const addHashtag = () => {
        const tag = hashtagInput.trim().replace(/^#/, '');
        if (!tag) return;
        const existing = hashtags ? hashtags.split(' ').map(h => h.replace(/^#/, '')) : [];
        if (!existing.includes(tag)) setHashtags([...existing, tag].map(h => `#${h}`).join(' '));
        setHashtagInput('');
    };
    const removeHashtag = (tag) => setHashtags(hashtags.split(' ').filter(h => h !== tag).join(' '));
    const hashtagList = hashtags ? hashtags.split(' ').filter(Boolean) : [];

    const handleSave = async (status) => {
        if (!accountId) return alert('Selecione uma conta.');
        const ready = mediaItems.filter(m => !m.uploading && m.path);
        if (!ready.length) return alert('Adicione pelo menos uma mídia.');
        setSaving(true);
        try {
            const payload = {
                account_id: Number(accountId),
                post_type: postType, aspect_ratio: aspectRatio,
                media_files: ready.map(m => ({ path: m.path, filename: m.filename, mediaType: m.mediaType })),
                caption, hashtags, notes,
                scheduled_at: scheduledAt || null, status,
            };
            const isEdit = !!editingPost;
            const res = await fetch(isEdit ? `${API}/posts/${editingPost.id}` : `${API}/posts`, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) onSaved(data.post);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── LEFT: Preview & Media ── */}
            <div className="space-y-4">
                {/* Post type selector */}
                <div className="flex gap-1 bg-slate-900/60 p-1 rounded-xl border border-white/5">
                    {POST_TYPES.map(({ id, label, Icon }) => (
                        <button key={id} onClick={() => switchType(id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all
                                ${postType === id ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                            <Icon className="w-3.5 h-3.5" />{label}
                        </button>
                    ))}
                </div>

                {/* Preview frame */}
                <MediaPreviewFrame
                    mediaItems={mediaItems}
                    aspectRatio={aspectRatio}
                    previewIdx={previewIdx}
                    setPreviewIdx={setPreviewIdx}
                />

                {/* Aspect ratio buttons */}
                {postType !== 'reel' && (
                    <div className="flex gap-1.5">
                        {ASPECT_RATIOS.map(r => (
                            <button key={r.id} onClick={() => setAspectRatio(r.id)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border
                                    ${aspectRatio === r.id ? 'bg-purple-600 text-white border-purple-500 shadow-sm' : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                {r.label}<br /><span className={`font-normal ${aspectRatio === r.id ? 'opacity-80' : 'opacity-50'}`}>{r.id}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Thumbnail strip */}
                {mediaItems.length > 0 && (
                    <MediaStrip
                        mediaItems={mediaItems}
                        previewIdx={previewIdx}
                        setPreviewIdx={setPreviewIdx}
                        onReorder={setMediaItems}
                        onRemove={removeMedia}
                    />
                )}

                {/* Drop zone */}
                {mediaItems.length < maxFiles && (
                    <div
                        onDrop={e => { e.preventDefault(); handleFilesSelected(e.dataTransfer.files); }}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => fileRef.current.click()}
                        className="border-2 border-dashed border-white/10 rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-slate-500 group">
                        <Upload className="w-6 h-6 group-hover:text-purple-400 transition-colors" />
                        <p className="text-sm font-medium group-hover:text-slate-300 transition-colors text-center">
                            {postType === 'carousel'
                                ? `Arraste ou clique para adicionar (${mediaItems.length}/${maxFiles})`
                                : 'Arraste ou clique para enviar'}
                        </p>
                        <p className="text-xs opacity-50">JPG, PNG, MP4, MOV — até 500MB</p>
                    </div>
                )}
                <input ref={fileRef} type="file" accept="image/*,video/*"
                    multiple={postType === 'carousel'} className="hidden"
                    onChange={e => handleFilesSelected(e.target.files)} />
            </div>

            {/* ── RIGHT: Text fields ── */}
            <div className="space-y-4">
                {/* Account */}
                <div>
                    <label className="text-slate-400 text-sm font-medium block mb-2">Conta Instagram</label>
                    <select value={accountId} onChange={e => setAccountId(e.target.value)}
                        className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none">
                        <option value="">— Selecione uma conta —</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.username ? ` (@${a.username})` : ''}</option>)}
                    </select>
                </div>

                {/* Caption */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-slate-400 text-sm font-medium">Legenda</label>
                        <span className={`text-xs ${caption.length > 2000 ? 'text-red-400' : 'text-slate-600'}`}>{caption.length}/2200</span>
                    </div>
                    <textarea value={caption} onChange={e => setCaption(e.target.value)}
                        placeholder="Escreva sua legenda aqui..." rows={5}
                        className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all resize-none" />
                </div>

                {/* Hashtags */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-slate-400 text-sm font-medium">Hashtags</label>
                        <span className={`text-xs ${hashtagList.length > 28 ? 'text-red-400' : 'text-slate-600'}`}>{hashtagList.length}/30</span>
                    </div>
                    <div className="flex gap-2 mb-2">
                        <input value={hashtagInput} onChange={e => setHashtagInput(e.target.value)}
                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && addHashtag()}
                            placeholder="Digite e pressione Enter ou Espaço"
                            className="flex-1 bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all text-sm" />
                        <button onClick={addHashtag} className="px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/20 transition-all">
                            <Hash className="w-4 h-4" />
                        </button>
                    </div>
                    {hashtagList.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 p-3 bg-slate-900/40 rounded-xl border border-white/5 max-h-32 overflow-y-auto">
                            {hashtagList.map(tag => (
                                <span key={tag} className="inline-flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-full px-2.5 py-0.5 text-xs">
                                    {tag}
                                    <button onClick={() => removeHashtag(tag)} className="hover:text-red-400 transition-colors"><X className="w-2.5 h-2.5" /></button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Notes */}
                <div>
                    <label className="text-slate-400 text-sm font-medium block mb-2">Notas internas</label>
                    <input value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Ex: usar música X no reel, filtro Y (não publicado no IG)"
                        className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all text-sm" />
                </div>

                {/* Scheduled date/time */}
                <div>
                    <label className="text-slate-400 text-sm font-medium block mb-2">Data e Hora do Agendamento</label>
                    <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                        className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all"
                        style={{ colorScheme: 'dark' }} />
                </div>

                {/* Upload progress indicator */}
                {uploading && (
                    <div className="flex items-center gap-2 text-purple-300 text-xs bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Enviando arquivos... aguarde antes de agendar.
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                    {onCancel && (
                        <button onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-sm">
                            Cancelar
                        </button>
                    )}
                    <button onClick={() => handleSave('draft')} disabled={saving || uploading}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        <FileText className="w-4 h-4" />Rascunho
                    </button>
                    <button onClick={() => handleSave('scheduled')} disabled={saving || uploading || !scheduledAt}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        <Send className="w-4 h-4" />Agendar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Post Queue ─────────────────────────────────────────────────────────────
function PostQueue({ posts, onEdit, onDelete, onRefresh }) {
    const [queueTab, setQueueTab] = useState('scheduled');
    const filtered = posts.filter(p => {
        if (queueTab === 'scheduled') return ['scheduled', 'draft', 'publishing'].includes(p.status);
        if (queueTab === 'published') return p.status === 'published';
        if (queueTab === 'error') return p.status === 'error';
        return true;
    });

    const getThumb = (post) => {
        try {
            const files = JSON.parse(post.media_files || '[]');
            if (files.length > 0) {
                const f = files[0];
                return `${API}/media/${f.filename || f.path?.split(/[/\\]/).pop()}`;
            }
        } catch { }
        if (post.media_path) return `${API}/media/${post.media_path.split(/[/\\]/).pop()}`;
        return null;
    };

    const getPostTypeIcon = (post) => {
        if (post.post_type === 'carousel') return <Layers className="w-3 h-3" />;
        if (post.post_type === 'reel' || post.media_type === 'video') return <Video className="w-3 h-3" />;
        return <Image className="w-3 h-3" />;
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex gap-1 bg-slate-900/60 p-1 rounded-xl">
                    {[['scheduled', 'Agendados'], ['published', 'Publicados'], ['error', 'Erros']].map(([val, label]) => (
                        <button key={val} onClick={() => setQueueTab(val)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${queueTab === val ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                            {label}
                            {val === 'error' && posts.filter(p => p.status === 'error').length > 0 && (
                                <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0 text-xs">{posts.filter(p => p.status === 'error').length}</span>
                            )}
                        </button>
                    ))}
                </div>
                <button onClick={onRefresh} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                    <Calendar className="w-12 h-12 opacity-20" />
                    <p className="text-sm">Nenhum post aqui.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(post => {
                        const thumb = getThumb(post);
                        const isCarousel = post.post_type === 'carousel';
                        return (
                            <div key={post.id} className="flex gap-4 bg-slate-900/60 border border-white/5 rounded-xl p-4 hover:border-purple-500/20 transition-all">
                                {/* Thumbnail */}
                                <div className="relative w-16 h-16 rounded-lg bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                    {thumb
                                        ? <img src={thumb} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                                        : <Image className="w-6 h-6 text-slate-600" />
                                    }
                                    {isCarousel && (
                                        <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded p-0.5"><Layers className="w-2.5 h-2.5 text-white" /></div>
                                    )}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="text-white text-sm font-semibold truncate">{post.account_name}</span>
                                        {statusBadge(post.status)}
                                        <span className="text-slate-600 text-xs flex items-center gap-0.5">{getPostTypeIcon(post)}{post.post_type || 'single'}</span>
                                    </div>
                                    <p className="text-slate-400 text-xs truncate">{post.caption || '(sem legenda)'}</p>
                                    {post.scheduled_at && <p className="text-purple-400 text-xs mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(post.scheduled_at)}</p>}
                                    {post.error_msg && <p className="text-red-400 text-xs mt-1 truncate">❌ {post.error_msg}</p>}
                                    {post.published_at && <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Publicado em {fmtDate(post.published_at)}</p>}
                                </div>
                                {/* Actions */}
                                <div className="flex flex-col gap-2 shrink-0">
                                    {post.status !== 'published' && (
                                        <button onClick={() => onEdit(post)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><Edit2 className="w-4 h-4" /></button>
                                    )}
                                    <button onClick={() => onDelete(post.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Main Social Media Panel ────────────────────────────────────────────────
export default function SocialMediaPanel({ socket }) {
    const [tab, setTab] = useState('accounts');
    const [accounts, setAccounts] = useState([]);
    const [posts, setPosts] = useState([]);
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [editingPost, setEditingPost] = useState(null);

    const loadAccounts = useCallback(async () => {
        try { const r = await fetch(`${API}/accounts`); const d = await r.json(); setAccounts(d.accounts || []); } catch { }
    }, []);
    const loadPosts = useCallback(async () => {
        try { const r = await fetch(`${API}/posts`); const d = await r.json(); setPosts(d.posts || []); } catch { }
    }, []);

    useEffect(() => { loadAccounts(); loadPosts(); }, [loadAccounts, loadPosts]);

    useEffect(() => {
        if (!socket) return;
        const onAccStatus = (d) => setAccounts(prev => prev.map(a => a.id === d.id ? { ...a, status: d.status, username: d.username ?? a.username } : a));
        const onPostStatus = (d) => setPosts(prev => prev.map(p => p.id === d.id ? { ...p, status: d.status, error_msg: d.error ?? p.error_msg } : p));
        socket.on('ig-account-status', onAccStatus);
        socket.on('ig-post-status', onPostStatus);
        return () => { socket.off('ig-account-status', onAccStatus); socket.off('ig-post-status', onPostStatus); };
    }, [socket]);

    const handleRemoveAccount = async (id) => {
        if (!confirm('Remover esta conta?')) return;
        await fetch(`${API}/accounts/${id}`, { method: 'DELETE' });
        setAccounts(prev => prev.filter(a => a.id !== id));
    };
    const handleRelogin = async (id) => { await fetch(`${API}/accounts/${id}/login`, { method: 'POST' }); setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'logging_in' } : a)); };
    const handleCheckStatus = async (id) => { const r = await fetch(`${API}/accounts/${id}/status`); const d = await r.json(); setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: d.status } : a)); };
    const handleDeletePost = async (id) => { if (!confirm('Excluir este post?')) return; await fetch(`${API}/posts/${id}`, { method: 'DELETE' }); setPosts(prev => prev.filter(p => p.id !== id)); };

    const handlePostSaved = (post) => {
        setPosts(prev => {
            const idx = prev.findIndex(p => p.id === post.id);
            const withAcc = { ...post, account_name: accounts.find(a => a.id === post.account_id)?.name || '' };
            return idx >= 0 ? prev.map(p => p.id === post.id ? withAcc : p) : [withAcc, ...prev];
        });
        setEditingPost(null);
        setTab('queue');
    };

    const handleReschedule = useCallback(async (postId, newDatetime) => {
        const r = await fetch(`${API}/posts/${postId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduled_at: newDatetime }) });
        const d = await r.json();
        if (d.success) setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_at: d.post.scheduled_at } : p));
    }, []);

    const TABS = [
        { id: 'accounts', label: 'Contas', Icon: Instagram },
        { id: 'compose', label: 'Agendar', Icon: Plus },
        { id: 'queue', label: 'Fila', Icon: Clock },
        { id: 'calendar', label: 'Calendário', Icon: Calendar },
    ];

    const errorCount = posts.filter(p => p.status === 'error').length;

    return (
        <div className="lg:col-span-12 flex flex-col gap-6">
            {showAddAccount && (
                <AddAccountModal onClose={() => setShowAddAccount(false)} onAdded={(account) => setAccounts(prev => [...prev, { ...account, status: 'logging_in' }])} />
            )}

            {/* Tab bar */}
            <div className="glass-panel rounded-2xl p-2 flex items-center gap-2 flex-wrap">
                {TABS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
                            ${tab === id ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        <Icon className="w-4 h-4" />{label}
                        {id === 'queue' && errorCount > 0 && (
                            <span className="bg-red-500 text-white rounded-full px-1.5 py-0 text-xs">{errorCount}</span>
                        )}
                    </button>
                ))}
                <div className="flex-1" />
                {tab === 'accounts' && (
                    <button onClick={() => setShowAddAccount(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/20">
                        <Plus className="w-4 h-4" /> Adicionar Conta
                    </button>
                )}
                {tab === 'compose' && editingPost && (
                    <button onClick={() => { setEditingPost(null); setTab('queue'); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 text-sm transition-all">
                        <X className="w-4 h-4" /> Cancelar edição
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="glass-panel rounded-2xl p-6">
                {/* ACCOUNTS */}
                {tab === 'accounts' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-300 pb-4 border-b border-white/5">
                            <Instagram className="w-5 h-5 text-purple-400" />
                            <h2 className="font-semibold text-lg">Contas Instagram</h2>
                            <span className="ml-auto text-slate-500 text-sm">{accounts.length} conta{accounts.length !== 1 ? 's' : ''}</span>
                        </div>
                        {accounts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4">
                                <Instagram className="w-16 h-16 opacity-10" />
                                <p className="font-medium">Nenhuma conta adicionada</p>
                                <button onClick={() => setShowAddAccount(true)}
                                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm hover:from-purple-500 hover:to-pink-500 transition-all">
                                    <Plus className="w-4 h-4 inline mr-2" />Adicionar primeira conta
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {accounts.map(a => (
                                    <AccountCard key={a.id} account={a} onLogin={handleRelogin} onRemove={handleRemoveAccount} onCheckStatus={handleCheckStatus} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* COMPOSE */}
                {tab === 'compose' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-300 pb-4 border-b border-white/5">
                            <Plus className="w-5 h-5 text-purple-400" />
                            <h2 className="font-semibold text-lg">{editingPost ? 'Editar Post' : 'Novo Post'}</h2>
                        </div>
                        <PostComposer
                            key={editingPost?.id ?? 'new'}
                            accounts={accounts}
                            editingPost={editingPost}
                            onSaved={handlePostSaved}
                            onCancel={editingPost ? () => { setEditingPost(null); setTab('queue'); } : null}
                        />
                    </div>
                )}

                {/* QUEUE */}
                {tab === 'queue' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-300 pb-4 border-b border-white/5">
                            <Clock className="w-5 h-5 text-purple-400" />
                            <h2 className="font-semibold text-lg">Fila de Postagens</h2>
                        </div>
                        <PostQueue posts={posts} onEdit={(post) => { setEditingPost(post); setTab('compose'); }} onDelete={handleDeletePost} onRefresh={loadPosts} />
                    </div>
                )}

                {/* CALENDAR */}
                {tab === 'calendar' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-300 pb-4 border-b border-white/5">
                            <Calendar className="w-5 h-5 text-purple-400" />
                            <h2 className="font-semibold text-lg">Calendário de Publicações</h2>
                        </div>
                        <InstagramCalendar posts={posts} accounts={accounts} onEdit={(post) => { setEditingPost(post); setTab('compose'); }} onReschedule={handleReschedule} />
                    </div>
                )}
            </div>
        </div>
    );
}

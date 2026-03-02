import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    MessageSquare, Mic, Square, Trash2, Upload, Plus,
    GripVertical, ChevronDown, CheckCircle, X, Play, RefreshCw
} from 'lucide-react';

// ─── Audio Library (server-side saved audios) ────────────────────────────────
const AudioLibraryModal = ({ onSelect, onClose }) => {
    const [audios, setAudios] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/bot/audios')
            .then(r => r.json())
            .then(d => setAudios(d.audios || []))
            .catch(() => setAudios([]))
            .finally(() => setLoading(false));
    }, []);

    const deleteAudio = async (filename) => {
        if (!confirm(`Apagar ${filename}?`)) return;
        await fetch(`http://localhost:3000/api/bot/audios/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        setAudios(prev => prev.filter(a => a.filename !== filename));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h3 className="text-slate-200 font-semibold flex items-center gap-2">
                        <Mic className="w-4 h-4 text-purple-400" /> Biblioteca de Áudios
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading && <p className="text-slate-500 text-sm text-center py-8">Carregando...</p>}
                    {!loading && audios.length === 0 && (
                        <p className="text-slate-500 text-sm text-center py-8">Nenhum áudio salvo ainda.</p>
                    )}
                    {audios.map(a => (
                        <div key={a.filename} className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl border border-slate-700 hover:border-purple-500/40 transition-colors group">
                            <div className="flex-1 min-w-0">
                                <p className="text-slate-300 text-sm font-mono truncate">{a.filename}</p>
                                <p className="text-slate-600 text-xs">{a.size}</p>
                            </div>
                            <audio src={`http://localhost:3000/api/bot/audios/file/${encodeURIComponent(a.filename)}`}
                                controls className="h-7 w-28 shrink-0" />
                            <button onClick={() => onSelect(a)} title="Usar este áudio"
                                className="px-2 py-1.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 rounded-lg text-xs transition-colors shrink-0">
                                Usar
                            </button>
                            <button onClick={() => deleteAudio(a.filename)} title="Apagar"
                                className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg transition-colors shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ─── A single step card ───────────────────────────────────────────────────────
const StepCard = ({ step, index, total, onChange, onRemove, onMoveUp, onMoveDown }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const [showLibrary, setShowLibrary] = useState(false);
    const mediaRecRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const startRec = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecRef.current = mr;
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                onChange({ ...step, audioBlob: blob, audioUrl: URL.createObjectURL(blob), audioFilename: null });
                stream.getTracks().forEach(t => t.stop());
            };
            mr.start();
            setIsRecording(true);
            setRecTime(0);
            timerRef.current = setInterval(() => setRecTime(p => p + 1), 1000);
        } catch { alert('Não foi possível acessar o microfone.'); }
    };

    const stopRec = () => {
        if (mediaRecRef.current && isRecording) {
            mediaRecRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    useEffect(() => () => { clearInterval(timerRef.current); }, []);

    const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const isText = step.type === 'text';
    const isAudio = step.type === 'audio';
    const audioReady = isAudio && (step.audioUrl || step.audioFilename);

    return (
        <div className={`relative flex gap-2 group`}>
            {/* Step number line */}
            <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10
                    ${isText ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400' : 'bg-purple-500/20 border border-purple-500/40 text-purple-400'}`}>
                    {index + 1}
                </div>
                {index < total - 1 && <div className="w-px flex-1 bg-slate-700 mt-1 mb-1" />}
            </div>

            {/* Card */}
            <div className={`flex-1 mb-3 rounded-xl border transition-all
                ${isText ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-800/60 border-purple-500/20'}`}>

                {/* Card header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                        ${isText ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>
                        {isText ? '💬 Texto' : '🎤 Áudio'}
                    </span>

                    {/* Type toggle */}
                    <button onClick={() => onChange({ ...step, type: isText ? 'audio' : 'text', text: '', audioBlob: null, audioUrl: null, audioFilename: null })}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto">
                        Trocar para {isText ? 'Áudio' : 'Texto'}
                    </button>

                    {/* Move up/down */}
                    <button onClick={onMoveUp} disabled={index === 0}
                        className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors rotate-180">
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onMoveDown} disabled={index === total - 1}
                        className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    <button onClick={onRemove} className="text-slate-600 hover:text-red-400 transition-colors ml-1">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Card body */}
                <div className="p-3">
                    {isText && (
                        <div>
                            <textarea
                                value={step.text || ''}
                                onChange={e => onChange({ ...step, text: e.target.value })}
                                rows={3}
                                placeholder="Olá {nome}! | Oi {nome}!    ← use | para variações"
                                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600 resize-none"
                            />
                            <p className="text-xs text-slate-600 mt-1">
                                Use <code className="text-blue-400 bg-blue-500/10 px-1 rounded">|</code> para spintax (variações aleatórias). Ex: <code className="text-slate-400">Olá! | Oi! | E aí!</code>
                            </p>
                        </div>
                    )}

                    {isAudio && (
                        <div className="space-y-2">
                            {/* Current audio status */}
                            {audioReady && (
                                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                    <span className="text-emerald-400 text-xs flex-1 truncate font-mono">
                                        {step.audioFilename || 'Áudio gravado'}
                                    </span>
                                    {step.audioUrl && <audio src={step.audioUrl} controls className="h-7 w-28 shrink-0" />}
                                    <button onClick={() => onChange({ ...step, audioBlob: null, audioUrl: null, audioFilename: null })}
                                        className="text-slate-500 hover:text-red-400 transition-colors shrink-0">
                                        <RefreshCw className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {/* Controls */}
                            {!audioReady && (
                                <div className="flex flex-wrap gap-2">
                                    {/* Record */}
                                    {!isRecording ? (
                                        <button type="button" onClick={startRec}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20 text-sm">
                                            <Mic className="w-3.5 h-3.5" /> Gravar
                                        </button>
                                    ) : (
                                        <button type="button" onClick={stopRec}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg transition-colors animate-pulse text-sm">
                                            <Square className="w-3.5 h-3.5" /> Parar ({fmt(recTime)})
                                        </button>
                                    )}

                                    {/* Upload file */}
                                    <label className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors border border-blue-500/20 text-sm cursor-pointer">
                                        <Upload className="w-3.5 h-3.5" /> Upload
                                        <input type="file" accept="audio/*" className="hidden"
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) onChange({ ...step, audioBlob: file, audioUrl: URL.createObjectURL(file), audioFilename: file.name });
                                            }} />
                                    </label>

                                    {/* Pick from library */}
                                    <button type="button" onClick={() => setShowLibrary(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors border border-purple-500/20 text-sm">
                                        <Play className="w-3.5 h-3.5" /> Da Biblioteca
                                    </button>
                                </div>
                            )}

                            {audioReady && (
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setShowLibrary(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors border border-purple-500/20 text-xs">
                                        <Play className="w-3 h-3" /> Trocar áudio
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showLibrary && (
                <AudioLibraryModal
                    onSelect={a => {
                        onChange({
                            ...step,
                            audioBlob: null,
                            audioUrl: `http://localhost:3000/api/bot/audios/file/${encodeURIComponent(a.filename)}`,
                            audioFilename: a.filename,
                            audioServerPath: a.path
                        });
                        setShowLibrary(false);
                    }}
                    onClose={() => setShowLibrary(false)}
                />
            )}
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * DmWorkflowBuilder
 * 
 * Props:
 *   steps: Array<{type:'text'|'audio', text?, audioBlob?, audioUrl?, audioFilename?, audioServerPath?}>
 *   onChange: (steps) => void
 *   onAudiosChange: (audiosArray) => void  — keeps ConfigForm.audios in sync for bot upload
 */
const DmWorkflowBuilder = ({ steps = [], onChange }) => {
    const addStep = (type) => {
        onChange([...steps, { type, text: '', audioBlob: null, audioUrl: null, audioFilename: null }]);
    };

    const updateStep = (index, data) => {
        const next = [...steps];
        next[index] = data;
        onChange(next);
    };

    const removeStep = (index) => {
        onChange(steps.filter((_, i) => i !== index));
    };

    const moveStep = (index, dir) => {
        const next = [...steps];
        const swapIdx = index + dir;
        if (swapIdx < 0 || swapIdx >= next.length) return;
        [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
        onChange(next);
    };

    return (
        <div className="space-y-1">
            {steps.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-sm border border-dashed border-slate-700 rounded-xl">
                    Nenhuma etapa ainda. Adicione uma mensagem ou áudio abaixo.
                </div>
            )}

            {steps.map((step, i) => (
                <StepCard
                    key={i}
                    step={step}
                    index={i}
                    total={steps.length}
                    onChange={(data) => updateStep(i, data)}
                    onRemove={() => removeStep(i)}
                    onMoveUp={() => moveStep(i, -1)}
                    onMoveDown={() => moveStep(i, 1)}
                />
            ))}

            {/* Add buttons */}
            <div className="flex gap-2 pt-1">
                <button
                    type="button"
                    onClick={() => addStep('text')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 border-dashed rounded-xl text-sm transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" /> Texto
                </button>
                <button
                    type="button"
                    onClick={() => addStep('audio')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 border-dashed rounded-xl text-sm transition-colors"
                >
                    <Mic className="w-3.5 h-3.5" /> Áudio
                </button>
            </div>
        </div>
    );
};

export default DmWorkflowBuilder;

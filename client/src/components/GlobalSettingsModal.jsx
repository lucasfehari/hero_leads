import React, { useState, useEffect, useRef } from 'react';
import { X, Key, Brain, Save, CheckCircle2, Download, Cpu } from 'lucide-react';
import { io as socketIO } from 'socket.io-client';

const API = 'http://localhost:3000/api/clips';

const WHISPER_MODELS = [
    { id: 'tiny',     label: 'Tiny (39MB)',     desc: 'Mais rápido, menos preciso' },
    { id: 'base',     label: 'Base (74MB)',      desc: 'Rápido, boa precisão' },
    { id: 'small',    label: 'Small (244MB)',    desc: '⭐ Recomendado — equilíbrio ideal' },
    { id: 'medium',   label: 'Medium (769MB)',   desc: 'Mais preciso, mais lento' },
    { id: 'large-v3', label: 'Large-v3 (1.5GB)', desc: 'Máxima precisão (lento)' },
];

const GlobalSettingsModal = ({ isOpen, onClose, onSave }) => {
    const [settings, setSettings] = useState({
        openRouterKey: '',
        openRouterModel: 'openai/gpt-4o-mini',
        groqKey: '',
        openaiKey: '',
        huggingKey: '',
        whisperModel: 'small',
        companyContext: ''
    });

    const [saved, setSaved] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [whisperStatus, setWhisperStatus] = useState(null); // null=loading, true=ok, false=not installed
    const [isInstalling, setIsInstalling] = useState(false);
    const [installLog, setInstallLog] = useState([]);
    const socketRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setSettings({
                openRouterKey: localStorage.getItem('openRouterKey') || '',
                openRouterModel: localStorage.getItem('openRouterModel') || 'openai/gpt-4o-mini',
                groqKey: localStorage.getItem('groqKey') || '',
                openaiKey: localStorage.getItem('openaiKey') || '',
                huggingKey: localStorage.getItem('huggingKey') || '',
                whisperModel: localStorage.getItem('whisperModel') || 'small',
                companyContext: localStorage.getItem('companyContext') || ''
            });
            setSaved(false);
            setTestResult(null);
            setInstallLog([]);
            checkWhisper();
        }
    }, [isOpen]);

    // Socket for install feedback
    useEffect(() => {
        if (!isOpen) return;
        const sock = socketIO('http://localhost:3000');
        socketRef.current = sock;
        sock.on('clips-log', ({ message }) => {
            if (isInstalling) setInstallLog(l => [...l.slice(-20), message]);
        });
        sock.on('whisper-installed', () => {
            setIsInstalling(false);
            setWhisperStatus(true);
        });
        sock.on('whisper-install-error', () => {
            setIsInstalling(false);
            setWhisperStatus(false);
        });
        return () => sock.disconnect();
    }, [isOpen, isInstalling]);

    const checkWhisper = async () => {
        try {
            const res = await fetch(`${API}/whisper-status`);
            const data = await res.json();
            setWhisperStatus(data.installed);
        } catch { setWhisperStatus(false); }
    };

    const installWhisper = async () => {
        setIsInstalling(true);
        setInstallLog(['📦 Iniciando instalação...']);
        try {
            await fetch(`${API}/whisper-install`, { method: 'POST' });
        } catch (e) {
            setInstallLog(l => [...l, '❌ Erro: ' + e.message]);
            setIsInstalling(false);
        }
    };

    if (!isOpen) return null;

    const handleChange = (e) => {
        let val = e.target.value;
        if (e.target.name.toLowerCase().includes('key')) {
            val = val.replace(/\s+/g, '');
        }
        setSettings({ ...settings, [e.target.name]: val });
        localStorage.setItem(e.target.name, val);
    };
    const handleSave = () => {
        Object.entries(settings).forEach(([k, v]) => {
            localStorage.setItem(k, typeof v === 'string' ? (k.toLowerCase().includes('key') ? v.replace(/\s+/g, '') : v.trim()) : v);
        });
        setSaved(true);
        setTimeout(() => { if (onSave) onSave(settings); }, 1200);
    };

    const testConnection = async () => {
        if (!settings.openRouterKey) return alert('Insira a chave da OpenRouter primeiro.');
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('http://localhost:3000/api/bot/test-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: settings.openRouterKey, model: settings.openRouterModel || 'openai/gpt-4o-mini' })
            });
            const data = await res.json();
            setTestResult(data.success
                ? { success: true, message: 'Sucesso! Conexão estabelecida.' }
                : { success: false, message: data.error });
        } catch (err) {
            setTestResult({ success: false, message: 'Erro de rede: ' + err.message });
        }
        setIsTesting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Brain className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Global AI Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">

                    {/* ── WHISPER LOCAL ────────────────────────────── */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Cpu className="w-4 h-4" /> 🖥️ Whisper Local — Offline, Sem Chave, Grátis
                        </h3>

                        <div className={`rounded-xl border p-4 space-y-4 ${whisperStatus ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-purple-500/30 bg-purple-500/5'}`}>
                            {/* Status */}
                            <div className="flex items-center justify-between">
                                <div>
                                    {whisperStatus === null && <p className="text-sm text-slate-400">Verificando instalação...</p>}
                                    {whisperStatus === true && (
                                        <>
                                            <p className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4" /> faster-whisper instalado!
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5">Transcrição offline ativa — sem nenhuma API key.</p>
                                        </>
                                    )}
                                    {whisperStatus === false && !isInstalling && (
                                        <>
                                            <p className="text-sm font-bold text-amber-400">⚡ Instale para transcrição offline</p>
                                            <p className="text-xs text-slate-500 mt-0.5">1 clique — roda 100% na sua máquina, sem internet.</p>
                                        </>
                                    )}
                                    {isInstalling && (
                                        <p className="text-sm text-blue-400 flex items-center gap-2">
                                            <span className="animate-spin">⚙️</span> Instalando...
                                        </p>
                                    )}
                                </div>
                                {!whisperStatus && !isInstalling && (
                                    <button
                                        onClick={installWhisper}
                                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-purple-500/30"
                                    >
                                        <Download className="w-4 h-4" /> Instalar Whisper Local
                                    </button>
                                )}
                                {whisperStatus && (
                                    <span className="text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-lg font-medium">
                                        ✅ Ativo
                                    </span>
                                )}
                            </div>

                            {/* Install log */}
                            {installLog.length > 0 && (
                                <div className="bg-black/40 rounded-lg p-3 space-y-1 max-h-28 overflow-y-auto font-mono">
                                    {installLog.map((l, i) => (
                                        <p key={i} className="text-xs text-slate-400">{l}</p>
                                    ))}
                                </div>
                            )}

                            {/* Model selector */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-400">Modelo Whisper</label>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {WHISPER_MODELS.map(m => (
                                        <label key={m.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${settings.whisperModel === m.id ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                                            <input
                                                type="radio"
                                                name="whisperModel"
                                                value={m.id}
                                                checked={settings.whisperModel === m.id}
                                                onChange={handleChange}
                                                className="accent-purple-500"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-slate-200">{m.label}</span>
                                                <span className="text-xs text-slate-500 ml-2">{m.desc}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-600">O modelo é baixado automaticamente na primeira transcrição (~1-5min).</p>
                            </div>
                        </div>
                    </div>

                    <hr className="border-white/5" />

                    {/* ── OpenRouter ─────────────────────────────── */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Key className="w-4 h-4" /> OpenRouter (I.A. de Análise)
                        </h3>
                        <p className="text-xs text-slate-500">Necessário para selecionar os melhores momentos do vídeo com I.A.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400">API Key</label>
                                <input type="password" name="openRouterKey" value={settings.openRouterKey} onChange={handleChange}
                                    placeholder="sk-or-v1-..." autoComplete="new-password"
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400">Modelo</label>
                                <input type="text" name="openRouterModel" value={settings.openRouterModel} onChange={handleChange}
                                    placeholder="openai/gpt-4o-mini"
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={testConnection} disabled={isTesting}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                                {isTesting ? 'Testando...' : 'Testar Conexão'}
                            </button>
                            {testResult && <span className={`text-sm ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>{testResult.message}</span>}
                        </div>
                    </div>

                    <hr className="border-white/5" />

                    {/* ── Transcrição API (Fallback) ─────────────── */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                            🎙️ Transcrição via API (Opcional — fallback se Whisper Local não disponível)
                        </h3>

                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                            <p className="text-sm font-bold text-emerald-400">✅ Groq Whisper (Grátis)</p>
                            <input type="password" name="groqKey" value={settings.groqKey} onChange={handleChange} autoComplete="new-password"
                                placeholder="gsk_..." className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50" />
                            {settings.groqKey && <p className="text-[10px] text-emerald-400">✓ Ativo como fallback</p>}
                        </div>

                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                            <p className="text-sm font-medium text-slate-400">OpenAI Whisper (Pago — máxima precisão)</p>
                            <input type="password" name="openaiKey" value={settings.openaiKey} onChange={handleChange} autoComplete="new-password"
                                placeholder="sk-..." className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                        </div>
                    </div>

                    <hr className="border-white/5" />

                    {/* ── Company Context ─────────────────────────── */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Brain className="w-4 h-4" /> Company Context
                        </h3>
                        <textarea name="companyContext" value={settings.companyContext} onChange={handleChange}
                            placeholder="Ex: Somos a Browze, vendemos automação. Tom de voz jovem e profissional."
                            rows={3}
                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none">
                        </textarea>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/10 bg-slate-900/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSave}
                        className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2">
                        {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Salvo!' : 'Salvar Configurações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalSettingsModal;

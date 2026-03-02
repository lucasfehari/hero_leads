import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';
import { Smartphone, Plus, RefreshCw, CheckCircle, AlertCircle, Trash2, SwitchCamera, Pencil, X, Wifi, WifiOff, Clock } from 'lucide-react';
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

const STATUS_STYLES = {
    connected: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Conectado' },
    authenticated: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Autenticado' },
    scan_qr: { dot: 'bg-orange-400 animate-pulse', text: 'text-orange-400', label: 'Aguardando QR' },
    switching: { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400', label: 'Trocando...' },
    connecting: { dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400', label: 'Conectando...' },
    disconnected: { dot: 'bg-slate-500', text: 'text-slate-500', label: 'Desconectado' },
    error: { dot: 'bg-red-400', text: 'text-red-400', label: 'Erro' },
};

const StatusDot = ({ status }) => {
    const st = STATUS_STYLES[status] || STATUS_STYLES.disconnected;
    return (
        <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${st.dot}`} />
            <span className={`text-xs font-medium ${st.text}`}>{st.label}</span>
        </span>
    );
};

// ── Add session modal ─────────────────────────────────────────────────────────
const AddSessionModal = ({ onClose }) => {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        const clean = name.trim().toLowerCase().replace(/\s+/g, '_');
        if (!clean) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/whatsapp/sessions/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: clean })
            });
            const data = await res.json();
            if (data.success) { onClose(true); }
            else setError(data.error || 'Erro ao criar sessão');
        } catch (e) { setError(e.message); }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-200 font-semibold">Nova Sessão WhatsApp</h3>
                    <button onClick={() => onClose(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="text-slate-400 text-xs mb-1 block">Nome da sessão (sem espaços)</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)}
                            placeholder="ex: numero2, empresa, pessoal"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-green-500 transition-all"
                            autoFocus
                        />
                        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
                    </div>
                    <p className="text-slate-600 text-xs">Uma nova janela abrirá e mostrará o QR Code para escanear.</p>
                    <button type="submit" disabled={loading || !name.trim()}
                        className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Criar e Conectar
                    </button>
                </form>
            </div>
        </div>
    );
};

// ── Rename modal ──────────────────────────────────────────────────────────────
const RenameModal = ({ session, onClose }) => {
    const [label, setLabel] = useState(session.label || session.name);
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!label.trim()) return;
        setLoading(true);
        await fetch(`/api/whatsapp/sessions/${session.name}/rename`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label.trim() })
        });
        setLoading(false);
        onClose(true);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-200 font-semibold">Renomear Sessão</h3>
                    <button onClick={() => onClose(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={submit} className="space-y-4">
                    <input
                        value={label} onChange={e => setLabel(e.target.value)}
                        placeholder="Nome exibido"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-green-500 transition-all"
                        autoFocus
                    />
                    <button type="submit" disabled={loading}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors">
                        Salvar
                    </button>
                </form>
            </div>
        </div>
    );
};

// ── Main dashboard ────────────────────────────────────────────────────────────
const WhatsAppDashboard = () => {
    const [status, setStatus] = useState('connecting');
    const [qrCode, setQrCode] = useState('');
    const [activeSession, setActiveSession] = useState(null);
    const [activePhone, setActivePhone] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [renaming, setRenaming] = useState(null);

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/whatsapp/sessions');
            const data = await res.json();
            setSessions(data.sessions || []);
            setActiveSession(data.current);
        } catch { /* ignore */ }
    };

    useEffect(() => {
        fetchSessions();

        socket.on('wa-status', (data) => {
            setStatus(data.status);
            if (data.phone) setActivePhone(data.phone);
            if (data.status === 'connected' || data.status === 'authenticated') {
                setQrCode('');
                fetchSessions();
            }
        });

        socket.on('wa-qr', (qr) => {
            setQrCode(qr);
            setStatus('scan_qr');
        });

        return () => {
            socket.off('wa-status');
            socket.off('wa-qr');
        };
    }, []);

    const switchTo = async (name) => {
        await fetch('/api/whatsapp/sessions/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: name })
        });
        setQrCode('');
        setStatus('switching');
        fetchSessions();
    };

    const deleteSession = async (name) => {
        if (!confirm(`Apagar sessão "${name}"? Será necessário escanear o QR novamente.`)) return;
        await fetch(`/api/whatsapp/sessions/${name}`, { method: 'DELETE' });
        fetchSessions();
    };

    const isConnected = status === 'connected' || status === 'authenticated';

    return (
        <div className="space-y-4">
            {/* ── Active session card ─────────────────────────────────── */}
            <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold flex items-center gap-2 text-base">
                        <Smartphone className="w-5 h-5 text-green-500" /> WhatsApp — Sessão Ativa
                    </h2>
                    <StatusDot status={status} />
                </div>

                {isConnected ? (
                    <div className="flex items-center gap-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <div className="w-12 h-12 bg-emerald-500/15 rounded-full flex items-center justify-center shrink-0">
                            <Wifi className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-emerald-400 font-semibold text-sm">Conectado e Pronto</p>
                            {activePhone && <p className="text-slate-400 text-xs font-mono mt-0.5">{activePhone}</p>}
                            <p className="text-slate-600 text-xs mt-0.5">Sessão: <span className="text-slate-400">{activeSession}</span></p>
                        </div>
                    </div>
                ) : qrCode ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="bg-white p-3 rounded-xl inline-block">
                            <QRCode value={qrCode} size={220} />
                        </div>
                        <p className="text-slate-400 text-sm animate-pulse text-center">
                            Abra o WhatsApp → Aparelhos Conectados → Conectar Aparelho
                        </p>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-3 py-8 text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Inicializando cliente WhatsApp...</span>
                    </div>
                )}
            </div>

            {/* ── Session list ────────────────────────────────────────── */}
            <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-300 font-semibold text-sm flex items-center gap-2">
                        <SwitchCamera className="w-4 h-4 text-green-500" /> Sessões Salvas
                        <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">{sessions.length}</span>
                    </h3>
                    <button onClick={() => setShowAdd(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 rounded-lg text-xs font-medium transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Nova sessão
                    </button>
                </div>

                {sessions.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-4">Nenhuma sessão salva ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {sessions.map(s => (
                            <div key={s.name}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                                    ${s.active
                                        ? 'bg-green-500/5 border-green-500/25'
                                        : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600/50'}`}>
                                {/* Status indicator */}
                                <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_STYLES[s.status]?.dot || 'bg-slate-600'}`} />

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-200 text-sm font-medium truncate">{s.label || s.name}</span>
                                        {s.active && <span className="text-xs bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full shrink-0">ativo</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {s.phone
                                            ? <span className="text-slate-500 text-xs font-mono">{s.phone}</span>
                                            : <span className="text-slate-600 text-xs">Sem número registrado</span>}
                                        {s.last_seen && (
                                            <span className="text-slate-700 text-xs flex items-center gap-1">
                                                <Clock className="w-2.5 h-2.5" />
                                                {new Date(s.last_seen).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {!s.active && (
                                        <button onClick={() => switchTo(s.name)} title="Usar esta sessão"
                                            className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-colors">
                                            <SwitchCamera className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button onClick={() => setRenaming(s)} title="Renomear"
                                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    {!s.active && (
                                        <button onClick={() => deleteSession(s.name)} title="Apagar sessão"
                                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modals */}
            {showAdd && (
                <AddSessionModal onClose={(changed) => {
                    setShowAdd(false);
                    if (changed) fetchSessions();
                }} />
            )}
            {renaming && (
                <RenameModal session={renaming} onClose={(changed) => {
                    setRenaming(null);
                    if (changed) fetchSessions();
                }} />
            )}
        </div>
    );
};

export default WhatsAppDashboard;

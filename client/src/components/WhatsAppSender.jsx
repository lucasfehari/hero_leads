import React, { useState, useEffect, useCallback } from 'react';
import {
    Send, Clock, Play, List, Plus, Trash2, ChevronDown, ChevronUp,
    Users, RefreshCw, LogIn, CheckCircle, ShieldCheck, ShieldAlert,
    Zap, AlertTriangle, BarChart2, ToggleLeft, ToggleRight
} from 'lucide-react';
import io from 'socket.io-client';

const socket = io('http://localhost:3000');
const API = 'http://localhost:3000/api/whatsapp';

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const Toggle = ({ value, onChange, label, icon: Icon }) => (
    <button
        onClick={() => onChange(!value)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${value
            ? 'bg-green-500/20 border-green-500/40 text-green-400'
            : 'bg-slate-800/40 border-white/5 text-slate-500'
            }`}
    >
        {value ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
    </button>
);

const NumInput = ({ label, value, onChange, unit, min = 1 }) => (
    <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">{label}</label>
        <div className="flex items-center gap-1.5">
            <input
                type="number"
                min={min}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-center text-sm font-mono"
                value={value}
                onChange={e => onChange(parseInt(e.target.value) || min)}
            />
            {unit && <span className="text-xs text-slate-600">{unit}</span>}
        </div>
    </div>
);

// ─── Componente Principal ─────────────────────────────────────────────────────

const WhatsAppSender = () => {
    // Session
    const [sessions, setSessions] = useState([]);
    const [currentSession, setCurrentSession] = useState('default');
    const [newSessionName, setNewSessionName] = useState('');
    const [sessionOpen, setSessionOpen] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(false);

    // Warmup / Health
    const [warmup, setWarmup] = useState(null);
    const [antiBanOpen, setAntiBanOpen] = useState(false);

    // Campaign
    const [numbers, setNumbers] = useState('');
    const [messages, setMessages] = useState(['']);
    const [config, setConfig] = useState({
        minDelay: 12,
        maxDelay: 35,
        batchSize: 20,
        msgMinDelay: 4,
        msgMaxDelay: 10,
        // Anti-ban
        antiBanEnabled: true,
        hourlyLimit: 35,
        dailyLimit: null,
        activityEvery: 5,
        validateNumbers: true,
        shuffle: true,
        emojiPool: [],
    });

    // Status
    const [statusHistory, setStatusHistory] = useState([]);
    const [queueStatus, setQueueStatus] = useState({ status: 'idle', queueLength: 0 });
    const [emojiInput, setEmojiInput] = useState('');
    const [optOuts, setOptOuts] = useState([]); // alertas de opt-out em tempo real

    // Opt-Out config
    const [optOutConfig, setOptOutConfig] = useState({
        enabled: true,
        autoReply: true,
        replyMessage: 'Tudo bem! Você foi removido da nossa lista e não receberá mais mensagens. 👋',
        keywords: ['sair', 'parar', 'stop', 'cancelar', 'descadastrar', 'remover', 'não quero', 'chega', 'unsubscribe', 'bloquear', 'quit'],
    });
    const [optOutOpen, setOptOutOpen] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');

    // ── Carregamento ─────────────────────────────────────────────────────────
    const loadSessions = useCallback(async () => {
        try {
            const r = await fetch(`${API}/sessions`);
            const d = await r.json();
            setSessions(d.sessions || []);
            setCurrentSession(d.current || 'default');
        } catch (e) { /* */ }
    }, []);

    const loadWarmup = useCallback(async () => {
        try {
            const r = await fetch(`${API}/warmup`);
            const d = await r.json();
            setWarmup(d);
        } catch (e) { /* */ }
    }, []);

    const loadOptOutConfig = useCallback(async () => {
        try {
            const r = await fetch(`${API}/optout-config`);
            const d = await r.json();
            setOptOutConfig(d);
        } catch (e) { /* */ }
    }, []);

    const saveOptOutConfig = async (patch) => {
        const updated = { ...optOutConfig, ...patch };
        setOptOutConfig(updated);
        try {
            await fetch(`${API}/optout-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
        } catch (e) { /* */ }
    };

    useEffect(() => {
        loadSessions();
        loadWarmup();
        const warmupInterval = setInterval(loadWarmup, 30000);

        socket.on('wa-queue-status', (data) => {
            setQueueStatus(data);
            const entry = statusToEntry(data);
            if (entry) setStatusHistory(prev => [entry, ...prev].slice(0, 60));
        });

        socket.on('wa-status', (data) => {
            if (data.session) {
                setCurrentSession(data.session);
                loadSessions();
                loadWarmup();
            }
        });

        socket.on('wa-optout', (data) => {
            const alert = { ...data, id: Date.now() };
            setOptOuts(prev => [alert, ...prev]);
            setTimeout(() => setOptOuts(prev => prev.filter(o => o.id !== alert.id)), 15000);
        });

        loadOptOutConfig();

        return () => {
            clearInterval(warmupInterval);
            socket.off('wa-queue-status');
            socket.off('wa-status');
            socket.off('wa-optout');
        };
    }, [loadSessions, loadWarmup, loadOptOutConfig]);

    const statusToEntry = (d) => {
        const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (d.status === 'sent') return { ts, color: 'text-emerald-400', text: `✓ Enviado → ${d.number} (msg ${d.msgIndex}/${d.msgTotal})` };
        if (d.status === 'waiting') return { ts, color: 'text-orange-400', text: `⏳ Aguardando ${Math.round((d.duration || 0) / 1000)}s...` };
        if (d.status === 'waiting_next_msg') return { ts, color: 'text-yellow-400', text: `💬 Próx. msg em ${Math.round((d.duration || 0) / 1000)}s` };
        if (d.status === 'batch_pause') return { ts, color: 'text-pink-400', text: `☕ Pausa longa ${Math.round((d.duration || 0) / 60000)}min` };
        if (d.status === 'activity') return { ts, color: 'text-sky-400', text: d.msg };
        if (d.status === 'invalid_number') return { ts, color: 'text-red-400', text: `✕ Inválido: ${d.number}` };
        if (d.status === 'rate_limit') return { ts, color: 'text-red-500', text: d.msg };
        if (d.status === 'throttle') return { ts, color: 'text-amber-400', text: d.msg };
        if (d.status === 'error') return { ts, color: 'text-red-400', text: `✕ Erro: ${d.error}` };
        if (d.status === 'idle') return { ts, color: 'text-slate-400', text: `✅ Concluído — ${d.total || 0} enviados, ${d.skipped || 0} pulados` };
        if (d.status === 'scheduled_wait') return { ts, color: 'text-violet-400', text: d.msg };
        if (d.status === 'schedule_pause') return { ts, color: 'text-violet-400', text: d.msg };
        return null;
    };

    // ── Ações de Sessão ──────────────────────────────────────────────────────
    const switchToSession = async (name) => {
        setSessionLoading(true);
        try {
            const r = await fetch(`${API}/sessions/switch`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: name })
            });
            const d = await r.json();
            if (d.success) { setCurrentSession(name); await loadSessions(); await loadWarmup(); }
            else alert('Erro: ' + d.error);
        } catch (e) { alert('Erro: ' + e.message); }
        setSessionLoading(false);
    };

    const handleNewSession = async () => {
        const name = newSessionName.trim().replace(/\s+/g, '_');
        if (!name) return alert('Digite um nome para a sessão');
        await switchToSession(name);
        setNewSessionName('');
    };

    const handleDeleteSession = async (name) => {
        if (!window.confirm(`Excluir sessão "${name}"?`)) return;
        try {
            const r = await fetch(`${API}/sessions/${name}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) await loadSessions(); else alert('Erro: ' + d.error);
        } catch (e) { alert('Erro: ' + e.message); }
    };

    // ── Multi-mensagem ────────────────────────────────────────────────────────
    const addMessage = () => setMessages(p => [...p, '']);
    const removeMessage = (i) => setMessages(p => p.filter((_, idx) => idx !== i));
    const updateMessage = (i, v) => setMessages(p => p.map((m, idx) => idx === i ? v : m));

    // ── Emoji pool ────────────────────────────────────────────────────────────
    const addEmoji = (emoji) => {
        if (!emoji.trim()) return;
        setConfig(c => ({ ...c, emojiPool: [...new Set([...c.emojiPool, emoji.trim()])] }));
        setEmojiInput('');
    };

    // ── Iniciar campanha ──────────────────────────────────────────────────────
    const handleStart = async () => {
        const validMessages = messages.filter(m => m.trim());
        const numberList = numbers.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
        if (!numberList.length || !validMessages.length) return alert('Preencha números e pelo menos uma mensagem!');
        setStatusHistory([]);
        try {
            const r = await fetch(`${API}/start`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numbers: numberList, messages: validMessages, config })
            });
            const d = await r.json();
            if (!d.success) alert('Erro: ' + d.error);
        } catch (e) { alert('Erro: ' + e.message); }
    };

    const isProcessing = ['processing', 'waiting', 'waiting_next_msg', 'batch_pause', 'throttle'].includes(queueStatus.status);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5">

            {/* ── ALERTAS OPT-OUT ──────────────────────────────────────── */}
            {optOuts.length > 0 && (
                <div className="space-y-2">
                    {optOuts.map(o => (
                        <div key={o.id} className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 animate-pulse-once">
                            <span className="text-xl flex-shrink-0">🚫</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-red-400">Opt-Out detectado!</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    <span className="font-mono text-white">+{o.number}</span> pediu remoção:
                                    <em className="ml-1 text-slate-400">"{o.message}"</em>
                                </p>
                                <p className="text-xs text-slate-600 mt-1">✅ Adicionado à blacklist · Resposta automática enviada</p>
                            </div>
                            <button onClick={() => setOptOuts(prev => prev.filter(x => x.id !== o.id))}
                                className="flex-shrink-0 text-slate-600 hover:text-slate-400 p-1 rounded transition-colors">
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── SESSÃO ──────────────────────────────────────────────── */}
            <div className="bg-slate-800/30 rounded-2xl border border-white/5 overflow-hidden">
                <button
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                    onClick={() => setSessionOpen(o => !o)}
                >
                    <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-purple-400" />
                        <div>
                            <p className="font-semibold text-white text-sm">Gerenciar Contas</p>
                            <p className="text-xs text-slate-500">
                                Ativa: <span className="text-purple-300 font-mono">{currentSession}</span>
                            </p>
                        </div>
                    </div>
                    {sessionOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>

                {sessionOpen && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
                        {sessions.length > 0 && (
                            <div className="space-y-2">
                                {sessions.map(s => (
                                    <div key={s} className={`flex items-center justify-between p-3 rounded-xl border ${s === currentSession ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/5 bg-slate-900/40'}`}>
                                        <div className="flex items-center gap-2">
                                            {s === currentSession && <CheckCircle className="w-4 h-4 text-purple-400" />}
                                            <span className="text-sm font-mono text-slate-200">{s}</span>
                                            {s === currentSession && <span className="text-xs text-purple-400">(ativa)</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            {s !== currentSession && (
                                                <>
                                                    <button onClick={() => switchToSession(s)} disabled={sessionLoading}
                                                        className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center gap-1">
                                                        {sessionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />} Conectar
                                                    </button>
                                                    <button onClick={() => handleDeleteSession(s)}
                                                        className="text-xs px-2 py-1 bg-red-900/30 hover:bg-red-800/50 text-red-400 rounded-lg">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input className="flex-1 bg-slate-950/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-purple-500/50"
                                placeholder="Nome da nova conta..." value={newSessionName}
                                onChange={e => setNewSessionName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleNewSession()} />
                            <button onClick={handleNewSession} disabled={!newSessionName.trim() || sessionLoading}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold flex items-center gap-1">
                                <Plus className="w-4 h-4" /> Criar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── SAÚDE DA SESSÃO (Warmup) ─────────────────────────────── */}
            {warmup && (
                <div className="bg-slate-800/20 rounded-2xl border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {warmup.healthy
                                ? <ShieldCheck className="w-5 h-5 text-green-400" />
                                : <ShieldAlert className="w-5 h-5 text-amber-400" />}
                            <span className="font-semibold text-sm text-white">
                                {warmup.healthy ? 'Conta Aquecida ✅' : `Aquecendo conta (semana ${warmup.weekIndex + 1})`}
                            </span>
                        </div>
                        <button onClick={loadWarmup} className="text-slate-600 hover:text-slate-400 p-1 rounded">
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Barra de progresso do warmup */}
                    <div className="w-full bg-slate-900 rounded-full h-2 mb-3">
                        <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{
                                width: `${warmup.warmupProgress}%`,
                                background: warmup.warmupProgress < 40
                                    ? 'linear-gradient(90deg, #ef4444, #f97316)'
                                    : warmup.warmupProgress < 80
                                        ? 'linear-gradient(90deg, #f97316, #eab308)'
                                        : 'linear-gradient(90deg, #22c55e, #10b981)',
                            }}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-slate-900/60 rounded-xl p-2">
                            <p className="text-xs text-slate-500 mb-0.5">Hoje</p>
                            <p className="text-white font-mono text-sm font-bold">
                                {warmup.todayCount}<span className="text-slate-600 text-xs">/{warmup.dailyLimit}</span>
                            </p>
                        </div>
                        <div className="bg-slate-900/60 rounded-xl p-2">
                            <p className="text-xs text-slate-500 mb-0.5">Esta hora</p>
                            <p className="text-white font-mono text-sm font-bold">
                                {warmup.hourlyCount}<span className="text-slate-600 text-xs">/{config.hourlyLimit}</span>
                            </p>
                        </div>
                        <div className="bg-slate-900/60 rounded-xl p-2">
                            <p className="text-xs text-slate-500 mb-0.5">Dias ativos</p>
                            <p className="text-white font-mono text-sm font-bold">{warmup.daysSinceStart}</p>
                        </div>
                    </div>

                    {!warmup.healthy && (
                        <div className="mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300">
                                Conta ainda em aquecimento. Limite automático de <strong>{warmup.dailyLimit} msgs/dia</strong> ativo para proteger a conta. Aumente gradativamente a cada semana.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── OPT-OUT CONFIG ───────────────────────────────────────── */}
            <div className="bg-slate-800/20 rounded-2xl border border-white/5 overflow-hidden">
                <button
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                    onClick={() => setOptOutOpen(o => !o)}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xl">🚫</span>
                        <div>
                            <p className="font-semibold text-white text-sm">Opt-Out Automático</p>
                            <p className="text-xs text-slate-500">
                                {optOutConfig.enabled ? `${optOutConfig.keywords.length} palavras-chave · Resposta ${optOutConfig.autoReply ? 'ativa' : 'desativada'}` : 'Desativado'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Toggle value={optOutConfig.enabled} onChange={(v) => saveOptOutConfig({ enabled: v })} label={optOutConfig.enabled ? 'ON' : 'OFF'} />
                        {optOutOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                </button>

                {optOutOpen && (
                    <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-4">
                        {/* Resposta automática */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-slate-500">Resposta automática ao opt-out</p>
                                <Toggle value={optOutConfig.autoReply} onChange={(v) => saveOptOutConfig({ autoReply: v })} label={optOutConfig.autoReply ? 'Ativada' : 'Desativada'} />
                            </div>
                            {optOutConfig.autoReply && (
                                <textarea
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 h-20 outline-none resize-none focus:ring-2 focus:ring-green-500/50"
                                    value={optOutConfig.replyMessage}
                                    onChange={e => setOptOutConfig(c => ({ ...c, replyMessage: e.target.value }))}
                                    onBlur={() => saveOptOutConfig({ replyMessage: optOutConfig.replyMessage })}
                                    placeholder="Mensagem enviada quando alguém pede remoção..."
                                />
                            )}
                        </div>

                        {/* Palavras-chave */}
                        <div>
                            <p className="text-xs text-slate-500 mb-2">Palavras-chave de opt-out <span className="text-slate-600">(clique para remover)</span></p>
                            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                                {optOutConfig.keywords.map((kw, i) => (
                                    <button key={i}
                                        onClick={() => saveOptOutConfig({ keywords: optOutConfig.keywords.filter((_, idx) => idx !== i) })}
                                        className="text-xs px-2.5 py-1 bg-red-900/20 hover:bg-red-900/50 text-red-400 border border-red-500/20 rounded-lg transition-colors">
                                        {kw} ✕
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-red-500/40"
                                    placeholder="nova palavra..."
                                    value={newKeyword}
                                    onChange={e => setNewKeyword(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && newKeyword.trim()) {
                                            saveOptOutConfig({ keywords: [...optOutConfig.keywords, newKeyword.trim().toLowerCase()] });
                                            setNewKeyword('');
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => { if (newKeyword.trim()) { saveOptOutConfig({ keywords: [...optOutConfig.keywords, newKeyword.trim().toLowerCase()] }); setNewKeyword(''); } }}
                                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm">
                                    + Adicionar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── AGENDAMENTO ──────────────────────────────────────────── */}
            <div className="bg-slate-800/20 rounded-2xl border border-white/5 overflow-hidden">
                <button
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                    onClick={() => setConfig(c => ({ ...c, _schedOpen: !c._schedOpen }))}
                >
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-violet-400" />
                        <div>
                            <p className="font-semibold text-white text-sm">Agendamento</p>
                            <p className="text-xs text-slate-500">
                                {config.scheduleEnabled ? `${config.scheduleStart} → ${config.scheduleEnd}` : 'Desativado — envia imediatamente'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Toggle value={config.scheduleEnabled} onChange={(v) => setConfig(c => ({ ...c, scheduleEnabled: v }))} label={config.scheduleEnabled ? 'ON' : 'OFF'} />
                        {config._schedOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                </button>

                {config._schedOpen && (
                    <div className="px-4 pb-5 border-t border-white/5 pt-4">
                        <p className="text-xs text-slate-500 mb-3">A campanha só envia mensagens dentro da janela de horário configurada. Fora do horário, fica pausada e retoma automaticamente.</p>
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1 flex-1">
                                <label className="text-xs text-slate-500">Início</label>
                                <input type="time"
                                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono w-full focus:ring-2 focus:ring-violet-500/50 outline-none"
                                    value={config.scheduleStart}
                                    onChange={e => setConfig(c => ({ ...c, scheduleStart: e.target.value }))}
                                />
                            </div>
                            <div className="flex-shrink-0 text-slate-600 mt-5">→</div>
                            <div className="flex flex-col gap-1 flex-1">
                                <label className="text-xs text-slate-500">Fim</label>
                                <input type="time"
                                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono w-full focus:ring-2 focus:ring-violet-500/50 outline-none"
                                    value={config.scheduleEnd}
                                    onChange={e => setConfig(c => ({ ...c, scheduleEnd: e.target.value }))}
                                />
                            </div>
                        </div>
                        {config.scheduleEnabled && (
                            <div className="mt-3 flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
                                <span className="text-violet-400">⏰</span>
                                <p className="text-xs text-violet-300">
                                    Ao clicar em <strong>Iniciar Disparos</strong>, a campanha esperará até <strong>{config.scheduleStart}</strong> para começar a enviar.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── ANTI-BAN CONFIG ──────────────────────────────────────── */}
            <div className="bg-slate-800/20 rounded-2xl border border-white/5 overflow-hidden">
                <button
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                    onClick={() => setAntiBanOpen(o => !o)}
                >
                    <div className="flex items-center gap-3">
                        <ShieldCheck className={`w-5 h-5 ${config.antiBanEnabled ? 'text-green-400' : 'text-slate-500'}`} />
                        <div>
                            <p className="font-semibold text-white text-sm">Proteção Anti-Ban</p>
                            <p className="text-xs text-slate-500">
                                {config.antiBanEnabled ? '7 camadas ativas' : 'Desativado — risco alto!'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Toggle
                            value={config.antiBanEnabled}
                            onChange={(v) => setConfig(c => ({ ...c, antiBanEnabled: v }))}
                            label={config.antiBanEnabled ? 'ON' : 'OFF'}
                        />
                        {antiBanOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                </button>

                {antiBanOpen && (
                    <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-5">

                        {/* Toggles */}
                        <div>
                            <p className="text-xs text-slate-500 mb-2">Funcionalidades</p>
                            <div className="flex flex-wrap gap-2">
                                <Toggle value={config.validateNumbers} onChange={(v) => setConfig(c => ({ ...c, validateNumbers: v }))} label="Validar números" icon={CheckCircle} />
                                <Toggle value={config.shuffle} onChange={(v) => setConfig(c => ({ ...c, shuffle: v }))} label="Embaralhar lista" icon={Zap} />
                            </div>
                        </div>

                        {/* Limites de taxa */}
                        <div>
                            <p className="text-xs text-slate-500 mb-3">Limites de Taxa</p>
                            <div className="flex flex-wrap gap-4">
                                <NumInput label="Máx. por hora" value={config.hourlyLimit} onChange={(v) => setConfig(c => ({ ...c, hourlyLimit: v }))} unit="msgs" />
                                <NumInput label="Máx. por dia (0=auto)" value={config.dailyLimit || 0}
                                    onChange={(v) => setConfig(c => ({ ...c, dailyLimit: v > 0 ? v : null }))} unit="msgs" min={0} />
                                <NumInput label="Atividade a cada" value={config.activityEvery} onChange={(v) => setConfig(c => ({ ...c, activityEvery: v }))} unit="contatos" />
                            </div>
                        </div>

                        {/* Emoji pool */}
                        <div>
                            <p className="text-xs text-slate-500 mb-2">Pool de Emojis <span className="text-slate-600">(adicionados aleatoriamente ao final)</span></p>
                            <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                                {config.emojiPool.map((e, i) => (
                                    <button key={i} onClick={() => setConfig(c => ({ ...c, emojiPool: c.emojiPool.filter((_, idx) => idx !== i) }))}
                                        className="text-lg hover:opacity-50 transition-opacity" title="Clique para remover">
                                        {e}
                                    </button>
                                ))}
                                {config.emojiPool.length === 0 && <span className="text-xs text-slate-600">Nenhum emoji — sem emojis automáticos</span>}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-lg"
                                    placeholder="😊"
                                    value={emojiInput}
                                    onChange={e => setEmojiInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addEmoji(emojiInput)}
                                    maxLength={2}
                                />
                                <button onClick={() => addEmoji(emojiInput)}
                                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                                    + Adicionar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── NÚMEROS ──────────────────────────────────────────────── */}
            <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                    Números <span className="text-slate-500 text-xs">(um por linha)</span>
                </label>
                <textarea
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 h-32 outline-none resize-none custom-scrollbar transition-all hover:border-slate-600 focus:ring-2 focus:ring-green-500/50"
                    placeholder={"5511999999999\n5511888888888"}
                    value={numbers}
                    onChange={e => setNumbers(e.target.value)}
                />
                <p className="text-xs text-slate-600 mt-1 ml-1">DDI + DDD + Número (ex: 5511...)</p>
            </div>

            {/* ── MENSAGENS ────────────────────────────────────────────── */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-300">
                        Mensagens <span className="text-slate-500 text-xs ml-1">(enviadas em sequência)</span>
                    </label>
                    <button onClick={addMessage}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg border border-green-500/20 transition-colors">
                        <Plus className="w-3 h-3" /> Adicionar
                    </button>
                </div>
                <div className="space-y-3">
                    {messages.map((msg, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center mt-3">
                                <span className="text-xs text-slate-500 font-mono">{idx + 1}</span>
                            </div>
                            <textarea
                                className="flex-1 bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 h-24 outline-none resize-none custom-scrollbar transition-all hover:border-slate-600 focus:ring-2 focus:ring-green-500/50"
                                placeholder={`Mensagem ${idx + 1}... Use {Opção1|Opção2} para variações`}
                                value={msg}
                                onChange={e => updateMessage(idx, e.target.value)}
                            />
                            {messages.length > 1 && (
                                <button onClick={() => removeMessage(idx)}
                                    className="mt-3 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {messages.length > 1 && (
                    <div className="mt-3 bg-slate-800/20 rounded-xl p-3 border border-white/5 flex items-center gap-3">
                        <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="text-xs text-slate-500">Delay entre msgs:</span>
                        <input type="number" className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-center text-sm font-mono"
                            value={config.msgMinDelay} onChange={e => setConfig(c => ({ ...c, msgMinDelay: parseInt(e.target.value) || 3 }))} />
                        <span className="text-slate-600">–</span>
                        <input type="number" className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-center text-sm font-mono"
                            value={config.msgMaxDelay} onChange={e => setConfig(c => ({ ...c, msgMaxDelay: parseInt(e.target.value) || 10 }))} />
                        <span className="text-xs text-slate-500">seg</span>
                    </div>
                )}
            </div>

            {/* ── DELAYS ENTRE CONTATOS ─────────────────────────────────── */}
            <div className="bg-slate-800/20 p-4 rounded-2xl border border-white/5">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-400" /> Delay Entre Contatos
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Delay (seg)</label>
                        <div className="flex items-center gap-2">
                            <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-center text-sm font-mono"
                                value={config.minDelay} onChange={e => setConfig(c => ({ ...c, minDelay: parseInt(e.target.value) }))} />
                            <span className="text-slate-600">–</span>
                            <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-center text-sm font-mono"
                                value={config.maxDelay} onChange={e => setConfig(c => ({ ...c, maxDelay: parseInt(e.target.value) }))} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Pausa longa a cada</label>
                        <div className="flex items-center gap-2">
                            <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-center text-sm font-mono"
                                value={config.batchSize} onChange={e => setConfig(c => ({ ...c, batchSize: parseInt(e.target.value) }))} />
                            <span className="text-xs text-slate-500">msgs</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── STATUS LOG ───────────────────────────────────────────── */}
            <div className="bg-slate-800/20 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-purple-400" /> Status do Envio
                    </h3>
                    {isProcessing && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full animate-pulse border border-green-500/20">
                            {queueStatus.count || 0} enviados · {queueStatus.queueLength || 0} na fila
                        </span>
                    )}
                </div>
                <div className="h-28 overflow-y-auto font-mono text-xs space-y-1 bg-slate-950/50 p-3 rounded-xl border border-white/5 custom-scrollbar">
                    {statusHistory.length === 0 && <div className="text-slate-600">Pronto para iniciar.</div>}
                    {statusHistory.map((s, i) => (
                        <div key={i} className={s.color}>
                            <span className="text-slate-600 mr-2">{s.ts}</span>{s.text}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── BOTÃO INICIAR ─────────────────────────────────────────── */}
            <button
                onClick={handleStart}
                disabled={isProcessing}
                className={`w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${isProcessing
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-900/30'
                    }`}
            >
                {isProcessing
                    ? <><RefreshCw className="w-5 h-5 animate-spin" /> Enviando...</>
                    : <><Send className="w-5 h-5" /> Iniciar Disparos</>
                }
            </button>
        </div>
    );
};

export default WhatsAppSender;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Send, Clock, Play, List, Plus, Trash2, ChevronDown, ChevronUp,
    Users, RefreshCw, LogIn, CheckCircle, ShieldCheck, ShieldAlert,
    Zap, AlertTriangle, BarChart2, ToggleLeft, ToggleRight
} from 'lucide-react';
import io from 'socket.io-client';
import DmWorkflowBuilder from './DmWorkflowBuilder';

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

const WhatsAppSender = ({ prefillNumbers, prefillLeads = [] }) => {
    const abortAiRef = useRef(false);
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
    const [waSteps, setWaSteps] = useState([{ type: 'text', text: '' }]);
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

    // ── I.A Personalização ───────────────────────────────────────────────────
    const [aiEnabled, setAiEnabled] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('Olá {nome}! Vi que sua empresa {empresa} em {endereco} atua no segmento de {segmento}. Gostaria de apresentar uma solução que pode te ajudar a crescer ainda mais. Posso te enviar mais detalhes?');
    const [aiContacts, setAiContacts] = useState([]); // [{name, phone, message, enabled, loading, lead}]
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiSectionOpen, setAiSectionOpen] = useState(false);
    const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 }); // progress tracker
    const [splitAiMessage, setSplitAiMessage] = useState(true); // Toggle para enviar parágrafos como mensagens separadas
    const [savedPrompts, setSavedPrompts] = useState([]);

    // Opt-Out config
    const [optOutConfig, setOptOutConfig] = useState({
        enabled: true,
        autoReply: false,   // desativado por padrão
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

        const storedPrompts = localStorage.getItem('savedAiPrompts');
        if (storedPrompts) {
            try { setSavedPrompts(JSON.parse(storedPrompts)); } catch (e) {}
        }

        if (prefillNumbers) {
            setNumbers(prefillNumbers);
        }

        return () => {
            clearInterval(warmupInterval);
            socket.off('wa-queue-status');
            socket.off('wa-status');
            socket.off('wa-optout');
        };
    }, [loadSessions, loadWarmup, loadOptOutConfig, prefillNumbers]);

    const handleSavePrompt = () => {
        if (!aiPrompt.trim()) return;
        const name = prompt('Dê um nome para este prompt:');
        if (!name) return;
        const newPrompts = [...savedPrompts, { name, text: aiPrompt }];
        setSavedPrompts(newPrompts);
        localStorage.setItem('savedAiPrompts', JSON.stringify(newPrompts));
    };

    const handleDeletePrompt = (index) => {
        if (!window.confirm('Excluir este prompt salvo?')) return;
        const newPrompts = savedPrompts.filter((_, i) => i !== index);
        setSavedPrompts(newPrompts);
        localStorage.setItem('savedAiPrompts', JSON.stringify(newPrompts));
    };

    // Quando chegam leads do Maps, montar tabela de contatos para I.A
    useEffect(() => {
        if (prefillLeads && prefillLeads.length > 0) {
            const contacts = prefillLeads.map(lead => ({
                id: lead.id || Math.random().toString(36).slice(2),
                name: lead.name || lead.title || '—',
                phone: lead.phoneFormatted || lead.phone || '',
                address: lead.address || '',
                segmento: lead.query || lead.category || '',
                website: lead.website || '',
                message: '',
                enabled: true,
                loading: false,
                lead,
            }));
            setAiContacts(contacts);
            setAiEnabled(true);
            setAiSectionOpen(true);
        }
    }, [prefillLeads]);

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

    // ── Gerar mensagens I.A em batches paralelos com progress ──────────────────
    const handleGenerateAI = async () => {
        if (!aiPrompt.trim()) return alert('Digite um prompt para a I.A!');
        const key = localStorage.getItem('openRouterKey') || '';
        if (!key) return alert('Configure a chave OpenRouter em Global Settings primeiro!');
        const model = localStorage.getItem('openRouterModel') || 'openai/gpt-4o-mini';
        const companyContext = localStorage.getItem('companyContext') || '';

        abortAiRef.current = false;
        const total = aiContacts.length;
        setIsGenerating(true);
        setAiProgress({ done: 0, total });
        // Marcar todos como loading
        setAiContacts(prev => prev.map(c => ({ ...c, loading: true, message: '' })));

        const leadsToSend = aiContacts.map(c => ({
            ...(c.lead || {}),
            id: c.id,
            name: c.name,
            phoneFormatted: c.phone,
            phone: c.phone,
            address: c.address,
            query: c.segmento,
            website: c.website,
        }));

        const CHUNK = 8;
        try {
            for (let i = 0; i < leadsToSend.length; i += CHUNK) {
                if (abortAiRef.current) {
                    console.log('Geração de I.A cancelada pelo usuário.');
                    break;
                }
                const chunk = leadsToSend.slice(i, i + CHUNK);
                const res = await fetch('http://localhost:3000/api/ai/generate-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leads: chunk, prompt: aiPrompt, companyContext, key, model })
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);

                // Aplicar mensagens geradas para este chunk
                const startIdx = i;
                setAiContacts(prev => {
                    const updated = [...prev];
                    data.results.forEach((result, ri) => {
                        const idx = startIdx + ri;
                        if (updated[idx]) {
                            updated[idx] = { ...updated[idx], message: result.message || '', loading: false };
                        }
                    });
                    return updated;
                });
                setAiProgress({ done: Math.min(i + CHUNK, total), total });
            }
        } catch (e) {
            alert('Erro ao gerar mensagens: ' + e.message);
            setAiContacts(prev => prev.map(c => ({ ...c, loading: false })));
        }
        setIsGenerating(false);
        setAiProgress({ done: total, total });
    };


    // ── Iniciar campanha ──────────────────────────────────────────────────────
    const handleStart = async () => {
        // Obter mensagens manuais previamente configuradas
        const validMessages = [];
        let audioIdx = 0;
        for (const step of waSteps) {
            if (step.type === 'text') {
                if (step.text?.trim()) validMessages.push(step.text.trim());
            } else if (step.type === 'audio') {
                audioIdx++;
                const tag = `wa-audio-${audioIdx}`;
                if (step.audioServerPath) {
                    validMessages.push({ type: 'audio', path: step.audioServerPath });
                } else if (step.audioBlob) {
                    const formData = new FormData();
                    formData.append('audio', step.audioBlob, `${tag}.webm`);
                    formData.append('id', tag);
                    try {
                        const res = await fetch('http://localhost:3000/api/bot/upload-audio', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.success) {
                            validMessages.push({ type: 'audio', path: data.path });
                        } else throw new Error(data.error);
                    } catch (err) { return alert('Erro ao upload áudio: ' + err.message); }
                }
            }
        }

        // Se a tabela de I.A tem contatos, a tabela vira a fonte principal de disparos!
        if (aiContacts.length > 0) {
            const enabledContacts = aiContacts.filter(c => c.enabled && c.phone);
            if (enabledContacts.length === 0) return alert('Nenhum contato habilitado na tabela.');

            if (aiEnabled) {
                // MODO I.A ATIVO: envia a mensagem gerada individual
                const readyToSend = enabledContacts.filter(c => c.message.trim());
                if (readyToSend.length === 0) return alert('Nenhum contato com mensagem gerada. Gere as mensagens primeiro!');

                setStatusHistory([]);
                for (const contact of readyToSend) {
                    try {
                        let finalMessages = [contact.message];
                        if (splitAiMessage) finalMessages = contact.message.split('|||').map(m => m.trim()).filter(m => m.length > 0);

                        await fetch(`${API}/start`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ numbers: [contact.phone], messages: finalMessages, config })
                        });
                    } catch (e) { console.error('Erro:', e); }
                }
                return;
            } else {
                // MODO I.A DESATIVADO: envia a mensagem MANUAL para a lista da tabela!
                const numberList = enabledContacts.map(c => c.phone);
                if (!validMessages.length) return alert('Modo I.A desativado: Adicione pelo menos uma mensagem/áudio manual nas etapas abaixo!');

                setStatusHistory([]);
                try {
                    const r = await fetch(`${API}/start`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ numbers: numberList, messages: validMessages, config })
                    });
                    const d = await r.json();
                    if (!d.success) alert('Erro: ' + d.error);
                } catch (e) { alert('Erro: ' + e.message); }
                return;
            }
        }

        // Modo Estritamente Manual (se não houver tabela de I.A carregada)
        const numberList = numbers.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
        if (!numberList.length || !validMessages.length) return alert('Preencha números e adicione pelo menos uma mensagem/áudio!');
        
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

            {/* ══ I.A PERSONALIZAÇÃO — sempre visível ══════════════════════════ */}
            <div className="rounded-2xl border overflow-hidden transition-all duration-300"
                style={{
                    borderColor: aiEnabled ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)',
                    background: aiEnabled ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.01)'
                }}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setAiSectionOpen(o => !o)}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: aiEnabled ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" style={{ color: aiEnabled ? '#818cf8' : '#64748b' }}>
                                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                                <circle cx="8.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
                                <circle cx="15.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-sm" style={{ color: aiEnabled ? '#a5b4fc' : '#94a3b8' }}>
                                I.A Personalização
                                {aiContacts.length > 0 && (
                                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-normal"
                                        style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
                                        {aiContacts.filter(c => c.enabled).length}/{aiContacts.length} contatos
                                    </span>
                                )}
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5">
                                {aiEnabled ? 'I.A gera mensagem única para cada lead' : 'Desativado — usando mensagem manual'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Toggle global de I.A */}
                        <button
                            onClick={e => { e.stopPropagation(); setAiEnabled(v => !v); }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border"
                            style={aiEnabled
                                ? { background: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.4)', color: '#a5b4fc' }
                                : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: '#475569' }
                            }
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                {aiEnabled
                                    ? <><rect x="1" y="5" width="22" height="14" rx="7" fill="rgba(99,102,241,0.6)" stroke="none" /><circle cx="16" cy="12" r="5" fill="white" stroke="none" /></>
                                    : <><rect x="1" y="5" width="22" height="14" rx="7" fill="rgba(255,255,255,0.08)" stroke="none" /><circle cx="8" cy="12" r="5" fill="#475569" stroke="none" /></>
                                }
                            </svg>
                            {aiEnabled ? 'I.A ON' : 'I.A OFF'}
                        </button>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-600 transition-transform duration-200" style={{ transform: aiSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>

                {/* Body expandível */}
                {aiSectionOpen && (
                    <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-4">

                        {/* Prompt */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-semibold text-slate-400">Prompt da I.A</label>
                                <div className="flex items-center gap-2">
                                    {savedPrompts.length > 0 && (
                                        <select
                                            onChange={e => e.target.value !== '' && setAiPrompt(savedPrompts[e.target.value].text)}
                                            className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 outline-none"
                                        >
                                            <option value="">Carregar salvo...</option>
                                            {savedPrompts.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                                        </select>
                                    )}
                                    <button onClick={handleSavePrompt} className="text-[10px] text-indigo-400 border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 rounded hover:bg-indigo-500/20 transition-all">Salvar Atual</button>
                                </div>
                            </div>
                            {/* Badges de variáveis */}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {['{nome}', '{empresa}', '{endereco}', '{segmento}', '{site}', '{telefone}', '{rating}', '{email}', '{instagram}'].map(v => (
                                    <button key={v}
                                        onClick={() => setAiPrompt(p => p + ' ' + v)}
                                        className="text-xs px-2 py-0.5 rounded-md font-mono transition-all hover:opacity-80"
                                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
                                        {v}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                placeholder="Ex: Olá {nome}! Vi que {empresa} fica em {endereco}. Tenho uma solução incrível para o segmento de {segmento}..."
                                className="w-full rounded-xl p-3 text-sm resize-none h-24 outline-none transition-all"
                                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.2)', color: '#e2e8f0' }}
                            />
                            
                            {/* Toggle para quebra de parágrafos */}
                            <div className="mt-3 flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                    <h4 className="text-sm font-medium text-slate-300">I.A Inteligente (Multi-mensagens)</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">Permite que a I.A decida quando enviar textos separados para parecer mais humano (ex: Oi fulano! [envia] Vi sua empresa... [envia]).</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={splitAiMessage} onChange={(e) => setSplitAiMessage(e.target.checked)} />
                                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                                </label>
                            </div>
                        </div>

                        {/* Botão gerar */}
                        <button
                            onClick={handleGenerateAI}
                            disabled={isGenerating || aiContacts.length === 0}
                            className="w-full py-3 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-40 overflow-hidden"
                            style={{
                                background: isGenerating ? 'rgba(99,102,241,0.12)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                color: 'white',
                                boxShadow: isGenerating ? 'none' : '0 4px 20px rgba(99,102,241,0.3)'
                            }}>
                            {isGenerating ? (
                                <>
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                                            <span>Gerando... {aiProgress.done}/{aiProgress.total}</span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); abortAiRef.current = true; }}
                                            className="bg-red-500/20 text-red-300 hover:bg-red-500/40 px-3 py-1 rounded-lg text-xs font-bold border border-red-500/30 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                    {/* Barra de progresso */}
                                    <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                        <div className="h-1 rounded-full transition-all duration-500" style={{
                                            width: aiProgress.total > 0 ? `${(aiProgress.done / aiProgress.total) * 100}%` : '0%',
                                            background: 'rgba(255,255,255,0.6)'
                                        }} />
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="rgba(255,255,255,0.3)" /></svg>
                                    ✨ Gerar Mensagens com I.A ({aiContacts.filter(c => c.enabled).length} ativos / {aiContacts.length} total)
                                </div>
                            )}
                        </button>

                        {aiContacts.length === 0 && (
                            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-slate-600 flex-shrink-0"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                                <p className="text-xs text-slate-600">Clique em <span className="text-slate-400 font-medium">Abrir no WhatsApp</span> na aba Maps para carregar leads aqui.</p>
                            </div>
                        )}

                        {/* ── TABELA DE CONTATOS ──────────────────────────────── */}
                        {aiContacts.length > 0 && (
                            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                {/* Header da tabela */}
                                <div className="grid gap-2 px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider"
                                    style={{ gridTemplateColumns: '1fr 120px 1fr 40px', background: 'rgba(0,0,0,0.3)' }}>
                                    <span>Nome / Empresa</span>
                                    <span>Telefone</span>
                                    <span>Mensagem I.A</span>
                                    <span className="text-center">✓</span>
                                </div>
                                {/* Rows */}
                                <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)', maxHeight: '360px', overflowY: 'auto' }}>
                                    {aiContacts.map((contact, idx) => (
                                        <div key={contact.id}
                                            className="grid gap-2 px-3 py-2.5 transition-all"
                                            style={{
                                                gridTemplateColumns: '1fr 120px 1fr 40px',
                                                background: contact.enabled ? 'transparent' : 'rgba(0,0,0,0.2)',
                                                opacity: contact.enabled ? 1 : 0.45
                                            }}>
                                            {/* Nome */}
                                            <div className="flex flex-col justify-center min-w-0">
                                                <p className="text-xs font-semibold text-slate-200 truncate">{contact.name}</p>
                                                {contact.address && <p className="text-[10px] text-slate-600 truncate">{contact.address}</p>}
                                                {contact.segmento && <p className="text-[10px] text-indigo-400/60 truncate">{contact.segmento}</p>}
                                            </div>
                                            {/* Telefone */}
                                            <div className="flex items-center">
                                                <span className="text-xs font-mono text-emerald-400 truncate">{contact.phone}</span>
                                            </div>
                                            {/* Mensagem editável */}
                                            <div className="relative">
                                                {contact.loading ? (
                                                    <div className="flex items-center gap-2 h-full">
                                                        <svg className="w-3 h-3 animate-spin text-indigo-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                                                        <span className="text-xs text-slate-600 italic">Gerando...</span>
                                                    </div>
                                                ) : (
                                                    <textarea
                                                        value={contact.message}
                                                        onChange={e => setAiContacts(prev => prev.map((c, i) => i === idx ? { ...c, message: e.target.value } : c))}
                                                        placeholder="Mensagem será gerada pela I.A..."
                                                        className="w-full text-xs resize-none rounded-lg p-2 outline-none transition-all custom-scrollbar"
                                                        style={{
                                                            background: 'rgba(0,0,0,0.25)',
                                                            border: contact.message ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.06)',
                                                            color: '#cbd5e1',
                                                            height: '64px',
                                                            lineHeight: '1.4'
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {/* Toggle individual */}
                                            <div className="flex items-center justify-center">
                                                <button
                                                    onClick={() => setAiContacts(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c))}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                                    style={contact.enabled
                                                        ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }
                                                        : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#475569' }
                                                    }
                                                    title={contact.enabled ? 'Clique para excluir do disparo' : 'Clique para incluir no disparo'}
                                                >
                                                    {contact.enabled
                                                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Footer da tabela */}
                                <div className="flex items-center justify-between px-3 py-2 text-xs" style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span className="text-slate-600">
                                        {aiContacts.filter(c => c.enabled && c.message).length} prontos para envio
                                        · {aiContacts.filter(c => !c.enabled).length} desativados
                                    </span>
                                    <div className="flex gap-2">
                                        <button onClick={() => setAiContacts(prev => prev.map(c => ({ ...c, enabled: true })))} className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">Ativar todos</button>
                                        <span className="text-slate-700">·</span>
                                        <button onClick={() => setAiContacts(prev => prev.map(c => ({ ...c, enabled: false })))} className="text-slate-500 hover:text-slate-400 text-xs transition-colors">Desativar todos</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

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
                                    <div key={s.name} className={`flex items-center justify-between p-3 rounded-xl border ${s.name === currentSession ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/5 bg-slate-900/40'}`}>
                                        <div className="flex items-center gap-2">
                                            {s.name === currentSession && <CheckCircle className="w-4 h-4 text-purple-400" />}
                                            <span className="text-sm font-mono text-slate-200">
                                                {s.label || s.name} {s.phone && <span className="text-xs text-slate-500">({s.phone})</span>}
                                            </span>
                                            {s.name === currentSession && <span className="text-xs text-purple-400">(ativa)</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            {s.name !== currentSession && (
                                                <>
                                                    <button onClick={() => switchToSession(s.name)} disabled={sessionLoading}
                                                        className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center gap-1">
                                                        {sessionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />} Conectar
                                                    </button>
                                                    <button onClick={() => handleDeleteSession(s.name)}
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
                <div className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
                    <div 
                        className="flex items-center gap-3 cursor-pointer flex-1"
                        onClick={() => setAntiBanOpen(o => !o)}
                    >
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
                        <button 
                            type="button" 
                            className="p-1" 
                            onClick={() => setAntiBanOpen(o => !o)}
                        >
                            {antiBanOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </button>
                    </div>
                </div>

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
                <label className="text-sm font-medium text-slate-300 mb-2 flex justify-between items-center">
                    <span>Números <span className="text-slate-500 text-xs">(um por linha)</span></span>
                    {numbers.trim() && (
                        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                            {numbers.split(/[\n,]+/).map(n => n.trim()).filter(Boolean).length} contatos
                        </span>
                    )}
                </label>
                <textarea
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 h-32 outline-none resize-none custom-scrollbar transition-all hover:border-slate-600 focus:ring-2 focus:ring-green-500/50"
                    placeholder={"5511999999999\n5511888888888"}
                    value={numbers}
                    onChange={e => setNumbers(e.target.value)}
                />
                <p className="text-xs text-slate-600 mt-1 ml-1">DDI + DDD + Número (ex: 5511...)</p>
            </div>

            {/* ── MENSAGENS E ÁUDIOS ────────────────────────────────────────────── */}
            <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                    Mensagens <span className="text-slate-500 text-xs ml-1">(enviadas em sequência)</span>
                </label>
                <div className="bg-slate-900/30 p-4 rounded-xl border border-white/5">
                    <DmWorkflowBuilder
                        steps={waSteps}
                        onChange={setWaSteps}
                    />
                </div>
                {waSteps.length > 1 && (
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

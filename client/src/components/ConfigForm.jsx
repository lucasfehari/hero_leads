import React, { useState, useEffect } from 'react';
import { Hash, User, MessageCircle, Send, PlayCircle, Users, Trash2, Brain } from 'lucide-react';

import DmWorkflowBuilder from './DmWorkflowBuilder';

const ConfigForm = ({ onStart, isRunning }) => {
    const [config, setConfig] = useState({
        keywords: '',
        competitors: '',
        commentTemplate: 'Excelente! 🔥, Adorei! 👏',
        delayMin: 5,
        delayMax: 15,
        targetListEnabled: false,
        targetList: '',
        excludedKeywords: [],
        aiMode: false,
        aiPrompt: 'Procure por donos de clínicas de estética. Gere uma mensagem curta elogiando o trabalho deles.',
        aiAutoMessage: false,
        aiDontDo: '',
        // Session Limits
        sessionMaxActions: '',
        stopAtTime: '',
        sleepEnabled: false,
        sleepStart: '23:00',
        sleepEnd: '08:00',
    });
    const [excludedInput, setExcludedInput] = useState('');
    const [dmSteps, setDmSteps] = useState([]); // [{type:'text'|'audio', text?, audioBlob?, audioUrl?, audioFilename?, audioServerPath?}]

    // Load saved config
    useEffect(() => {
        const savedConfig = localStorage.getItem('instagramConfig');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                setConfig(prev => ({ ...prev, ...parsed }));
            } catch (e) { }
        }
    }, []);

    // Save config on change
    useEffect(() => {
        localStorage.setItem('instagramConfig', JSON.stringify(config));
    }, [config]);

    const handleChange = (e) => {
        setConfig({ ...config, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Serialize dmSteps → dmTemplate string (;;;) and upload new audio blobs
        const finalAudios = [];
        const parts = [];
        let audioIdx = 0;

        for (const step of dmSteps) {
            if (step.type === 'text') {
                if (step.text?.trim()) parts.push(step.text.trim());
            } else if (step.type === 'audio') {
                audioIdx++;
                const tag = `@audio${audioIdx}`;

                if (step.audioServerPath) {
                    // Already on server — reuse path directly
                    finalAudios.push({ id: tag, path: step.audioServerPath });
                } else if (step.audioBlob) {
                    // New recording/upload — send to server
                    const formData = new FormData();
                    formData.append('audio', step.audioBlob, `${tag}.webm`);
                    formData.append('id', tag);
                    try {
                        const res = await fetch('http://localhost:3000/api/bot/upload-audio', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.success) finalAudios.push({ id: tag, path: data.path });
                        else throw new Error(data.error);
                    } catch (err) {
                        alert('Erro ao fazer upload do áudio: ' + err.message);
                        return;
                    }
                }
                parts.push(tag);
            }
        }

        const dmTemplate = parts.join(' ;;; ');

        onStart({ ...config, profile: selectedProfile, dmTemplate, audios: finalAudios });
    };

    const [profiles, setProfiles] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState('');
    const [newProfileName, setNewProfileName] = useState('');
    const [showAddProfile, setShowAddProfile] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const fetchProfiles = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/profiles');
            const data = await res.json();
            if (data.profiles) setProfiles(data.profiles);
        } catch (err) {
            console.error("Error loading profiles:", err);
        }
    };

    React.useEffect(() => {
        fetchProfiles();
    }, []);

    const handleSwitchProfile = async (profileName) => {
        setSelectedProfile(profileName);
        console.log("Switching to profile:", profileName);
        try {
            await fetch('http://localhost:3000/api/profiles/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: profileName })
            });
            alert(`Perfil ${profileName} ativado!`);
        } catch (e) {
            alert("Erro ao trocar perfil: " + e.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            {/* INSTAGRAM SESSION MANAGER */}
            <div className="rounded-xl border overflow-hidden" style={{ background: 'rgba(1,3,38,0.4)', borderColor: 'rgba(23,191,96,0.12)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(23,191,96,0.1)' }}>
                    <label className="text-sm font-semibold flex items-center gap-2" style={{ color: '#BCF285' }}>
                        <User className="w-4 h-4" style={{ color: '#17BF60' }} /> Contas Instagram
                        <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(23,191,96,0.12)', color: '#17A655' }}>
                            {profiles.length} conta{profiles.length !== 1 ? 's' : ''}
                        </span>
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowAddProfile(!showAddProfile)}
                        disabled={isRunning}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ background: 'rgba(23,191,96,0.12)', color: '#17BF60', border: '1px solid rgba(23,191,96,0.2)' }}
                    >
                        {showAddProfile ? '✕ Cancelar' : '+ Nova Conta'}
                    </button>
                </div>

                {/* Add account form */}
                {showAddProfile && (
                    <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: 'rgba(23,191,96,0.1)', background: 'rgba(23,191,96,0.04)' }}>
                        <input
                            placeholder="Nome do perfil (ex: Loja01, Pessoal...)"
                            className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all"
                            style={{ background: 'rgba(1,3,38,0.7)', border: '1px solid rgba(23,191,96,0.2)' }}
                            value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={async () => {
                                if (!newProfileName.trim()) return alert('Digite um nome para a conta!');
                                alert('O navegador vai abrir. Faça login no Instagram e aguarde fechar sozinho!');
                                setIsLoggingIn(true);
                                try {
                                    const res = await fetch('http://localhost:3000/api/profiles/login', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ name: newProfileName.trim() })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        setShowAddProfile(false);
                                        setNewProfileName('');
                                        await fetchProfiles();
                                        handleSwitchProfile(data.profile || newProfileName.trim());
                                    } else {
                                        alert('Erro ao salvar: ' + (data.error || 'Desconhecido'));
                                    }
                                } catch (e) { alert('Erro de conexão: ' + e.message); }
                                setIsLoggingIn(false);
                            }}
                            disabled={isLoggingIn || !newProfileName.trim()}
                            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2"
                            style={isLoggingIn
                                ? { background: 'rgba(100,116,139,0.3)', color: '#64748b', cursor: 'wait' }
                                : { background: 'linear-gradient(135deg, #17BF60, #17A655)', color: '#010326' }}
                        >
                            {isLoggingIn ? '⏳ Aguardando Login...' : '🌐 Abrir Navegador & Logar'}
                        </button>
                    </div>
                )}

                {/* Account list */}
                <div className="divide-y" style={{ divideColor: 'rgba(23,191,96,0.06)' }}>
                    {profiles.length === 0 && (
                        <div className="text-center py-6 text-sm" style={{ color: '#475569' }}>
                            Nenhuma conta adicionada.<br />
                            <span style={{ color: '#17A655' }}>Clique em "+ Nova Conta" para começar.</span>
                        </div>
                    )}
                    {profiles.map(p => {
                        const name = typeof p === 'object' ? p.name : p;
                        const updatedAt = typeof p === 'object' ? p.updated_at : null;
                        const isActive = selectedProfile === name;
                        return (
                            <div key={name}
                                className="flex items-center gap-3 px-4 py-3 transition-all"
                                style={{ background: isActive ? 'rgba(23,191,96,0.06)' : 'transparent' }}>
                                {/* Avatar placeholder or Image */}
                                {p.profile_pic ? (
                                    <img src={p.profile_pic} className="w-8 h-8 rounded-full shrink-0 object-cover border border-white/10" alt="Profile" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                        style={{ background: isActive ? 'rgba(23,191,96,0.2)' : 'rgba(100,116,139,0.15)', color: isActive ? '#17BF60' : '#64748b' }}>
                                        {name[0].toUpperCase()}
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white truncate">
                                            {p.username ? `@${p.username}` : name}
                                        </span>
                                        {isActive && (
                                            <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0 font-medium"
                                                style={{ background: 'rgba(23,191,96,0.15)', color: '#17BF60' }}>
                                                ativo
                                            </span>
                                        )}
                                    </div>
                                    {updatedAt && (
                                        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                                            Último login: {new Date(updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {!isActive && (
                                        <button type="button" onClick={() => handleSwitchProfile(name)}
                                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                                            style={{ background: 'rgba(23,191,96,0.1)', color: '#17BF60', border: '1px solid rgba(23,191,96,0.2)' }}
                                            title="Usar esta conta">
                                            Usar
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!confirm(`Apagar a conta "${name}"? A sessão será removida e será necessário fazer login novamente.`)) return;
                                            try {
                                                await fetch(`http://localhost:3000/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
                                                if (selectedProfile === name) setSelectedProfile('');
                                                await fetchProfiles();
                                            } catch (e) { alert('Erro ao apagar: ' + e.message); }
                                        }}
                                        className="p-1.5 rounded-lg transition-all"
                                        style={{ color: '#475569' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent'; }}
                                        title="Apagar conta"
                                        disabled={isRunning}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>


            {/* IGNORE HISTORY TOGGLE */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-amber-500/20">
                <div className="flex items-center justify-between">
                    <div>
                        <label className="text-sm font-medium text-amber-400 flex items-center gap-2 cursor-pointer">
                            <span className="text-lg">⚡</span> Ignorar Histórico (Retargeting)
                        </label>
                        <p className="text-xs text-slate-500 mt-1">
                            Envia para todos, mesmo quem já recebeu mensagem antes.
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        name="ignoreHistory"
                        checked={config.ignoreHistory || false}
                        onChange={(e) => setConfig({ ...config, ignoreHistory: e.target.checked })}
                        className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                        disabled={isRunning}
                    />
                </div>
            </div>

            {/* AI PROSPECTING MODE */}
            <div
                className="rounded-xl border overflow-hidden transition-all"
                style={config.aiMode || config.aiAutoMessage
                    ? { background: 'rgba(1,3,38,0.6)', borderColor: 'rgba(56,189,248,0.35)' }
                    : { background: 'rgba(1,3,38,0.3)', borderColor: 'rgba(255,255,255,0.06)' }}
            >
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-3">
                    <label className="text-sm font-medium text-sky-400 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-sky-400" /> Prospecção com I.A. (OpenRouter)
                    </label>
                    <input
                        type="checkbox"
                        name="aiMode"
                        checked={config.aiMode || false}
                        onChange={(e) => setConfig({ ...config, aiMode: e.target.checked })}
                        className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                        disabled={isRunning}
                    />
                </div>

                {/* Campaign Prompt — shows when aiMode ON */}
                {config.aiMode && (
                    <div className="px-4 pb-3 animate-in fade-in slide-in-from-top-2">
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-sky-500/20">
                            <label className="text-xs text-sky-300 font-semibold mb-1 block">🎯 Objetivo da Campanha (Prompt Alvo)</label>
                            <p className="text-[10px] text-slate-400 mb-2">Descreva exatamente que tipo de lead a IA deve buscar hoje.</p>
                            <textarea
                                name="aiPrompt"
                                value={config.aiPrompt || ''}
                                onChange={handleChange}
                                rows={2}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all text-sm resize-none custom-scrollbar"
                                placeholder="Ex: Procure por donos de padarias em SP..."
                                disabled={isRunning}
                            />
                        </div>
                    </div>
                )}

                {/* ─── 🤖 AI AUTO MESSAGE — always visible inside this card ─── */}
                <div
                    className="mx-4 mb-4 rounded-xl p-4 space-y-3 border transition-all"
                    style={config.aiAutoMessage
                        ? { background: 'linear-gradient(135deg, rgba(168,85,247,0.14), rgba(56,189,248,0.07))', borderColor: 'rgba(168,85,247,0.5)' }
                        : { background: 'rgba(168,85,247,0.04)', borderColor: 'rgba(168,85,247,0.18)' }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <label className="text-sm font-bold flex items-center gap-2 cursor-pointer" style={{ color: config.aiAutoMessage ? '#e9d5ff' : '#a78bfa' }}>
                                <span className="text-lg">🤖</span>
                                Deixe a I.A. enviar a mensagem
                                {config.aiAutoMessage && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'rgba(168,85,247,0.25)', color: '#c4b5fd', border: '1px solid rgba(168,85,247,0.4)' }}>
                                        ATIVO
                                    </span>
                                )}
                            </label>
                            <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                                A I.A. lê o perfil e escreve uma mensagem 100% personalizada para converter — sem usar o template manual.
                            </p>
                        </div>
                        <input
                            id="aiAutoMessage"
                            type="checkbox"
                            checked={config.aiAutoMessage || false}
                            onChange={(e) => setConfig({
                                ...config,
                                aiAutoMessage: e.target.checked,
                                // Auto-enable aiMode when aiAutoMessage is turned on
                                aiMode: e.target.checked ? true : config.aiMode
                            })}
                            className="w-5 h-5 accent-purple-500 rounded cursor-pointer mt-0.5 shrink-0"
                            disabled={isRunning}
                        />
                    </div>

                    {config.aiAutoMessage && (
                        <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2">

                            {/* Restrictions */}
                            <div>
                                <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: '#fca5a5' }}>
                                    <span>🚫</span> O que a I.A. NÃO deve fazer
                                </label>
                                <textarea
                                    id="aiDontDo"
                                    name="aiDontDo"
                                    value={config.aiDontDo || ''}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all resize-none placeholder:text-slate-600"
                                    style={{ background: 'rgba(1,3,38,0.7)', border: '1px solid rgba(248,113,113,0.3)' }}
                                    placeholder={"Ex:\n- Não mencionar preços ou valores\n- Não usar palavras como \"gratis\"\n- Não ser muito formal ou robótico\n- Não mandar links externos"}
                                    disabled={isRunning}
                                />
                                <p className="text-xs mt-1" style={{ color: '#475569' }}>Deixe em branco se não houver restrições.</p>
                            </div>

                            {/* How it works */}
                            <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(168,85,247,0.15)' }}>
                                <p className="font-semibold mb-1.5" style={{ color: '#a78bfa' }}>💡 Como funciona:</p>
                                <ol className="list-decimal list-inside space-y-1" style={{ color: '#64748b' }}>
                                    <li>Analisa o perfil: bio, nome, nicho</li>
                                    <li>Decide se é lead com base no Objetivo acima</li>
                                    <li>Escreve mensagem citando dados reais do perfil</li>
                                    <li>Escolhe CTA ideal para converter aquela pessoa</li>
                                    <li>Envia — template manual ignorado</li>
                                </ol>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ROTATION SETTINGS */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <User className="w-4 h-4 text-orange-400" /> Rotação de Contas (Multi-Login)
                    </label>
                    <input
                        type="checkbox"
                        name="rotationEnabled"
                        checked={config.rotationEnabled || false}
                        onChange={(e) => setConfig({ ...config, rotationEnabled: e.target.checked })}
                        className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                        disabled={isRunning}
                    />
                </div>
                {config.rotationEnabled && (
                    <div className="text-xs text-slate-500">
                        O bot vai usar <strong>TODAS</strong> as contas salvas, trocando a cada:
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                name="rotationLimit"
                                value={config.rotationLimit || 10}
                                onChange={handleChange}
                                className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-center"
                                min="1"
                            />
                            <span>ações (Seguir/DM), depois troca para a próxima conta.</span>
                        </div>
                    </div>
                )}
            </div>

            {/* SESSION LIMITS */}
            <div
                className="rounded-xl border p-4 space-y-4"
                style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.22)' }}
            >
                <div>
                    <label className="text-sm font-semibold flex items-center gap-2" style={{ color: '#a5b4fc' }}>
                        🛡️ Limites de Sessão
                        <span className="text-xs font-normal" style={{ color: '#475569' }}>— segurança automática</span>
                    </label>
                    <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                        O bot para sozinho quando atingir qualquer um desses limites.
                    </p>
                </div>

                {/* Row: Max interactions + Stop at time */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>
                            🎯 Máx. de pessoas (sessão)
                        </label>
                        <input
                            id="sessionMaxActions"
                            type="number"
                            name="sessionMaxActions"
                            value={config.sessionMaxActions || ''}
                            onChange={handleChange}
                            min="1"
                            placeholder="Ex: 50"
                            className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all placeholder:text-slate-600"
                            style={{ background: 'rgba(1,3,38,0.6)', border: '1px solid rgba(99,102,241,0.25)' }}
                            disabled={isRunning}
                        />
                        <p className="text-xs mt-1" style={{ color: '#475569' }}>Para ao interagir com N pessoas</p>
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>
                            ⏰ Parar às (horário)
                        </label>
                        <input
                            id="stopAtTime"
                            type="time"
                            name="stopAtTime"
                            value={config.stopAtTime || ''}
                            onChange={handleChange}
                            className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all"
                            style={{ background: 'rgba(1,3,38,0.6)', border: '1px solid rgba(99,102,241,0.25)', colorScheme: 'dark' }}
                            disabled={isRunning}
                        />
                        <p className="text-xs mt-1" style={{ color: '#475569' }}>Encerra a sessão nesse horário</p>
                    </div>
                </div>

                {/* Sleep schedule */}
                <div className="rounded-lg p-3 space-y-3" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#a5b4fc' }}>
                                😴 Modo Sono
                            </label>
                            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Bot pausa entre esses horários (suporte overnight)</p>
                        </div>
                        <input
                            id="sleepEnabled"
                            type="checkbox"
                            name="sleepEnabled"
                            checked={config.sleepEnabled || false}
                            onChange={(e) => setConfig({ ...config, sleepEnabled: e.target.checked })}
                            className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                            disabled={isRunning}
                        />
                    </div>

                    {config.sleepEnabled && (
                        <div className="flex items-end gap-2 animate-in fade-in slide-in-from-top-1">
                            <div className="flex-1">
                                <p className="text-xs mb-1" style={{ color: '#64748b' }}>Dormir às</p>
                                <input
                                    id="sleepStart"
                                    type="time"
                                    name="sleepStart"
                                    value={config.sleepStart || '23:00'}
                                    onChange={handleChange}
                                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                                    style={{ background: 'rgba(1,3,38,0.7)', border: '1px solid rgba(99,102,241,0.3)', colorScheme: 'dark' }}
                                    disabled={isRunning}
                                />
                            </div>
                            <span className="pb-2.5 font-bold" style={{ color: '#4f46e5' }}>→</span>
                            <div className="flex-1">
                                <p className="text-xs mb-1" style={{ color: '#64748b' }}>Acordar às</p>
                                <input
                                    id="sleepEnd"
                                    type="time"
                                    name="sleepEnd"
                                    value={config.sleepEnd || '08:00'}
                                    onChange={handleChange}
                                    className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                                    style={{ background: 'rgba(1,3,38,0.7)', border: '1px solid rgba(99,102,241,0.3)', colorScheme: 'dark' }}
                                    disabled={isRunning}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* STRATEGY SETTINGS 
            <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <PlayCircle className="w-4 h-4 text-pink-500" /> Modo Apenas Reels 🎥
                    </label>
                    <input
                        type="checkbox"
                        name="onlyReels"
                        checked={config.onlyReels || false}
                        onChange={(e) => setConfig({ ...config, onlyReels: e.target.checked })}
                        className="w-5 h-5 accent-pink-500 rounded cursor-pointer"
                        disabled={isRunning}
                    />
                </div>
                <p className="text-xs text-slate-500">
                    Se ativado, o bot vai ignorar hashtags e focar 100% em explorar Reels, interagir e enviar mensagens.
                </p>
            </div>
*/}

            {/* TARGET LIST MODE */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Users className="w-4 h-4 text-cyan-400" /> Disparo por Lista (Alvos Específicos)
                    </label>
                    <input
                        type="checkbox"
                        name="targetListEnabled"
                        checked={config.targetListEnabled || false}
                        onChange={(e) => setConfig({ ...config, targetListEnabled: e.target.checked })}
                        className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                        disabled={isRunning}
                    />
                </div>

                {config.targetListEnabled && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                        <p className="text-xs text-slate-500">Cole os @usernames abaixo (um por linha ou separados por vírgula):</p>
                        <textarea
                            name="targetList"
                            value={config.targetList || ''}
                            onChange={handleChange}
                            rows={4}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600 custom-scrollbar resize-none"
                            placeholder="@neymarjr&#10;@cristiano&#10;messi"
                            disabled={isRunning}
                        />
                    </div>
                )}
            </div>

            {!config.targetListEnabled && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-2 text-slate-400 mb-2 text-sm font-medium">
                                <Hash className="w-4 h-4 text-emerald-500" /> Hashtags (Busca)
                            </label>
                            <input
                                type="text"
                                name="hashtags"
                                value={config.hashtags || ''}
                                onChange={handleChange}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600"
                                placeholder="#marketing, #vendas"
                                disabled={isRunning}
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-slate-400 mb-2 text-sm font-medium">
                                <User className="w-4 h-4 text-blue-500" /> Palavras-Chave (Filtro)
                            </label>
                            <input
                                type="text"
                                name="interestKeywords"
                                value={config.interestKeywords || ''}
                                onChange={handleChange}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                                placeholder="loja, promoção, moda"
                                disabled={isRunning}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-1">Hashtags: Onde o bot vai procurar. Palavras-Chave: O que o bot vai ler (Bios/Reels) para aprovar.</p>
                </div>
            )}

            {/* EXCLUDED KEYWORDS — Tag Input */}
            <div
                className="rounded-xl border p-4 space-y-3"
                style={{ background: 'rgba(248,113,113,0.04)', borderColor: 'rgba(248,113,113,0.18)' }}
            >
                <div>
                    <label className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: '#fca5a5' }}>
                        <span>🛡️</span> Palavras-chave para Ignorar
                    </label>
                    <p className="text-xs mb-3" style={{ color: '#64748b' }}>
                        Usuários cujo username, nome ou bio contenham qualquer uma dessas palavras serão pulados automaticamente.
                    </p>

                    {/* Tag bubbles */}
                    {(config.excludedKeywords || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {(config.excludedKeywords || []).map((kw, i) => (
                                <span
                                    key={i}
                                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                                    style={{ background: 'rgba(248,113,113,0.14)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.25)' }}
                                >
                                    {kw}
                                    <button
                                        type="button"
                                        disabled={isRunning}
                                        onClick={() => setConfig(c => ({ ...c, excludedKeywords: c.excludedKeywords.filter((_, j) => j !== i) }))}
                                        className="leading-none opacity-70 hover:opacity-100 transition-opacity"
                                        style={{ fontSize: '0.85rem' }}
                                    >×</button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Input row */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={excludedInput}
                            onChange={e => setExcludedInput(e.target.value)}
                            onKeyDown={e => {
                                if ((e.key === 'Enter' || e.key === ',') && excludedInput.trim()) {
                                    e.preventDefault();
                                    const kw = excludedInput.toLowerCase().trim();
                                    if (kw && !(config.excludedKeywords || []).includes(kw)) {
                                        setConfig(c => ({ ...c, excludedKeywords: [...(c.excludedKeywords || []), kw] }));
                                    }
                                    setExcludedInput('');
                                }
                                if (e.key === 'Backspace' && !excludedInput && (config.excludedKeywords || []).length > 0) {
                                    setConfig(c => ({ ...c, excludedKeywords: c.excludedKeywords.slice(0, -1) }));
                                }
                            }}
                            disabled={isRunning}
                            placeholder="Digite e pressione Enter... (ex: concorrente, agência, bot)"
                            className="flex-1 rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all placeholder:text-slate-600"
                            style={{ background: 'rgba(1,3,38,0.6)', border: '1px solid rgba(248,113,113,0.22)' }}
                        />
                        <button
                            type="button"
                            disabled={isRunning || !excludedInput.trim()}
                            onClick={() => {
                                const kw = excludedInput.toLowerCase().trim();
                                if (kw && !(config.excludedKeywords || []).includes(kw)) {
                                    setConfig(c => ({ ...c, excludedKeywords: [...(c.excludedKeywords || []), kw] }));
                                }
                                setExcludedInput('');
                            }}
                            className="px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={{ background: 'rgba(248,113,113,0.15)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.25)' }}
                        >+ Add</button>
                    </div>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
                <div>
                    <label className="flex items-center gap-2 text-slate-400 mb-2 text-sm font-medium">
                        <MessageCircle className="w-4 h-4 text-orange-500" /> Comentários (Spintax)
                    </label>
                    <textarea
                        name="commentTemplate"
                        value={config.commentTemplate || ''}
                        onChange={handleChange}
                        rows={3}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all placeholder:text-slate-600 resize-none"
                        placeholder="Excelente! | Muito bom! | Adorei o post! (Use '|' para variar)"
                        disabled={isRunning}
                    />
                    <p className="text-xs text-slate-500 mt-1 ml-1">O bot vai escolher uma opção aleatória por vez.</p>
                </div>

                <div>
                    <label className="flex items-center gap-2 text-slate-400 mb-3 text-sm font-medium">
                        <Send className="w-4 h-4 text-purple-500" /> Mensagem Direct — Sequência de Envio
                    </label>
                    <DmWorkflowBuilder
                        steps={dmSteps}
                        onChange={setDmSteps}
                    />

                    {/* Template Variables Hint */}
                    <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.18)' }}>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#c4b5fd' }}>
                            <span>✨</span> Variáveis de Personalização — substituídas automaticamente por dados reais de cada perfil
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
                            {[
                                ['{nome}', 'Primeiro nome (ex: Mariana)'],
                                ['{nome_completo}', 'Nome completo do perfil'],
                                ['{usuario}', '@username do perfil'],
                                ['{nicho}', 'Primeira frase da bio (ex: Dentista)'],
                                ['{bio}', 'Primeiros 100 caracteres da bio'],
                            ].map(([variable, desc]) => (
                                <div key={variable} className="flex items-baseline gap-1.5">
                                    <code
                                        className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                                        style={{ background: 'rgba(168,85,247,0.15)', color: '#e9d5ff' }}
                                    >{variable}</code>
                                    <span className="text-xs" style={{ color: '#64748b' }}>{desc}</span>
                                </div>
                            ))}
                        </div>
                        <div className="rounded p-2 text-xs" style={{ background: 'rgba(0,0,0,0.25)' }}>
                            <span style={{ color: '#64748b' }}>Exemplo: </span>
                            <span style={{ color: '#a78bfa' }}>
                                "Oi {'{nome}'}, vi que você atua em {'{nicho}'}! Tenho algo que pode te ajudar 🚀"
                            </span>
                            <br />
                            <span style={{ color: '#475569' }}>→ </span>
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                "Oi Mariana, vi que você atua em Clínica de Estética! Tenho algo que pode te ajudar 🚀"
                            </span>
                        </div>
                    </div>
                </div>
            </div>



            <div className="pt-6">
                <button
                    type="submit"
                    disabled={isRunning}
                    className={`w-full flex justify-center items-center gap-2 py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${isRunning
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/20 hover:shadow-emerald-900/40 transform hover:-translate-y-0.5'
                        }`}
                >
                    {isRunning ? (
                        <>Bot Rodando...</>
                    ) : (
                        <>
                            <PlayCircle className="w-6 h-6" /> Iniciar Automação
                        </>
                    )}
                </button>
            </div>
        </form>
    );
};

export default ConfigForm;

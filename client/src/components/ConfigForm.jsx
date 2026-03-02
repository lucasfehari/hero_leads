import React, { useState } from 'react';
import { Hash, User, MessageCircle, Send, PlayCircle, Users, Trash2 } from 'lucide-react';

import DmWorkflowBuilder from './DmWorkflowBuilder';

const ConfigForm = ({ onStart, isRunning }) => {
    const [config, setConfig] = useState({
        keywords: '',
        competitors: '',
        commentTemplate: 'Excelente! 🔥, Adorei! 👏',
        delayMin: 5,
        delayMax: 15,
        targetListEnabled: false,
        targetList: ''
    });
    const [dmSteps, setDmSteps] = useState([]); // [{type:'text'|'audio', text?, audioBlob?, audioUrl?, audioFilename?, audioServerPath?}]

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
                                {/* Avatar placeholder */}
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                    style={{ background: isActive ? 'rgba(23,191,96,0.2)' : 'rgba(100,116,139,0.15)', color: isActive ? '#17BF60' : '#64748b' }}>
                                    {name[0].toUpperCase()}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{name}</span>
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

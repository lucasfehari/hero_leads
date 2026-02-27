import React, { useState } from 'react';
import { Hash, User, MessageCircle, Send, PlayCircle, Users } from 'lucide-react';
import AudioRecorderSlot from './AudioRecorderSlot';

const ConfigForm = ({ onStart, isRunning }) => {
    const [config, setConfig] = useState({
        keywords: '',
        competitors: '',
        dmTemplate: 'Hi {name}, love your content! Are you interested in...',
        commentTemplate: 'Awesome! 🔥, Great content! 👏',
        delayMin: 5,
        delayMax: 15,
        targetListEnabled: false,
        targetList: ''
    });

    const handleChange = (e) => {
        setConfig({ ...config, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        let finalAudios = [];
        if (config.audios && config.audios.length > 0) {
            setIsLoggingIn(true); // Reusing this loading state for the button
            try {
                // Upload each audio to the server
                for (const aud of config.audios) {
                    if (aud.file) {
                        const formData = new FormData();
                        formData.append('audio', aud.file, `${aud.id}.webm`);
                        formData.append('id', aud.id);

                        const res = await fetch('http://localhost:3000/api/bot/upload-audio', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();
                        if (data.success) {
                            finalAudios.push({ id: aud.id, path: data.path });
                        } else {
                            throw new Error(data.error || 'Failed to upload audio');
                        }
                    }
                }
            } catch (err) {
                alert('Erro ao fazer upload dos áudios: ' + err.message);
                setIsLoggingIn(false);
                return;
            }
            setIsLoggingIn(false);
        }

        onStart({ ...config, profile: selectedProfile, audios: finalAudios });
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

            {/* PROFILE SWITCHER */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <User className="w-4 h-4 text-purple-400" /> Conta Conectada
                    </label>
                    <button type="button" onClick={() => setShowAddProfile(!showAddProfile)} className="text-xs text-purple-400 hover:text-purple-300">
                        + Adicionar Nova
                    </button>
                </div>

                {showAddProfile ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <input
                            placeholder="Nome do Perfil (ex: Loja 01)"
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white"
                            value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={async () => {
                                if (!newProfileName) return alert('Digite um nome para o perfil!');
                                alert('Vou abrir o navegador. Faça login no Instagram e espere ele fechar sozinho!');
                                setIsLoggingIn(true);
                                try {
                                    const res = await fetch('http://localhost:3000/api/profiles/login', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ name: newProfileName })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        setShowAddProfile(false);
                                        setProfiles([...profiles, newProfileName]);
                                        handleSwitchProfile(newProfileName);
                                        alert('Perfil Salvo com Sucesso!');
                                    } else {
                                        alert('Erro ao salvar: ' + (data.error || 'Desconhecido'));
                                    }
                                } catch (e) {
                                    alert('Erro de conexão: ' + e.message);
                                }
                                setIsLoggingIn(false);
                            }}
                            disabled={isLoggingIn}
                            className={`w-full py-2 rounded text-sm font-bold text-white transition-all ${isLoggingIn ? 'bg-slate-600 cursor-wait' : 'bg-purple-600 hover:bg-purple-500'}`}
                        >
                            {isLoggingIn ? 'Aguardando Login...' : 'Abrir Navegador & Logar'}
                        </button>
                    </div>
                ) : (
                    <select
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white appearance-none cursor-pointer"
                        value={selectedProfile}
                        onChange={(e) => handleSwitchProfile(e.target.value)}
                    >
                        <option value="">Selecione um Perfil...</option>
                        {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                )}
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
                    <label className="flex items-center gap-2 text-slate-400 mb-2 text-sm font-medium">
                        <Send className="w-4 h-4 text-purple-500" /> Mensagem Direct (Spintax & Sequência)
                    </label>
                    <textarea
                        name="dmTemplate"
                        value={config.dmTemplate || ''}
                        onChange={handleChange}
                        rows={4}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600 resize-none"
                        placeholder="Olá! ;;; Tudo bem? | Oi! ;;; Vi seu perfil! (Use ';;;' para enviar 2 msgs seguidas e @audio1 para enviar áudio)"
                        disabled={isRunning}
                    />
                    <p className="text-xs text-slate-500 mt-1 ml-1">Vazio = Desativado. '|' = Variação. ';;;' = Sequência. '@audio1' = Áudio Gravado.</p>
                </div>

                {/* ── ÁUDIOS (GRAVADOR) ────────────────────────────────────── */}
                <div className="pt-4 border-t border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                            <span className="text-red-500 text-lg">🎤</span> Áudios (Voice Notes)
                        </label>
                        <button type="button" onClick={() => setConfig(c => ({ ...c, audios: [...(c.audios || []), { id: `@audio${(c.audios?.length || 0) + 1}`, url: null, file: null }] }))}
                            className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 transition-colors">
                            + Adicionar Áudio
                        </button>
                    </div>
                    {config.audios?.length > 0 && (
                        <div className="space-y-3">
                            {config.audios.map((aud, index) => (
                                <AudioRecorderSlot
                                    key={index}
                                    audio={aud}
                                    onUpdate={(data) => {
                                        const newAudios = [...config.audios];
                                        newAudios[index] = { ...newAudios[index], ...data };
                                        setConfig(c => ({ ...c, audios: newAudios }));
                                    }}
                                    onRemove={() => setConfig(c => ({ ...c, audios: c.audios.filter((_, i) => i !== index) }))}
                                />
                            ))}
                        </div>
                    )}
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

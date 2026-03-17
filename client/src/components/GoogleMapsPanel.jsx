import React, { useState, useEffect } from 'react';
import { MapPin, Search, PlayCircle, User, Plus, ChevronDown, ChevronUp, Layers } from 'lucide-react';

const GoogleMapsPanel = ({ onStart, onStop, isRunning }) => {
    const [query, setQuery] = useState('');
    const [deepScrape, setDeepScrape] = useState(false);

    // Dorks Builder State
    const [isDorksOpen, setIsDorksOpen] = useState(false);
    const [dorkNicho, setDorkNicho] = useState('');
    const [dorkLocal, setDorkLocal] = useState('');
    const [dorkIncluded, setDorkIncluded] = useState('');
    const [dorkExcluded, setDorkExcluded] = useState('');

    const handleAddDork = () => {
        if (!dorkNicho && !dorkLocal) return;
        let parts = [];
        if (dorkNicho) parts.push(dorkNicho.trim());
        if (dorkIncluded) parts.push(`"${dorkIncluded.trim()}"`);
        if (dorkExcluded) parts.push(`-${dorkExcluded.trim()}`);
        if (dorkLocal) parts.push(dorkLocal.trim());

        const finalDork = parts.join(' ');
        setQuery(prev => prev ? prev + '\n' + finalDork : finalDork);

        setDorkNicho('');
        setDorkLocal('');
        setDorkIncluded('');
        setDorkExcluded('');
    };

    // Profile State
    const [profiles, setProfiles] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState('');
    const [newProfileName, setNewProfileName] = useState('');
    const [showAddProfile, setShowAddProfile] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const fetchProfiles = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/maps/profiles');
            const data = await res.json();
            if (data.profiles) setProfiles(data.profiles);
        } catch (err) {
            console.error("Error loading profiles:", err);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    const handleCreateProfile = async () => {
        if (!newProfileName) return alert('Digite um nome para o perfil!');

        setIsLoggingIn(true);
        alert('Vou abrir o navegador. Faça login no Google (se quiser) e depois FECHE o navegador para salvar.');

        try {
            const res = await fetch('http://localhost:3000/api/maps/profiles/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newProfileName })
            });
            const data = await res.json();

            if (data.success) {
                await fetchProfiles();
                setSelectedProfile(newProfileName);
                setShowAddProfile(false);
                setNewProfileName('');
                alert('Perfil de Sessão criado com sucesso!');
            } else {
                alert('Erro: ' + data.error);
            }
        } catch (e) {
            alert('Erro de conexão: ' + e.message);
        }
        setIsLoggingIn(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const queriesArray = query.split('\n').map(q => q.trim()).filter(q => q.length > 0);
        if (queriesArray.length === 0) return;

        const profile = selectedProfile || 'default_guest';
        onStart({ queries: queriesArray, profile, deepScrape });
    };

    return (
        <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-2 text-slate-300 mb-6 pb-4 border-b border-white/5">
                <MapPin className="w-5 h-5 text-red-500" />
                <h2 className="font-semibold text-lg">Google Maps Extraction</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Profile Selector */}
                <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <User className="w-4 h-4 text-orange-400" /> Perfil de Navegação
                        </label>
                        <button type="button" onClick={() => setShowAddProfile(!showAddProfile)} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Novo
                        </button>
                    </div>

                    {showAddProfile ? (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <input
                                placeholder="Nome do Perfil (ex: Conta Principal)"
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-orange-500 outline-none"
                                value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={handleCreateProfile}
                                disabled={isLoggingIn}
                                className={`w-full py-2 rounded text-sm font-bold text-white transition-all ${isLoggingIn ? 'bg-slate-600 cursor-wait' : 'bg-orange-600 hover:bg-orange-500'}`}
                            >
                                {isLoggingIn ? 'Aguardando Fechamento...' : 'Criar & Logar Google'}
                            </button>
                        </div>
                    ) : (
                        <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white appearance-none cursor-pointer focus:border-orange-500 outline-none"
                            value={selectedProfile}
                            onChange={(e) => setSelectedProfile(e.target.value)}
                        >
                            <option value="">Navegação Anônima (Sem Perfil)</option>
                            {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                        Selecionar um perfil evita bloqueios e captchas.
                    </p>
                </div>

                <div>
                    <label className="flex items-center gap-2 text-slate-400 mb-2 text-sm font-medium">
                        <Search className="w-4 h-4 text-blue-400" /> Termo(s) de Busca
                    </label>
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all placeholder:text-slate-600 custom-scrollbar resize-y h-24"
                        placeholder="Restaurantes em SP&#10;Clínicas em Goiânia&#10;(Uma busca por linha)"
                        disabled={isRunning}
                    />
                </div>

                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-white/5">
                    <input
                        type="checkbox"
                        id="deepScrapeCheckbox"
                        checked={deepScrape}
                        onChange={(e) => setDeepScrape(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-500 bg-slate-700 border-slate-600 focus:ring-orange-500 focus:ring-offset-slate-900"
                    />
                    <label htmlFor="deepScrapeCheckbox" className="text-sm font-medium text-slate-300 cursor-pointer">
                        <span className="text-orange-400 font-bold">Deep Scrape</span> (Extrair E-mail e Instagram dos Sites)
                        <p className="text-xs text-slate-500 font-normal">Aumenta o tempo da extração.</p>
                    </label>
                </div>

                {/* Dorks Builder */}
                <div className="bg-slate-800/20 rounded-xl border border-white/5 overflow-hidden">
                    <button
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
                        onClick={() => setIsDorksOpen(!isDorksOpen)}
                    >
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-white text-sm">Busca Avançada (Construtor Dorks)</span>
                        </div>
                        {isDorksOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </button>
                    {isDorksOpen && (
                        <div className="p-4 border-t border-white/5 space-y-4 bg-slate-900/30">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">O que busca? (Nicho)</label>
                                    <input type="text" placeholder="Ex: Dentistas" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500/50" value={dorkNicho} onChange={e => setDorkNicho(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Onde? (Local)</label>
                                    <input type="text" placeholder="Ex: São Paulo" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500/50" value={dorkLocal} onChange={e => setDorkLocal(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Obrigatório ("termo")</label>
                                    <input type="text" placeholder="Ex: instagram" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500/50" value={dorkIncluded} onChange={e => setDorkIncluded(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Excluir (-termo)</label>
                                    <input type="text" placeholder="Ex: fechado" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500/50" value={dorkExcluded} onChange={e => setDorkExcluded(e.target.value)} />
                                </div>
                            </div>
                            <button onClick={handleAddDork} disabled={!dorkNicho && !dorkLocal} className="w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                                + Gerar e Adicionar à Lista
                            </button>
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    {isRunning ? (
                        <button
                            type="button"
                            onClick={onStop}
                            className="w-full btn-danger flex justify-center items-center gap-2"
                        >
                            Stop Extraction
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="w-full flex justify-center items-center gap-2 py-3 rounded-xl font-bold text-lg transition-all shadow-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-red-900/20 hover:shadow-red-900/40 transform hover:-translate-y-0.5"
                        >
                            <PlayCircle className="w-6 h-6" /> Start Extraction
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

export default GoogleMapsPanel;

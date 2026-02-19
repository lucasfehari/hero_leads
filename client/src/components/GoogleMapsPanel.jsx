import React, { useState, useEffect } from 'react';
import { MapPin, Search, PlayCircle, User, Plus } from 'lucide-react';

const GoogleMapsPanel = ({ onStart, onStop, isRunning }) => {
    const [query, setQuery] = useState('');

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
        if (!query) return;
        // Default to 'default' if no profile selected, or force selection? 
        // Let's force selection if profiles exist, or default.
        const profile = selectedProfile || 'default_guest';
        onStart({ query, profile });
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
                        <Search className="w-4 h-4 text-blue-400" /> Termo de Busca
                    </label>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all placeholder:text-slate-600"
                        placeholder="e.g. Restaurantes em SP"
                        disabled={isRunning}
                    />
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

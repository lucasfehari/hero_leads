import React, { useState, useEffect } from 'react';
import { MapPin, Search, PlayCircle, User, Plus, ChevronDown, ChevronUp, Layers, Sparkles } from 'lucide-react';

const GoogleMapsPanel = ({ onStart, onStop, isRunning }) => {
    const [query, setQuery] = useState('');
    const [deepScrape, setDeepScrape] = useState(false);

    // I.A Assistant
    const [aiEnabled, setAiEnabled] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [aiSectionOpen, setAiSectionOpen] = useState(false);

    const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) return alert('Descreva o que você quer buscar!');
        const key = localStorage.getItem('openRouterKey') || '';
        if (!key) return alert('Configure a chave OpenRouter em Global Settings!');
        const model = localStorage.getItem('openRouterModel') || 'openai/gpt-4o-mini';
        const companyContext = localStorage.getItem('companyContext') || '';

        setIsAiGenerating(true);
        try {
            const systemPrompt = companyContext
                ? `Você é um especialista em prospecção de leads via Google Maps. Contexto da empresa: ${companyContext}\n\nGere termos de busca para o Google Maps (um por linha). Responda APENAS com os termos de busca, sem explicações, sem numeração, sem aspas.`
                : `Você é um especialista em prospecção de leads via Google Maps. Gere termos de busca para o Google Maps (um por linha). Responda APENAS com os termos de busca, sem explicações, sem numeração, sem aspas.`;

            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Gere de 3 a 6 termos de busca para o Google Maps com base nessa descrição: "${aiPrompt}". Um termo por linha. Varie as cidades/regiões se possível.` }
                    ],
                    max_tokens: 300,
                    temperature: 0.7
                })
            });
            const data = await res.json();
            const generated = data.choices?.[0]?.message?.content?.trim() || '';
            if (generated) {
                setQuery(prev => prev ? prev + '\n' + generated : generated);
            } else {
                alert('A I.A não retornou resultados. Verifique a chave e tente novamente.');
            }
        } catch (e) {
            alert('Erro: ' + e.message);
        }
        setIsAiGenerating(false);
    };

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

                {/* ── I.A ASSISTANT ─────────────────────────────────────── */}
                <div className="rounded-xl overflow-hidden transition-all"
                    style={{
                        border: aiEnabled ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.05)',
                        background: aiEnabled ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.01)'
                    }}>
                    <button
                        type="button"
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
                        onClick={() => setAiSectionOpen(!aiSectionOpen)}
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4" style={{ color: aiEnabled ? '#818cf8' : '#64748b' }} />
                            <span className="font-semibold text-sm" style={{ color: aiEnabled ? '#a5b4fc' : '#94a3b8' }}>
                                I.A Assistant — Gerar Buscas
                            </span>
                            {aiEnabled && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>ON</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setAiEnabled(v => !v); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all"
                                style={aiEnabled
                                    ? { background: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.4)', color: '#a5b4fc' }
                                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#475569' }
                                }>
                                {aiEnabled ? 'I.A ON' : 'I.A OFF'}
                            </button>
                            {aiSectionOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                        </div>
                    </button>

                    {aiSectionOpen && (
                        <div className="px-3 pb-4 border-t border-white/5 pt-3 space-y-3">
                            <p className="text-xs text-slate-500">Descreva o que você quer prospectar e a I.A gera os termos de busca automaticamente.</p>
                            <textarea
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                placeholder="Ex: Quero encontrar clínicas odontológicas em São Paulo e Campinas para oferecer serviços de marketing digital..."
                                className="w-full bg-slate-950/50 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none h-20 outline-none placeholder:text-slate-600"
                                style={{ border: '1px solid rgba(99,102,241,0.2)' }}
                                disabled={isRunning}
                            />
                            <button
                                type="button"
                                onClick={handleAiGenerate}
                                disabled={isAiGenerating || !aiPrompt.trim() || isRunning}
                                className="w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                                style={{
                                    background: isAiGenerating ? 'rgba(99,102,241,0.1)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: 'white',
                                    boxShadow: isAiGenerating ? 'none' : '0 4px 15px rgba(99,102,241,0.25)'
                                }}>
                                {isAiGenerating ? (
                                    <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" /></svg> Gerando com I.A...</>
                                ) : (
                                    <><Sparkles className="w-4 h-4" /> ✨ Gerar Termos de Busca</>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                <div>
                    <label className="flex items-center gap-2 text-slate-400 mb-2 text-sm font-medium">
                        <Search className="w-4 h-4 text-blue-400" /> Termo(s) de Busca
                        {query && <span className="ml-auto text-xs text-slate-600">{query.split('\n').filter(q => q.trim()).length} busca(s)</span>}
                    </label>
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all placeholder:text-slate-600 custom-scrollbar resize-y h-24"
                        placeholder={"Restaurantes em SP\nClínicas em Goiânia\n(Uma busca por linha)"}
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

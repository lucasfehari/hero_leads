import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Download, Phone, Globe, Map, Trash2, RefreshCw, Search, Star, Database } from 'lucide-react';

const PAGE_SIZE = 20;

const GoogleMapsResults = ({ results: liveResults, onExport }) => {
    // ── DB State (leads persistidos) ──────────────────────────────────────────
    const [dbLeads, setDbLeads] = useState([]);
    const [dbTotal, setDbTotal] = useState(0);
    const [dbPages, setDbPages] = useState(1);
    const [dbPage, setDbPage] = useState(1);
    const [filterQuery, setFilterQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('db'); // 'live' | 'db'

    const fetchDbLeads = useCallback(async (p = 1, q = filterQuery) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ page: p, limit: PAGE_SIZE, query: q });
            const res = await fetch(`http://localhost:3000/api/maps/leads?${params}`);
            const data = await res.json();
            setDbLeads(data.leads || []);
            setDbTotal(data.total || 0);
            setDbPages(data.pages || 1);
            setDbPage(data.page || p);
        } catch (e) {
            console.error('Error fetching leads:', e);
        }
        setIsLoading(false);
    }, [filterQuery]);

    useEffect(() => { fetchDbLeads(1); }, []);

    // Ao chegar um novo lead ao vivo, recarregar o DB
    useEffect(() => {
        if (liveResults.length > 0) fetchDbLeads(dbPage);
    }, [liveResults]);

    const handleDeleteLead = async (id, name) => {
        if (!window.confirm(`Remover "${name}" do banco?`)) return;
        try {
            const res = await fetch(`http://localhost:3000/api/maps/leads/${id}`, { method: 'DELETE' });
            const d = await res.json();
            if (d.success) setDbLeads(prev => prev.filter(l => l.id !== id));
        } catch (e) { alert('Erro: ' + e.message); }
    };

    const handleClearAll = async () => {
        if (!window.confirm('Limpar TODOS os leads do banco? Esta ação não pode ser desfeita.')) return;
        try {
            await fetch('http://localhost:3000/api/maps/leads', { method: 'DELETE' });
            setDbLeads([]);
            setDbTotal(0);
        } catch (e) { alert('Erro: ' + e.message); }
    };

    const handleExportDB = () => {
        if (dbLeads.length === 0) return;
        // Pegar todos (sem paginação) via fetch e exportar
        fetch(`http://localhost:3000/api/maps/leads?page=1&limit=99999&query=${encodeURIComponent(filterQuery)}`)
            .then(r => r.json())
            .then(data => {
                const headers = ['ID', 'Nome', 'Telefone', 'Endereço', 'Website', 'Busca', 'Data'];
                const csv = [
                    headers.join(','),
                    ...(data.leads || []).map(r =>
                        `"${r.id}","${r.name || ''}","${r.phone || ''}","${r.address || ''}","${r.website || ''}","${r.query || ''}","${r.scraped_at || ''}"`
                    )
                ].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `leads_maps_${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
    };

    const LeadCard = ({ lead, onDelete }) => (
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
            <div className="flex justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-base truncate">{lead.name || lead.title || '—'}</h3>
                    {lead.address && <p className="text-xs text-slate-400 mt-1 truncate">{lead.address}</p>}
                    {lead.rating && (
                        <p className="text-xs text-yellow-400 flex items-center gap-1 mt-1">
                            <Star className="w-3 h-3" /> {lead.rating}
                        </p>
                    )}
                    {lead.query && (
                        <span className="text-xs text-slate-600 mt-1 inline-block">
                            Busca: {lead.query}
                        </span>
                    )}
                </div>
                <div className="flex flex-col gap-2 items-end flex-shrink-0">
                    {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                            <Phone className="w-3 h-3" /> {lead.phone}
                        </a>
                    )}
                    {lead.website && (
                        <a href={lead.website} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded hover:underline">
                            <Globe className="w-3 h-3" /> Site
                        </a>
                    )}
                    {onDelete && (
                        <button onClick={onDelete}
                            className="p-1 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col min-h-0 h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Map className="w-5 h-5 text-red-400" />
                    <h2 className="font-semibold text-lg text-slate-300">Leads Extraídos</h2>
                    {activeTab === 'db' && dbTotal > 0 && (
                        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{dbTotal} salvos</span>
                    )}
                    {activeTab === 'live' && liveResults.length > 0 && (
                        <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">{liveResults.length} ao vivo</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExportDB}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700">
                        <Download className="w-3 h-3" /> CSV
                    </button>
                    {activeTab === 'db' && (
                        <>
                            <button onClick={() => fetchDbLeads(dbPage)}
                                className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}>
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            {dbTotal > 0 && (
                                <button onClick={handleClearAll}
                                    className="p-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-950/50 p-1 rounded-xl mb-4 flex-shrink-0">
                <button onClick={() => setActiveTab('db')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'db' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>
                    <Database className="w-3.5 h-3.5" /> Banco Local
                </button>
                <button onClick={() => setActiveTab('live')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'live' ? 'bg-red-700 text-white' : 'text-slate-500 hover:text-white'}`}>
                    <MapPin className="w-3.5 h-3.5" /> Ao Vivo
                </button>
            </div>

            {/* DB Tab */}
            {activeTab === 'db' && (
                <>
                    <div className="mb-3 flex-shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <input
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500"
                                placeholder="Filtrar por busca..."
                                value={filterQuery}
                                onChange={e => setFilterQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && fetchDbLeads(1, filterQuery)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-0">
                        {dbLeads.length === 0 ? (
                            <div className="h-32 flex flex-col items-center justify-center text-slate-500 space-y-2">
                                <MapPin className="w-8 h-8 opacity-30" />
                                <p className="text-sm">{isLoading ? 'Carregando...' : 'Nenhum lead no banco ainda.'}</p>
                            </div>
                        ) : dbLeads.map(lead => (
                            <LeadCard key={lead.id} lead={lead}
                                onDelete={() => handleDeleteLead(lead.id, lead.name)} />
                        ))}
                    </div>

                    {dbPages > 1 && (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5 flex-shrink-0">
                            <button onClick={() => fetchDbLeads(dbPage - 1)} disabled={dbPage <= 1}
                                className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 text-sm transition-colors">
                                ← Ant.
                            </button>
                            <span className="text-slate-500 text-xs">Página {dbPage} / {dbPages}</span>
                            <button onClick={() => fetchDbLeads(dbPage + 1)} disabled={dbPage >= dbPages}
                                className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 text-sm transition-colors">
                                Próx. →
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Live Tab */}
            {activeTab === 'live' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-0">
                    {liveResults.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-slate-500 space-y-2">
                            <MapPin className="w-8 h-8 opacity-30" />
                            <p className="text-sm">Inicie uma extração para ver resultados ao vivo.</p>
                        </div>
                    ) : liveResults.map((lead, i) => (
                        <LeadCard key={i} lead={lead} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default GoogleMapsResults;

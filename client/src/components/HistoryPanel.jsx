import React, { useState, useEffect, useCallback } from 'react';
import { History, Trash2, RefreshCw, ChevronLeft, ChevronRight, User } from 'lucide-react';

const PAGE_SIZE = 20;

const HistoryPanel = () => {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [profiles, setProfiles] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState('');

    const fetchProfiles = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/history/profiles');
            const data = await res.json();
            if (data.profiles) setProfiles(data.profiles);
        } catch (e) { }
    };

    const fetchHistory = useCallback(async (p = 1, prof = selectedProfile) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
            if (prof) params.append('profile', prof);
            const res = await fetch(`http://localhost:3000/api/history?${params}`);
            const data = await res.json();
            if (data.history) {
                setHistory(data.history);
                setTotal(data.total || 0);
                setTotalPages(data.pages || 1);
                setPage(data.page || p);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
        }
        setIsLoading(false);
    }, [selectedProfile]);

    const handleDelete = async (username, profile) => {
        if (!window.confirm(`Remover @${username} do histórico do perfil "${profile}"?`)) return;
        try {
            const res = await fetch(
                `http://localhost:3000/api/history/${username}?profile=${encodeURIComponent(profile)}`,
                { method: 'DELETE' }
            );
            const data = await res.json();
            if (data.success) {
                setHistory(prev => prev.filter(item => !(item.username === username && item.profile === profile)));
                setTotal(prev => prev - 1);
            }
        } catch (err) {
            alert('Erro de conexão: ' + err.message);
        }
    };

    const goToPage = (p) => {
        if (p < 1 || p > totalPages) return;
        fetchHistory(p, selectedProfile);
    };

    useEffect(() => {
        fetchProfiles();
        fetchHistory(1, '');
        const interval = setInterval(() => fetchHistory(page, selectedProfile), 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="glass-panel rounded-2xl p-6 flex flex-col h-full bg-slate-900/50 border border-white/5">
            {/* Header */}
            <div className="flex items-center justify-between text-slate-300 mb-4 pb-4 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-400" />
                    <h2 className="font-semibold text-lg">Histórico de Envios</h2>
                    {total > 0 && (
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{total}</span>
                    )}
                </div>
                <button
                    onClick={() => fetchHistory(page, selectedProfile)}
                    className={`p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors ${isLoading ? 'animate-spin text-indigo-400' : 'text-slate-400 hover:text-white'}`}
                    title="Atualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Profile Filter */}
            {profiles.length > 0 && (
                <div className="mb-3 flex-shrink-0">
                    <select
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        value={selectedProfile}
                        onChange={e => {
                            setSelectedProfile(e.target.value);
                            fetchHistory(1, e.target.value);
                        }}
                    >
                        <option value="">Todos os Perfis</option>
                        {profiles.map(p => (
                            <option key={p.profile} value={p.profile}>
                                {p.profile} ({p.count} contatos)
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2 min-h-0">
                {history.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm mt-8">
                        {isLoading ? 'Carregando...' : 'Nenhum envio registrado ainda.'}
                    </div>
                ) : (
                    history.map((item, index) => (
                        <div
                            key={`${item.profile}-${item.username}-${index}`}
                            className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors"
                        >
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-white font-medium text-sm truncate">@{item.username}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-indigo-400 text-xs flex items-center gap-1">
                                        <User className="w-2.5 h-2.5" />{item.profile}
                                    </span>
                                    <span className="text-slate-600 text-xs">•</span>
                                    <span className="text-slate-500 text-xs">
                                        {new Date(item.date).toLocaleString('pt-BR')}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(item.username, item.profile)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors ml-2 flex-shrink-0"
                                title="Remover do Histórico"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5 flex-shrink-0">
                    <button
                        onClick={() => goToPage(page - 1)}
                        disabled={page <= 1}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-slate-400 text-sm">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => goToPage(page + 1)}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default HistoryPanel;

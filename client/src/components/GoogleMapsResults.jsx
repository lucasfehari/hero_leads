import React from 'react';
import { MapPin, Download, Phone, Globe, Map } from 'lucide-react';

const GoogleMapsResults = ({ results, onExport }) => {
    return (
        <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col min-h-0 h-full">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Map className="w-5 h-5 text-emerald-400" />
                    <h2 className="font-semibold text-lg text-slate-300">Extracted Leads ({results.length})</h2>
                </div>
                {results.length > 0 && (
                    <button
                        onClick={onExport}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors border border-slate-700"
                    >
                        <Download className="w-3 h-3" /> Export CSV
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
                {results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 opacity-50">
                        <MapPin className="w-12 h-12" />
                        <p>No leads extracted yet. Start a search!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map((lead, index) => (
                            <div key={index} className="bg-slate-950/50 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-white text-lg">{lead.title || lead.name}</h3>
                                        <p className="text-sm text-slate-400 mt-1">{lead.address}</p>
                                    </div>
                                    <div className="flex flex-col gap-2 text-sm justify-center">
                                        {lead.phone && (
                                            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded w-fit">
                                                <Phone className="w-3 h-3" /> {lead.phone}
                                            </div>
                                        )}
                                        {lead.website && (
                                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-400 bg-blue-500/10 px-2 py-1 rounded hover:underline w-fit">
                                                <Globe className="w-3 h-3" /> Website
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GoogleMapsResults;

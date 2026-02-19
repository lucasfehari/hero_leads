import React, { useEffect, useRef } from 'react';


const LogViewer = ({ logs }) => {
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="h-full overflow-y-auto font-mono text-xs md:text-sm custom-scrollbar pr-2 pb-2">
            {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                    <div className="w-12 h-12 border-2 border-slate-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p>Waiting for activity...</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {logs.map((log, index) => (
                        <div
                            key={index}
                            className={`p-2 rounded border-l-2 bg-slate-900/50 backdrop-blur-sm transition-all duration-300 animate-slideIn ${log.type === 'error' ? 'border-red-500 text-red-200 bg-red-500/5' :
                                log.type === 'warning' ? 'border-yellow-500 text-yellow-200 bg-yellow-500/5' :
                                    log.type === 'success' ? 'border-emerald-500 text-emerald-200 bg-emerald-500/5' :
                                        'border-slate-600 text-slate-300'
                                }`}
                        >
                            <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-start gap-2">
                                    <span className="text-slate-500 whitespace-nowrap opacity-60 font-medium text-[10px] pt-1">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                                    </span>
                                    <span className="leading-relaxed break-words">{log.message}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div ref={endRef} />
        </div>
    );
};

export default LogViewer;

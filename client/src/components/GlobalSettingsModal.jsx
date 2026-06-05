import React, { useState, useEffect } from 'react';
import { X, Key, Brain, Save, CheckCircle2 } from 'lucide-react';

const GlobalSettingsModal = ({ isOpen, onClose, onSave }) => {
    const [settings, setSettings] = useState({
        openRouterKey: '',
        openRouterModel: 'openai/gpt-4o-mini',
        companyContext: ''
    });
    
    const [saved, setSaved] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSettings({
                openRouterKey: localStorage.getItem('openRouterKey') || '',
                openRouterModel: localStorage.getItem('openRouterModel') || 'openai/gpt-4o-mini',
                companyContext: localStorage.getItem('companyContext') || ''
            });
            setSaved(false);
            setTestResult(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        localStorage.setItem('openRouterKey', settings.openRouterKey);
        localStorage.setItem('openRouterModel', settings.openRouterModel);
        localStorage.setItem('companyContext', settings.companyContext);
        setSaved(true);
        // Notify parent and close after brief success feedback
        setTimeout(() => {
            if (onSave) onSave(settings);
        }, 1200);
    };

    const testConnection = async () => {
        if (!settings.openRouterKey) return alert('Insira a chave da OpenRouter primeiro.');
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('http://localhost:3000/api/bot/test-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: settings.openRouterKey, model: settings.openRouterModel || 'openai/gpt-4o-mini' })
            });
            const data = await res.json();
            if (data.success) setTestResult({ success: true, message: 'Sucesso! Conexão estabelecida.' });
            else setTestResult({ success: false, message: data.error });
        } catch (err) {
            setTestResult({ success: false, message: 'Erro de rede: ' + err.message });
        }
        setIsTesting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Brain className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Global AI Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                    {/* API Keys */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Key className="w-4 h-4" /> OpenRouter Auth
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-300">API Key</label>
                                <input 
                                    type="password" 
                                    name="openRouterKey"
                                    value={settings.openRouterKey}
                                    onChange={handleChange}
                                    placeholder="sk-or-v1-..."
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-300">LLM Model</label>
                                <input 
                                    type="text" 
                                    name="openRouterModel"
                                    value={settings.openRouterModel}
                                    onChange={handleChange}
                                    placeholder="openai/gpt-4o-mini"
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                onClick={testConnection} 
                                disabled={isTesting}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isTesting ? 'Testando...' : 'Testar Conexão'}
                            </button>
                            {testResult && (
                                <span className={`text-sm ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {testResult.message}
                                </span>
                            )}
                        </div>
                    </div>

                    <hr className="border-white/5" />

                    {/* Contexto da Empresa */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                <Brain className="w-4 h-4" /> Company Context (Prompt Base)
                            </h3>
                        </div>
                        <p className="text-xs text-slate-500">
                            Escreva quem é a sua empresa, o que você vende e qual o tom de voz da marca. A I.A. vai ler isso antes de abordar qualquer prospecto no Instagram ou Threads para saber como se portar.
                        </p>
                        <textarea
                            name="companyContext"
                            value={settings.companyContext}
                            onChange={handleChange}
                            placeholder="Ex: Somos a Browze, vendemos automação. Nosso tom de voz é descontraído, jovem, mas muito profissional."
                            rows={4}
                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 resize-none"
                        ></textarea>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/10 bg-slate-900/50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
                    >
                        {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Salvo!' : 'Salvar Configurações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalSettingsModal;

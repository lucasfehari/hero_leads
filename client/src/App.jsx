import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import LogViewer from './components/LogViewer';
import ConfigForm from './components/ConfigForm';
import GoogleMapsPanel from './components/GoogleMapsPanel';
import GoogleMapsResults from './components/GoogleMapsResults';
import WhatsAppSender from './components/WhatsAppSender';
import SocialMediaPanel from './components/SocialMediaPanel';
import HistoryPanel from './components/HistoryPanel';
import ThreadsConfigForm from './components/ThreadsConfigForm';
import GlobalSettingsModal from './components/GlobalSettingsModal';
import DashboardPanel from './components/DashboardPanel';

const socket = io('http://localhost:3000');

// ─── NAV ITEMS ────────────────────────────────────────
const NAV = [
  {
    id: 'dashboard', label: 'Dashboard', group: 'overview',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    )
  },
  {
    id: 'instagram', label: 'Instagram Bot', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        <rect x="2" y="2" width="20" height="20" rx="5"/>
        <circle cx="12" cy="12" r="4"/>
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    )
  },
  {
    id: 'threads', label: 'Threads Bot', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        <path d="M17 8c-1.5-2-4-2.5-6-1.5C8 8 7 11 8 14c.5 1.5 2 3 4 3s4-1.5 4-3"/>
        <path d="M12 17c-1 2-3 3-5 2"/>
      </svg>
    )
  },
  {
    id: 'maps', label: 'Google Maps', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    )
  },
  {
    id: 'whatsapp', label: 'WhatsApp', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
      </svg>
    )
  },
  {
    id: 'socialmedia', label: 'Social Media', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    )
  },
];

const THEME = {
  dashboard: { glow: 'rgba(99,102,241,0.18)', accent: '#6366f1', label: 'Overview' },
  instagram: { glow: 'rgba(23,191,96,0.18)', accent: '#17BF60', label: 'Instagram Studio' },
  threads:   { glow: 'rgba(200,200,200,0.08)', accent: '#a1a1aa', label: 'Threads Studio' },
  maps:      { glow: 'rgba(59,130,246,0.18)', accent: '#3b82f6', label: 'Maps Studio' },
  whatsapp:  { glow: 'rgba(34,197,94,0.15)', accent: '#22c55e', label: 'WhatsApp Studio' },
  socialmedia:{ glow: 'rgba(236,72,153,0.15)', accent: '#ec4899', label: 'Social Studio' },
};

// ─── SIDEBAR NAV ITEM ─────────────────────────────────
function NavItem({ item, active, onClick }) {
  const theme = THEME[item.id] || THEME.instagram;
  return (
    <button
      onClick={onClick}
      className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden ${
        active
          ? 'text-white'
          : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
      }`}
      style={active ? {
        background: `linear-gradient(135deg, ${theme.accent}22 0%, ${theme.accent}10 100%)`,
        boxShadow: `inset 0 0 0 1px ${theme.accent}33`,
      } : {}}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
          style={{ background: theme.accent }}
        />
      )}
      <span style={{ color: active ? theme.accent : undefined }} className="shrink-0 w-5 flex items-center justify-center">
        {item.icon}
      </span>
      <span className="flex-1 text-left">{item.label}</span>
    </button>
  );
}

// ─── LOGO ICON (Brand "B") ─────────────────────────────
function BrowzeLogo() {
  return (
    <div className="relative">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
        style={{ background: 'linear-gradient(135deg, #17BF60 0%, #0d9448 100%)' }}
      >
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
          <path d="M5 4h7a4 4 0 0 1 0 8H5V4z" fill="#BCF285" />
          <path d="M5 12h8a4 4 0 0 1 0 8H5v-8z" fill="white" fillOpacity="0.92" />
        </svg>
      </div>
      {/* Glow under logo */}
      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full blur-md opacity-60"
        style={{ background: '#17BF60' }}
      />
    </div>
  );
}

// ─── STATUS BADGE ─────────────────────────────────────
function StatusBadge({ isRunning, status }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
      style={isRunning
        ? { background: 'rgba(23,191,96,0.08)', borderColor: 'rgba(23,191,96,0.25)' }
        : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }
      }
    >
      <span className="relative flex h-2 w-2">
        {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      </span>
      <span className={`text-xs font-semibold ${isRunning ? 'text-emerald-400' : 'text-slate-400'}`}>{status}</span>
    </div>
  );
}

// ─── PANEL WRAPPER ────────────────────────────────────
function Panel({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] overflow-hidden ${className}`}
      style={{ background: 'rgba(10,16,30,0.85)', backdropFilter: 'blur(16px)' }}
    >
      {children}
    </div>
  );
}

// ─── PANEL HEADER ─────────────────────────────────────
function PanelHeader({ icon, title, right }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
      <div className="flex items-center gap-2.5">
        <span className="text-slate-400">{icon}</span>
        <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
      </div>
      {right}
    </div>
  );
}

// ─── LOG TERMINAL ─────────────────────────────────────
function LiveTerminal({ logs, title = 'Live Activity', showAIToggle, showAITerminal, onToggleAI }) {
  return (
    <Panel className="flex flex-col flex-1 min-h-0">
      <PanelHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4 text-blue-400"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>}
        title={title}
        right={
          <div className="flex items-center gap-2">
            {showAIToggle && (
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-white/5">
                <button
                  onClick={() => onToggleAI(false)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${!showAITerminal ? 'bg-blue-500/80 text-white' : 'text-slate-500 hover:text-white'}`}
                >System</button>
                <button
                  onClick={() => onToggleAI(true)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${showAITerminal ? 'bg-sky-500/80 text-white' : 'text-slate-500 hover:text-white'}`}
                >A.I. Brain</button>
              </div>
            )}
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 bg-slate-950/60 px-2.5 py-1 rounded-full border border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Real-time
            </span>
          </div>
        }
      />
      <div className="flex-1 min-h-0 relative bg-[#070d1a] m-3 rounded-xl border border-white/5">
        <div className="absolute inset-0 p-3">
          <LogViewer logs={logs} />
        </div>
      </div>
    </Panel>
  );
}

// ─── MAIN APP ─────────────────────────────────────────
function App() {
  const [logs, setLogs] = useState([]);
  const [waLogs, setWaLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mapsResults, setMapsResults] = useState([]);
  const [qrCode, setQrCode] = useState(null);
  const [waPrefillNumbers, setWaPrefillNumbers] = useState('');
  const [showAITerminal, setShowAITerminal] = useState(false);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);

  const theme = THEME[activeTab] || THEME.instagram;

  const navigateToWhatsApp = (numbersStr) => {
    setActiveTab('whatsapp');
    setWaPrefillNumbers(numbersStr);
  };

  useEffect(() => {
    socket.on('connect', () => addLog('Connected to backend server.', 'info'));
    socket.on('log', (log) => setLogs((prev) => [...prev, log]));
    socket.on('maps-data', (data) => setMapsResults((prev) => [data, ...prev]));
    socket.on('wa-qr', (qr) => { setQrCode(qr); addWaLog('QR Code received. Scan to connect.', 'info'); });
    socket.on('wa-status', (data) => {
      if (data.status === 'connected' || data.status === 'authenticated') {
        setQrCode(null); addWaLog('WhatsApp conectado com sucesso! ✅', 'success');
      } else if (data.status === 'disconnected') {
        setQrCode(null); addWaLog('WhatsApp desconectado. ❌', 'error');
      } else if (data.status === 'switching') {
        setQrCode(null); addWaLog(`Trocando para sessão: ${data.session}...`, 'info');
      }
    });
    socket.on('disconnect', () => addLog('Disconnected from backend server.', 'error'));
    return () => {
      ['connect','log','maps-data','wa-qr','wa-status','disconnect'].forEach(e => socket.off(e));
    };
  }, []);

  const addLog = (message, type = 'info') => setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), message, type }]);
  const addWaLog = (message, type = 'info') => setWaLogs((prev) => [...prev, { timestamp: new Date().toISOString(), message, type }]);

  const handleStart = async (config) => {
    try {
      const globalKey = localStorage.getItem('openRouterKey') || '';
      const globalModel = localStorage.getItem('openRouterModel') || 'openai/gpt-4o-mini';
      const companyContext = localStorage.getItem('companyContext') || '';
      const mergedConfig = {
        ...config,
        openRouterKey: globalKey,
        openRouterModel: globalModel,
        aiPrompt: companyContext ? `Contexto Global:\n${companyContext}\n\nObjetivo da Campanha:\n${config.aiPrompt}` : config.aiPrompt
      };
      setIsRunning(true); setStatus('Running');
      let endpoint = 'http://localhost:3000/api/start';
      if (activeTab === 'maps') endpoint = 'http://localhost:3000/api/google-maps/start';
      if (activeTab === 'threads') endpoint = 'http://localhost:3000/api/threads/start';
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mergedConfig) });
      const data = await response.json();
      if (data.status === 'started') {
        addLog(`Bot (${activeTab}) started successfully.`, 'success');
        if (activeTab === 'maps') setMapsResults([]);
      } else { setIsRunning(false); setStatus('Error'); addLog('Failed to start bot: ' + data.error, 'error'); }
    } catch (error) { setIsRunning(false); setStatus('Error'); addLog('Error: ' + error.message, 'error'); }
  };

  const handleStop = async () => {
    try {
      setStatus('Stopping...');
      let endpoint = 'http://localhost:3000/api/stop';
      if (activeTab === 'maps') endpoint = 'http://localhost:3000/api/google-maps/stop';
      if (activeTab === 'threads') endpoint = 'http://localhost:3000/api/threads/stop';
      await fetch(endpoint, { method: 'POST' });
      setIsRunning(false); setStatus('Idle'); addLog('Bot stopped.', 'warning');
    } catch (error) { addLog('Error stopping bot: ' + error.message, 'error'); }
  };

  const exportMapsCSV = () => {
    if (!mapsResults.length) return;
    const headers = ['Name','Phone','Address','Website'];
    const csv = [headers.join(','), ...mapsResults.map(r => `"${r.name}","${r.phone||''}","${r.address||''}","${r.website||''}""`)].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: `leads_${Date.now()}.csv` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const aiLogs = logs.filter(l => l.message?.includes('[AI]') || l.message?.includes('[I.A]') || l.message?.includes('[SUCCESS]'));
  const visibleLogs = showAITerminal ? aiLogs : logs;

  const groups = { overview: 'Visão Geral', platforms: 'Plataformas' };

  return (
    <div className="flex h-screen overflow-hidden text-slate-200" style={{ background: '#060c18', fontFamily: "'Inter', 'Space Grotesk', sans-serif" }}>

      <GlobalSettingsModal isOpen={isGlobalSettingsOpen} onClose={() => setIsGlobalSettingsOpen(false)} />

      {/* ════ SIDEBAR ════ */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-white/[0.05] relative z-20" style={{ background: 'rgba(4,8,20,0.95)', backdropFilter: 'blur(20px)' }}>

        {/* Brand */}
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <BrowzeLogo />
            <div>
              <p className="text-[15px] font-bold text-white leading-tight tracking-tight">Browze AI</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-500 mt-0.5">Automation Suite</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5 custom-scrollbar">
          {Object.entries(groups).map(([groupId, groupLabel]) => {
            const items = NAV.filter(n => n.group === groupId);
            return (
              <div key={groupId}>
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">{groupLabel}</p>
                <div className="space-y-0.5">
                  {items.map(item => (
                    <NavItem key={item.id} item={item} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom: Settings */}
        <div className="p-3 border-t border-white/[0.05]">
          <button
            onClick={() => setIsGlobalSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-white hover:bg-white/5 transition-all group"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4.5 h-4.5 group-hover:rotate-45 transition-transform duration-300">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Global Settings
          </button>
        </div>
      </aside>

      {/* ════ MAIN ════ */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">

        {/* Dynamic glow */}
        <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
          <div
            className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full blur-[120px] opacity-30 transition-all duration-1000"
            style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
          />
          <div
            className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 transition-all duration-1000"
            style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
          />
        </div>

        {/* Top Bar */}
        <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-white/[0.05] z-10" style={{ background: 'rgba(6,12,24,0.8)', backdropFilter: 'blur(20px)' }}>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-bold text-white">{theme.label}</h1>
              <p className="text-[11px] text-slate-500">Browze AI — Automation Suite</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge isRunning={isRunning} status={status} />
            {isRunning && (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/25 bg-red-500/10 hover:bg-red-500/20 transition-all"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Stop Engine
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="max-w-[1400px] mx-auto h-full">

            {/* ── DASHBOARD ── */}
            {activeTab === 'dashboard' && (
              <DashboardPanel logs={logs} />
            )}

            {/* ── INSTAGRAM ── */}
            {activeTab === 'instagram' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-[calc(100vh-120px)]">
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <Panel className="flex flex-col flex-1">
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-emerald-400"><circle cx="12" cy="12" r="3"/><rect x="2" y="2" width="20" height="20" rx="5"/></svg>}
                      title="Instagram Configuration"
                    />
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <ConfigForm onStart={handleStart} isRunning={isRunning} />
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
                      title="Histórico de Leads"
                    />
                    <div className="p-4 max-h-48 overflow-y-auto custom-scrollbar">
                      <HistoryPanel />
                    </div>
                  </Panel>
                </div>
                <div className="lg:col-span-7 flex flex-col min-h-[600px]">
                  <LiveTerminal
                    logs={visibleLogs}
                    title="Live Activity"
                    showAIToggle
                    showAITerminal={showAITerminal}
                    onToggleAI={setShowAITerminal}
                  />
                </div>
              </div>
            )}

            {/* ── THREADS ── */}
            {activeTab === 'threads' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-[calc(100vh-120px)]">
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <Panel className="flex flex-col flex-1">
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400"><path d="M17 8c-1.5-2-4-2.5-6-1.5C8 8 7 11 8 14c.5 1.5 2 3 4 3s4-1.5 4-3"/><path d="M12 17c-1 2-3 3-5 2"/></svg>}
                      title="Threads Configuration"
                    />
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <ThreadsConfigForm onStart={handleStart} isRunning={isRunning} />
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
                      title="Histórico de Leads"
                    />
                    <div className="p-4 max-h-48 overflow-y-auto custom-scrollbar">
                      <HistoryPanel />
                    </div>
                  </Panel>
                </div>
                <div className="lg:col-span-7 flex flex-col min-h-[600px]">
                  <LiveTerminal
                    logs={visibleLogs}
                    title="Threads Activity"
                    showAIToggle
                    showAITerminal={showAITerminal}
                    onToggleAI={setShowAITerminal}
                  />
                </div>
              </div>
            )}

            {/* ── MAPS ── */}
            {activeTab === 'maps' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-[calc(100vh-120px)]">
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <GoogleMapsPanel isRunning={isRunning} onStart={handleStart} onStop={handleStop} />
                  <div className="flex-1 min-h-0">
                    <LiveTerminal logs={logs} title="Live CMD" />
                  </div>
                </div>
                <div className="lg:col-span-7">
                  <GoogleMapsResults results={mapsResults} onExport={exportMapsCSV} onOpenWhatsApp={navigateToWhatsApp} />
                </div>
              </div>
            )}

            {/* ── SOCIAL MEDIA ── */}
            {activeTab === 'socialmedia' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-12">
                  <SocialMediaPanel socket={socket} />
                </div>
              </div>
            )}

            {/* ── WHATSAPP ── */}
            {activeTab === 'whatsapp' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[calc(100vh-120px)]">
                <div className="lg:col-span-6">
                  <Panel className="flex flex-col h-full">
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-green-400"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>}
                      title="WhatsApp Config"
                    />
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <WhatsAppSender prefillNumbers={waPrefillNumbers} />
                    </div>
                  </Panel>
                </div>
                <div className="lg:col-span-6 flex flex-col gap-4">
                  <Panel className="flex flex-col items-center justify-center min-h-[260px] p-6">
                    {qrCode ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="bg-white p-4 rounded-2xl shadow-2xl shadow-black/50">
                          <QRCodeSVG value={qrCode} size={180} />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-bold text-sm">Escaneie para conectar</p>
                          <p className="text-slate-400 text-xs mt-1">WhatsApp → Menu → Aparelhos Conectados</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-12 h-12 opacity-20"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        <p className="text-sm">Aguardando QR Code ou Conexão...</p>
                      </div>
                    )}
                  </Panel>
                  <div className="flex-1 min-h-[300px]">
                    <LiveTerminal logs={waLogs} title="WhatsApp Activity" />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

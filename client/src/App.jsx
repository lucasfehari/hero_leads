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
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  },
  {
    id: 'instagram', label: 'Instagram Bot', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5">
        <defs>
          <radialGradient id="instagram-grad" cx="30%" cy="107%" r="130%">
            <stop offset="0%" stopColor="#fdf497" />
            <stop offset="5%" stopColor="#fdf497" />
            <stop offset="45%" stopColor="#fd5949" />
            <stop offset="60%" stopColor="#d6249f" />
            <stop offset="90%" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#instagram-grad)" />
        <rect x="6.5" y="6.5" width="11" height="11" rx="2.8" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.5" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="15" cy="9" r="0.75" fill="white" />
      </svg>
    )
  },
  {
    id: 'threads', label: 'Threads Bot', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#101010" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <g transform="scale(0.6) translate(8, 8)">
          <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" fill="white" />
        </g>
      </svg>
    )
  },
  {
    id: 'maps', label: 'Google Maps', group: 'platforms',
    icon: (
      <svg viewBox="0 0 256 367" className="w-4.5 h-4.5">
        <path d="M70.5853976,271.865254 C81.1995596,285.391378 90.8598594,299.639537 99.4963338,314.50654 C106.870174,328.489419 109.94381,337.97007 115.333495,354.817346 C118.638014,364.124835 121.625069,366.902652 128.046515,366.902652 C135.045169,366.902652 138.219816,362.176756 140.672953,354.867852 C145.766819,338.95854 149.763988,326.815514 156.069992,315.343493 C168.443902,293.193112 183.819296,273.510299 198.927732,254.592287 C203.018698,249.238677 229.462067,218.047767 241.366994,193.437035 C241.366994,193.437035 255.999233,166.402027 255.999233,128.645368 C255.999233,93.3274168 241.569017,68.8321265 241.569017,68.8321265 L200.024428,79.9578224 L174.793197,146.408963 L168.552129,155.57215 L167.303915,157.231625 L165.64444,159.309576 L162.729537,162.628525 L158.56642,166.791642 L136.098575,185.09637 L79.928962,217.528279 L70.5853976,271.865254 Z" fill="#34A853" />
        <path d="M12.6120081,188.891517 C26.3207125,220.205084 52.7568668,247.730719 70.6431185,271.8869 L165.64444,159.352866 C165.64444,159.352866 152.260416,176.856717 127.981579,176.856717 C100.939355,176.856717 79.0920095,155.2619 79.0920095,128.032084 C79.0920095,109.359386 90.325932,96.5309245 90.325932,96.5309245 L25.8373003,113.811107 L12.6120081,188.891517 Z" fill="#FBBC04" />
        <path d="M166.705061,5.78651629 C198.256727,15.959818 225.262874,37.3165365 241.597878,68.8104812 L165.673301,159.28793 C165.673301,159.28793 176.907223,146.228586 176.907223,127.671329 C176.907223,99.8065834 153.443693,78.990998 128.09702,78.990998 C104.128433,78.990998 90.3620076,96.4659886 90.3620076,96.4659886 L90.3620076,39.4666386 L166.705061,5.78651629 Z" fill="#4285F4" />
        <path d="M30.0148476,45.7654275 C48.8607087,23.2182162 82.0213432,0 127.736265,0 C149.915506,0 166.625695,5.82259183 166.625695,5.82259183 L90.2898565,96.5164943 L36.2054099,96.5164943 L30.0148476,45.7654275 Z" fill="#1A73E8" />
        <path d="M12.6120081,188.891517 C12.6120081,188.891517 0,164.194204 0,128.414485 C0,94.5972757 13.145926,65.0369799 30.0148476,45.7654275 L90.3331471,96.5237094 L12.6120081,188.891517 Z" fill="#EA4335" />
      </svg>
    )
  },
  {
    id: 'whatsapp', label: 'WhatsApp', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#25D366" />
        <g transform="scale(0.6) translate(8, 8)">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="white" />
        </g>
      </svg>
    )
  },
  {
    id: 'socialmedia', label: 'Social Media', group: 'platforms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4.5 h-4.5">
        <circle cx="18" cy="5" r="3.5" fill="#ec4899" stroke="none" />
        <circle cx="6" cy="12" r="3.5" fill="#3b82f6" stroke="none" />
        <circle cx="18" cy="19" r="3.5" fill="#22c55e" stroke="none" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="#94a3b8" strokeWidth="1.5" />
      </svg>
    )
  },
];

const THEME = {
  dashboard: { glow: 'rgba(99,102,241,0.18)', accent: '#6366f1', label: 'Overview' },
  instagram: { glow: 'rgba(225,48,108,0.18)', accent: '#e1306c', label: 'Instagram Studio' },
  threads: { glow: 'rgba(255,255,255,0.08)', accent: '#ffffff', label: 'Threads Studio' },
  maps: { glow: 'rgba(66,133,244,0.18)', accent: '#4285f4', label: 'Maps Studio' },
  whatsapp: { glow: 'rgba(37,211,102,0.15)', accent: '#25d366', label: 'WhatsApp Studio' },
  socialmedia: { glow: 'rgba(236,72,153,0.15)', accent: '#ec4899', label: 'Social Studio' },
};

// ─── SIDEBAR NAV ITEM ─────────────────────────────────
function NavItem({ item, active, onClick }) {
  const theme = THEME[item.id] || THEME.instagram;
  return (
    <button
      onClick={onClick}
      className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden ${active
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
      <span
        style={{ color: active ? theme.accent : undefined }}
        className={`shrink-0 w-5 flex items-center justify-center transition-all duration-200 ${active ? 'opacity-100 scale-105' : 'opacity-50 grayscale-[35%] group-hover:opacity-90 group-hover:grayscale-0'}`}
      >
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
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4 text-blue-400"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>}
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
  const [qrExpired, setQrExpired] = useState(false);
  const [waPrefillNumbers, setWaPrefillNumbers] = useState('');
  const [waPrefillLeads, setWaPrefillLeads] = useState([]);
  const [showAITerminal, setShowAITerminal] = useState(false);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);

  const theme = THEME[activeTab] || THEME.instagram;

  const navigateToWhatsApp = (numbersStr, leads = []) => {
    setActiveTab('whatsapp');
    setWaPrefillNumbers(numbersStr);
    setWaPrefillLeads(leads);
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
      ['connect', 'log', 'maps-data', 'wa-qr', 'wa-status', 'disconnect'].forEach(e => socket.off(e));
    };
  }, []);

  useEffect(() => {
    let timeout;
    if (qrCode) {
      setQrExpired(false);
      timeout = setTimeout(() => {
        setQrExpired(true);
      }, 40000); // 40 seconds
    }
    return () => clearTimeout(timeout);
  }, [qrCode]);

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

  const handleRestartWhatsApp = async () => {
    try {
      addWaLog('Reiniciando conexão WhatsApp...', 'warning');
      await fetch('http://localhost:3000/api/whatsapp/restart', { method: 'POST' });
    } catch (error) { addWaLog('Erro ao reiniciar: ' + error.message, 'error'); }
  };

  const exportMapsCSV = () => {
    if (!mapsResults.length) return;
    const headers = ['Name', 'Phone', 'Address', 'Website'];
    const csv = [headers.join(','), ...mapsResults.map(r => `"${r.name}","${r.phone || ''}","${r.address || ''}","${r.website || ''}""`)].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `leads_${Date.now()}.csv` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const aiLogs = logs.filter(l => l.message?.includes('[AI]') || l.message?.includes('[I.A]') || l.message?.includes('[SUCCESS]'));
  const visibleLogs = showAITerminal ? aiLogs : logs;

  const groups = { overview: 'Visão Geral', platforms: 'Plataformas' };

  return (
    <div className="flex h-screen overflow-hidden text-slate-200" style={{ background: '#060c18', fontFamily: "'Inter', 'Space Grotesk', sans-serif" }}>

      <GlobalSettingsModal
        isOpen={isGlobalSettingsOpen}
        onClose={() => setIsGlobalSettingsOpen(false)}
        onSave={() => setIsGlobalSettingsOpen(false)}
      />

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
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-emerald-400"><circle cx="12" cy="12" r="3" /><rect x="2" y="2" width="20" height="20" rx="5" /></svg>}
                      title="Instagram Configuration"
                    />
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <ConfigForm onStart={handleStart} isRunning={isRunning} />
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>}
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
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400"><path d="M17 8c-1.5-2-4-2.5-6-1.5C8 8 7 11 8 14c.5 1.5 2 3 4 3s4-1.5 4-3" /><path d="M12 17c-1 2-3 3-5 2" /></svg>}
                      title="Threads Configuration"
                    />
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <ThreadsConfigForm onStart={handleStart} isRunning={isRunning} />
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHeader
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-slate-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>}
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
                      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-green-400"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>}
                      title="WhatsApp Config"
                    />
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <WhatsAppSender prefillNumbers={waPrefillNumbers} prefillLeads={waPrefillLeads} />
                    </div>
                  </Panel>
                </div>
                <div className="lg:col-span-6 flex flex-col gap-4">
                  <Panel className="flex flex-col items-center justify-center min-h-[260px] p-6">
                    {qrCode ? (
                      <div className="flex flex-col items-center gap-4">
                        {qrExpired ? (
                          <div className="flex flex-col items-center gap-3 py-4">
                            <div className="bg-slate-800/50 p-4 rounded-2xl text-center border border-white/5">
                              <p className="text-slate-400 text-sm mb-3">O QR Code expirou por inatividade.</p>
                              <button
                                onClick={handleRestartWhatsApp}
                                className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-all"
                              >
                                Gerar novo QR Code
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="bg-white p-4 rounded-2xl shadow-2xl shadow-black/50">
                              <QRCodeSVG value={qrCode} size={180} />
                            </div>
                            <div className="text-center">
                              <p className="text-white font-bold text-sm">Escaneie para conectar</p>
                              <p className="text-slate-400 text-xs mt-1">WhatsApp → Menu → Aparelhos Conectados</p>
                              <button
                                onClick={handleRestartWhatsApp}
                                className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
                              >
                                Gerar novo QR Code manualmente
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-12 h-12 opacity-20"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                        <p className="text-sm">Aguardando QR Code ou Conexão...</p>
                        <button
                          onClick={handleRestartWhatsApp}
                          className="mt-2 px-4 py-2 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition-all font-medium text-sm"
                        >
                          Gerar Novo QR Code / Conectar
                        </button>
                      </div>
                    )}
                  </Panel>
                  <div className="flex-1 flex flex-col min-h-[300px]">
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

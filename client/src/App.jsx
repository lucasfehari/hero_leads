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
import { Activity, Radio, Cpu, Settings, Terminal, ShieldCheck, Smartphone } from 'lucide-react';

const socket = io('http://localhost:3000');

function App() {
  const [logs, setLogs] = useState([]);
  const [waLogs, setWaLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [activeTab, setActiveTab] = useState('instagram');
  const [mapsResults, setMapsResults] = useState([]);
  const [qrCode, setQrCode] = useState(null);

  useEffect(() => {
    socket.on('connect', () => {
      addLog('Connected to backend server.', 'info');
    });

    socket.on('log', (log) => {
      setLogs((prev) => [...prev, log]);
    });

    socket.on('maps-data', (data) => {
      setMapsResults((prev) => [data, ...prev]);
    });

    socket.on('wa-qr', (qr) => {
      setQrCode(qr);
      addWaLog('QR Code received. Scan to connect.', 'info');
    });

    socket.on('wa-status', (data) => {
      if (data.status === 'connected' || data.status === 'authenticated') {
        setQrCode(null);
        addWaLog('WhatsApp conectado com sucesso! ✅', 'success');
      } else if (data.status === 'disconnected') {
        addWaLog('WhatsApp desconectado. ❌', 'error');
      }
    });

    socket.on('disconnect', () => {
      addLog('Disconnected from backend server.', 'error');
    });

    return () => {
      socket.off('connect');
      socket.off('log');
      socket.off('maps-data');
      socket.off('wa-qr');
      socket.off('wa-status');
      socket.off('disconnect');
    };
  }, []);

  const addLog = (message, type = 'info') => {
    setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), message, type }]);
  };

  const addWaLog = (message, type = 'info') => {
    setWaLogs((prev) => [...prev, { timestamp: new Date().toISOString(), message, type }]);
  };

  const handleStart = async (config) => {
    try {
      setIsRunning(true);
      setStatus('Starting...');
      const endpoint = activeTab === 'instagram' ? 'http://localhost:3000/api/start' : 'http://localhost:3000/api/google-maps/start';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      if (data.status === 'started') {
        setStatus('Running');
        addLog(`Bot (${activeTab}) started successfully.`, 'success');
        if (activeTab === 'maps') setMapsResults([]);
      } else {
        setIsRunning(false);
        setStatus('Error');
        addLog('Failed to start bot: ' + data.error, 'error');
      }
    } catch (error) {
      setIsRunning(false);
      setStatus('Error');
      addLog('Error communicating with server: ' + error.message, 'error');
    }
  };

  const handleStop = async () => {
    try {
      setStatus('Stopping...');
      const endpoint = activeTab === 'instagram' ? 'http://localhost:3000/api/stop' : 'http://localhost:3000/api/google-maps/stop';
      await fetch(endpoint, { method: 'POST' });
      setIsRunning(false);
      setStatus('Idle');
      addLog('Bot stopped.', 'warning');
    } catch (error) {
      addLog('Error stopping bot: ' + error.message, 'error');
    }
  };

  const exportMapsCSV = () => {
    if (mapsResults.length === 0) return;
    const headers = ['Name', 'Phone', 'Address', 'Website'];
    const csvContent = [
      headers.join(','),
      ...mapsResults.map(r => `"${r.name}","${r.phone || ''}","${r.address || ''}","${r.website || ''}"`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">

      {/* Background Ambience — brand green glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] animate-float"
          style={{ background: 'radial-gradient(circle, rgba(23,191,96,0.07) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full blur-[130px] animate-float"
          style={{ background: 'radial-gradient(circle, rgba(15,38,32,0.7) 0%, transparent 70%)', animationDelay: '-3s' }} />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] rounded-full blur-[100px]"
          style={{ background: 'radial-gradient(circle, rgba(23,166,85,0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-7xl space-y-6">

        {/* ── Browze Bot Header ─────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl px-5 py-3 flex flex-col md:flex-row justify-between items-center gap-4">

          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Logo mark */}
            <div className="relative">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-brand-pulse"
                style={{ background: 'linear-gradient(135deg, #17BF60 0%, #0F2620 100%)' }}>
                {/* B icon */}
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 4h7a4 4 0 0 1 0 8H5V4z" fill="#BCF285" />
                  <path d="M5 12h8a4 4 0 0 1 0 8H5v-8z" fill="white" fillOpacity="0.9" />
                </svg>
              </div>
            </div>
            {/* Wordmark */}
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <span style={{ color: '#BCF285' }}>Browze</span>
                <span className="text-white"> Bot</span>
              </h1>
              <p className="text-xs font-medium mt-0.5" style={{ color: '#17A655', fontFamily: "'Space Grotesk', sans-serif" }}>
                Automation Suite
              </p>
            </div>
          </div>

          {/* Tab Nav */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(1,3,38,0.6)', border: '1px solid rgba(23,191,96,0.1)' }}>
            {[
              { id: 'instagram', label: 'Instagram' },
              { id: 'maps', label: 'Maps' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'socialmedia', label: 'Social' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                style={activeTab === tab.id
                  ? { background: 'linear-gradient(135deg, #17BF60 0%, #17A655 100%)', color: '#010326', boxShadow: '0 2px 12px rgba(23,191,96,0.35)' }
                  : { color: '#64748b' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl shrink-0"
            style={{ background: 'rgba(1,3,38,0.5)', border: '1px solid rgba(23,191,96,0.08)' }}>
            <div className="flex flex-col items-end">
              <span className="text-xs uppercase tracking-widest font-bold" style={{ color: '#17A655' }}>Status</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: isRunning ? '#17BF60' : '#475569' }}>{status}</span>
                <span className="relative flex h-2.5 w-2.5">
                  {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#17BF60' }} />}
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: isRunning ? '#17BF60' : '#334155' }} />
                </span>
              </div>
            </div>
            {isRunning && (
              <button onClick={handleStop} className="btn-danger flex items-center gap-1.5 text-sm">
                <Radio className="w-3.5 h-3.5" /> Stop
              </button>
            )}
          </div>
        </header>

        {/* Main Content Grid - 12 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)] min-h-[600px]">

          {/* INSTAGRAM LAYOUT */}
          {activeTab === 'instagram' ? (
            <>
              <div className="lg:col-span-5 flex flex-col gap-6">
                {/* CONFIGURATION PANEL */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col max-h-[60%]">
                  <div className="flex items-center gap-2 text-slate-300 mb-6 pb-4 border-b border-white/5">
                    <Settings className="w-5 h-5 text-emerald-400" />
                    <h2 className="font-semibold text-lg">Configuration</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <ConfigForm onStart={handleStart} isRunning={isRunning} />
                  </div>
                </div>

                {/* HISTORY PANEL */}
                <div className="flex-1 flex flex-col min-h-[30%]">
                  <HistoryPanel />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col">
                <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col relative overflow-hidden">
                  <div className="flex items-center justify-between text-slate-300 mb-4 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-blue-400" />
                      <h2 className="font-semibold text-lg">Live Activity</h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-950/50 px-3 py-1 rounded-full">
                      <Activity className="w-3 h-3" />
                      Real-time
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden rounded-xl bg-slate-950/80 border border-white/5 relative">
                    <div className="absolute inset-0 p-4">
                      <LogViewer logs={logs} />
                    </div>
                  </div>
                </div>
              </div>
            </>

          ) : activeTab === 'maps' ? (
            // MAPS LAYOUT
            <>
              <div className="lg:col-span-5 flex flex-col gap-6 h-full">
                <div className="flex-none">
                  <GoogleMapsPanel
                    isRunning={isRunning}
                    onStart={handleStart}
                    onStop={handleStop}
                  />
                </div>
                <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col relative overflow-hidden min-h-0">
                  <div className="flex items-center justify-between text-slate-300 mb-4 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-blue-400" />
                      <h2 className="font-semibold text-lg">Live CMD</h2>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden rounded-xl bg-slate-950/80 border border-white/5 relative">
                    <div className="absolute inset-0 p-4">
                      <LogViewer logs={logs} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col h-full">
                <GoogleMapsResults
                  results={mapsResults}
                  onExport={exportMapsCSV}
                />
              </div>
            </>

          ) : activeTab === 'socialmedia' ? (
            // SOCIAL MEDIA LAYOUT
            <SocialMediaPanel socket={socket} />

          ) : (
            // WHATSAPP LAYOUT - using fragments so panels are direct children of the 12-col grid
            <>
              {/* Left: Config */}
              <div className="lg:col-span-6 flex flex-col min-w-0">
                <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-2 text-slate-300 mb-6 pb-4 border-b border-white/5">
                    <Settings className="w-5 h-5 text-green-400" />
                    <h2 className="font-semibold text-lg">WhatsApp Config</h2>
                  </div>
                  <WhatsAppSender />
                </div>
              </div>

              {/* Right: QR + Logs */}
              <div className="lg:col-span-6 flex flex-col gap-6 min-w-0">

                {/* QR Code Panel */}
                <div className="glass-panel p-6 rounded-2xl flex flex-col items-center justify-center min-h-[260px]">
                  {qrCode ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="bg-white p-4 rounded-xl shadow-2xl">
                        <QRCodeSVG value={qrCode} size={200} />
                      </div>
                      <p className="text-white font-medium">Escaneie para conectar</p>
                      <p className="text-slate-400 text-sm text-center">Abra o WhatsApp → Menu → Aparelhos Conectados</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <Smartphone className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">Aguardando QR Code ou Conexão...</p>
                    </div>
                  )}
                </div>

                {/* Logs Panel */}
                <div className="glass-panel rounded-2xl p-6 flex-1 flex flex-col relative overflow-hidden min-h-[300px]">
                  <div className="flex items-center justify-between text-slate-300 mb-4 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-blue-400" />
                      <h2 className="font-semibold text-lg">Live Activity</h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-950/50 px-3 py-1 rounded-full">
                      <Activity className="w-3 h-3" />
                      Real-time
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden rounded-xl bg-slate-950/80 border border-white/5 relative">
                    <div className="absolute inset-0 p-4">
                      <LogViewer logs={waLogs} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
}

export default App;

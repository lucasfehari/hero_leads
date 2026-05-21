import React, { useState, useEffect, useRef } from 'react';

// Tiny sparkline chart
const Sparkline = ({ data, color = '#17BF60', height = 40 }) => {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 120, h = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#grad-${color.replace('#','')})`} />
      <polyline points={points} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// Mini bar chart
const BarChart = ({ data, color = '#17BF60', labels }) => {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-16 w-full">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md transition-all duration-700"
            style={{
              height: `${(v / max) * 100}%`,
              background: `linear-gradient(180deg, ${color} 0%, ${color}88 100%)`,
              minHeight: 2
            }}
          />
          {labels && <span className="text-[9px] text-slate-500">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
};

// Animated number counter
const Counter = ({ value, prefix = '', suffix = '' }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = value / 40;
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(Math.floor(start));
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{display.toLocaleString()}{suffix}</span>;
};

const DashboardPanel = ({ logs }) => {
  // Derive stats from logs
  const successLogs = logs.filter(l => l.type === 'success' || l.message?.includes('[SUCCESS]'));
  const aiLogs = logs.filter(l => l.message?.includes('[AI]') || l.message?.includes('[I.A]'));
  const errorLogs = logs.filter(l => l.type === 'error');
  const totalActions = logs.length;

  // Simulated activity graph data (last 7 days style)
  const activityData = [12, 28, 19, 45, 33, 52, successLogs.length + 10];
  const leadsData = [3, 8, 6, 14, 10, 18, successLogs.length];
  const aiData = [2, 5, 4, 9, 7, 12, aiLogs.length];
  const weekLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  // Platform breakdown (simulated)
  const platforms = [
    { name: 'Instagram', pct: 54, color: '#17BF60', count: Math.max(2, Math.floor(totalActions * 0.54)) },
    { name: 'Threads', pct: 28, color: '#8b8b8b', count: Math.max(1, Math.floor(totalActions * 0.28)) },
    { name: 'Google Maps', pct: 18, color: '#3b82f6', count: Math.max(1, Math.floor(totalActions * 0.18)) },
  ];

  // Recent bot activity feed
  const recentLogs = [...logs].reverse().slice(0, 8);

  const cards = [
    {
      label: 'Total de Ações',
      value: totalActions,
      sub: '+12% hoje',
      positive: true,
      color: '#17BF60',
      spark: activityData,
      icon: '⚡',
    },
    {
      label: 'Leads Aprovados',
      value: successLogs.length,
      sub: 'pela I.A.',
      positive: true,
      color: '#22c55e',
      spark: leadsData,
      icon: '🎯',
    },
    {
      label: 'Decisões da I.A.',
      value: aiLogs.length,
      sub: 'análises completas',
      positive: true,
      color: '#38bdf8',
      spark: aiData,
      icon: '🧠',
    },
    {
      label: 'Erros / Alertas',
      value: errorLogs.length,
      sub: 'registrados',
      positive: false,
      color: '#f87171',
      spark: [0, 1, 0, 0, 2, 1, errorLogs.length],
      icon: '⚠️',
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Boas-vindas ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">Bem-vindo ao Browze AI 👋</h3>
          <p className="text-slate-400 text-sm mt-1">Visão geral da sua automação em tempo real</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Última atualização</p>
          <p className="text-sm font-semibold text-slate-300">{new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-white/5 p-5 group hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5"
            style={{ background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(12px)' }}
          >
            {/* Glow accent */}
            <div
              className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"
              style={{ background: card.color }}
            />
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-2xl">{card.icon}</span>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">{card.label}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${card.positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                {card.sub}
              </span>
            </div>
            <p className="text-3xl font-bold text-white mb-3">
              <Counter value={card.value} />
            </p>
            <Sparkline data={card.spark} color={card.color} height={36} />
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Activity Bar Chart */}
        <div
          className="lg:col-span-2 rounded-2xl border border-white/5 p-5"
          style={{ background: 'rgba(15,23,42,0.8)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-base font-bold text-white">Atividade Semanal</h4>
              <p className="text-xs text-slate-400">Ações por dia nos últimos 7 dias</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
              Semana Atual
            </span>
          </div>
          <BarChart data={activityData} color="#17BF60" labels={weekLabels} />
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/5">
            <div>
              <p className="text-xs text-slate-500">Pico do Dia</p>
              <p className="text-sm font-bold text-emerald-400">{Math.max(...activityData)} ações</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Média Diária</p>
              <p className="text-sm font-bold text-white">{Math.round(activityData.reduce((a,b)=>a+b,0)/activityData.length)} ações</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-sm font-bold text-white">{activityData.reduce((a,b)=>a+b,0)}</p>
            </div>
          </div>
        </div>

        {/* Platform Breakdown */}
        <div
          className="rounded-2xl border border-white/5 p-5"
          style={{ background: 'rgba(15,23,42,0.8)' }}
        >
          <h4 className="text-base font-bold text-white mb-1">Por Plataforma</h4>
          <p className="text-xs text-slate-400 mb-5">Distribuição de ações</p>
          <div className="space-y-4">
            {platforms.map((p, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-300">{p.name}</span>
                  <span className="text-xs font-bold" style={{ color: p.color }}>{p.pct}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${p.pct}%`, background: `linear-gradient(90deg, ${p.color}cc, ${p.color})` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{p.count} ações</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live Activity Feed ── */}
      <div
        className="rounded-2xl border border-white/5 p-5"
        style={{ background: 'rgba(15,23,42,0.8)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-bold text-white">Feed de Atividade Recente</h4>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
        {recentLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="text-3xl mb-2">🤖</p>
            <p className="text-sm">Nenhuma atividade ainda. Inicie uma campanha!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-white/3 last:border-0">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  log.type === 'success' ? 'bg-emerald-400' :
                  log.type === 'error' ? 'bg-red-400' :
                  log.type === 'warning' ? 'bg-amber-400' : 'bg-slate-500'
                }`} />
                <p className="text-xs text-slate-300 leading-relaxed flex-1 truncate">{log.message}</p>
                <span className="text-[10px] text-slate-600 shrink-0">
                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPanel;

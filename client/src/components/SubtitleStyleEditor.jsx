/**
 * SubtitleStyleEditor.jsx
 * Editor visual de estilo de legendas com preview em tempo real.
 * Expõe um objeto `subtitleStyle` compatível com buildAssHeader() do subtitles.js
 */

import React, { useState, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const POSITIONS = [
  ['top-left',     '↖'], ['top-center',    '↑'], ['top-right',    '↗'],
  ['middle-left',  '←'], ['middle-center', '⊙'], ['middle-right', '→'],
  ['bottom-left',  '↙'], ['bottom-center', '↓'], ['bottom-right', '↘'],
];

const FONT_SIZES = [
  { label: 'small',  name: 'P',  px: 13 },
  { label: 'medium', name: 'M',  px: 17 },
  { label: 'large',  name: 'G',  px: 22 },
  { label: 'xlarge', name: 'GG', px: 28 },
];

const FONTS = [
  { value: 'arial-black', label: 'Arial Black' },
  { value: 'impact',      label: 'Impact' },
  { value: 'montserrat',  label: 'Montserrat' },
  { value: 'oswald',      label: 'Oswald' },
  { value: 'bebas',       label: 'Bebas Neue' },
];

const FONT_CSS = {
  'arial-black': '"Arial Black", "Arial Bold", sans-serif',
  'impact':      'Impact, "Arial Narrow Bold", sans-serif',
  'montserrat':  '"Montserrat ExtraBold", Montserrat, sans-serif',
  'oswald':      'Oswald, "Arial Narrow", sans-serif',
  'bebas':       '"Bebas Neue", Impact, sans-serif',
};

const PRESETS = [
  {
    name: '🔥 TikTok Viral',
    style: { position: 'middle-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#FFE000', outlineColor: '#000000', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'arial-black' },
  },
  {
    name: '🥩 Bicolor',
    style: { position: 'middle-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#FFE000', biColor: '#FF6B6B', outlineColor: '#000000', bold: true, boxBackground: false, bicolor: true, fadeIn: true, fontName: 'arial-black' },
  },
  {
    name: '💙 Azul Clean',
    style: { position: 'bottom-center', fontSize: 'medium', textColor: '#FFFFFF', highlightColor: '#00CFFF', outlineColor: '#000000', bold: true, boxBackground: false, bicolor: false, fadeIn: false, fontName: 'arial-black' },
  },
  {
    name: '🟣 Roxo Glow',
    style: { position: 'bottom-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#C084FC', outlineColor: '#1e003a', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'arial-black' },
  },
  {
    name: '🔥 Fire',
    style: { position: 'middle-center', fontSize: 'large', textColor: '#FFD700', highlightColor: '#FF4500', outlineColor: '#4a0000', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'impact', outlineWidth: 5 },
  },
  {
    name: '🩶 Ice',
    style: { position: 'bottom-center', fontSize: 'large', textColor: '#E0F7FF', highlightColor: '#00FFFF', outlineColor: '#001a3a', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'arial-black', shadow: 3 },
  },
  {
    name: '⚪ Minimalista',
    style: { position: 'bottom-center', fontSize: 'medium', textColor: '#FFFFFF', highlightColor: '#FFFFFF', outlineColor: '#000000', bold: false, boxBackground: false, bicolor: false, fadeIn: false, fontName: 'arial-black' },
  },
  {
    name: '🟦 Neon Pop',
    style: { position: 'middle-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#00FF9F', outlineColor: '#003320', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'impact', outlineWidth: 6 },
  },
  {
    name: '🟧 Box Escuro',
    style: { position: 'bottom-center', fontSize: 'medium', textColor: '#FFFFFF', highlightColor: '#FFE000', outlineColor: '#000000', bold: true, boxBackground: true, boxOpacity: 0.75, bicolor: false, fadeIn: false, fontName: 'arial-black' },
  },
  {
    name: '🎓 Shadow Drop',
    style: { position: 'middle-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#FF3CAC', outlineColor: '#000000', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'bebas', outlineWidth: 3, shadow: 6 },
  },
  {
    name: '🎹 Karaoke',
    style: { position: 'bottom-center', fontSize: 'large', textColor: '#FFFFFF', highlightColor: '#7FFF00', biColor: '#FFFFFF', outlineColor: '#000000', bold: true, boxBackground: false, bicolor: true, fadeIn: false, fontName: 'montserrat' },
  },
  {
    name: '🟣 Oswald Bold',
    style: { position: 'bottom-center', fontSize: 'xlarge', textColor: '#FFFFFF', highlightColor: '#FF6B35', outlineColor: '#000000', bold: true, boxBackground: false, bicolor: false, fadeIn: true, fontName: 'oswald' },
  },
];

const DEFAULT_STYLE = PRESETS[0].style;

// ── Position to CSS alignment ─────────────────────────────────────────────────
function posToCss(pos) {
  const row = pos.startsWith('top') ? 'flex-start' : pos.startsWith('middle') ? 'center' : 'flex-end';
  const col = pos.endsWith('left') ? 'flex-start' : pos.endsWith('right') ? 'flex-end' : 'center';
  return { alignItems: row, justifyContent: col };
}

// ── Color swatch input ────────────────────────────────────────────────────────
function ColorSwatch({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, border: '2px solid rgba(255,255,255,0.15)',
          background: value, cursor: 'pointer', position: 'relative', flexShrink: 0,
        }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none' }}
          />
        </div>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{value.toUpperCase()}</span>
      </div>
    </label>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#cbd5e1' }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        background: value ? '#a78bfa' : '#334155', position: 'relative', transition: 'background 0.2s', flexShrink: 0
      }}>
        <span style={{
          position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff',
          left: value ? 18 : 2, transition: 'left 0.2s'
        }}/>
      </button>
    </div>
  );
}

// ── Live subtitle preview renderer ────────────────────────────────────────────
function SubtitlePreview({ style }) {
  const sz = FONT_SIZES.find(f => f.label === (style.fontSize || 'large'))?.px || 22;
  const textColor  = style.textColor || '#FFFFFF';
  const hlColor    = style.highlightColor || '#FFE000';
  const biColor    = style.biColor || hlColor;
  const outline    = style.outlineColor || '#000000';
  const bold       = style.bold !== false;
  const hasBox     = style.boxBackground;
  const useExact   = style.useExactPos;
  const isBicolor  = !!style.bicolor;
  const fontFamily = FONT_CSS[style.fontName] || FONT_CSS['arial-black'];

  const shadowStr = hasBox ? 'none' : Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const r = 2;
    return `${(Math.cos(angle) * r).toFixed(1)}px ${(Math.sin(angle) * r).toFixed(1)}px 0 ${outline}`;
  }).join(', ');

  const { alignItems, justifyContent } = posToCss(style.position || 'middle-center');
  
  const words = ['EU', 'VOU', 'FALAR'];
  const currentIdx = 1;

  const containerStyle = useExact 
    ? { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }
    : { display: 'flex', alignItems, justifyContent, padding: '12px 10px', boxSizing: 'border-box', width: '100%', height: '100%' };

  const innerStyle = useExact
    ? { 
        position: 'absolute', 
        left: `${style.exactX || 50}%`, 
        top: `${style.exactY || 80}%`, 
        transform: 'translate(-50%, -50%)',
        display: 'flex', gap: 5, flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'center',
        background: hasBox ? `rgba(0,0,0,0.${Math.round((style.boxOpacity || 0.7) * 10)})` : 'transparent',
        padding: hasBox ? '4px 10px' : 0, borderRadius: hasBox ? 6 : 0,
      }
    : {
        display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
        background: hasBox ? `rgba(0,0,0,0.${Math.round((style.boxOpacity || 0.7) * 10)})` : 'transparent',
        padding: hasBox ? '4px 10px' : 0, borderRadius: hasBox ? 6 : 0,
      };

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {words.map((word, i) => {
          let color;
          if (i === currentIdx) {
            color = hlColor; // current word always highlighted
          } else if (isBicolor) {
            color = i % 2 === 0 ? textColor : biColor;
          } else {
            color = i < currentIdx ? 'rgba(255,255,255,0.55)' : textColor;
          }
          return (
            <span key={i} style={{
              fontFamily,
              fontWeight: bold ? 900 : 400,
              fontSize: i === currentIdx ? sz * 1.1 : sz,
              color,
              textShadow: shadowStr,
              letterSpacing: 0.5,
              transition: 'color 0.15s, font-size 0.1s',
            }}>
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function SubtitleStyleEditor({ value, onChange }) {
  const [style, setStyleState] = useState(value || DEFAULT_STYLE);
  const [activePreset, setActivePreset] = useState(0);

  const update = useCallback((key, val) => {
    const next = { ...style, [key]: val };
    setStyleState(next);
    onChange?.(next);
    setActivePreset(null); // deselect preset on manual change
  }, [style, onChange]);

  const applyPreset = useCallback((preset, idx) => {
    setStyleState(preset.style);
    setActivePreset(idx);
    onChange?.(preset.style);
  }, [onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── PREVIEW ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

        {/* Phone mockup preview */}
        <div style={{
          width: 110, flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.12)', borderRadius: 14,
          overflow: 'hidden', position: 'relative',
          background: 'linear-gradient(160deg, #1a1a2e 0%, #0f0f1a 100%)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}>
          {/* aspect ratio 9:16 */}
          <div style={{ paddingTop: '177.8%', position: 'relative' }}>
            {/* Simulated content */}
            <div style={{ position: 'absolute', inset: 0 }}>
              {/* Fake video background gradient */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, #1e3a5f 0%, #0d1b2a 60%, #0a0f1a 100%)',
              }}/>
              {/* Fake person silhouette */}
              <div style={{
                position: 'absolute', bottom: '30%', left: '50%', transform: 'translateX(-50%)',
                width: 36, height: 44, borderRadius: '50% 50% 0 0',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)'
              }}/>
              <div style={{
                position: 'absolute', bottom: '18%', left: '50%', transform: 'translateX(-50%)',
                width: 50, height: 32, borderRadius: 4,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)'
              }}/>
              {/* Subtitle layer */}
              <div style={{ position: 'absolute', inset: 0 }}>
                <SubtitlePreview style={style} />
              </div>
            </div>
          </div>
        </div>

        {/* Position grid */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Posição
          </p>
          
          <div style={{ marginBottom: 12 }}>
            <Toggle label="Posição Exata (Livre)" value={!!style.useExactPos} onChange={v => update('useExactPos', v)} />
          </div>

          {!style.useExactPos ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {POSITIONS.map(([pos, icon]) => (
                <button
                  key={pos}
                  onClick={() => update('position', pos)}
                  title={pos}
                  style={{
                    padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 14, transition: 'all 0.15s',
                    background: style.position === pos ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.04)',
                    color: style.position === pos ? '#a78bfa' : '#64748b',
                    boxShadow: style.position === pos ? '0 0 0 1px rgba(167,139,250,0.5)' : '0 0 0 1px rgba(255,255,255,0.06)',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', width: 12, fontWeight: 700 }}>X</span>
                <input
                  type="range" min={0} max={100}
                  value={style.exactX || 50}
                  onChange={e => update('exactX', parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: '#a78bfa' }}
                />
                <span style={{ fontSize: 10, color: '#a78bfa', minWidth: 26, textAlign: 'right' }}>{style.exactX || 50}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', width: 12, fontWeight: 700 }}>Y</span>
                <input
                  type="range" min={0} max={100}
                  value={style.exactY || 80}
                  onChange={e => update('exactY', parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: '#a78bfa' }}
                />
                <span style={{ fontSize: 10, color: '#a78bfa', minWidth: 26, textAlign: 'right' }}>{style.exactY || 80}%</span>
              </div>
            </div>
          )}

          {/* Font size */}
          <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 }}>
            Tamanho
          </p>
          <div style={{ display: 'flex', gap: 4 }}>
            {FONT_SIZES.map(({ label, name }) => (
              <button
                key={label}
                onClick={() => update('fontSize', label)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                  background: style.fontSize === label ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.04)',
                  color: style.fontSize === label ? '#a78bfa' : '#64748b',
                  boxShadow: style.fontSize === label ? '0 0 0 1px rgba(167,139,250,0.5)' : '0 0 0 1px rgba(255,255,255,0.06)',
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── PRESETS ─────────────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Presets rápidos
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {PRESETS.map((preset, idx) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset, idx)}
              style={{
                padding: '5px 4px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 10,
                fontWeight: activePreset === idx ? 700 : 500, lineHeight: 1.3, textAlign: 'center',
                transition: 'all 0.15s',
                background: activePreset === idx ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                color: activePreset === idx ? '#c4b5fd' : '#94a3b8',
                boxShadow: activePreset === idx ? '0 0 0 1px rgba(167,139,250,0.4)' : '0 0 0 1px rgba(255,255,255,0.06)',
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── COLORS ──────────────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Cores
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <ColorSwatch label="Texto"    value={style.textColor      || '#FFFFFF'} onChange={v => update('textColor', v)} />
          <ColorSwatch label="Destaque" value={style.highlightColor || '#FFE000'} onChange={v => update('highlightColor', v)} />
          <ColorSwatch label="Contorno" value={style.outlineColor   || '#000000'} onChange={v => update('outlineColor', v)} />
        </div>
      </div>

      {/* ── OPTIONS ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Toggle label="Negrito" value={style.bold !== false} onChange={v => update('bold', v)} />

        <Toggle label="Caixa de fundo" value={!!style.boxBackground} onChange={v => update('boxBackground', v)} />

        {style.boxBackground && (
          <div style={{ paddingLeft: 10, borderLeft: '2px solid rgba(167,139,250,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Opacidade caixa
              </span>
              <input
                type="range" min={0.2} max={1} step={0.05}
                value={style.boxOpacity || 0.7}
                onChange={e => update('boxOpacity', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#a78bfa' }}
              />
              <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, minWidth: 30 }}>
                {Math.round((style.boxOpacity || 0.7) * 100)}%
              </span>
            </div>
          </div>
        )}

        <Toggle label="🎹 Modo Bicolor (palavras alternadas)" value={!!style.bicolor} onChange={v => update('bicolor', v)} />

        {style.bicolor && (
          <div style={{ paddingLeft: 10, borderLeft: '2px solid rgba(167,139,250,0.3)', display: 'flex', gap: 12, marginTop: 4 }}>
            <ColorSwatch label="Cor B" value={style.biColor || '#FF6B6B'} onChange={v => update('biColor', v)} />
          </div>
        )}

        <Toggle label="⚡ Fade-in de entrada" value={!!style.fadeIn} onChange={v => update('fadeIn', v)} />
      </div>

      {/* ── FONT ─────────────────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Fonte
        </p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FONTS.map(f => (
            <button key={f.value} onClick={() => update('fontName', f.value)} style={{
              padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10,
              fontWeight: (style.fontName || 'arial-black') === f.value ? 700 : 500,
              transition: 'all 0.15s',
              background: (style.fontName || 'arial-black') === f.value ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.04)',
              color: (style.fontName || 'arial-black') === f.value ? '#c4b5fd' : '#94a3b8',
              boxShadow: (style.fontName || 'arial-black') === f.value ? '0 0 0 1px rgba(167,139,250,0.5)' : '0 0 0 1px rgba(255,255,255,0.06)',
              fontFamily: FONT_CSS[f.value],
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* ── SUMMARY chip ────────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.18)',
        borderRadius: 8, padding: '7px 10px',
        fontSize: 10, color: '#94a3b8', lineHeight: 1.6,
      }}>
        <span style={{ color: '#c4b5fd', fontWeight: 700 }}>Preview:</span>{' '}
        {FONT_SIZES.find(f => f.label === style.fontSize)?.name || 'M'} •{' '}
        {(style.position || 'middle-center').replace('-', ' ')} •{' '}
        {style.boxBackground ? 'caixa' : 'contorno'} •{' '}
        {style.bold !== false ? 'negrito' : 'normal'}
      </div>
    </div>
  );
}

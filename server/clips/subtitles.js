/**
 * subtitles.js — Gerador de .ASS com suporte a estilo personalizado
 */

const fs = require('fs');

// ── Hex color (#RRGGBB) → ASS format (&H00BBGGRR&) ───────────────────────────
function hexToAss(hex) {
    const h = hex.replace('#', '').padEnd(6, '0');
    const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
    return `&H00${b}${g}${r}&`;
}

// ── ASS alignment from position string ────────────────────────────────────────
function alignmentFromPos(pos) {
    const map = {
        'bottom-left': 1, 'bottom-center': 2, 'bottom-right': 3,
        'middle-left': 4, 'middle-center': 5, 'middle-right': 6,
        'top-left':    7, 'top-center':    8, 'top-right':    9,
    };
    return map[pos] || 2;
}

// ── Font size map ─────────────────────────────────────────────────────────────
function fontSizeFromLabel(label) {
    const map = { small: 48, medium: 62, large: 76, xlarge: 92 };
    return map[label] || 62;
}

// ── Build ASS header with custom style ────────────────────────────────────────
function buildAssHeader(width = 1080, height = 1920, style = {}) {
    const alignment  = alignmentFromPos(style.position || 'bottom-center');
    const fontSize   = fontSizeFromLabel(style.fontSize || 'medium');
    const primaryCol = hexToAss(style.textColor || '#FFFFFF');
    const outlineCol = hexToAss(style.outlineColor || '#000000');
    const hlColor    = hexToAss(style.highlightColor || '#00FFFF');
    const backCol    = style.boxBackground
        ? `&H${Math.round((style.boxOpacity || 0.6) * 255).toString(16).padStart(2, '0').toUpperCase()}000000&`
        : '&HA0000000&';
    const borderStyle = style.boxBackground ? 4 : 1;   // 4=box, 1=outline
    const outline     = style.boxBackground ? 0 : 4;
    const shadow      = style.boxBackground ? 0 : 2;
    const bold        = style.bold ? -1 : 0;
    const marginV     = alignment <= 3 ? 120 : (alignment >= 7 ? 80 : 0);

    return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,${fontSize},${primaryCol},${hlColor},${outlineCol},${backCol},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1
Style: Highlight,Arial Black,${fontSize},${hlColor},${hlColor},${outlineCol},${backCol},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1
Style: Emphasis,Arial Black,${Math.round(fontSize * 1.1)},&H004DFFFF&,${hlColor},${outlineCol},${backCol},-1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// ── Format seconds to ASS timecode ────────────────────────────────────────────
function toAssTime(seconds) {
    const h  = Math.floor(seconds / 3600);
    const m  = Math.floor((seconds % 3600) / 60);
    const s  = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

// ── Power words for emphasis ──────────────────────────────────────────────────
const POWER_WORDS = new Set([
    'nunca','sempre','agora','hoje','grátis','urgente','incrível','impossível',
    'segredo','verdade','exclusivo','único','simples','rápido','fácil','milhão',
    'bilhão','rico','dinheiro','sucesso','vencedor','épico','viral','poderoso',
    'never','always','now','today','free','urgent','incredible','impossible',
    'secret','truth','exclusive','unique','simple','fast','easy','million',
    'billion','rich','money','success','winner','epic','viral','powerful'
]);
function isEmphasis(word) {
    return POWER_WORDS.has(word.toLowerCase().replace(/[^a-záéíóúâêôãõüç]/gi,''));
}

// ── Group words into 2-3 word chunks ─────────────────────────────────────────
function groupWords(words, maxPerLine = 3) {
    const lines = [];
    for (let i = 0; i < words.length; i += maxPerLine) lines.push(words.slice(i, i + maxPerLine));
    return lines;
}

// ── Word-by-word highlight events ─────────────────────────────────────────────
function generateWordByWordEvents(words, style = {}) {
    const events = [];
    const hlCol = hexToAss(style.highlightColor || '#00FFFF');
    const txCol = hexToAss(style.textColor || '#FFFFFF');
    const fsz   = fontSizeFromLabel(style.fontSize || 'medium');
    const groups = groupWords(words, 3);

    for (const group of groups) {
        const groupEnd = group[group.length - 1].end;

        for (let wi = 0; wi < group.length; wi++) {
            const w = group[wi];
            const wordStart = w.start;
            const wordEnd   = group[wi + 1] ? group[wi + 1].start : groupEnd;

            let lineText = '';
            for (let j = 0; j < group.length; j++) {
                const wj = group[j];
                const txt = wj.word.trim();
                const up  = txt.toUpperCase();
                if (j === wi) {
                    if (isEmphasis(txt)) {
                        lineText += `{\\c&H004DFFFF&\\3c&H00000000&\\fs${Math.round(fsz*1.1)}}${up}{\\c${txCol}\\fs${fsz}} `;
                    } else {
                        lineText += `{\\c${hlCol}\\3c&H00000000&}${up}{\\c${txCol}} `;
                    }
                } else if (j < wi) {
                    lineText += `{\\c&H00CCCCCC&}${up}{\\c${txCol}} `;
                } else {
                    lineText += `${up} `;
                }
            }
            events.push(`Dialogue: 0,${toAssTime(wordStart)},${toAssTime(wordEnd)},Default,,0,0,0,,${lineText.trim()}`);
        }
    }
    return events;
}

// ── Main: Generate .ass from Whisper words ─────────────────────────────────────
function generateAssFile(words, outputPath, aspectRatio = '9:16', style = {}) {
    if (!words || !words.length) return null;
    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : (aspectRatio === '1:1' ? 1080 : 1920);
    const h   = isV ? 1920 : (aspectRatio === '1:1' ? 1080 : 1080);
    const header = buildAssHeader(w, h, style);
    const events = generateWordByWordEvents(words, style);
    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

// ── Fallback: Generate from plain text segments ────────────────────────────────
function generateAssFromSegments(segments, outputPath, aspectRatio = '9:16', style = {}) {
    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : 1920;
    const h   = isV ? 1920 : 1080;
    const header = buildAssHeader(w, h, style);
    const events = segments.map(seg => {
        const text = seg.text.trim().toUpperCase();
        const sty  = isEmphasis(text.split(' ')[0]) ? 'Emphasis' : 'Default';
        return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},${sty},,0,0,0,,${text}`;
    });
    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

// ── Placeholder: title + caption spread ───────────────────────────────────────
function generatePlaceholderAss(startSec, endSec, title, caption, outputPath, aspectRatio = '9:16', style = {}) {
    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : 1920;
    const h   = isV ? 1920 : 1080;
    const header = buildAssHeader(w, h, style);
    const events = [];
    events.push(`Dialogue: 0,${toAssTime(0)},${toAssTime(2)},Emphasis,,0,0,0,,${title.toUpperCase()}`);
    const words   = caption.split(/\s+/).filter(Boolean);
    const chunks  = [];
    for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(' '));
    const dur = (endSec - startSec) - 2;
    const tpc = dur / Math.max(chunks.length, 1);
    chunks.forEach((chunk, i) => {
        const cs = 2 + i * tpc;
        events.push(`Dialogue: 0,${toAssTime(cs)},${toAssTime(cs + tpc)},Default,,0,0,0,,${chunk.toUpperCase()}`);
    });
    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

// ── Smart Captions for Smart Editor ───────────────────────────────────────────
// Fillers to hide from subtitles (audio is kept or cut separately)
const FILLERS = new Set([
    'tipo','ahn','ééé','éé','é','ã','ãn','então','né','sabe','certo','assim',
    'bem','hm','hmm','hum','ah','ahh','oh','oi','olha','bom','ok','okay',
    'mmm','pois','cê','tô','tá','tava','saca','cara','mano','galera'
]);

// Semantic sentence-boundary detection based on pause gap
function detectSentenceBoundary(words, i, silenceGap = 0.4) {
    if (i >= words.length - 1) return true;
    const gap = words[i + 1].start - words[i].end;
    return gap >= silenceGap;
}

// Auto-punctuation: add comma on short pause, period on long pause
function addPunctuation(text, gapAfter) {
    if (!text) return text;
    if (/[.!?,]$/.test(text)) return text;
    if (gapAfter >= 0.6) return text + '.';
    if (gapAfter >= 0.25) return text + ',';
    return text;
}

// Group words into semantic chunks (2-5 words, never cut mid-phrase)
function groupWordsSemantic(words, maxPerLine = 4) {
    const groups = [];
    let current = [];

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        current.push(w);

        const isBoundary = detectSentenceBoundary(words, i, 0.35);
        const tooLong = current.length >= maxPerLine;

        if (isBoundary || tooLong) {
            groups.push(current);
            current = [];
        }
    }
    if (current.length) groups.push(current);
    return groups;
}

/**
 * generateSmartCaptions — used by the Smart Editor module.
 * Returns the ASS file with clean captions: no fillers, semantic breaks,
 * auto-punctuation and word-by-word highlight.
 */
function generateSmartCaptions(words, outputPath, aspectRatio = '9:16', style = {}) {
    if (!words || !words.length) return null;

    // Filter out filler words
    const cleanWords = words.filter(w => {
        const clean = w.word.trim().toLowerCase().replace(/[^a-záéíóúâêôãõüç]/gi, '');
        return clean.length > 0 && !FILLERS.has(clean);
    });

    if (!cleanWords.length) return null;

    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : 1920;
    const h   = isV ? 1920 : 1080;
    const header = buildAssHeader(w, h, style);
    const hlCol = hexToAss(style.highlightColor || '#00FFFF');
    const txCol = hexToAss(style.textColor || '#FFFFFF');
    const fsz   = fontSizeFromLabel(style.fontSize || 'medium');

    const groups = groupWordsSemantic(cleanWords, 4);
    const events = [];

    for (const group of groups) {
        const groupStart = group[0].start;
        const groupEnd   = group[group.length - 1].end;

        // Gap after group for auto punctuation
        const nextWord = cleanWords[cleanWords.indexOf(group[group.length - 1]) + 1];
        const gapAfter = nextWord ? nextWord.start - groupEnd : 1;

        for (let wi = 0; wi < group.length; wi++) {
            const wordItem = group[wi];
            const wordStart = wordItem.start;
            const wordEnd   = group[wi + 1] ? group[wi + 1].start : groupEnd;

            let lineText = '';
            for (let j = 0; j < group.length; j++) {
                const wj = group[j];
                let txt = wj.word.trim();
                // Add punctuation only on last word of group
                if (j === group.length - 1) txt = addPunctuation(txt, gapAfter);
                const up = txt.toUpperCase();

                if (j === wi) {
                    if (isEmphasis(txt)) {
                        lineText += `{\\c\u0026H004DFFFF\u0026\\3c\u0026H00000000\u0026\\fs${Math.round(fsz*1.1)}}${up}{\\c${txCol}\\fs${fsz}} `;
                    } else {
                        lineText += `{\\c${hlCol}\\3c\u0026H00000000\u0026}${up}{\\c${txCol}} `;
                    }
                } else if (j < wi) {
                    lineText += `{\\c\u0026H00CCCCCC\u0026}${up}{\\c${txCol}} `;
                } else {
                    lineText += `${up} `;
                }
            }
            events.push(`Dialogue: 0,${toAssTime(wordStart)},${toAssTime(wordEnd)},Default,,0,0,0,,${lineText.trim()}`);
        }
    }

    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

module.exports = { generateAssFile, generateAssFromSegments, generatePlaceholderAss, generateSmartCaptions, toAssTime, buildAssHeader };


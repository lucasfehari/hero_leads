/**
 * subtitles.js — Gerador de .ASS com suporte a estilo personalizado
 * v2 — Bicolor, animação, fonte configurável, semântico por padrão
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
function fontSizeFromLabel(label, base) {
    if (base) return base;
    const map = { small: 48, medium: 62, large: 76, xlarge: 92 };
    return map[label] || 62;
}

// ── Font name resolver ─────────────────────────────────────────────────────────
function resolveFontName(fontName) {
    const fonts = {
        'arial-black': 'Arial Black',
        'impact':      'Impact',
        'montserrat':  'Montserrat ExtraBold',
        'oswald':      'Oswald',
        'bebas':       'Bebas Neue',
        'roboto':      'Roboto Black',
    };
    return fonts[fontName] || fontName || 'Arial Black';
}

// ── Build ASS header with custom style ────────────────────────────────────────
function buildAssHeader(width = 1080, height = 1920, style = {}) {
    const alignment  = alignmentFromPos(style.position || 'bottom-center');
    const fontSize   = fontSizeFromLabel(style.fontSize || 'medium', style.fontSizePx);
    const fontName   = resolveFontName(style.fontName);
    const primaryCol = hexToAss(style.textColor || '#FFFFFF');
    const outlineCol = hexToAss(style.outlineColor || '#000000');
    const hlColor    = hexToAss(style.highlightColor || '#00FFFF');
    // Secondary color for bicolor mode
    const biColor    = hexToAss(style.biColor || style.highlightColor || '#FFE000');
    const backCol    = style.boxBackground
        ? `&H${Math.round((style.boxOpacity || 0.6) * 255).toString(16).padStart(2, '0').toUpperCase()}000000&`
        : '&HA0000000&';
    const borderStyle = style.boxBackground ? 4 : 1;   // 4=box, 1=outline
    const outline     = style.boxBackground ? 0 : (style.outlineWidth ?? 4);
    const shadow      = style.boxBackground ? 0 : (style.shadow ?? 2);
    const bold        = style.bold ? -1 : 0;
    const italic      = style.italic ? -1 : 0;
    const marginV     = alignment <= 3 ? 120 : (alignment >= 7 ? 80 : 0);
    const spacing     = style.letterSpacing || 0;

    return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryCol},${biColor},${outlineCol},${backCol},${bold},${italic},0,0,100,100,${spacing},0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1
Style: Highlight,${fontName},${fontSize},${hlColor},${biColor},${outlineCol},${backCol},${bold},${italic},0,0,100,100,${spacing},0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1
Style: Emphasis,${fontName},${Math.round(fontSize * 1.12)},&H004DFFFF&,${biColor},${outlineCol},${backCol},-1,${italic},0,0,100,100,${spacing},0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1
Style: BiColor2,${fontName},${fontSize},${biColor},${hlColor},${outlineCol},${backCol},${bold},${italic},0,0,100,100,${spacing},0,${borderStyle},${outline},${shadow},${alignment},80,80,${marginV},1

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
    'billion','rich','money','success','winner','epic','viral','powerful',
    'importante','crítico','essencial','obrigatório','fundamental','revelação',
]);
function isEmphasis(word) {
    return POWER_WORDS.has(word.toLowerCase().replace(/[^a-záéíóúâêôãõüç]/gi,''));
}

// ── Fillers to hide from subtitles ────────────────────────────────────────────
const FILLERS = new Set([
    'tipo','ahn','ééé','éé','é','ã','ãn','então','né','sabe','certo','assim',
    'bem','hm','hmm','hum','ah','ahh','oh','oi','olha','bom','ok','okay',
    'mmm','pois','cê','tô','tá','tava','saca','cara','mano','galera',
    'enfim','basicamente','literalmente','obviamente','sinceramente',
]);

function isFiller(word) {
    const clean = word.trim().toLowerCase().replace(/[^a-záéíóúâêôãõüç]/gi, '');
    return clean.length === 0 || FILLERS.has(clean);
}

// ── Semantic sentence-boundary detection based on pause gap ──────────────────
function detectSentenceBoundary(words, i, silenceGap = 0.4) {
    if (i >= words.length - 1) return true;
    const gap = words[i + 1].start - words[i].end;
    return gap >= silenceGap;
}

// ── Auto-punctuation: add comma on short pause, period on long pause ─────────
function addPunctuation(text, gapAfter) {
    if (!text) return text;
    if (/[.!?,]$/.test(text)) return text;
    if (gapAfter >= 0.6) return text + '.';
    if (gapAfter >= 0.25) return text + ',';
    return text;
}

// ── Group words into semantic chunks (2-5 words, never cut mid-phrase) ───────
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

// ── Build fade animation tag ──────────────────────────────────────────────────
function fadTag(style) {
    if (!style.fadeIn) return '';
    const ms = style.fadeInMs || 80;
    return `{\\fad(${ms},0)}`;
}

// ── Build word-by-word events (unified engine) ────────────────────────────────
function buildWordEvents(words, style = {}, width = 1080, height = 1920) {
    const events = [];
    const hlCol  = hexToAss(style.highlightColor || '#00FFFF');
    const txCol  = hexToAss(style.textColor || '#FFFFFF');
    const biCol  = hexToAss(style.biColor || style.highlightColor || '#FFE000');
    const fsz    = fontSizeFromLabel(style.fontSize || 'medium', style.fontSizePx);
    const fade   = fadTag(style);
    const isBicolor = !!style.bicolor;

    // Exact positioning tag
    let posTag = '';
    if (style.useExactPos) {
        const xPx = Math.round(width * ((style.exactX ?? 50) / 100));
        const yPx = Math.round(height * ((style.exactY ?? 80) / 100));
        posTag = `{\\pos(${xPx},${yPx})}`;
    }

    const groups = groupWordsSemantic(words, style.wordsPerLine || 4);

    for (const group of groups) {
        const groupStart = group[0].start;
        const groupEnd   = group[group.length - 1].end;

        // Gap after group for auto punctuation
        const nextWord = words[words.indexOf(group[group.length - 1]) + 1];
        const gapAfter = nextWord ? nextWord.start - groupEnd : 1;

        for (let wi = 0; wi < group.length; wi++) {
            const wordItem  = group[wi];
            const wordStart = wordItem.start;
            const wordEnd   = group[wi + 1] ? group[wi + 1].start : groupEnd;

            let lineText = '';

            if (isBicolor) {
                // Bicolor mode: alternate between textColor and biColor per word, highlight current
                for (let j = 0; j < group.length; j++) {
                    const wj  = group[j];
                    let txt   = wj.word.trim();
                    if (j === group.length - 1) txt = addPunctuation(txt, gapAfter);
                    const up  = txt.toUpperCase();
                    const col = j % 2 === 0 ? txCol : biCol;

                    if (j === wi) {
                        // Current word: highlighted + scale up slightly
                        const emp = isEmphasis(txt);
                        const scaledFsz = emp ? Math.round(fsz * 1.12) : fsz;
                        lineText += `{\\c${hlCol}\\fs${scaledFsz}}${up}{\\c${col}\\fs${fsz}} `;
                    } else if (j < wi) {
                        // Already spoken: dimmed
                        lineText += `{\\c&H00888888&}${up}{\\c${col}} `;
                    } else {
                        // Upcoming: alternating bicolor
                        lineText += `{\\c${col}}${up} `;
                    }
                }
            } else {
                // Classic mode: all white, highlighted word colored
                for (let j = 0; j < group.length; j++) {
                    const wj  = group[j];
                    let txt   = wj.word.trim();
                    if (j === group.length - 1) txt = addPunctuation(txt, gapAfter);
                    const up  = txt.toUpperCase();

                    if (j === wi) {
                        if (isEmphasis(txt)) {
                            lineText += `{\\c&H004DFFFF&\\3c&H00000000&\\fs${Math.round(fsz*1.12)}}${up}{\\c${txCol}\\fs${fsz}} `;
                        } else {
                            lineText += `{\\c${hlCol}\\3c&H00000000&}${up}{\\c${txCol}} `;
                        }
                    } else if (j < wi) {
                        lineText += `{\\c&H00CCCCCC&}${up}{\\c${txCol}} `;
                    } else {
                        lineText += `${up} `;
                    }
                }
            }

            events.push(
                `Dialogue: 0,${toAssTime(wordStart)},${toAssTime(wordEnd)},Default,,0,0,0,,${posTag}${fade}${lineText.trim()}`
            );
        }
    }
    return events;
}

// ── Main: Generate .ass from Whisper words ─────────────────────────────────────
function generateAssFile(words, outputPath, aspectRatio = '9:16', style = {}, opts = {}) {
    if (!words || !words.length) return null;

    // Apply filler removal if requested
    let processedWords = words;
    if (opts.removeFillers || style.removeFillers) {
        processedWords = words.filter(w => !isFiller(w.word));
    }
    if (!processedWords.length) return null;

    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : (aspectRatio === '1:1' ? 1080 : 1920);
    const h   = isV ? 1920 : (aspectRatio === '1:1' ? 1080 : 1080);
    const header = buildAssHeader(w, h, style);
    const events = buildWordEvents(processedWords, style, w, h);
    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

// ── Fallback: Generate from plain text segments ────────────────────────────────
function generateAssFromSegments(segments, outputPath, aspectRatio = '9:16', style = {}) {
    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : 1920;
    const h   = isV ? 1920 : 1080;
    const header = buildAssHeader(w, h, style);
    
    let posTag = '';
    if (style.useExactPos) {
        const xPx = Math.round(w * ((style.exactX ?? 50) / 100));
        const yPx = Math.round(h * ((style.exactY ?? 80) / 100));
        posTag = `{\\pos(${xPx},${yPx})}`;
    }

    const hlCol = hexToAss(style.highlightColor || '#00FFFF');
    const fade  = fadTag(style);

    const events = segments.map(seg => {
        const text = seg.text.trim().toUpperCase();
        const sty  = isEmphasis(text.split(' ')[0]) ? 'Emphasis' : 'Default';
        return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},${sty},,0,0,0,,${posTag}${fade}${text}`;
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
    const fade   = fadTag(style);
    
    let posTag = '';
    if (style.useExactPos) {
        const xPx = Math.round(w * ((style.exactX ?? 50) / 100));
        const yPx = Math.round(h * ((style.exactY ?? 80) / 100));
        posTag = `{\\pos(${xPx},${yPx})}`;
    }

    events.push(`Dialogue: 0,${toAssTime(0)},${toAssTime(2)},Emphasis,,0,0,0,,${posTag}${fade}${title.toUpperCase()}`);
    const words   = caption.split(/\s+/).filter(Boolean);
    const chunks  = [];
    for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(' '));
    const dur = (endSec - startSec) - 2;
    const tpc = dur / Math.max(chunks.length, 1);
    chunks.forEach((chunk, i) => {
        const cs = 2 + i * tpc;
        events.push(`Dialogue: 0,${toAssTime(cs)},${toAssTime(cs + tpc)},Default,,0,0,0,,${posTag}${fade}${chunk.toUpperCase()}`);
    });
    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

// ── Smart Captions (with filler removal + semantic breaks) ────────────────────
function generateSmartCaptions(words, outputPath, aspectRatio = '9:16', style = {}) {
    if (!words || !words.length) return null;

    // Filter out filler words
    const cleanWords = words.filter(w => !isFiller(w.word));
    if (!cleanWords.length) return null;

    const isV = aspectRatio === '9:16';
    const w   = isV ? 1080 : 1920;
    const h   = isV ? 1920 : 1080;
    const header = buildAssHeader(w, h, style);
    const events = buildWordEvents(cleanWords, style, w, h);
    fs.writeFileSync(outputPath, header + events.join('\n') + '\n', 'utf8');
    return outputPath;
}

module.exports = {
    generateAssFile,
    generateAssFromSegments,
    generatePlaceholderAss,
    generateSmartCaptions,
    toAssTime,
    buildAssHeader,
    isFiller,
    isEmphasis,
};

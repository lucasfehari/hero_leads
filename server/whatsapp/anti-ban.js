/**
 * Anti-Ban Engine — 7 Camadas de Proteção
 * =====================================
 * Camada 1: Delay Gaussiano (ritmo humano)
 * Camada 2: Warmup de Sessão (novas contas)
 * Camada 3: Simulação de Atividade Humana
 * Camada 4: Pré-Validação de Números
 * Camada 5: Humanizador de Mensagens
 * Camada 6: Limitador de Taxa Inteligente
 * Camada 7: Shuffle + Memória de Números Ruins
 */

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../../whatsapp_sessions');

// Cada sessão tem sua própria pasta: whatsapp_sessions/session-<name>/
function sessionDir(sessionName) {
    const dir = path.join(SESSIONS_DIR, `session-${sessionName}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function warmupFile(sessionName) {
    return path.join(sessionDir(sessionName), 'warmup.json');
}

function badNumbersFile(sessionName) {
    return path.join(sessionDir(sessionName), 'bad_numbers.json');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function readJSON(filePath, defaultVal) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { /* */ }
    return defaultVal;
}

function writeJSON(filePath, data) {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch (e) { /* */ }
}

// ─── Camada 1: Delay Gaussiano ────────────────────────────────────────────────
// Aproxima distribuição normal usando Box-Muller transform
// Resultado: humanos têm moda próxima ao centro, não uniforme
function gaussianDelay(minMs, maxMs) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    // Normal(0,1) → mapeado para [min, max] com 95% dentro dos limites
    const mid = (minMs + maxMs) / 2;
    const std = (maxMs - minMs) / 6;
    return Math.max(minMs, Math.min(maxMs, Math.round(mid + normal * std)));
}

// Spike de distração: usuário foi fazer outra coisa (5% de chance)
function distractionSpike(baseMsMax) {
    if (Math.random() < 0.05) {
        return baseMsMax + gaussianDelay(15000, 90000); // pausa extra de 15s-90s
    }
    return 0;
}

// ─── Camada 2: Warmup de Sessão ────────────────────────────────────────────────
const WARMUP_SCHEDULE = [20, 30, 45, 65, 90, 120, 160, 210, 280]; // msgs por dia por semana

function getTodayKey() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function getHourKey() {
    const d = new Date();
    return `${d.toISOString().slice(0, 10)}-${d.getHours()}`;
}

// Carrega o warmup de UMA sessão (arquivo próprio dentro da pasta da sessão)
function loadSessionWarmup(sessionName) {
    const file = warmupFile(sessionName);
    const data = readJSON(file, null);
    if (!data) {
        // Primeira vez: cria com firstDay = hoje
        const initial = { firstDay: getTodayKey(), dailyCounts: {}, hourlyCounts: {} };
        writeJSON(file, initial);
        return initial;
    }
    return data;
}

function saveSessionWarmup(sessionName, data) {
    writeJSON(warmupFile(sessionName), data);
}

function getSessionWarmup(sessionName, maxDailyOverride) {
    const session = loadSessionWarmup(sessionName);
    const today = getTodayKey();

    const daysSinceStart = Math.floor(
        (new Date(today) - new Date(session.firstDay)) / 86400000
    );
    const weekIndex = Math.min(Math.floor(daysSinceStart / 7), WARMUP_SCHEDULE.length - 1);
    const dailyLimit = maxDailyOverride || WARMUP_SCHEDULE[weekIndex];
    const todayCount = session.dailyCounts[today] || 0;

    return {
        dailyLimit,
        todayCount,
        daysSinceStart,
        weekIndex,
        warmupProgress: Math.min(100, Math.round((weekIndex / (WARMUP_SCHEDULE.length - 1)) * 100)),
        healthy: weekIndex >= WARMUP_SCHEDULE.length - 1,
        firstDay: session.firstDay,
    };
}

function recordSend(sessionName) {
    const session = loadSessionWarmup(sessionName);
    const today = getTodayKey();
    const hourKey = getHourKey();

    session.dailyCounts[today] = (session.dailyCounts[today] || 0) + 1;
    session.hourlyCounts[hourKey] = (session.hourlyCounts[hourKey] || 0) + 1;
    saveSessionWarmup(sessionName, session);
}

function getHourlyCount(sessionName) {
    const session = loadSessionWarmup(sessionName);
    return session.hourlyCounts?.[getHourKey()] || 0;
}

// ─── Camada 3: Simulador de Atividade Humana ──────────────────────────────────
async function simulateHumanActivity(client, notify) {
    try {
        notify?.('activity', { msg: '👁 Simulando atividade humana...' });
        const chats = await client.getChats();
        if (chats.length > 0) {
            // "Abre" 1 ou 2 conversas aleatórias
            const picks = Math.floor(Math.random() * 2) + 1;
            for (let i = 0; i < picks; i++) {
                const randomChat = chats[Math.floor(Math.random() * Math.min(chats.length, 20))];
                try {
                    await client.getChatById(randomChat.id._serialized);
                    // Marca como lida
                    await randomChat.sendSeen();
                } catch (e) { /* ignora erros de chat individual */ }
                await sleep(gaussianDelay(1200, 4000));
            }
        }
        // Pausa de "leitura"
        const readDelay = gaussianDelay(3000, 12000);
        notify?.('activity', { msg: `📖 Lendo conversas por ${Math.round(readDelay / 1000)}s...` });
        await sleep(readDelay);
    } catch (e) {
        await sleep(2000);
    }
}

// ─── Camada 4: Validação de Número ──────────────────────────────────────────
// Bad numbers também são por sessão — uma conta pode ter contatos bloqueados diferentes
function loadBadNumbers(sessionName) {
    return new Set(readJSON(badNumbersFile(sessionName), []));
}

function saveBadNumber(sessionName, number) {
    const list = Array.from(loadBadNumbers(sessionName));
    if (!list.includes(number)) {
        list.push(number);
        writeJSON(badNumbersFile(sessionName), list);
    }
}

async function isValidWhatsAppNumber(client, number) {
    try {
        return await client.isRegisteredUser(number);
    } catch (e) {
        return true; // em caso de erro, assume válido (não bloqueia)
    }
}

// ─── Camada 5: Humanizador de Mensagens ───────────────────────────────────────

// Caracteres invisíveis Unicode (zero-width) para quebrar hash de identidade
const INVISIBLE_CHARS = [
    '\u200B', // Zero Width Space
    '\u200C', // Zero Width Non-Joiner
    '\u200D', // Zero Width Joiner
    '\u2060', // Word Joiner
    '\uFEFF', // Zero Width No-Break Space
];

const DEFAULT_EMOJI_POOL = ['😊', '👍', '✅', '🙏', '💪', '🚀', '😁', '👋', '🌟', '💬'];

function injectInvisibleChars(text) {
    // Injeta 1-3 chars invisíveis em posições aleatórias dentro do texto
    const count = Math.floor(Math.random() * 3) + 1;
    let result = text;
    for (let i = 0; i < count; i++) {
        const char = INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)];
        const pos = Math.floor(Math.random() * result.length);
        result = result.slice(0, pos) + char + result.slice(pos);
    }
    return result;
}

function addRandomEmoji(text, emojiPool) {
    if (!emojiPool || emojiPool.length === 0) return text;
    if (Math.random() < 0.4) return text; // 60% de chance de adicionar
    const emoji = emojiPool[Math.floor(Math.random() * emojiPool.length)];
    return text + ' ' + emoji;
}

function randomizePunctuation(text) {
    // Varia a pontuação final aleatoriamente
    const trimmed = text.trimEnd();
    if (/[.!?]$/.test(trimmed)) {
        // 30% remove, 30% troca por !, 40% mantém
        const r = Math.random();
        if (r < 0.3) return trimmed.slice(0, -1);
        if (r < 0.6) return trimmed.slice(0, -1) + '!';
        return trimmed;
    }
    // Sem pontuação: 40% adiciona ponto, 20% adiciona !, 40% deixa assim
    const r = Math.random();
    if (r < 0.4) return trimmed + '.';
    if (r < 0.6) return trimmed + '!';
    return trimmed;
}

function spinText(text) {
    return text.replace(/\{([^{}]+)\}/g, (_, content) => {
        const choices = content.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
}

function humanizeMessage(text, options = {}) {
    let msg = spinText(text);
    msg = randomizePunctuation(msg);
    msg = injectInvisibleChars(msg);
    msg = addRandomEmoji(msg, options.emojiPool || []);
    return msg;
}

// ─── Camada 6: Limitador de Taxa ──────────────────────────────────────────────

function isGoodSendingHour() {
    const hour = new Date().getHours();
    return hour >= 7 && hour <= 21;
}

function checkRateLimits(sessionName, config) {
    const hourlyCount = getHourlyCount(sessionName);
    const { todayCount, dailyLimit } = getSessionWarmup(sessionName, config.dailyLimit);
    const hourlyLimit = config.hourlyLimit || 40;

    const result = {
        ok: true,
        softThrottle: false,
        hardStop: false,
        reason: null,
        hourlyCount,
        todayCount,
        dailyLimit,
        hourlyLimit,
    };

    if (todayCount >= dailyLimit) {
        result.ok = false;
        result.hardStop = true;
        result.reason = `Limite diário atingido (${todayCount}/${dailyLimit} msgs)`;
        return result;
    }

    if (hourlyCount >= hourlyLimit) {
        result.ok = false;
        result.hardStop = true;
        result.reason = `Limite por hora atingido (${hourlyCount}/${hourlyLimit} msgs/h)`;
        return result;
    }

    // Soft throttle: abrandamento quando próximo do limite
    if (hourlyCount >= hourlyLimit * 0.8) {
        result.softThrottle = true;
        result.reason = 'Próximo do limite por hora — desacelerando';
    }

    if (!isGoodSendingHour()) {
        result.softThrottle = true;
        result.reason = 'Fora do horário comercial — recomendado enviar entre 7h e 21h';
    }

    return result;
}

// ─── Camada 7: Shuffle + Números Ruins ───────────────────────────────────────
function shuffleContacts(numbers) {
    const arr = [...numbers];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─── API Pública ────────────────────────────────────────────────────────────
module.exports = {
    // Delays
    gaussianDelay,
    distractionSpike,
    sleep,

    // Warmup
    getSessionWarmup,
    recordSend,
    getHourlyCount,

    // Atividade
    simulateHumanActivity,

    // Números
    loadBadNumbers,
    saveBadNumber,
    isValidWhatsAppNumber,

    // Mensagem
    humanizeMessage,
    spinText,

    // Taxa
    checkRateLimits,
    isGoodSendingHour,

    // Contatos
    shuffleContacts,
};

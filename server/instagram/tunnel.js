/**
 * Tunnel Manager — Expõe o servidor local via URL pública temporária.
 *
 * Problema: A Instagram Graph API exige que as imagens/vídeos estejam
 * em uma URL pública HTTPS para o Instagram fazer cURL e baixar.
 * Quando o usuário não tem domínio público, usamos localtunnel
 * para criar uma URL HTTPS temporária apontando para o servidor local.
 *
 * Quando o usuário configurar um domínio público, basta setar
 * MEDIA_BASE_URL no .env e o tunnel NÃO será usado.
 */

const localtunnel = require('localtunnel');

// Porta do servidor Express (mesma que o server.js usa)
const SERVER_PORT = process.env.PORT || 3000;

// Se o usuário já tem um domínio público, basta definir esta variável
// Ex: MEDIA_BASE_URL=https://meudominio.com/api/ig/media
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL || null;

// Referência do tunnel ativo (singleton — só precisamos de um por vez)
let activeTunnel = null;
let tunnelUrl = null;

/**
 * Abre um tunnel público temporário.
 * Retorna a URL base pública (ex: https://xxxxx.loca.lt)
 * 
 * Se MEDIA_BASE_URL estiver definida, retorna ela diretamente
 * (sem abrir tunnel — o usuário já tem domínio público).
 */
async function openTunnel() {
    // Se o usuário já configurou URL pública, usa ela direto
    if (MEDIA_BASE_URL) {
        console.log(`[TUNNEL] Usando URL pública configurada: ${MEDIA_BASE_URL}`);
        return MEDIA_BASE_URL;
    }

    // Se já tem um tunnel ativo, reutiliza
    if (activeTunnel && tunnelUrl) {
        console.log(`[TUNNEL] Reutilizando tunnel existente: ${tunnelUrl}`);
        return tunnelUrl;
    }

    console.log(`[TUNNEL] Abrindo tunnel para porta ${SERVER_PORT}...`);

    try {
        // Subdomain fixo baseado no nome da máquina para reutilizar URL
        // (localtunnel tenta usar o mesmo subdomain se disponível)
        const subdomain = `insta-publisher-${Date.now()}`;

        activeTunnel = await localtunnel({
            port: SERVER_PORT,
            subdomain,
            // Permitir conexões do Instagram (Meta servers)
            allow_invalid_cert: true,
        });

        tunnelUrl = activeTunnel.url;
        console.log(`[TUNNEL] ✅ Tunnel aberto: ${tunnelUrl}`);

        // Listener para caso o tunnel caia durante o uso
        activeTunnel.on('close', () => {
            console.log('[TUNNEL] ⚠️ Tunnel fechou inesperadamente.');
            activeTunnel = null;
            tunnelUrl = null;
        });

        activeTunnel.on('error', (err) => {
            console.error('[TUNNEL] ❌ Erro no tunnel:', err.message);
        });

        return tunnelUrl;

    } catch (err) {
        console.error(`[TUNNEL] ❌ Falha ao abrir tunnel: ${err.message}`);
        throw new Error(`Não foi possível criar URL pública para as mídias. Configure MEDIA_BASE_URL ou verifique sua conexão.`);
    }
}

/**
 * Fecha o tunnel ativo (chamar após publicação).
 */
async function closeTunnel() {
    if (activeTunnel) {
        try {
            activeTunnel.close();
            console.log('[TUNNEL] Tunnel fechado.');
        } catch (err) {
            console.error('[TUNNEL] Erro ao fechar tunnel:', err.message);
        }
        activeTunnel = null;
        tunnelUrl = null;
    }
}

/**
 * Monta a URL pública completa para um arquivo de mídia.
 * O servidor Express já serve arquivos em /api/ig/media/:filename
 * 
 * @param {string} baseUrl — URL base do tunnel (ex: https://xxxxx.loca.lt)
 * @param {string} filename — nome do arquivo (ex: 1234567890-image.jpg)
 * @returns {string} URL pública completa (ex: https://xxxxx.loca.lt/api/ig/media/1234567890-image.jpg)
 */
function buildPublicMediaUrl(baseUrl, filename) {
    // Remove trailing slash da base URL se existir
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/api/ig/media/${filename}`;
}

module.exports = { openTunnel, closeTunnel, buildPublicMediaUrl };

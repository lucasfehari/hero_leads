/**
 * Instagram OAuth — Login automático via Instagram Business Login.
 *
 * Fluxo (como o GoHighLevel faz):
 *   1. Usuário clica "⚡ Conectar Instagram" na UI
 *   2. Abre popup do Instagram pedindo autorização
 *   3. Usuário autoriza → Instagram redireciona de volta com um 'code'
 *   4. Nosso backend troca o 'code' por um access_token de curta duração
 *   5. Troca o token curto por um de longa duração (~60 dias)
 *   6. Busca o ig_user_id automaticamente
 *   7. Salva tudo no banco — pronto para publicar via API
 *
 * Pré-requisitos no Meta Developers:
 *   - App com produto "Instagram" configurado
 *   - Redirect URI configurada: http://localhost:3000/api/ig/oauth/callback
 *   - Permissões: instagram_business_basic + instagram_content_publish
 */

require('dotenv').config();
const { db } = require('./db');

// Credenciais do app (vem do .env)
const IG_APP_ID = process.env.IG_APP_ID;
const IG_APP_SECRET = process.env.IG_APP_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// URL de callback que o Instagram redireciona após autorização
const REDIRECT_URI = `${BASE_URL}/api/ig/oauth/callback`;

// Permissões que precisamos para publicar
const SCOPES = [
    'instagram_business_basic',
    'instagram_business_content_publish',
].join(',');

/**
 * Gera a URL de autorização do Instagram.
 * O frontend abre essa URL em um popup/nova aba.
 *
 * @param {number} accountId — ID da conta no nosso banco (passado via state)
 * @returns {string} URL completa de autorização
 */
function getAuthorizationUrl(accountId) {
    // O 'state' carrega o accountId para sabermos qual conta atualizar no callback
    const state = JSON.stringify({ accountId });
    const stateEncoded = Buffer.from(state).toString('base64');

    const params = new URLSearchParams({
        enable_fb_login: '0',             // Só Instagram, sem Facebook
        force_authentication: '1',         // Sempre pedir login (multi-conta)
        client_id: IG_APP_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        state: stateEncoded,
    });

    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

/**
 * Troca o 'code' de autorização por um access_token de curta duração.
 * O code é válido por apenas 1 hora.
 *
 * @param {string} code — Código retornado pelo Instagram no callback
 * @returns {Promise<{access_token: string, user_id: string}>}
 */
async function exchangeCodeForToken(code) {
    console.log('[OAUTH] Trocando code por token de curta duração...');

    const response = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: IG_APP_ID,
            client_secret: IG_APP_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
            code,
        }),
    });

    const data = await response.json();

    if (data.error_message || data.error) {
        throw new Error(`OAuth error: ${data.error_message || data.error?.message || JSON.stringify(data)}`);
    }

    console.log(`[OAUTH] ✅ Token curto obtido. User ID: ${data.user_id}`);
    return {
        access_token: data.access_token,
        user_id: String(data.user_id),
    };
}

/**
 * Troca um token de curta duração (~1h) por um de longa duração (~60 dias).
 * Esse é o token que armazenamos no banco.
 *
 * @param {string} shortLivedToken — Token de curta duração
 * @returns {Promise<{access_token: string, expires_in: number}>}
 */
async function exchangeForLongLivedToken(shortLivedToken) {
    console.log('[OAUTH] Trocando por token de longa duração (~60 dias)...');

    const params = new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: IG_APP_SECRET,
        access_token: shortLivedToken,
    });

    const response = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
        throw new Error(`Long-lived token error: ${data.error.message}`);
    }

    console.log(`[OAUTH] ✅ Token de longa duração obtido. Expira em ${data.expires_in}s (~${Math.round(data.expires_in / 86400)} dias)`);
    return {
        access_token: data.access_token,
        expires_in: data.expires_in, // em segundos (~5184000 = 60 dias)
    };
}

/**
 * Busca informações do perfil Instagram usando o token.
 *
 * @param {string} accessToken — Token válido
 * @param {string} userId — IG User ID
 * @returns {Promise<{username: string, name: string, profile_picture_url: string}>}
 */
async function getProfileInfo(accessToken, userId) {
    const response = await fetch(
        `https://graph.instagram.com/v22.0/${userId}?fields=username,name,profile_picture_url,followers_count,media_count&access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.error) {
        throw new Error(`Profile error: ${data.error.message}`);
    }

    return data;
}

/**
 * Fluxo completo do callback OAuth.
 * Chamado quando o Instagram redireciona de volta com o 'code'.
 *
 * @param {string} code — Código de autorização
 * @param {string} stateBase64 — State encodado em base64 (contém accountId)
 * @param {object} io — Socket.IO instance para emitir updates
 * @returns {Promise<{success: boolean, account?: object, error?: string}>}
 */
async function handleCallback(code, stateBase64, io) {
    try {
        // 1. Decodificar state para pegar o accountId
        const state = JSON.parse(Buffer.from(stateBase64, 'base64').toString());
        const { accountId } = state;

        console.log(`[OAUTH] Callback recebido para conta #${accountId}`);

        // 2. Trocar code → token curto
        const { access_token: shortToken, user_id: igUserId } = await exchangeCodeForToken(code);

        // 3. Trocar token curto → token longo (~60 dias)
        const { access_token: longToken, expires_in } = await exchangeForLongLivedToken(shortToken);

        // 4. Buscar perfil do Instagram (username, foto, etc.)
        const profile = await getProfileInfo(longToken, igUserId);
        console.log(`[OAUTH] ✅ Perfil: @${profile.username} (${profile.followers_count} seguidores)`);

        // 5. Calcular data de expiração do token
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // 6. Salvar tudo no banco de dados
        db.prepare(`
            UPDATE ig_accounts SET
                ig_user_id = ?,
                access_token = ?,
                token_expires_at = ?,
                publish_method = 'api',
                username = ?,
                status = 'connected'
            WHERE id = ?
        `).run(igUserId, longToken, expiresAt, profile.username, accountId);

        const account = db.prepare('SELECT * FROM ig_accounts WHERE id = ?').get(accountId);

        // 7. Emitir evento de atualização via WebSocket
        if (io) {
            io.emit('ig-account-status', {
                id: accountId,
                status: 'connected',
                username: profile.username,
                publish_method: 'api',
            });
        }

        console.log(`[OAUTH] 🎉 Conta #${accountId} conectada via API! @${profile.username}`);

        return {
            success: true,
            account,
            profile,
        };

    } catch (err) {
        console.error(`[OAUTH] ❌ Erro no callback: ${err.message}`);
        return { success: false, error: err.message };
    }
}

module.exports = {
    getAuthorizationUrl,
    exchangeCodeForToken,
    exchangeForLongLivedToken,
    getProfileInfo,
    handleCallback,
    REDIRECT_URI,
};

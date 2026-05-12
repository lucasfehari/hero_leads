/**
 * Instagram Graph API — Módulo de Publicação
 *
 * Implementa o fluxo de 2 steps da Instagram Graph API:
 *   Step 1: Criar container de mídia (POST /{ig-user-id}/media)
 *   Step 2: Publicar o container (POST /{ig-user-id}/media_publish)
 *
 * Este é o MESMO método que o GoHighLevel, Buffer, Hootsuite etc. usam.
 * A legenda é um simples parâmetro JSON — zero problemas com Lexical/React.
 *
 * Requisitos:
 *   - Conta Instagram Business ou Creator
 *   - Conta conectada a uma Facebook Page
 *   - Access Token com permissões instagram_business_content_publish
 *   - Mídia acessível via URL pública HTTPS
 */

// Versão da API do Facebook/Instagram (atualizar conforme necessário)
const API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.instagram.com/${API_VERSION}`;
const GRAPH_FB_BASE = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Cria um container de mídia para uma IMAGEM (single post).
 *
 * @param {string} igUserId — ID da conta Instagram na Graph API
 * @param {string} accessToken — Token de acesso com permissões de publicação
 * @param {string} imageUrl — URL pública HTTPS da imagem (Instagram faz cURL)
 * @param {string} caption — Legenda do post (caption + hashtags)
 * @returns {Promise<string>} — ID do container criado
 */
async function createImageContainer(igUserId, accessToken, imageUrl, caption) {
    console.log(`[GRAPH API] Criando container de imagem para IG User ${igUserId}...`);
    console.log(`[GRAPH API] Image URL: ${imageUrl}`);
    console.log(`[GRAPH API] Caption length: ${caption.length} chars`);

    const response = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageUrl,
            caption: caption,
            access_token: accessToken,
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`[GRAPH API] Erro ao criar container: ${data.error.message} (code: ${data.error.code})`);
    }

    console.log(`[GRAPH API] ✅ Container criado: ${data.id}`);
    return data.id;
}

/**
 * Cria um container de mídia para um VÍDEO ou REEL.
 *
 * @param {string} igUserId — ID do Instagram
 * @param {string} accessToken — Token
 * @param {string} videoUrl — URL pública HTTPS do vídeo
 * @param {string} caption — Legenda
 * @param {string} mediaType — 'VIDEO' ou 'REELS'
 * @returns {Promise<string>} — ID do container
 */
async function createVideoContainer(igUserId, accessToken, videoUrl, caption, mediaType = 'REELS') {
    console.log(`[GRAPH API] Criando container de ${mediaType} para IG User ${igUserId}...`);

    const response = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoUrl,
            caption: caption,
            media_type: mediaType,
            access_token: accessToken,
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`[GRAPH API] Erro ao criar container de vídeo: ${data.error.message}`);
    }

    console.log(`[GRAPH API] ✅ Container de ${mediaType} criado: ${data.id}`);
    return data.id;
}

/**
 * Cria containers individuais para cada item de um CAROUSEL.
 * Depois cria o container pai do carousel com os IDs dos filhos.
 *
 * @param {string} igUserId — ID do Instagram
 * @param {string} accessToken — Token
 * @param {Array<{url: string, mediaType: string}>} items — Lista de mídias com URL pública e tipo
 * @param {string} caption — Legenda (vai no carousel pai, não nos itens)
 * @returns {Promise<string>} — ID do container do carousel
 */
async function createCarouselContainer(igUserId, accessToken, items, caption) {
    console.log(`[GRAPH API] Criando carousel com ${items.length} itens...`);

    // Step 1: Criar container para CADA item individual
    const childIds = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[GRAPH API] Criando item ${i + 1}/${items.length}: ${item.mediaType}...`);

        // Itens de carousel NÃO recebem caption — só o pai
        const body = {
            is_carousel_item: true,
            access_token: accessToken,
        };

        // Definir URL e tipo conforme o tipo de mídia
        if (item.mediaType === 'video') {
            body.video_url = item.url;
            body.media_type = 'VIDEO';
        } else {
            body.image_url = item.url;
        }

        const response = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(`[GRAPH API] Erro no item ${i + 1} do carousel: ${data.error.message}`);
        }

        childIds.push(data.id);
        console.log(`[GRAPH API] ✅ Item ${i + 1} criado: ${data.id}`);

        // Se for vídeo, aguardar processamento antes de prosseguir
        if (item.mediaType === 'video') {
            await waitForContainer(data.id, accessToken);
        }
    }

    // Step 2: Criar container PAI do carousel com os IDs dos filhos
    console.log(`[GRAPH API] Criando container pai do carousel...`);
    const carouselResponse = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            media_type: 'CAROUSEL',
            caption: caption,
            children: childIds.join(','),
            access_token: accessToken,
        }),
    });

    const carouselData = await carouselResponse.json();
    if (carouselData.error) {
        throw new Error(`[GRAPH API] Erro ao criar carousel: ${carouselData.error.message}`);
    }

    console.log(`[GRAPH API] ✅ Carousel container criado: ${carouselData.id}`);
    return carouselData.id;
}

/**
 * Verifica o status de processamento de um container.
 *
 * @param {string} containerId — ID do container
 * @param {string} accessToken — Token
 * @returns {Promise<string>} — Status: 'FINISHED', 'IN_PROGRESS', 'ERROR', 'EXPIRED'
 */
async function checkContainerStatus(containerId, accessToken) {
    const response = await fetch(
        `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.error) {
        throw new Error(`[GRAPH API] Erro ao verificar status: ${data.error.message}`);
    }

    return data.status_code;
}

/**
 * Aguarda até o container ficar pronto para publicação (FINISHED).
 * Faz polling a cada 5 segundos por até 5 minutos.
 * Necessário para vídeos/reels que levam tempo para processar no Meta.
 *
 * @param {string} containerId — ID do container
 * @param {string} accessToken — Token
 * @param {Function} [logCallback] — Callback opcional para logging
 * @returns {Promise<boolean>} — true se ficou FINISHED, false se timeout/erro
 */
async function waitForContainer(containerId, accessToken, logCallback = console.log) {
    const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutos máximo
    const POLL_INTERVAL_MS = 5000;      // Verificar a cada 5 segundos
    const startTime = Date.now();

    logCallback(`[GRAPH API] Aguardando container ${containerId} ficar pronto...`);

    while (Date.now() - startTime < MAX_WAIT_MS) {
        try {
            const status = await checkContainerStatus(containerId, accessToken);
            logCallback(`[GRAPH API] Status do container: ${status}`);

            switch (status) {
                case 'FINISHED':
                    logCallback(`[GRAPH API] ✅ Container pronto para publicação!`);
                    return true;

                case 'ERROR':
                    logCallback(`[GRAPH API] ❌ Container com erro de processamento.`);
                    return false;

                case 'EXPIRED':
                    logCallback(`[GRAPH API] ❌ Container expirou (>24h sem publicar).`);
                    return false;

                case 'IN_PROGRESS':
                    // Continuar polling
                    break;

                default:
                    logCallback(`[GRAPH API] Status desconhecido: ${status}. Continuando...`);
            }
        } catch (err) {
            logCallback(`[GRAPH API] ⚠️ Erro no polling: ${err.message}. Tentando novamente...`);
        }

        // Aguardar antes do próximo poll
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    logCallback(`[GRAPH API] ⚠️ Timeout aguardando container (${MAX_WAIT_MS / 1000}s).`);
    return false;
}

/**
 * Publica um container de mídia no feed do Instagram.
 * Este é o Step 2 do fluxo — o container já deve estar FINISHED.
 *
 * @param {string} igUserId — ID da conta Instagram
 * @param {string} accessToken — Token
 * @param {string} containerId — ID do container a publicar
 * @returns {Promise<string>} — ID da mídia publicada
 */
async function publishContainer(igUserId, accessToken, containerId) {
    console.log(`[GRAPH API] Publicando container ${containerId}...`);

    const response = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: accessToken,
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`[GRAPH API] Erro ao publicar: ${data.error.message} (code: ${data.error.code})`);
    }

    console.log(`[GRAPH API] ✅ Publicado com sucesso! Media ID: ${data.id}`);
    return data.id;
}

/**
 * Verifica se um access token ainda é válido consultando
 * os dados básicos da conta Instagram.
 *
 * @param {string} igUserId — ID da conta Instagram
 * @param {string} accessToken — Token a verificar
 * @returns {Promise<{valid: boolean, username?: string, error?: string}>}
 */
async function verifyToken(igUserId, accessToken) {
    try {
        const response = await fetch(
            `${GRAPH_BASE}/${igUserId}?fields=username,name,profile_picture_url,followers_count,media_count&access_token=${accessToken}`
        );
        const data = await response.json();

        if (data.error) {
            return { valid: false, error: data.error.message };
        }

        return {
            valid: true,
            username: data.username,
            name: data.name,
            profilePicture: data.profile_picture_url,
            followers: data.followers_count,
            mediaCount: data.media_count,
        };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

/**
 * Verifica o rate limit de publicação (100 posts por 24h).
 *
 * @param {string} igUserId — ID da conta
 * @param {string} accessToken — Token
 * @returns {Promise<{quota_usage: number, config: object}>}
 */
async function checkPublishingLimit(igUserId, accessToken) {
    try {
        const response = await fetch(
            `${GRAPH_BASE}/${igUserId}/content_publishing_limit?fields=quota_usage,config&access_token=${accessToken}`
        );
        const data = await response.json();
        return data.data?.[0] || { quota_usage: 0 };
    } catch (err) {
        console.error('[GRAPH API] Erro ao verificar rate limit:', err.message);
        return { quota_usage: 0 };
    }
}

/**
 * Fluxo completo de publicação — orquestra todos os steps.
 * Este é o entry point principal chamado pelo worker.
 *
 * @param {object} params
 * @param {string} params.igUserId — ID da conta Instagram na API
 * @param {string} params.accessToken — Token de acesso
 * @param {string} params.caption — Legenda completa (caption + hashtags)
 * @param {string} params.postType — 'single', 'carousel', 'reel'
 * @param {Array<{url: string, mediaType: string}>} params.mediaItems — Mídias com URLs públicas
 * @param {Function} [params.log] — Callback de log
 * @returns {Promise<{success: boolean, mediaId?: string, error?: string}>}
 */
async function publishPost({ igUserId, accessToken, caption, postType, mediaItems, log = console.log }) {
    try {
        // Validação básica
        if (!igUserId || !accessToken) {
            return { success: false, error: 'ig_user_id ou access_token não configurados.' };
        }
        if (!mediaItems || mediaItems.length === 0) {
            return { success: false, error: 'Nenhuma mídia para publicar.' };
        }

        log(`[GRAPH API] Iniciando publicação via API — tipo: ${postType}, ${mediaItems.length} mídia(s)`);

        let containerId;

        if (postType === 'carousel' && mediaItems.length > 1) {
            // ── Carousel ──────────────────────────────────────────────
            containerId = await createCarouselContainer(igUserId, accessToken, mediaItems, caption);
        } else if (mediaItems[0].mediaType === 'video') {
            // ── Vídeo / Reel ──────────────────────────────────────────
            const mediaType = postType === 'reel' ? 'REELS' : 'VIDEO';
            containerId = await createVideoContainer(igUserId, accessToken, mediaItems[0].url, caption, mediaType);
        } else {
            // ── Imagem (single post) ──────────────────────────────────
            containerId = await createImageContainer(igUserId, accessToken, mediaItems[0].url, caption);
        }

        // Aguardar container ficar FINISHED (especialmente para vídeos)
        const isReady = await waitForContainer(containerId, accessToken, log);
        if (!isReady) {
            return { success: false, error: 'Container não ficou pronto a tempo. Tente novamente.' };
        }

        // Publicar
        const mediaId = await publishContainer(igUserId, accessToken, containerId);

        log(`[GRAPH API] 🎉 Post publicado com sucesso! Media ID: ${mediaId}`);
        return { success: true, mediaId };

    } catch (err) {
        log(`[GRAPH API] ❌ Erro na publicação: ${err.message}`);
        return { success: false, error: err.message };
    }
}

module.exports = {
    createImageContainer,
    createVideoContainer,
    createCarouselContainer,
    checkContainerStatus,
    waitForContainer,
    publishContainer,
    verifyToken,
    checkPublishingLimit,
    publishPost,
};

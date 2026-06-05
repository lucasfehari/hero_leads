const { autoScroll, randomDelay, humanMove, scrollElement } = require('./utils');
const { likePost } = require('./actions');

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD EXCLUSION FILTER
// ─────────────────────────────────────────────────────────────────────────────
const isExcluded = (username, displayName, bio, excludedKeywords = []) => {
    if (!excludedKeywords || excludedKeywords.length === 0) return false;

    const fields = {
        username: (username || '').toLowerCase(),
        displayName: (displayName || '').toLowerCase(),
        bio: (bio || '').toLowerCase(),
    };

    for (const keyword of excludedKeywords) {
        const kw = keyword.toLowerCase().trim();
        if (!kw) continue;
        for (const [field, value] of Object.entries(fields)) {
            if (value.includes(kw)) {
                console.log(`[FILTER] ⛔ Skipped @${username} — keyword match: '${kw}' in ${field}`);
                return true;
            }
        }
    }
    return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// AI CORE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FIX BUG 3: Robust JSON parser — handles ALL AI response formats:
 * - Raw JSON: {"key": "value"}
 * - Markdown block: ```json\n{...}\n```
 * - Bare block: ```\n{...}\n```
 * - JSON embedded in surrounding text
 */
const parseAIJson = (text) => {
    if (!text) throw new Error('Empty AI response');
    let t = text.trim();

    // Strip markdown code blocks (handles ```json, ```, with or without newlines/spaces)
    const blockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (blockMatch) t = blockMatch[1].trim();

    // Extract first valid JSON object or array from the text
    const objMatch = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch) t = objMatch[0];

    return JSON.parse(t);
};

/**
 * FIX BUG 12: Calls OpenRouter API with automatic retry + exponential backoff.
 * Handles rate limits (429) and server errors (5xx) without dropping leads.
 * Backoff: 1.5s → 3s → 6s
 */
const callAIWithRetry = async (payload, apiKey, retries = 3) => {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // Treat rate limits and server errors as retriable
            if (res.status === 429 || res.status >= 500) {
                throw new Error(`API HTTP ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            lastError = e;
            if (attempt < retries - 1) {
                const backoffMs = 1500 * Math.pow(2, attempt); // 1.5s → 3s → 6s
                console.log(`[AI] ⏳ Tentativa ${attempt + 1}/${retries} falhou. Retry em ${Math.round(backoffMs / 1000)}s... (${e.message})`);
                await new Promise(r => setTimeout(r, backoffMs));
            }
        }
    }
    throw lastError;
};

/**
 * FIX BUG 11: Cleans raw bio text scraped from the DOM.
 * Removes follower/post counts and Instagram UI noise BEFORE sending to AI,
 * preventing the AI from making decisions based on irrelevant numbers.
 */
const cleanBioText = (rawText) => {
    if (!rawText) return '';
    return rawText
        // Remove follower/following/posts counters (PT + EN)
        .replace(/[\d.,]+\s*(followers?|following|posts?|seguidores?|publicações?|publicacoes?|seguindo)/gi, '')
        // Collapse newlines, tabs, and excessive spaces
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        // Cap at 800 chars to save tokens while keeping essential context
        .substring(0, 800);
};

// ─────────────────────────────────────────────────────────────────────────────
// AI CAMPAIGN PLANNING (Pre-Search) — FIX BUG 10
// ─────────────────────────────────────────────────────────────────────────────
const generateHashtagsFromPrompt = async (prompt, apiKey, modelName, logCallback) => {
    if (!prompt || !apiKey) return [];

    logCallback('[AI] 🧠 Planejando campanha estratégica de hashtags...');

    // FIX BUG 10: Upgraded prompt that generates a strategic MIX of hashtags
    // across 3 competition levels, respects language/geography, and avoids generic tags.
    const systemPrompt = `Você é um especialista sênior em growth marketing no Instagram com 10 anos de experiência em prospecção B2B e B2C.
O usuário fornecerá um OBJETIVO DE PROSPECÇÃO. Sua missão é criar um MIX ESTRATÉGICO de 8 hashtags para encontrar EXATAMENTE esse público.

REGRAS OBRIGATÓRIAS:
1. Sem o caractere "#" nas hashtags
2. Mix de 3 níveis de competição:
   - 2 hashtags GRANDES (>1M posts) — para volume de descoberta
   - 3 hashtags MÉDIAS (100k–1M posts) — equilíbrio volume/qualidade
   - 3 hashtags MICRO-NICHO (<100k posts) — MAIOR taxa de conversão real
3. Pense em hashtags que o PÚBLICO-ALVO usa (não apenas o que descreve o produto/serviço)
4. Se houver indicação de país/cidade/idioma, priorize hashtags nesse idioma
5. EVITE hashtags extremamente genéricas: "empreendedorismo", "negócios", "marketing"
6. PREFIRA hashtags de identidade profissional: ex. "dentistacuritiba", "advocaciatrabalhista", "salaobelezasp"

Responda APENAS com JSON válido (sem markdown, sem texto extra):
{ "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"], "reasoning": "Explicação breve da estratégia escolhida" }`;

    try {
        const data = await callAIWithRetry({
            model: modelName || 'openai/gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Objetivo da Prospecção:\n"${prompt}"` }
            ],
            temperature: 0.7,
            max_tokens: 400
        }, apiKey);

        if (data.choices?.[0]?.message?.content) {
            // FIX BUG 3: Use robust parser
            const aiJson = parseAIJson(data.choices[0].message.content);
            if (aiJson.reasoning) logCallback(`[AI] 💡 Estratégia: ${aiJson.reasoning}`);
            if (Array.isArray(aiJson.hashtags) && aiJson.hashtags.length > 0) {
                return aiJson.hashtags.map(t => t.replace('#', '').trim()).filter(Boolean);
            }
        }
    } catch (e) {
        logCallback(`[AI] ❌ Erro ao gerar hashtags: ${e.message}`, 'error');
    }
    return [];
};

const searchByHashtag = async (page, tag, seenUrls, logCallback) => {
    logCallback(`Searching for hashtag: #${tag}`);

    // Always navigate to ensure fresh state
    await page.goto(`https://www.instagram.com/explore/tags/${tag}/`, { waitUntil: 'networkidle2' });
    await randomDelay(3000, 5000);

    // FIX: Check if Instagram says "No results" or "We couldn't find anything for that search"
    const hasNoResults = await page.evaluate(() => {
        const text = document.body.innerText || '';
        return text.includes('No results') || text.includes("We couldn't find anything for that search") || text.includes('Nenhum resultado');
    });

    if (hasNoResults) {
        logCallback(`⚠️ Hashtag #${tag} não tem resultados ("No results"). Pulando...`, 'warning');
        return [];
    }

    let collectedPosts = [];
    let scrollAttempts = 0;
    const MAX_SCROLLS = 15; // Limit to avoid infinite loops

    while (collectedPosts.length < 9 && scrollAttempts < MAX_SCROLLS) {
        // 1. Grab all visible post links
        const postLinks = await page.$$eval('a[href*="/p/"]', links => links.map(link => link.href));

        // 2. Filter duplicates AND previously seen posts
        const newUniqueLinks = postLinks.filter(link =>
            !seenUrls.has(link) && !collectedPosts.includes(link)
        );

        if (newUniqueLinks.length > 0) {
            collectedPosts.push(...newUniqueLinks);
            logCallback(`Found ${newUniqueLinks.length} new posts (Total batch: ${collectedPosts.length})`);
        }

        // 3. If we don't have enough, SCROLL
        if (collectedPosts.length < 9) {
            logCallback(`Looking for more posts... (Scroll ${scrollAttempts + 1}/${MAX_SCROLLS})`);
            await page.evaluate(() => window.scrollBy(0, 800));
            await randomDelay(2000, 4000);
            scrollAttempts++;
        }
    }

    logCallback(`Batch complete. Returning ${collectedPosts.length} new posts for #${tag}`);
    return collectedPosts;
};

// Scroll through profile, maybe click on a post, close it, etc.
const browseProfile = async (page, username, logCallback) => {
    logCallback(`Browsing @${username}'s profile... (Human Mode)`);

    // Initial "Reading" pause
    await randomDelay(2000, 5000);

    // Slow Scroll down
    await autoScroll(page);

    // Random pause after scrolling
    await randomDelay(3000, 7000);

    // Scroll back up a bit? Humans do that.
    if (Math.random() > 0.5) {
        await page.evaluate(() => window.scrollBy(0, -300));
        await randomDelay(1000, 3000);
    }

    // Maybe click on a photo to "view" it
    const posts = await page.$$('a[href*="/p/"]');
    if (posts.length > 0) {
        logCallback(`Contemplating posts...`);
        await randomDelay(2000, 4000);

        // Pick a random post
        const randomIndex = Math.floor(Math.random() * Math.min(posts.length, 6));

        await posts[randomIndex].click();

        logCallback(`Viewing a specific post by @${username}`);
        await randomDelay(4000, 8000);

        // Maybe like it?
        if (Math.random() > 0.4) { // 60% chance to like while browsing
            await likePost(page);
            logCallback(`Liked a post during browsing.`);
            await randomDelay(1000, 2000);
        }

        // Close modal
        await page.keyboard.press('Escape');
        await randomDelay(2000, 4000);
    }

    logCallback(`Finished browsing @${username}.`);
};

const analyzeProfile = async (page, username, config, logCallback, excludedKeywords = []) => {
    logCallback(`Analyzing profile: @${username}`);

    // Check if we are already on the profile page
    const currentUrl = page.url();
    if (!currentUrl.includes(username)) {
        await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 5000);
    } else {
        logCallback('Already on profile page.');
        await randomDelay(2000, 4000);
    }

    // Get Bio, displayName and visible text
    const { bioRaw, displayName } = await page.evaluate(() => {
        // Try meta description first
        const meta = document.querySelector('meta[property="og:description"]');
        let text = meta ? meta.content : '';

        // Fallback to page content headers (name, bio category)
        const h1 = document.querySelector('h1');
        const name = h1 ? h1.innerText.trim() : '';
        if (h1) text += ' ' + h1.parentElement.innerText;

        // Also grab any visible text in the bio section
        const bioSection = document.querySelector('section main div header section');
        if (bioSection) text += ' ' + bioSection.innerText;

        return { bioRaw: text, displayName: name };
    });

    // FIX BUG 11: Clean the bio BEFORE using it — removes follower counts / UI noise
    const bioStub = cleanBioText(bioRaw);

    // Build profileContext for template variable substitution downstream
    const profileContext = { displayName, bioStub };

    logCallback(`Bio Text Extracted: "${bioStub.substring(0, 60)}..."`);

    // ── Keyword exclusion check ────────────────────────────────────────────
    if (isExcluded(username, displayName, bioStub, excludedKeywords)) {
        logCallback(`[FILTER] ⛔ @${username} pulado por palavra-chave proibida.`, 'warning');
        return { approved: false, profileContext };
    }

    if (config.aiMode && config.openRouterKey) {
        logCallback(`[AI] 🔍 Analisando perfil de @${username}...`);
        try {
            // Build the dynamic extension for AI Auto Message mode
            const aiAutoSection = config.aiAutoMessage ? [
                '',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'MODO I.A. TOTAL ATIVADO — GERAÇÃO DE MENSAGEM DE CONVERSÃO',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'Quando isLead=true e shouldDM=true, o campo "customMessage" é ABSOLUTAMENTE OBRIGATÓRIO.',
                'A mensagem de conversão DEVE:',
                '1. Abrir com o NOME da pessoa (do campo Nome do Perfil)',
                '2. Mencionar algo ESPECÍFICO da bio (nicho, produto, cidade, servico) — nunca invente dados',
                '3. Mostrar curiosidade ou oferecer valor relevante ao negócio/atuação real dela',
                '4. Ter uma CTA (chamada para ação) natural: pergunta aberta ou convite para conversar',
                '5. Tom: humano, caloroso, direto. Máximo 2–3 frases. NUNCA palavrões ou promessas falsas.',
                '',
                'Exemplo de BOA mensagem:',
                '"Oi Ana! Vi que você tem uma clínica de estética em SP — trabalho com captacao de clientes para esse segmento. Posso te mostrar o que estou fazendo por outras clínicas?"',
                '',
                'Exemplo de MÁ mensagem (PROIBIDA — genérica e spam):',
                '"Olá! Tenho uma oportunidade incrível para você! Entre em contato!"',
                '',
                'O QUE A I.A. NÃO DEVE FAZER (restrições do operador):',
                '"""',
                config.aiDontDo ? config.aiDontDo.trim() : 'Nenhuma restrição específica definida.',
                '"""'
            ].join('\n') : '';

            // FIX: Improved system prompt with language rule + personalization rule
            const systemPrompt = `Você é o Cérebro Orquestrador de um Bot de Prospecção no Instagram.
Analise o perfil abaixo e decida se é um bom lead com base no prompt/critério do usuário.
Coordene QUAIS AÇÕES o bot deve tomar para que a interação pareça humana e evite banimentos.

REGRA DE IDIOMA CRÍTICA: 'customComment' e 'customMessage' DEVEM estar no mesmo idioma da Bio do perfil.
(Bio em inglês → responda em inglês. Bio em português → responda em português. Bio em espanhol → espanhol.)

REGRA DE PERSONALIZAÇÃO: 'customMessage' DEVE ser altamente personalizada citando algo específico da Bio ou Nome do perfil. NÃO envie mensagens genéricas.

Responda APENAS com JSON válido (sem markdown, sem texto extra):
{
  "isLead": boolean,
  "rejectionReason": "string (opcional — explique por que não é lead)",
  "actions": {
    "shouldFollow": boolean,
    "shouldLike": boolean,
    "shouldComment": boolean,
    "customComment": "string (opcional, vazio usa comentário manual do usuário)",
    "shouldDM": boolean,
    "customMessage": "string (OBRIGATÓRIO se shouldDM=true — personalizado com bio/nome do perfil)",
    "sleepAfterMs": number
  }
}${aiAutoSection}`;

            const userMessage = `Prompt do Usuário (Critérios e Instruções de Abordagem):
"${config.aiPrompt}"

Perfil Analisado:
Username: @${username}
Nome: ${displayName}
Bio: ${bioStub}`;

            // FIX BUG 12: Use retry-enabled AI caller
            const data = await callAIWithRetry({
                model: config.openRouterModel || 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.3, // Lower = more consistent JSON output
                max_tokens: 500
            }, config.openRouterKey);

            if (data.choices?.[0]?.message?.content) {
                // FIX BUG 3: Use robust parser
                const aiJson = parseAIJson(data.choices[0].message.content);

                if (aiJson.isLead && aiJson.actions) {
                    logCallback(`[AI] ✅ Lead aprovado! Follow(${aiJson.actions.shouldFollow}) DM(${aiJson.actions.shouldDM})`, 'success');
                    return {
                        approved: true,
                        aiMessage: aiJson.actions.customMessage || null,
                        actions: aiJson.actions,
                        profileContext
                    };
                } else {
                    const reason = aiJson.rejectionReason ? ` Motivo: ${aiJson.rejectionReason}` : '';
                    logCallback(`[AI] ❌ Perfil rejeitado.${reason}`, 'warning');
                    return { approved: false, profileContext };
                }
            } else {
                logCallback(`[AI] ⚠️ Resposta inesperada da API. Pulando perfil.`, 'error');
                return { approved: false };
            }
        } catch (error) {
            logCallback(`[AI] ⚠️ Falha na requisição: ${error.message}. Pulando perfil.`, 'error');
            return { approved: false };
        }
    } else {
        // Legacy keyword matching (non-AI mode)
        const keywordsList = config.interestKeywords
            ? config.interestKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k)
            : [];
        if (keywordsList.length > 0) {
            const hasKeyword = keywordsList.some(k =>
                bioStub.toLowerCase().includes(k) || displayName.toLowerCase().includes(k)
            );
            if (!hasKeyword) {
                logCallback(`[FILTER] ⛔ @${username} pulado: Nenhuma keyword de interesse encontrada na Bio.`, 'warning');
                return { approved: false };
            }
        }

        logCallback('Profile approved (Keyword Mode).', 'success');
        return { approved: true, profileContext };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// FIX BUG 4: Quick Reel Relevance Check via AI (lightweight — no profile visit)
// When AI mode is active, validates reel caption BEFORE committing to visit profile.
// Uses low max_tokens and temperature for speed and cost efficiency.
// ─────────────────────────────────────────────────────────────────────────────
const checkReelRelevanceAI = async (caption, config, logCallback) => {
    if (!caption || !config || !config.openRouterKey) return true; // Fail open if no data

    try {
        const data = await callAIWithRetry({
            model: config.openRouterModel || 'openai/gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Você é um filtro rápido de relevância para prospecção no Instagram.
Com base no CRITÉRIO DO USUÁRIO, diga se a legenda do Reel indica que o AUTOR pode ser um lead relevante.
Seja objetivo. Responda APENAS com JSON (sem markdown):
{ "relevant": boolean, "reason": "string curta" }`
                },
                {
                    role: 'user',
                    content: `Critério de prospecção:\n"${config.aiPrompt}"\n\nLegenda do Reel:\n"${caption.substring(0, 400)}"`
                }
            ],
            temperature: 0.1,
            max_tokens: 80
        }, config.openRouterKey);

        if (data.choices?.[0]?.message?.content) {
            const result = parseAIJson(data.choices[0].message.content);
            if (!result.relevant) {
                logCallback(`[AI] 🎥 Reel irrelevante: ${result.reason || 'sem motivo'}`, 'warning');
            }
            return result.relevant !== false;
        }
    } catch (e) {
        // Fail open — don't block reels due to API errors
        logCallback(`[AI] ⚠️ Filtro de Reel falhou (${e.message}) — aprovando por padrão.`, 'warning');
    }
    return true;
};

// FIX BUG 4 + BUG 8: exploreReels now receives `config` to enable AI filtering.
// Empty captions are handled gracefully (skip instead of crash).
const exploreReels = async (page, keywords, logCallback, excludedKeywords = [], config = null) => {
    logCallback('Starting Reels Exploration...');

    // Go to Reels Feed
    if (!page.url().includes('/reels/')) {
        await page.goto('https://www.instagram.com/reels/', { waitUntil: 'networkidle2' });
        await randomDelay(3000, 5000);
    }

    let reelsProcessed = 0;
    const MAX_REELS = 15;
    let noMatchCount = 0;

    while (reelsProcessed < MAX_REELS) {
        logCallback(`Watching Reel ${reelsProcessed + 1}...`);

        // 1. Watch the reel (Human behavior)
        await randomDelay(5000, 15000);

        // 2. Extract Caption/Description & Author
        const { caption, author } = await page.evaluate(() => {
            let foundCaption = '';
            let foundAuthor = '';

            // ── Strategy 1: Use meta og:description (most reliable) ─────────
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc && ogDesc.content) {
                foundCaption = ogDesc.content;
            }

            // ── Strategy 2: Look for the Reel caption container ─────────────
            if (!foundCaption) {
                const captionCandidates = [
                    'div[class*="x1lliihq"] span[dir="auto"]',
                    'div[role="dialog"] span[dir="auto"]',
                    'span[dir="auto"]',
                ];
                for (const sel of captionCandidates) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText && el.innerText.length > 5) {
                        foundCaption = el.innerText;
                        break;
                    }
                }
            }

            // ── Strategy 3: Fallback — any visible span with decent length ──
            if (!foundCaption) {
                const spans = Array.from(document.querySelectorAll('span'));
                const longSpan = spans.find(s => {
                    const txt = (s.innerText || '').trim();
                    return txt.length > 15 && txt.length < 500 &&
                        !txt.includes('Follow') && !txt.includes('Like') &&
                        !txt.includes('Comment') && !txt.includes('Share');
                });
                if (longSpan) foundCaption = longSpan.innerText.trim();
            }

            // ── Find Author ─────────────────────────────────────────────────
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) {
                const match = ogTitle.content.match(/\(@([a-zA-Z0-9_.]+)\)/);
                if (match) foundAuthor = '/' + match[1] + '/';
            }

            if (!foundAuthor) {
                const links = Array.from(document.querySelectorAll('a'));
                const authorLink = links.find(a => {
                    const href = a.getAttribute('href');
                    if (!href) return false;
                    const systemPaths = ['/explore/', '/audio/', '/reels/', '/p/', '/stories/', '/direct/', '/accounts/', '/legal/', '/hashtag/'];
                    if (systemPaths.some(s => href.includes(s))) return false;
                    const parts = href.split('/').filter(Boolean);
                    return parts.length === 1 && /^[a-zA-Z0-9_.]+$/.test(parts[0]);
                });
                if (authorLink) foundAuthor = authorLink.getAttribute('href');
            }

            return { caption: foundCaption, author: foundAuthor };
        });

        // FIX BUG 8: Handle empty caption — skip gracefully instead of failing silently
        if (!caption) {
            logCallback('⚠️ Reel sem legenda detectada. Pulando para o próximo.', 'warning');
            await page.keyboard.press('ArrowDown');
            await randomDelay(2000, 3000);
            reelsProcessed++;
            continue;
        }

        logCallback(`Reel Caption: "${caption.substring(0, 60)}..."`);

        // 3. Keyword Check
        const keywordMatch = keywords.length === 0 || keywords.some(k => caption.toLowerCase().includes(k.toLowerCase()));

        if (keywordMatch && author) {
            const profileUsername = author.replace(/\//g, '');

            // ── Keyword exclusion check ──────────────────────────────────────
            if (isExcluded(profileUsername, '', caption, excludedKeywords)) {
                logCallback(`[FILTER] ⛔ Reel author @${profileUsername} pulado por palavra-chave.`, 'warning');
                noMatchCount++;
                await page.keyboard.press('ArrowDown');
                await randomDelay(2000, 4000);
                reelsProcessed++;
                continue;
            }

            // FIX BUG 4: When AI mode active, validate reel caption relevance BEFORE visiting profile
            // This avoids wasting time + API calls on the full profile analysis for irrelevant reels
            if (config && config.aiMode && config.openRouterKey) {
                const isRelevant = await checkReelRelevanceAI(caption, config, logCallback);
                if (!isRelevant) {
                    logCallback(`[AI] 🎥 Reel rejeitado pela I.A. Pulando.`, 'warning');
                    noMatchCount++;
                    await page.keyboard.press('ArrowDown');
                    await randomDelay(2000, 4000);
                    reelsProcessed++;
                    continue;
                }
            }

            logCallback(`✅ Reel aprovado! Visitando autor: @${profileUsername}`);
            const profileUrl = `https://www.instagram.com${author}`;
            return profileUrl; // RETURN to be processed by main loop (Action Chain)
        } else {
            if (keywordMatch && !author) logCallback('Reel relevante mas autor NÃO encontrado. Pulando.', 'warning');
            else logCallback('Reel não relevante. Pulando.');
            noMatchCount++;
        }

        // 5. Next Reel (Scroll Down)
        logCallback('Scrolling to next Reel...');
        await page.keyboard.press('ArrowDown');
        await randomDelay(2000, 4000);
        reelsProcessed++;

        // Safety Break
        if (!page.url().includes('/reels/')) {
            logCallback('Lost Reels context. Restarting navigation.', 'warning');
            await page.goto('https://www.instagram.com/reels/', { waitUntil: 'networkidle2' });
            await randomDelay(3000, 5000);
        }
    }

    return null; // Finished batch without finding anyone
};

module.exports = {
    searchByHashtag,
    analyzeProfile,
    browseProfile,
    exploreReels,
    isExcluded,
    generateHashtagsFromPrompt,
    checkReelRelevanceAI
};

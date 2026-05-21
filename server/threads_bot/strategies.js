const fetch = require('node-fetch');

const analyzeThreadWithAI = async (threadText, authorName, config, logCallback) => {
    if (!config.aiMode || !config.openRouterKey) {
        return { 
            approved: true, // Auto-approve if AI is off
            actions: { shouldLike: true, shouldComment: false }
        };
    }

    logCallback(`[AI] Analisando post de @${authorName} no Threads...`);
    try {
        const systemPrompt = `Você é o Cérebro Orquestrador de um Bot do Threads.
Seu objetivo é analisar um Post (Thread) escrito por um usuário e decidir se ele é um bom lead baseado no objetivo do seu dono (prompt).
Além disso, você deve coordenar as AÇÕES: você quer Curtir o post? Quer Responder (Reply)?

REGRA DE IDIOMA CRÍTICA: Se você decidir gerar um 'customComment' (Reply), o idioma DEVE OBRIGATORIAMENTE ser o mesmo idioma em que o Post do usuário foi escrito.
REGRA DE FORMATAÇÃO JSON CRÍTICA: Nunca use quebras de linha reais (\\n invisível) dentro de strings JSON, pois isso quebra o JSON.parse(). Evite quebras de linha no comentário.

Responda APENAS com um objeto JSON válido, sem formatação markdown:
{
  "isLead": boolean (true se o post indicar que o autor é o seu público alvo, false se não),
  "actions": {
    "shouldLike": boolean,
    "shouldComment": boolean,
    "customComment": string (Seja autêntico, curto, como se fosse um comentário humano. Deixe vazio se não quiser comentar)
  }
}`;
        
        const userMessage = `Prompt do Usuário (Seu Objetivo de Busca):
"${config.aiPrompt}"

Post Encontrado na Busca:
Autor: @${authorName}
Texto do Post: "${threadText}"`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.openRouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: config.openRouterModel || "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ]
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            let aiResponseText = data.choices[0].message.content.trim();
            if (aiResponseText.startsWith("```json")) {
                aiResponseText = aiResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
            }

            const aiDecision = JSON.parse(aiResponseText);
            
            if (aiDecision.isLead) {
                logCallback(`[SUCCESS] I.A. Aprovou o post de @${authorName}! Ações: ${JSON.stringify(aiDecision.actions)}`);
                return { approved: true, actions: aiDecision.actions };
            } else {
                logCallback(`[AI] Rejeitou o post de @${authorName}. Não é o alvo.`);
                return { approved: false };
            }
        }
    } catch (error) {
        logCallback(`[ERROR] Falha na IA do Threads: ${error.message}`, 'error');
    }

    // Default fallback
    return { approved: false };
};

const generateKeywordsFromPrompt = async (config, logCallback) => {
    if (!config.aiMode || !config.openRouterKey || !config.aiPrompt) {
        return [];
    }

    logCallback(`[AI] Planejando a campanha... Gerando termos de busca a partir do prompt.`);
    try {
        const systemPrompt = `Você é um Estrategista de Marketing Especialista em Buscas no Threads.
Sua tarefa é ler o objetivo do usuário e gerar uma lista de 3 palavras-chave curtas (ou hashtags) altamente focadas para encontrar as pessoas que o usuário deseja focar hoje.
Responda APENAS com um Array JSON contendo as strings, por exemplo: ["design", "empreendedor", "marketing"]. Sem formatação markdown, sem outras palavras.`;

        const userMessage = `Objetivo da Busca:
"${config.aiPrompt}"`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.openRouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: config.openRouterModel || "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ]
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            let aiResponseText = data.choices[0].message.content.trim();
            if (aiResponseText.startsWith("```json")) aiResponseText = aiResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
            if (aiResponseText.startsWith("```")) aiResponseText = aiResponseText.replace(/```/g, "").trim();

            const keywords = JSON.parse(aiResponseText);
            if (Array.isArray(keywords) && keywords.length > 0) {
                logCallback(`[SUCCESS] I.A. gerou os termos de busca: ${keywords.join(', ')}`);
                return keywords;
            }
        }
    } catch (error) {
        logCallback(`[ERROR] Falha na geração de keywords: ${error.message}`, 'error');
    }

    return [];
};

module.exports = { analyzeThreadWithAI, generateKeywordsFromPrompt };

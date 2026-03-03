// Configuração e Estado Global
let botState = {
    isRunning: false,
    tabId: null,
    processedCount: 0,
    currentTarget: null,
    queue: [], // URLs de perfis para interagir
    config: null
};

// Funções Utilitárias de Log (envia pro Popup)
function emitLog(text, level = 'info') {
    console.log(`[BOT] ${text}`);
    chrome.runtime.sendMessage({ type: 'LOG', text, level }).catch(() => { });
}

function emitState() {
    chrome.storage.local.set({ botState });
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE', ...botState }).catch(() => { });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_BOT') {
        botState.config = request.config;
        botState.isRunning = true;
        botState.processedCount = 0;
        botState.queue = [];
        emitState();
        emitLog(`Iniciando busca pela hashtag #${botState.config.targetHashtag}`, 'success');

        // Cria a aba do Instagram para extrair leads da Hashtag
        chrome.tabs.create({ url: `https://www.instagram.com/explore/tags/${botState.config.targetHashtag}/` }, (tab) => {
            botState.tabId = tab.id;
            // Inject script depois que a página carregar (gerenciado pelo manifest matches)
        });

        sendResponse({ success: true });
    }

    if (request.action === 'STOP_BOT') {
        stopBot();
        sendResponse({ success: true });
    }

    // Comunicação do Content Script para o Background
    if (request.action === 'LEADS_GATHERED') {
        emitLog(`Encontrados ${request.leads.length} perfis na hashtag.`, 'success');
        botState.queue = request.leads;
        processNextLead();
    }

    if (request.action === 'PROFILE_PROCESSED') {
        botState.processedCount++;
        emitState();
        emitLog(`Perfil ${botState.currentTarget} abordado com sucesso.`, 'success');

        // Aguarda delay randômico entre perfis antes de ir pro próximo
        const delay = randomInt(botState.config.minDelay * 1000, botState.config.maxDelay * 1000);
        emitLog(`Aguardando ${(delay / 1000).toFixed(1)} segundos (ação anti-bloqueio)...`);

        setTimeout(() => {
            processNextLead();
        }, delay);
    }

    if (request.action === 'BOT_ERROR') {
        emitLog(`Erro: ${request.message}`, 'error');
        // continua ou para?
    }

    return true; // Keeps channel open for async response
});

// Orquestração da Fila
function processNextLead() {
    if (!botState.isRunning) return;

    if (botState.processedCount >= botState.config.limit) {
        emitLog(`Limite atingido (${botState.config.limit}). Encerrando ciclo.`, 'success');
        stopBot();
        return;
    }

    if (botState.queue.length === 0) {
        emitLog('Fila de perfis vazia. O bot precisa de uma nova busca de hashtag para continuar explorando (V2). Parando por agora.', 'warning');
        stopBot();
        return;
    }

    const nextUrl = botState.queue.shift(); // Remove o primeiro da fila
    botState.currentTarget = nextUrl;
    emitLog(`Navegando para perfil: ${nextUrl}`);

    chrome.tabs.update(botState.tabId, { url: nextUrl }, () => {
        // Quando a página carregar, o content script vai ler a msg 'PROCESS_PROFILE'
    });
}

function stopBot() {
    botState.isRunning = false;
    emitLog('Bot parado.', 'error');
    emitState();
}

// Quando a tab terminar de carregar, diz o que o content_script tem que fazer
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (botState.isRunning && tabId === botState.tabId && changeInfo.status === 'complete') {

        // Dá um tempinho extra pro SPA do Instagram renderizar o DOM React
        setTimeout(() => {
            if (tab.url.includes('/explore/tags/')) {
                // Estamos na página de Hashtag, pedir pro content script raspar os links
                chrome.tabs.sendMessage(tabId, {
                    command: 'GATHER_LEADS'
                }).catch(() => { });
            }
            else if (tab.url.includes('/p/')) {
                // é um post (não devia cair aqui nessa lógica simplificada v1, mas ok)
            }
            else {
                // Estamos na página de um Perfil (lead)
                chrome.tabs.sendMessage(tabId, {
                    command: 'PROCESS_PROFILE',
                    config: botState.config
                }).catch(() => { });
            }
        }, 5000);
    }
});

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

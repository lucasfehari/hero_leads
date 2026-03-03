document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logOutput = document.getElementById('logOutput');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const processedCount = document.getElementById('processedCount');

    // Load previous config from storage
    chrome.storage.local.get(['botConfig', 'botState'], (res) => {
        if (res.botConfig) {
            document.getElementById('targetHashtag').value = res.botConfig.targetHashtag || '';
            document.getElementById('limit').value = res.botConfig.limit || 10;
            document.getElementById('doFollow').checked = res.botConfig.doFollow !== false;
            document.getElementById('doLike').checked = res.botConfig.doLike !== false;
            document.getElementById('dmMessage').value = res.botConfig.dmMessage || '';
            document.getElementById('minDelay').value = res.botConfig.minDelay || 30;
            document.getElementById('maxDelay').value = res.botConfig.maxDelay || 90;
        }

        // Restore UI state
        if (res.botState && res.botState.isRunning) {
            setUIStateRunning(true);
            processedCount.innerText = res.botState.processedCount || 0;
        }
    });

    // Start Bot
    startBtn.addEventListener('click', () => {
        const config = {
            targetHashtag: document.getElementById('targetHashtag').value.replace('#', '').trim(),
            limit: parseInt(document.getElementById('limit').value, 10),
            doFollow: document.getElementById('doFollow').checked,
            doLike: document.getElementById('doLike').checked,
            dmMessage: document.getElementById('dmMessage').value.trim(),
            minDelay: parseInt(document.getElementById('minDelay').value, 10),
            maxDelay: parseInt(document.getElementById('maxDelay').value, 10),
        };

        if (!config.targetHashtag) {
            appendLog('Erro: Insira uma hashtag alvo.', 'error');
            return;
        }

        // Save config
        chrome.storage.local.set({ botConfig: config });

        // Send start message to Background script
        chrome.runtime.sendMessage({ action: 'START_BOT', config }, (response) => {
            if (response && response.success) {
                setUIStateRunning(true);
                appendLog('Iniciando Browze Bot Lite...', 'success');
            }
        });
    });

    // Stop Bot
    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'STOP_BOT' }, (response) => {
            setUIStateRunning(false);
            appendLog('Bot parado pelo usuário.', 'error');
        });
    });

    // Listen for logs and state updates from background/content
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'LOG') {
            appendLog(msg.text, msg.level);
        }
        if (msg.type === 'STATE_UPDATE') {
            if (msg.processedCount !== undefined) {
                processedCount.innerText = msg.processedCount;
            }
            if (msg.isRunning === false) {
                setUIStateRunning(false);
            }
        }
    });

    // UI Helpers
    function setUIStateRunning(isRunning) {
        startBtn.disabled = isRunning;
        stopBtn.disabled = !isRunning;

        if (isRunning) {
            statusDot.className = 'dot active';
            statusText.innerText = 'Rodando...';
            statusText.style.color = 'var(--primary)';
        } else {
            statusDot.className = 'dot idle';
            statusText.innerText = 'Parado';
            statusText.style.color = 'var(--text-muted)';
        }

        // Disable inputs while running
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(i => i.disabled = isRunning);
    }

    function appendLog(text, level = 'info') {
        const el = document.createElement('div');
        el.className = `log-line ${level}`;
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        el.innerText = `[${time}] ${text}`;
        logOutput.appendChild(el);
        logOutput.scrollTop = logOutput.scrollHeight;
    }
});

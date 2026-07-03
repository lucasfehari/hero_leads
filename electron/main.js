const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const https = require('https');
const http = require('http');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;
let licenseWindow;
let serverProcess;

// ─────────────────────────────────────────────────────────────────
// Configurações de Licença
// ─────────────────────────────────────────────────────────────────

// URL do servidor de licenças (Render)
const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://hero-leads.onrender.com';

// Arquivo local para cache da licença
const licenseCachePath = path.join(app.getPath('userData'), 'license.json');

// Gera um Machine ID único baseado em características do hardware
function getMachineId() {
    const raw = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'cpu'}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// Salva licença localmente (cache)
function saveLicenseCache(key, data) {
    const payload = { key, data, cachedAt: Date.now() };
    fs.writeFileSync(licenseCachePath, JSON.stringify(payload), 'utf8');
}

// Lê cache local de licença
function readLicenseCache() {
    try {
        const raw = fs.readFileSync(licenseCachePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Valida licença no servidor
function validateLicenseOnServer(key) {
    return new Promise((resolve, reject) => {
        const machineId = getMachineId();
        const body = JSON.stringify({ key, machine_id: machineId });

        const url = new URL(`${LICENSE_SERVER}/validate`);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: 30000, // 30s para acomodar cold start do Render gratuito
        };

        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch { reject(new Error('Resposta inválida do servidor')); }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────
// Janela de Ativação de Licença
// ─────────────────────────────────────────────────────────────────
function createLicenseWindow() {
    licenseWindow = new BrowserWindow({
        width: 520,
        height: 600,
        resizable: false,
        center: true,
        frame: true,
        titleBarStyle: 'default',
        title: 'Browze Bot — Ativação',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    licenseWindow.setMenuBarVisibility(false);
    licenseWindow.loadFile(path.join(__dirname, 'license.html'));
}

// ─────────────────────────────────────────────────────────────────
// Janela Principal do App
// ─────────────────────────────────────────────────────────────────
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        minWidth: 1024,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, '../build/icon.png'),
        title: 'Browze Bot',
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
    } else {
        mainWindow.loadURL('http://localhost:5173');
    }

    mainWindow.on('closed', () => { mainWindow = null; });
}

const { fork } = require('child_process');

// ─────────────────────────────────────────────────────────────────
// Servidor Backend
// ─────────────────────────────────────────────────────────────────
function startServer() {
    console.log('[Electron] Iniciando servidor Express na porta 3000...');
    serverProcess = fork(path.join(__dirname, '../server/index.js'), [], {
        cwd: path.join(__dirname, '../server'),
        env: { ...process.env, PORT: '3000' },
        stdio: 'pipe'
    });
    serverProcess.stdout.on('data', d => console.log('[Server]', d.toString()));
    serverProcess.stderr.on('data', d => console.error('[Server Error]', d.toString()));
}

// ─────────────────────────────────────────────────────────────────
// IPC Handlers (comunicação com a tela de licença)
// ─────────────────────────────────────────────────────────────────
ipcMain.handle('validate-license', async (event, key) => {
    try {
        const result = await validateLicenseOnServer(key);
        if (result.valid) {
            saveLicenseCache(key, result);
        }
        return result;
    } catch (err) {
        console.error('[License] Erro ao validar:', err.message);

        // Se offline, tentar usar cache
        const cache = readLicenseCache();
        if (cache?.key === key) {
            const AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
            if (Date.now() - cache.cachedAt < AGE_MS) {
                console.log('[License] Usando cache offline (menos de 7 dias)');
                return { valid: true, ...cache.data, offline: true };
            }
        }

        return { valid: false, error: 'Servidor offline. Conexão com a internet necessária.' };
    }
});

ipcMain.handle('license-valid', async (event, key, data) => {
    // Fecha a janela de licença e abre o app principal
    if (licenseWindow) {
        licenseWindow.close();
        licenseWindow = null;
    }
    startServer();
    setTimeout(() => {
        createMainWindow();
        if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
    }, 2000);
});

ipcMain.handle('get-machine-id', () => getMachineId());

ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
});

// ─────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    const machineId = getMachineId();
    const cache = readLicenseCache();

    // Verifica cache local primeiro (mais rápido)
    let licenseValid = false;
    if (cache) {
        const CACHE_AGE = 24 * 60 * 60 * 1000; // 1 dia em ms
        const isRecent  = Date.now() - cache.cachedAt < CACHE_AGE;

        if (isRecent) {
            console.log('[License] Cache válido. Iniciando sem verificação online...');
            licenseValid = true;
        } else {
            // Cache expirado — reverifica online
            try {
                const result = await validateLicenseOnServer(cache.key);
                if (result.valid) {
                    saveLicenseCache(cache.key, result);
                    licenseValid = true;
                }
            } catch {
                // Offline — usa cache antigo por até 7 dias
                const GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000;
                if (Date.now() - cache.cachedAt < GRACE_PERIOD) {
                    console.log('[License] Offline. Período de graça ativo.');
                    licenseValid = true;
                }
            }
        }
    }

    if (licenseValid) {
        startServer();
        setTimeout(createMainWindow, 2000);
    } else {
        createLicenseWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});

// ─────────────────────────────────────────────────────────────────
// Auto Updater
// ─────────────────────────────────────────────────────────────────
autoUpdater.on('update-available', () => {
    console.log('[Updater] Atualização disponível. Baixando...');
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Atualização Pronta',
        message: 'Uma nova versão do Browze Bot está pronta. Deseja reiniciar para atualizar agora?',
        buttons: ['Reiniciar Agora', 'Depois'],
    }).then(result => {
        if (result.response === 0) autoUpdater.quitAndInstall();
    });
});

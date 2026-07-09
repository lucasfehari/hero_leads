const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// autoUpdater only works inside the Electron runtime
let autoUpdater = null;
try {
    const updater = require('electron-updater');
    autoUpdater = updater.autoUpdater;
} catch (e) {
    console.log('[Updater] electron-updater not available in this environment.');
}

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
function saveLicenseCache(key, data, profile = null) {
    const payload = { key, data, profile, cachedAt: Date.now() };
    if (!profile) {
        const oldCache = readLicenseCache();
        if (oldCache && oldCache.profile) {
            payload.profile = oldCache.profile;
        }
    }
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
            preload: path.join(__dirname, 'preload.js'),
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

// ─────────────────────────────────────────────────────────────────
// Servidor Backend
// ─────────────────────────────────────────────────────────────────
function startServer() {
    console.log('[Electron] Iniciando servidor Express na porta 3000...');

    // Quando empacotado (instalado no Windows), os arquivos ficam em app.asar.unpacked
    // Quando em desenvolvimento, ficam na pasta raiz do projeto
    let serverDir;
    let serverScript;

    if (app.isPackaged) {
        // app.getAppPath() retorna o caminho do .asar
        // Os arquivos desempacotados ficam em [appPath].unpacked
        const appPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
        serverDir = path.join(appPath, 'server');
        serverScript = path.join(serverDir, 'index.js');
    } else {
        serverDir = path.join(__dirname, '../server');
        serverScript = path.join(serverDir, 'index.js');
    }

    console.log('[Electron] Server path:', serverScript);
    console.log('[Electron] Server cwd:', serverDir);

    // Usa o Node.js embutido no Electron (process.execPath)
    // Isso funciona tanto em dev quanto dentro do ASAR empacotado
    serverProcess = spawn(process.execPath, [serverScript], {
        cwd: serverDir,
        env: { ...process.env, PORT: '3000', ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', d => console.log('[Server]', d.toString().trim()));
    serverProcess.stderr.on('data', d => console.error('[Server Error]', d.toString().trim()));
    serverProcess.on('error', e => console.error('[Server] Falha ao iniciar:', e));
    serverProcess.on('exit', (code, sig) => console.log(`[Server] Encerrado: code=${code} signal=${sig}`));
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

ipcMain.handle('license-valid', async (event, key, data, profile) => {
    // Salva o perfil e licença antes de continuar
    if (profile) {
        saveLicenseCache(key, data, profile);
    }
    
    // Fecha a janela de licença e abre o app principal
    if (licenseWindow) {
        licenseWindow.close();
        licenseWindow = null;
    }
    startServer();
    setTimeout(() => {
        createMainWindow();
        if (app.isPackaged && autoUpdater) autoUpdater.checkForUpdatesAndNotify();
    }, 2000);
});

ipcMain.handle('get-machine-id', () => getMachineId());

ipcMain.handle('get-profile', () => readLicenseCache());

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
if (autoUpdater) {
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
}

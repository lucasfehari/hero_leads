const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let serverProcess;

function startServer() {
    console.log('[Electron] Inciando servidor Express na porta 3000...');
    serverProcess = spawn('node', [path.join(__dirname, '../server/index.js')], {
        cwd: path.join(__dirname, '../server'),
        env: { ...process.env, PORT: '3000' }
    });

    serverProcess.stdout.on('data', d => console.log('[Server]', d.toString()));
    serverProcess.stderr.on('data', d => console.error('[Server Error]', d.toString()));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, '../client/public/favicon.ico'),
        title: 'Browze Bot'
    });

    // Em modo de desenvolvimento, carrega do vite (porta 5173)
    // Em produção, carrega o index.html gerado na pasta dist
    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
    } else {
        mainWindow.loadURL('http://localhost:5173');
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Inicialização
app.whenReady().then(() => {
    startServer();
    
    // Aguarda o servidor subir um pouco antes de mostrar a interface
    setTimeout(() => {
        createWindow();
        
        // Verifica se há atualizações silenciosamente
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    }, 2000);
});

// Tratamento de encerramento
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Garante que o processo do node local seja encerrado ao fechar a janela
    if (serverProcess) {
        serverProcess.kill();
    }
});

// ─────────────────────────────────────────────────────────────
// Eventos do Auto Updater
// ─────────────────────────────────────────────────────────────
autoUpdater.on('update-available', () => {
    console.log('[Updater] Atualização disponível. Baixando...');
});

autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] Atualização baixada.');
    dialog.showMessageBox({
        type: 'info',
        title: 'Atualização Pronta',
        message: 'Uma nova versão do Browze Bot foi baixada. Deseja reiniciar para aplicar a atualização agora?',
        buttons: ['Reiniciar Agora', 'Depois']
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para o processo renderer (license.html)
contextBridge.exposeInMainWorld('electronAPI', {
  validateLicense: (key) => ipcRenderer.invoke('validate-license', key),
  licenseValid: (key, data) => ipcRenderer.invoke('license-valid', key, data),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});

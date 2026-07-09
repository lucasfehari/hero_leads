const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para os processos renderer (license.html e painel React)
contextBridge.exposeInMainWorld('electronAPI', {
  validateLicense: (key) => ipcRenderer.invoke('validate-license', key),
  licenseValid: (key, data, profile) => ipcRenderer.invoke('license-valid', key, data, profile),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getProfile: () => ipcRenderer.invoke('get-profile')
});

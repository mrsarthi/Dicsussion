const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Open browser for wallet authentication
    openAuthBrowser: () => ipcRenderer.invoke('open-auth-browser'),

    // Get stored authentication
    getStoredAuth: () => ipcRenderer.invoke('get-stored-auth'),

    // Listen for wallet auth from browser
    onWalletAuth: (callback) => {
        ipcRenderer.on('wallet-auth', (event, data) => callback(data));
    },

    // Check if running in Electron
    isElectron: true,

    // Flash taskbar
    flashFrame: (flag) => ipcRenderer.invoke('flash-frame', flag),

    // Update Management
    onUpdateAvailable: (callback) => {
        const listener = (event, info) => callback(info);
        ipcRenderer.on('update-available', listener);
        return () => ipcRenderer.removeListener('update-available', listener);
    },
    onUpdateProgress: (callback) => {
        const listener = (event, progress) => callback(progress);
        ipcRenderer.on('update-progress', listener);
        return () => ipcRenderer.removeListener('update-progress', listener);
    },
    onUpdateDownloaded: (callback) => {
        const listener = (event, info) => callback(info);
        ipcRenderer.on('update-downloaded', listener);
        return () => ipcRenderer.removeListener('update-downloaded', listener);
    },
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
});

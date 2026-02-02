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
});

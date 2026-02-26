const { contextBridge } = require('electron');

// Expose minimal API to renderer
contextBridge.exposeInMainWorld('desktop', {
    isElectron: true,
    platform: process.platform,
    version: process.env.npm_package_version || '1.0.0'
});

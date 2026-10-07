const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, secure Electron APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // External URLs
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // App Metadata
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Silent / Direct Printing for Vouchers & Reports
  printSilent: (options) => ipcRenderer.invoke('print-silent', options),

  // Notification / Alert hooks
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),

  // Event Listeners
  onWindowMaximizeChange: (callback) => {
    const subscription = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximize-changed', subscription);
    return () => ipcRenderer.removeListener('window-maximize-changed', subscription);
  },
});

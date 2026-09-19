const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boardSetup', {
  loadConfig: () => ipcRenderer.invoke('setup-load-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('setup-save-config', cfg),
  loginAndEnter: (cfg) => ipcRenderer.invoke('setup-login-enter', cfg),
});

contextBridge.exposeInMainWorld('classroomDesktop', {
  isDesktop: true,
  showMain(payload) {
    ipcRenderer.send('desktop-show', payload || {});
  },
  hideMain() {
    ipcRenderer.send('desktop-hide');
  },
  notifyReady() {
    ipcRenderer.send('desktop-ready');
  },
  onMode(cb) {
    const listener = (_e, mode) => cb(mode);
    ipcRenderer.on('desktop-mode', listener);
    return () => ipcRenderer.removeListener('desktop-mode', listener);
  },
});

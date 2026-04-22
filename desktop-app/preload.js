const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  loginNaver: () => ipcRenderer.invoke('login-naver'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  toggleAutoLaunch: (enabled) => ipcRenderer.invoke('toggle-autolaunch', enabled),
  onTriggerLogin: (callback) => ipcRenderer.on('trigger-login', callback),
})

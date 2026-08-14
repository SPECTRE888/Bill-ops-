/*!
 * Helm Ops — Electron preload bridge
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  openExternal: (u) => ipcRenderer.invoke('open-external', u),
  openInvoiceWindow: (html, title) => ipcRenderer.invoke('open-invoice-window', { html, title }),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, payload) => cb(payload)),
});

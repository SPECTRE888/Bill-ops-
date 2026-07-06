/*!
 * Bill Ops — Electron preload bridge
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  openExternal: (u) => ipcRenderer.invoke('open-external', u),
  openInvoiceWindow: (html, title) => ipcRenderer.invoke('open-invoice-window', { html, title }),
});

// Sandboxed preload: the page only gets these named calls, never Node or raw IPC.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('torrentTV', {
  platform: process.platform,
  add: (url, label, hosts, meta) => ipcRenderer.invoke('tt:add', url, label, hosts, meta),
  list: () => ipcRenderer.invoke('tt:list'),
  pause: (id) => ipcRenderer.invoke('tt:pause', id),
  resume: (id) => ipcRenderer.invoke('tt:resume', id),
  remove: (id) => ipcRenderer.invoke('tt:remove', id),
  open: (id) => ipcRenderer.invoke('tt:open', id),
  vpn: () => ipcRenderer.invoke('tt:vpn'),
  setRequireVpn: (on) => ipcRenderer.invoke('tt:setRequireVpn', on),
  rescan: (id) => ipcRenderer.invoke('tt:rescan', id),
  setRequireScan: (on) => ipcRenderer.invoke('tt:setRequireScan', on),
  scanner: () => ipcRenderer.invoke('tt:scanner'),
  httpGet: (url) => ipcRenderer.invoke('tt:httpGet', url),
});

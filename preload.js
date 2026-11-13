const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchGatewayToken: () => ipcRenderer.invoke('fetch-gateway-token'),
});

const { contextBridge, ipcRenderer } = require('electron');
// The only things the web page may do. No file paths are accepted from the page: the main process decides where files go.
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('app:info'),
  savePhoto: (examId, roll, data) => ipcRenderer.invoke('photo:save', examId, roll, data),
  readAll: (examId) => ipcRenderer.invoke('photo:readAll', examId),
  openFolder: (examId) => ipcRenderer.invoke('folder:open', examId),
});

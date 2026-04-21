import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (buffer: number[], defaultName: string) =>
    ipcRenderer.invoke('save-file', { buffer, defaultName }),
  saveProject: (data: string, filePath: string) =>
    ipcRenderer.invoke('save-project', { data, filePath }),
  saveProjectTo: (data: string, defaultName: string) =>
    ipcRenderer.invoke('save-project-to', { data, defaultName }),
  openProject: () =>
    ipcRenderer.invoke('open-project'),
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),
})

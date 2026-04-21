import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (buffer: number[], defaultName: string) =>
    ipcRenderer.invoke('save-file', { buffer, defaultName }),
})

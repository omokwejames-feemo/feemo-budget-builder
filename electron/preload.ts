import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File management ──────────────────────────────────────────────────────
  saveFile: (buffer: number[], defaultName: string) =>
    ipcRenderer.invoke('save-file', { buffer, defaultName }),
  saveProject: (data: string, filePath: string) =>
    ipcRenderer.invoke('save-project', { data, filePath }),
  saveProjectTo: (data: string, defaultName: string) =>
    ipcRenderer.invoke('save-project-to', { data, defaultName }),
  openProject: () =>
    ipcRenderer.invoke('open-project'),
  readFileByPath: (filePath: string) =>
    ipcRenderer.invoke('read-file-by-path', filePath),

  // ── Updates ──────────────────────────────────────────────────────────────
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
  downloadAndOpenUpdate: (assetUrl: string, fileName: string) =>
    ipcRenderer.invoke('download-and-open-update', { assetUrl, fileName }),
  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),

  // Progress events — renderer subscribes once per download session
  onDownloadProgress: (cb: (data: { percent: number; downloaded: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('download-progress')
    ipcRenderer.on('download-progress', (_event, data) => cb(data))
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download-progress')
  },
})

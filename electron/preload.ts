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
  downloadUpdate: () =>
    ipcRenderer.invoke('download-update'),
  installUpdate: () =>
    ipcRenderer.invoke('install-update'),
  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),

  onUpdateAvailable: (cb: (info: { version: string; body: string }) => void) => {
    ipcRenderer.removeAllListeners('update-available')
    ipcRenderer.on('update-available', (_event, info) => cb(info))
  },
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.removeAllListeners('update-downloaded')
    ipcRenderer.on('update-downloaded', () => cb())
  },
  onUpdateError: (cb: (message: string) => void) => {
    ipcRenderer.removeAllListeners('update-error')
    ipcRenderer.on('update-error', (_event, message) => cb(message))
  },
  onDownloadProgress: (cb: (data: { percent: number; downloaded: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('download-progress')
    ipcRenderer.on('download-progress', (_event, data) => cb(data))
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download-progress')
  },

  // ── PDF export ───────────────────────────────────────────────────────────
  printToPdf: (html: string, defaultName: string) =>
    ipcRenderer.invoke('print-to-pdf', { html, defaultName }),

  // ── File-open from OS (double-click) ─────────────────────────────────────
  onOpenFile: (cb: (filePath: string) => void) => {
    ipcRenderer.removeAllListeners('open-file')
    ipcRenderer.on('open-file', (_event, filePath: string) => cb(filePath))
  },

  // ── Beta session (encrypted local store) ────────────────────────────────
  sessionLoad: () =>
    ipcRenderer.invoke('session-load'),
  sessionSave: (session: unknown) =>
    ipcRenderer.invoke('session-save', session),
  sessionClear: () =>
    ipcRenderer.invoke('session-clear'),

  // ── Beta key validation (all logic lives in main — renderer never sees OTP) ─
  betaValidateKey: (key: string, email: string) =>
    ipcRenderer.invoke('beta-validate-key', { key, email }),
  betaSendCode: (key: string, email: string) =>
    ipcRenderer.invoke('beta-send-code', { key, email }),
  betaVerifyCode: (key: string, email: string, code: string) =>
    ipcRenderer.invoke('beta-verify-code', { key, email, code }),
  betaCheckSession: (key: string, email: string) =>
    ipcRenderer.invoke('beta-check-session', { key, email }),

  // ── Budget upload ────────────────────────────────────────────────────────
  openXlsxBudget: () =>
    ipcRenderer.invoke('open-xlsx-budget'),

  // ── Google Drive ─────────────────────────────────────────────────────────
  gdriveSetCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke('gdrive-set-credentials', { clientId, clientSecret }),
  gdriveGetCredentials: () =>
    ipcRenderer.invoke('gdrive-get-credentials'),
  gdriveHasToken: () =>
    ipcRenderer.invoke('gdrive-has-token'),
  gdriveAuthorize: () =>
    ipcRenderer.invoke('gdrive-authorize'),
  gdriveUpload: (data: string, fileName: string) =>
    ipcRenderer.invoke('gdrive-upload', { data, fileName }),
  gdriveDisconnect: () =>
    ipcRenderer.invoke('gdrive-disconnect'),
})

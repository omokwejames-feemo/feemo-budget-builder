// Global type augmentation for Electron's preload bridge
export {}

declare global {
  interface Window {
    electronAPI?: {
      saveFile: (buffer: number[], defaultName: string) => Promise<{ success: boolean; filePath?: string }>
      saveProject: (data: string, filePath: string) => Promise<{ success: boolean; filePath?: string }>
      saveProjectTo: (data: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>
      openProject: () => Promise<{ success: boolean; filePath?: string; data?: string }>
      readFileByPath: (filePath: string) => Promise<{ success: boolean; filePath?: string; data?: string; error?: string }>
      getAppVersion: () => Promise<string>
      checkForUpdates: () => Promise<{
        success: boolean; error?: string; hasUpdate: boolean; latest: string; current: string; body?: string
      }>
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>
      installUpdate: () => void
      openExternal: (url: string) => void
      onUpdateAvailable: (cb: (info: { version: string; body: string }) => void) => void
      onUpdateDownloaded: (cb: () => void) => void
      onUpdateError: (cb: (message: string) => void) => void
      onDownloadProgress: (cb: (data: { percent: number; downloaded: number; total: number }) => void) => void
      removeDownloadProgressListener: () => void
      onOpenFile: (cb: (filePath: string) => void) => void
      printToPdf: (html: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      gdriveSetCredentials: (clientId: string, clientSecret: string) => Promise<{ success: boolean; error?: string }>
      gdriveGetCredentials: () => Promise<{ success: boolean; clientId?: string; clientSecret?: string }>
      gdriveHasToken: () => Promise<{ hasToken: boolean }>
      gdriveAuthorize: () => Promise<{ success: boolean; error?: string }>
      gdriveUpload: (data: string, fileName: string) => Promise<{ success: boolean; timestamp?: string; error?: string }>
      gdriveDisconnect: () => Promise<{ success: boolean }>
      // Beta session
      sessionLoad: () => Promise<{ key: string; email: string; expiresAt: number } | null>
      sessionSave: (session: { key: string; email: string; expiresAt: number }) => Promise<{ success: boolean }>
      sessionClear: () => Promise<{ success: boolean }>
      // Beta key validation (IPC to main process — OTP never leaves main)
      betaValidateKey: (key: string, email: string) => Promise<{ status: string; expiresAt?: number | null; message?: string }>
      betaSendCode: (key: string, email: string) => Promise<{ success: boolean; message?: string }>
      betaVerifyCode: (key: string, email: string, code: string) => Promise<{ success: boolean; expiresAt?: number | null; message?: string }>
      betaCheckSession: (key: string, email: string) => Promise<{ valid: boolean; expiresAt?: number | null }>
      // Budget upload
      openXlsxBudget: () => Promise<{ success: boolean; filePath?: string; buffer?: number[] }>
    }
  }
}

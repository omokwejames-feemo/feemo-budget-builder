// Beta session — persisted locally via encrypted electron-store (IPC)
export interface BetaSession {
  key: string
  email: string
  expiresAt: number  // ms timestamp
}

export async function loadSession(): Promise<BetaSession | null> {
  if (!window.electronAPI) return null
  const res = await window.electronAPI.sessionLoad()
  return res ?? null
}

export async function saveSession(session: BetaSession): Promise<void> {
  if (!window.electronAPI) return
  await window.electronAPI.sessionSave(session)
}

export async function clearSession(): Promise<void> {
  if (!window.electronAPI) return
  await window.electronAPI.sessionClear()
}

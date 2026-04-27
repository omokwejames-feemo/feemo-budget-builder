import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from './feemoFirebase'

export interface SyncResult {
  success: boolean
  error?: string
}

export interface PullResult {
  success: boolean
  data?: Record<string, unknown>
  updatedBy?: 'desktop' | 'mobile'
  updatedAt?: unknown
  error?: string
}

export async function pushToCloud(
  uid: string,
  state: Record<string, unknown>,
  updatedBy: 'desktop' | 'mobile',
): Promise<SyncResult> {
  try {
    await setDoc(doc(db, 'users', uid, 'sync', 'active'), {
      state,
      title: (state.project as { title?: string } | undefined)?.title ?? 'Untitled',
      updatedAt: serverTimestamp(),
      updatedBy,
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function pullFromCloud(uid: string): Promise<PullResult> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'sync', 'active'))
    if (!snap.exists()) return { success: true }
    const data = snap.data()
    return {
      success: true,
      data: data.state as Record<string, unknown>,
      updatedBy: data.updatedBy,
      updatedAt: data.updatedAt,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function subscribeToCloud(
  uid: string,
  cb: (data: Record<string, unknown> | undefined) => void,
): () => void {
  return onSnapshot(doc(db, 'users', uid, 'sync', 'active'), (snap) => {
    cb(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined)
  })
}

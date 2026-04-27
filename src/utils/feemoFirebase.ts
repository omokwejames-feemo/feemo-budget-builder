import { initializeApp, getApps } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { initializeFirestore, getFirestore, memoryLocalCache } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'feemo-beta-functions.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'feemo-beta-functions',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'feemo-budget-builder.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)

// initializeFirestore throws if called twice (e.g. Vite HMR), so fall back to getFirestore
let _db: ReturnType<typeof getFirestore>
try {
  // Use memory cache — IndexedDB blocks Electron's renderer process
  _db = initializeFirestore(app, { localCache: memoryLocalCache() })
} catch {
  _db = getFirestore(app)
}
export const db = _db

setPersistence(auth, browserLocalPersistence).catch(() => {})

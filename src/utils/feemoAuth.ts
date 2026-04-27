import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './feemoFirebase'

export interface FeemoUser {
  uid: string
  email: string | null
}

function toFeemoUser(user: User): FeemoUser {
  return { uid: user.uid, email: user.email }
}

export async function signInWithEmail(email: string, password: string): Promise<FeemoUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return toFeemoUser(cred.user)
}

export async function signUpWithEmail(email: string, password: string): Promise<FeemoUser> {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  return toFeemoUser(cred.user)
}

export async function signOutFeemo(): Promise<void> {
  await signOut(auth)
}

export function onFeemoAuthChange(cb: (user: FeemoUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    cb(user ? toFeemoUser(user) : null)
  })
}

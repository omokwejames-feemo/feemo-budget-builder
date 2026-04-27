import { useState, useEffect } from 'react'
import { signInWithEmail, signUpWithEmail, signOutFeemo, onFeemoAuthChange } from '../utils/feemoAuth'
import type { FeemoUser } from '../utils/feemoAuth'

interface FeemoAccountProps {
  onClose: () => void
}

export default function FeemoAccount({ onClose }: FeemoAccountProps) {
  const [user, setUser] = useState<FeemoUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = onFeemoAuthChange((u) => setUser(u))
    return unsub
  }, [])

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password)
      } else {
        await signUpWithEmail(email.trim(), password)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Simplify Firebase error messages
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password.')
      } else if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists.')
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters.')
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    setLoading(true)
    try {
      await signOutFeemo()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 26px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              Feemo Sync
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {user ? 'Cloud sync active' : 'Sign in to sync across devices'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text3)',
              fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '22px 26px' }}>
          {user ? (
            /* ── Signed-in state ── */
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(46,204,113,0.07)',
                border: '1px solid rgba(46,204,113,0.2)',
                borderRadius: 10, padding: '12px 14px',
                marginBottom: 20,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: '#2ecc71', flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2ecc71', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                    Signed in
                  </div>
                  <div style={{
                    fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {user.email}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 20 }}>
                Your budget is automatically synced to the cloud whenever you make changes.
                The Feemo mobile app will pick up updates in real time.
              </div>

              <button
                onClick={handleSignOut}
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 0',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--red)', fontWeight: 600, fontSize: 13,
                  fontFamily: 'var(--font-ui)', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          ) : (
            /* ── Sign-in / sign-up form ── */
            <div>
              {/* Mode toggle */}
              <div style={{
                display: 'flex', background: 'var(--bg)', borderRadius: 8,
                padding: 3, marginBottom: 20, border: '1px solid var(--border)',
              }}>
                {(['signin', 'signup'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError('') }}
                    style={{
                      flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
                      fontFamily: 'var(--font-ui)', border: 'none', borderRadius: 6,
                      cursor: 'pointer',
                      background: mode === m ? 'var(--bg2)' : 'transparent',
                      color: mode === m ? 'var(--text)' : 'var(--text3)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {m === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              {/* Email */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 12px', fontSize: 13,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)',
                    fontFamily: 'var(--font-ui)', outline: 'none',
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 12px', fontSize: 13,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)',
                    fontFamily: 'var(--font-ui)', outline: 'none',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: '9px 12px', borderRadius: 8, marginBottom: 14,
                  background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)',
                  fontSize: 12, color: 'var(--red)', lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 0',
                  background: 'var(--blue)', border: 'none',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  fontFamily: 'var(--font-ui)', borderRadius: 8,
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading
                  ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                  : (mode === 'signin' ? 'Sign in' : 'Create account')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

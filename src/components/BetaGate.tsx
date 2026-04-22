import { useState } from 'react'
import { verifyAccessKey } from '../utils/accessVerify'

const STORAGE_KEY = 'feemo-access-v1'

function hasStoredAccess(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'granted'
  } catch {
    return false
  }
}

function storeAccess() {
  try {
    localStorage.setItem(STORAGE_KEY, 'granted')
  } catch {}
}

interface BetaGateProps {
  onGranted: () => void
}

export default function BetaGate({ onGranted }: BetaGateProps) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  // Already cleared previously
  if (hasStoredAccess()) {
    onGranted()
    return null
  }

  async function handleConfirm() {
    if (!key.trim()) { setError('Please enter your access key.'); return }
    setChecking(true)
    setError('')
    const ok = await verifyAccessKey(key)
    setChecking(false)
    if (ok) {
      storeAccess()
      onGranted()
    } else {
      setError('Invalid key. Access denied.')
      setKey('')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 16,
        padding: '48px 52px',
        maxWidth: 480,
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <img
            src="/feemo-logo.png"
            alt="Feemovision"
            style={{ width: 72, height: 72, objectFit: 'contain' }}
            onError={e => {
              const el = e.currentTarget
              el.style.display = 'none'
              const fb = el.nextElementSibling as HTMLElement | null
              if (fb) fb.style.display = 'inline-flex'
            }}
          />
          <div style={{
            display: 'none',
            width: 72, height: 72, margin: '0 auto',
            background: 'var(--accent, #f5a623)', color: '#000',
            fontWeight: 800, fontSize: 36, borderRadius: 16,
            alignItems: 'center', justifyContent: 'center',
          }}>F</div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          Feemo Budget Manager
        </div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#f5a623',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 28,
        }}>
          Beta Access
        </div>

        <p style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.7, marginBottom: 32 }}>
          This is a beta version of Feemo Budget Manager. This software is only
          available to authorised users. Please enter your access key to continue.
        </p>

        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          placeholder="Enter access key"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#1e1e1e',
            border: `1px solid ${error ? '#cc2233' : '#333'}`,
            borderRadius: 8,
            color: '#fff',
            fontSize: 15,
            textAlign: 'center',
            letterSpacing: '0.15em',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: error ? 10 : 20,
            fontFamily: 'monospace',
          }}
        />

        {error && (
          <div style={{
            fontSize: 12, color: '#cc2233',
            marginBottom: 16, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={checking}
          style={{
            width: '100%',
            padding: '13px 0',
            background: checking ? '#333' : '#f5a623',
            color: checking ? '#666' : '#000',
            fontWeight: 700, fontSize: 14,
            border: 'none', borderRadius: 8, cursor: checking ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {checking ? 'Verifying…' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}

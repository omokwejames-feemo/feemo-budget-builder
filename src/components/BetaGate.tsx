import { useState, useEffect } from 'react'
import { isMasterKey } from '../utils/masterKeyVerify'
import { loadSession, saveSession, clearSession } from '../utils/betaSession'

type Stage = 'checking' | 'key-entry' | 'sending-code' | 'code-entry'

interface BetaGateProps {
  onGranted: () => void
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Btn({ onClick, disabled, children, variant = 'primary' }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode; variant?: 'primary' | 'ghost'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px 0',
        background: disabled ? '#333' : variant === 'primary' ? '#f5a623' : 'transparent',
        color: disabled ? '#666' : variant === 'primary' ? '#000' : '#9a9a9a',
        fontWeight: 700, fontSize: 14,
        border: variant === 'ghost' ? '1px solid #333' : 'none',
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
        marginBottom: 10,
      }}
    >{children}</button>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, autoFocus, onEnter }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; autoFocus?: boolean; onEnter?: () => void
}) {
  return (
    <div style={{ marginBottom: 14, textAlign: 'left' }}>
      <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <input
        type={type} value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '11px 14px',
          background: '#1e1e1e', border: '1px solid #333',
          borderRadius: 8, color: '#fff', fontSize: 14,
          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

function ErrMsg({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: '#cc2233', marginBottom: 14, fontWeight: 600, textAlign: 'center' }}>{msg}</div>
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BetaGate({ onGranted }: BetaGateProps) {
  const [stage, setStage] = useState<Stage>('checking')
  const [key, setKey] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingKey, setPendingKey] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')

  // Silent session re-validation on every launch
  useEffect(() => {
    ;(async () => {
      const session = await loadSession()
      if (!session) { setStage('key-entry'); return }
      if (Date.now() > session.expiresAt) { await clearSession(); setStage('key-entry'); return }

      if (!window.electronAPI) { setStage('key-entry'); return }
      const res = await window.electronAPI.betaCheckSession(session.key, session.email)
      if (res.valid) {
        onGranted()
      } else {
        await clearSession()
        setStage('key-entry')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleKeySubmit() {
    const trimKey = key.trim()
    const trimEmail = email.trim().toLowerCase()
    if (!trimKey) { setError('Please enter your access key.'); return }

    // Local master-key check — no IPC, no network
    if (await isMasterKey(trimKey)) { onGranted(); return }

    if (!trimEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    setBusy(true); setError('')
    const api = window.electronAPI
    if (!api) { setError('App not ready. Please restart.'); setBusy(false); return }

    const res = await api.betaValidateKey(trimKey, trimEmail)

    if (res.status === 'master-granted') { onGranted(); return }

    if (res.status === 'error') {
      setError(res.message ?? 'Access denied.')
      setBusy(false); return
    }

    if (res.status === 'verified') {
      await saveSession({ key: trimKey, email: trimEmail, expiresAt: res.expiresAt ?? Date.now() + 5 * 86400000 })
      onGranted(); return
    }

    // needs-verification — send OTP
    setPendingKey(trimKey); setPendingEmail(trimEmail)
    setStage('sending-code')
    const sendRes = await api.betaSendCode(trimKey, trimEmail)
    setBusy(false)

    if (!sendRes.success) {
      setError(sendRes.message ?? 'Failed to send verification email. Check your email address and try again.')
      setStage('key-entry'); return
    }
    setStage('code-entry')
  }

  async function handleCodeSubmit() {
    const trimCode = code.trim()
    if (trimCode.length !== 6 || !/^\d{6}$/.test(trimCode)) {
      setError('Please enter the 6-digit code sent to your email.')
      return
    }
    setBusy(true); setError('')
    const api = window.electronAPI!
    const res = await api.betaVerifyCode(pendingKey, pendingEmail, trimCode)
    setBusy(false)

    if (res.success) {
      await saveSession({ key: pendingKey, email: pendingEmail, expiresAt: res.expiresAt ?? Date.now() + 5 * 86400000 })
      onGranted()
    } else {
      setError(res.message ?? 'Verification failed.')
    }
  }

  async function handleResend() {
    setBusy(true); setError(''); setCode('')
    const res = await window.electronAPI?.betaSendCode(pendingKey, pendingEmail)
    setBusy(false)
    if (res && !res.success) setError(res.message ?? 'Could not resend code.')
  }

  // ─── Shared layout ──────────────────────────────────────────────────────────

  const shell: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 99999, background: '#0a0a0a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const card: React.CSSProperties = {
    background: '#141414', border: '1px solid #2a2a2a',
    borderRadius: 16, padding: '44px 48px',
    maxWidth: 460, width: '90%', textAlign: 'center',
    boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
  }
  const logo = (
    <div style={{ marginBottom: 24 }}>
      <img src="./feemo-logo.png" alt="Feemovision"
        style={{ width: 64, height: 64, objectFit: 'contain' }}
        onError={e => {
          const el = e.currentTarget; el.style.display = 'none'
          const fb = el.nextElementSibling as HTMLElement | null
          if (fb) fb.style.display = 'inline-flex'
        }}
      />
      <div style={{ display: 'none', width: 64, height: 64, margin: '0 auto', background: '#f5a623', color: '#000', fontWeight: 800, fontSize: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>F</div>
    </div>
  )
  const heading = (
    <>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Feemo Budget Manager</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>Beta Access</div>
    </>
  )
  const footer = (
    <div style={{ marginTop: 12, fontSize: 11, color: '#444' }}>
      Keys issued by Feemovision Limited ·{' '}
      <a href="mailto:james@feemovision.com" style={{ color: '#555', textDecoration: 'none' }}>james@feemovision.com</a>
    </div>
  )

  if (stage === 'checking' || stage === 'sending-code') {
    return (
      <div style={shell}><div style={card}>
        {logo}{heading}
        <div style={{ color: '#555', fontSize: 13 }}>
          {stage === 'checking' ? 'Checking session…' : `Sending verification code to ${pendingEmail}…`}
        </div>
      </div></div>
    )
  }

  if (stage === 'code-entry') {
    return (
      <div style={shell}><div style={card}>
        {logo}{heading}
        <p style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.7, marginBottom: 24 }}>
          A 6-digit code has been sent to{' '}
          <strong style={{ color: '#ccc' }}>{pendingEmail}</strong>.
          Enter it below.
        </p>
        <Field label="Verification code" value={code} onChange={v => { setCode(v); setError('') }}
          placeholder="000000" autoFocus onEnter={handleCodeSubmit} />
        {error && <ErrMsg msg={error} />}
        <Btn onClick={handleCodeSubmit} disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</Btn>
        <Btn variant="ghost" onClick={handleResend} disabled={busy}>Resend code</Btn>
        <Btn variant="ghost" onClick={() => { setStage('key-entry'); setError(''); setCode('') }} disabled={busy}>← Back</Btn>
        {footer}
      </div></div>
    )
  }

  // key-entry
  return (
    <div style={shell}><div style={card}>
      {logo}{heading}
      <p style={{ fontSize: 13, color: '#9a9a9a', lineHeight: 1.7, marginBottom: 24 }}>
        This software is currently available to authorised beta testers only.
      </p>
      <Field label="Access Key" value={key} onChange={v => { setKey(v); setError('') }}
        placeholder="FEEMO-XXXX-XXXX" autoFocus onEnter={handleKeySubmit} />
      <Field label="Email Address" value={email} onChange={v => { setEmail(v); setError('') }}
        type="email" placeholder="you@example.com" onEnter={handleKeySubmit} />
      {error && <ErrMsg msg={error} />}
      <Btn onClick={handleKeySubmit} disabled={busy}>{busy ? 'Verifying…' : 'Confirm'}</Btn>
      {footer}
    </div></div>
  )
}

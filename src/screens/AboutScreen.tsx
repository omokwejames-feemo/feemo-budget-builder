import { useState, useEffect } from 'react'

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'update-available'; current: string; latest: string; downloadUrl: string }
  | { status: 'error'; message: string }

export default function AboutScreen() {
  const [appVersion, setAppVersion] = useState<string>('…')
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' })

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
  }, [])

  async function handleCheckForUpdates() {
    if (!window.electronAPI) return
    setCheckState({ status: 'checking' })
    try {
      const result = await window.electronAPI.checkForUpdates()
      if (!result.success) {
        setCheckState({ status: 'error', message: result.error ?? 'Could not reach update server.' })
        return
      }
      if (result.hasUpdate) {
        setCheckState({
          status: 'update-available',
          current: result.current,
          latest: result.latest,
          downloadUrl: result.downloadUrl,
        })
      } else {
        setCheckState({ status: 'up-to-date', version: result.current })
      }
    } catch (err) {
      setCheckState({ status: 'error', message: String(err) })
    }
  }

  function handleDownload(url: string) {
    window.electronAPI?.openExternal(url)
  }

  return (
    <div className="screen" style={{ maxWidth: 560 }}>
      <div className="screen-header">
        <div className="screen-title">About</div>
        <div className="screen-sub">App information and updates.</div>
      </div>

      {/* Identity card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '28px 28px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            width: 64, height: 64, background: 'var(--accent)', color: '#000',
            fontWeight: 800, fontSize: 36, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(245,166,35,0.25)', flexShrink: 0,
          }}>F</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Feemo Budget Builder
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 12, color: 'var(--accent)', fontWeight: 700,
                background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.25)',
                borderRadius: 5, padding: '3px 10px', fontFamily: 'monospace', letterSpacing: '0.04em',
              }}>
                v{appVersion}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>by Feemovision</span>
            </div>
          </div>
        </div>
      </div>

      {/* Update card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Software Updates</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status area */}
          {checkState.status === 'idle' && (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              Click below to check if a newer version is available.
            </div>
          )}

          {checkState.status === 'checking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text2)' }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              Checking for updates…
            </div>
          )}

          {checkState.status === 'up-to-date' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.25)',
            }}>
              <span style={{ fontSize: 18, color: 'var(--green)' }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 13 }}>You're on the latest version</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>v{checkState.version} is up to date.</div>
              </div>
            </div>
          )}

          {checkState.status === 'update-available' && (
            <div style={{
              padding: '14px 16px', borderRadius: 8,
              background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>🎉</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>
                  Version {checkState.latest} is available
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
                You're running <strong style={{ color: 'var(--text)' }}>v{checkState.current}</strong>.
                The new release <strong style={{ color: 'var(--text)' }}>v{checkState.latest}</strong> is ready to download.
              </div>
              <button
                className="btn btn-primary"
                onClick={() => handleDownload(checkState.downloadUrl)}
              >
                Download v{checkState.latest} →
              </button>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                This will open the release page in your browser. Download the installer for your platform and run it to update.
              </div>
            </div>
          )}

          {checkState.status === 'error' && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13, marginBottom: 4 }}>
                Could not check for updates
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                {checkState.message}
              </div>
            </div>
          )}

          {/* Button row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-ghost"
              onClick={handleCheckForUpdates}
              disabled={checkState.status === 'checking'}
              style={{ minWidth: 160 }}
            >
              {checkState.status === 'checking' ? 'Checking…' : 'Check for Updates'}
            </button>
            {checkState.status !== 'idle' && checkState.status !== 'checking' && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, color: 'var(--text3)' }}
                onClick={() => setCheckState({ status: 'idle' })}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Links */}
      <div style={{ marginTop: 20, display: 'flex', gap: 20, fontSize: 12 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => window.electronAPI?.openExternal('https://github.com/omokwejames-feemo/feemo-budget-builder/releases')}
        >
          Release History
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => window.electronAPI?.openExternal('https://github.com/omokwejames-feemo/feemo-budget-builder/issues')}
        >
          Report a Bug
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

import { useState, useEffect } from 'react'

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'update-available'; current: string; latest: string }
  | { status: 'error'; message: string }

type DlState =
  | { status: 'idle' }
  | { status: 'downloading'; percent: number; downloaded: number; total: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

function fmtBytes(b: number) {
  if (b === 0) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function AboutScreen() {
  const [appVersion, setAppVersion] = useState<string>('…')
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' })
  const [dlState, setDlState] = useState<DlState>({ status: 'idle' })

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
    window.electronAPI?.onUpdateDownloaded(() => setDlState({ status: 'ready' }))
    return () => { window.electronAPI?.removeDownloadProgressListener() }
  }, [])

  async function handleCheck() {
    if (!window.electronAPI) return
    setCheckState({ status: 'checking' })
    setDlState({ status: 'idle' })
    try {
      const r = await window.electronAPI.checkForUpdates()
      if (!r.success) { setCheckState({ status: 'error', message: r.error ?? 'Could not reach update server.' }); return }
      if (r.hasUpdate) {
        setCheckState({ status: 'update-available', current: r.current, latest: r.latest })
      } else {
        setCheckState({ status: 'up-to-date', version: r.current })
      }
    } catch (err) {
      setCheckState({ status: 'error', message: String(err) })
    }
  }

  async function handleDownload() {
    if (!window.electronAPI) return
    setDlState({ status: 'downloading', percent: 0, downloaded: 0, total: 0 })
    window.electronAPI.onDownloadProgress(({ percent, downloaded, total }) => {
      setDlState({ status: 'downloading', percent, downloaded, total })
    })
    const result = await window.electronAPI.downloadUpdate()
    window.electronAPI.removeDownloadProgressListener()
    if (!result.success) {
      setDlState({ status: 'error', message: result.error ?? 'Download failed.' })
    }
    // ready state is set by onUpdateDownloaded event
  }

  return (
    <div className="screen" style={{ maxWidth: 560 }}>
      <div className="screen-header">
        <div className="screen-title">About</div>
        <div className="screen-sub">App information and updates.</div>
      </div>

      {/* Identity */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '28px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            width: 64, height: 64, background: 'var(--accent)', color: '#000',
            fontWeight: 800, fontSize: 36, borderRadius: 14, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(245,166,35,0.25)',
          }}>F</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Feemo Budget Manager</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 12, color: 'var(--accent)', fontWeight: 700,
                background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.25)',
                borderRadius: 5, padding: '3px 10px', fontFamily: 'monospace',
              }}>v{appVersion}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>by Feemovision</span>
            </div>
          </div>
        </div>
      </div>

      {/* Updates */}
      <div className="card">
        <div className="card-header"><span className="card-title">Software Updates</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {checkState.status === 'idle' && (
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
              Click below to check if a newer version is available.
            </p>
          )}

          {checkState.status === 'checking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text2)' }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              Checking for updates…
            </div>
          )}

          {checkState.status === 'up-to-date' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 8, background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.25)' }}>
              <span style={{ fontSize: 20, color: 'var(--green)' }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 13 }}>You're on the latest version</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>v{checkState.version} is up to date.</div>
              </div>
            </div>
          )}

          {checkState.status === 'update-available' && dlState.status === 'idle' && (
            <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🎉</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>Version {checkState.latest} is available</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
                You're running <strong style={{ color: 'var(--text)' }}>v{checkState.current}</strong>.
              </div>
              <button className="btn btn-primary" style={{ fontSize: 14, padding: '10px 24px' }} onClick={handleDownload}>
                ↓ Download Update
              </button>
            </div>
          )}

          {dlState.status === 'downloading' && (
            <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.25)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--blue)', marginBottom: 10 }}>
                Downloading… {dlState.percent}%
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 4, background: 'var(--blue)', width: `${dlState.percent}%`, transition: 'width 0.3s ease' }} />
              </div>
              {dlState.total > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {fmtBytes(dlState.downloaded)} / {fmtBytes(dlState.total)}
                </div>
              )}
            </div>
          )}

          {dlState.status === 'ready' && (
            <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.25)' }}>
              <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 14, marginBottom: 8 }}>✓ Update downloaded</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14 }}>
                Restart the app to apply the update. Your work will be saved automatically.
              </div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 13, background: 'var(--green)', borderColor: 'var(--green)' }}
                onClick={() => window.electronAPI?.installUpdate()}
              >
                ↺ Restart &amp; Apply
              </button>
            </div>
          )}

          {dlState.status === 'error' && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)' }}>
              <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13, marginBottom: 4 }}>Download failed</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{dlState.message}</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setDlState({ status: 'idle' })}>Try again</button>
            </div>
          )}

          {checkState.status === 'error' && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)' }}>
              <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13, marginBottom: 4 }}>Could not check for updates</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{checkState.message}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost"
              onClick={handleCheck}
              disabled={checkState.status === 'checking' || dlState.status === 'downloading'}
              style={{ minWidth: 170 }}
            >
              {checkState.status === 'checking' ? 'Checking…' : 'Check for Updates'}
            </button>
            {(checkState.status !== 'idle' || dlState.status !== 'idle') && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, color: 'var(--text3)' }}
                onClick={() => { setCheckState({ status: 'idle' }); setDlState({ status: 'idle' }) }}
              >Dismiss</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 16, fontSize: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => window.electronAPI?.openExternal('https://github.com/omokwejames-feemo/feemo-budget-builder/releases')}>
          Release History
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => window.electronAPI?.openExternal('https://github.com/omokwejames-feemo/feemo-budget-builder/issues')}>
          Report a Bug
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

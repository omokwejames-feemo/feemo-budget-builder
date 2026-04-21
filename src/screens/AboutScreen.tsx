import { useState, useEffect } from 'react'

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'update-available'; current: string; latest: string; assetUrl: string; assetSize: number; releasePageUrl: string }
  | { status: 'error'; message: string }

type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading'; percent: number; downloaded: number; total: number }
  | { status: 'opening' }
  | { status: 'done' }
  | { status: 'error'; message: string }

function fmtBytes(b: number) {
  if (b === 0) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function AboutScreen() {
  const [appVersion, setAppVersion] = useState<string>('…')
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' })
  const [dlState, setDlState] = useState<DownloadState>({ status: 'idle' })
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
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
        setCheckState({ status: 'update-available', current: r.current, latest: r.latest, assetUrl: r.assetUrl, assetSize: r.assetSize, releasePageUrl: r.releasePageUrl })
      } else {
        setCheckState({ status: 'up-to-date', version: r.current })
      }
    } catch (err) {
      setCheckState({ status: 'error', message: String(err) })
    }
  }

  async function handleDownload() {
    if (!window.electronAPI || checkState.status !== 'update-available') return
    const { assetUrl, latest } = checkState

    // Derive a clean filename from the URL
    const rawName = assetUrl.split('/').pop() ?? `Feemo-Budget-Builder-${latest}${isMac ? '.dmg' : '.exe'}`
    const fileName = decodeURIComponent(rawName)

    setDlState({ status: 'downloading', percent: 0, downloaded: 0, total: 0 })

    window.electronAPI.onDownloadProgress(({ percent, downloaded, total }) => {
      setDlState({ status: 'downloading', percent, downloaded, total })
    })

    const result = await window.electronAPI.downloadAndOpenUpdate(assetUrl, fileName)
    window.electronAPI.removeDownloadProgressListener()

    if (!result.success) {
      setDlState({ status: 'error', message: result.error ?? 'Download failed.' })
    } else {
      setDlState({ status: 'done' })
    }
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
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Feemo Budget Builder</div>
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

          {/* ── Check states ── */}
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
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                You're running <strong style={{ color: 'var(--text)' }}>v{checkState.current}</strong>.
                {checkState.assetSize > 0 && <span style={{ color: 'var(--text3)' }}> Download size: {fmtBytes(checkState.assetSize)}.</span>}
              </div>
              <button className="btn btn-primary" style={{ fontSize: 14, padding: '10px 24px' }} onClick={handleDownload}>
                ↓ Download &amp; Install v{checkState.latest}
              </button>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                {isMac
                  ? 'The installer will download and open automatically. Drag the app to Applications when prompted.'
                  : 'The installer will download and run automatically. Follow the prompts to complete the update.'}
              </div>
            </div>
          )}

          {/* ── Download progress ── */}
          {(dlState.status === 'downloading' || dlState.status === 'opening') && (
            <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.25)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--blue)', marginBottom: 10 }}>
                {dlState.status === 'opening' ? 'Opening installer…' : `Downloading… ${dlState.percent}%`}
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'var(--blue)',
                  width: `${dlState.status === 'downloading' ? dlState.percent : 100}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              {dlState.status === 'downloading' && dlState.total > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {fmtBytes(dlState.downloaded)} / {fmtBytes(dlState.total)}
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {dlState.status === 'done' && (
            <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.25)' }}>
              <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 14, marginBottom: 8 }}>✓ Installer opened</div>
              {isMac ? (
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  A DMG window has opened in Finder.<br />
                  <strong style={{ color: 'var(--text)' }}>Drag Feemo Budget Builder into your Applications folder</strong> to finish the update.<br />
                  Then close this version and launch the new one from Applications.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  The installer is running. <strong style={{ color: 'var(--text)' }}>Follow the prompts</strong> — click Yes on the security dialog to allow the update.<br />
                  The app will relaunch automatically when the install is complete.
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {(checkState.status === 'error' || dlState.status === 'error') && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)' }}>
              <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13, marginBottom: 4 }}>
                {dlState.status === 'error' ? 'Download failed' : 'Could not check for updates'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {dlState.status === 'error' ? dlState.message : (checkState as { message: string }).message}
              </div>
              {checkState.status === 'update-available' && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => window.electronAPI?.openExternal(checkState.releasePageUrl)}
                >
                  Open release page instead →
                </button>
              )}
            </div>
          )}

          {/* ── Action row ── */}
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

      {/* Links */}
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

import { useState, useEffect } from 'react'

interface PendingUpdate {
  version: string
  current: string
  body: string
}

type DlState =
  | { status: 'idle' }
  | { status: 'downloading'; percent: number; downloaded: number; total: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function renderChangelog(body: string): string[] {
  if (!body.trim()) return []
  return body
    .split('\n')
    .map(l => l.replace(/^#{1,3}\s*/, '').replace(/^\*+\s*/, '• ').replace(/^-\s*/, '• ').trim())
    .filter(l => l.length > 0)
}

interface UpdateDialogProps {
  update: PendingUpdate
  onDismiss: () => void
}

export default function UpdateDialog({ update, onDismiss }: UpdateDialogProps) {
  const [dlState, setDlState] = useState<DlState>({ status: 'idle' })
  const changelogLines = renderChangelog(update.body)

  useEffect(() => {
    window.electronAPI?.onUpdateDownloaded(() => {
      setDlState({ status: 'ready' })
    })
  }, [])

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
    // ready state is set by the onUpdateDownloaded event
  }

  function handleRestart() {
    window.electronAPI?.installUpdate()
  }

  const busy = dlState.status === 'downloading'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <img
            src="/feemo-logo.png"
            alt="Feemovision"
            style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Update available — v{update.version}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {update.current ? `You're on v${update.current}. ` : ''}A new version is ready to install.
            </div>
          </div>
        </div>

        {/* Changelog */}
        {changelogLines.length > 0 && (
          <div style={{
            padding: '16px 28px',
            borderBottom: '1px solid var(--border)',
            maxHeight: 220, overflowY: 'auto',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              What's new
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {changelogLines.map((line, i) => (
                <div key={i} style={{ fontSize: 12, color: line.startsWith('•') ? 'var(--text)' : 'var(--text3)', lineHeight: 1.5 }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download progress */}
        {dlState.status === 'downloading' && (
          <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginBottom: 8 }}>
              Downloading… {dlState.percent}%
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', borderRadius: 3, background: 'var(--blue)',
                width: `${dlState.percent}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            {dlState.total > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {fmtBytes(dlState.downloaded)} / {fmtBytes(dlState.total)}
              </div>
            )}
          </div>
        )}

        {/* Ready to restart */}
        {dlState.status === 'ready' && (
          <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(46,204,113,0.06)' }}>
            <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13, marginBottom: 6 }}>✓ Update downloaded</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              Restart the app to apply the update. Your work will be saved automatically.
            </div>
          </div>
        )}

        {/* Error */}
        {dlState.status === 'error' && (
          <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(231,76,60,0.06)' }}>
            <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 12, marginBottom: 4 }}>Download failed</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{dlState.message}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '16px 28px', display: 'flex', gap: 10, alignItems: 'center' }}>
          {dlState.status === 'idle' && (
            <button className="btn btn-primary" style={{ fontSize: 13, padding: '9px 22px' }} onClick={handleDownload}>
              ↓ Download Update
            </button>
          )}
          {dlState.status === 'ready' && (
            <button className="btn btn-primary" style={{ fontSize: 13, padding: '9px 22px', background: 'var(--green)', borderColor: 'var(--green)' }} onClick={handleRestart}>
              ↺ Restart &amp; Apply
            </button>
          )}
          {dlState.status === 'error' && (
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setDlState({ status: 'idle' })}>
              Try again
            </button>
          )}
          <div style={{ flex: 1 }} />
          {!busy && dlState.status !== 'ready' && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)' }} onClick={onDismiss}>
              Later
            </button>
          )}
          {dlState.status === 'ready' && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)' }} onClick={onDismiss}>
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

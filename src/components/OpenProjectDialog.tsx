import { RecentProject } from '../hooks/useRecentProjects'

interface OpenProjectDialogProps {
  recents: RecentProject[]
  onOpenRecent: (filePath: string) => void
  onBrowse: () => void
  onRemoveRecent: (filePath: string) => void
  onDismiss: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function OpenProjectDialog({
  recents, onOpenRecent, onBrowse, onRemoveRecent, onDismiss,
}: OpenProjectDialogProps) {
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
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Open Project</div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--text3)', padding: '4px 8px' }}
            onClick={onDismiss}
          >✕</button>
        </div>

        {/* Recent projects */}
        {recents.length > 0 ? (
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', maxHeight: 320, overflowY: 'auto' }}>
            <div style={{ padding: '0 24px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Recent Projects
            </div>
            {recents.map(r => (
              <div
                key={r.filePath}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 24px', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => onOpenRecent(r.filePath)}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>🗂</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {r.filePath}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{timeAgo(r.savedAt)}</div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: 14, color: 'var(--text3)', flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); onRemoveRecent(r.filePath) }}
                  title="Remove from recents"
                >✕</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '28px 24px', color: 'var(--text3)', fontSize: 13, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
            No recent projects yet.
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '16px 24px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={onBrowse}>
            Browse for file…
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 13, color: 'var(--text3)' }} onClick={onDismiss}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

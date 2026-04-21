import { RecentProject } from '../hooks/useRecentProjects'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface HomeScreenProps {
  onNewProject: () => void
  onOpenProject: () => void
  recents: RecentProject[]
  onOpenRecent: (filePath: string) => void
}

export default function HomeScreen({ onNewProject, onOpenProject, recents, onOpenRecent }: HomeScreenProps) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      gap: 0,
    }}>
      {/* Logo */}
      <div style={{
        width: 72, height: 72,
        background: 'var(--accent)', color: '#000',
        fontWeight: 800, fontSize: 40, borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 8px 32px rgba(245,166,35,0.3)',
      }}>F</div>

      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
        Feemo Budget Builder
      </div>
      <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 40 }}>
        Smart production budget generator by Feemovision
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: recents.length > 0 ? 40 : 0 }}>
        <button
          onClick={onNewProject}
          style={{
            padding: '14px 32px',
            background: 'var(--accent)', color: '#000',
            fontWeight: 700, fontSize: 15,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          + New Project
        </button>
        <button
          onClick={onOpenProject}
          style={{
            padding: '14px 32px',
            background: 'transparent', color: 'var(--text)',
            fontWeight: 600, fontSize: 15,
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
        >
          Open Project…
        </button>
      </div>

      {/* Recent projects */}
      {recents.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, textAlign: 'center' }}>
            Recent
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recents.slice(0, 5).map(r => (
              <div
                key={r.filePath}
                onClick={() => onOpenRecent(r.filePath)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>🗂</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{timeAgo(r.savedAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 48, fontSize: 11, color: 'var(--text3)' }}>
        v1.3 · Feemovision
      </div>
    </div>
  )
}

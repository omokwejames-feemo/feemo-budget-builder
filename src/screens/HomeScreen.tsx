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
  onUploadBudget: () => void
  recents: RecentProject[]
  onOpenRecent: (filePath: string) => void
  onRebuild: () => void
}

export default function HomeScreen({ onNewProject, onOpenProject, onUploadBudget, recents, onOpenRecent, onRebuild }: HomeScreenProps) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      gap: 0,
      position: 'relative',
    }}>
      {/* Logo */}
      <div style={{ width: 96, height: 96, marginBottom: 20 }}>
        <img
          src="./feemo-logo.png"
          alt="Feemovision"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onError={e => {
            const el = e.currentTarget
            el.style.display = 'none'
            const fallback = el.nextElementSibling as HTMLElement | null
            if (fallback) fallback.style.display = 'flex'
          }}
        />
        <div style={{
          display: 'none',
          width: 96, height: 96,
          background: 'var(--accent-blue)', color: '#fff',
          fontWeight: 700, fontSize: 48, fontFamily: 'var(--font-mono)', borderRadius: 20,
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(29,108,245,0.3)',
        }}>F</div>
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
        Feemo Budget Manager
      </div>
      <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 40 }}>
        Smart production budget manager by Feemovision
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: recents.length > 0 ? 40 : 0 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <button
            onClick={onNewProject}
            style={{
              padding: '14px 32px',
              background: 'var(--accent-blue)', color: '#fff',
              fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-ui)',
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

        {/* Upload Existing Budget — distinct from New Project */}
        <button
          onClick={onUploadBudget}
          style={{
            padding: '12px 28px',
            background: 'transparent', color: 'var(--text2)',
            fontWeight: 600, fontSize: 14,
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
        >
          <span style={{ fontSize: 16 }}>📂</span> Upload Existing Budget
        </button>

        <button
          onClick={onRebuild}
          style={{
            padding: '10px 24px',
            background: 'transparent', color: 'var(--text3)',
            fontWeight: 600, fontSize: 13,
            border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text2)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
        >
          ↑ Rebuild from Files
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
        v1.4 · Feemovision
      </div>
    </div>
  )
}

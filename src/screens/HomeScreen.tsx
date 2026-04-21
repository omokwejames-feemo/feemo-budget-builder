interface HomeScreenProps {
  onNewProject: () => void
  onOpenProject: () => void
}

export default function HomeScreen({ onNewProject, onOpenProject }: HomeScreenProps) {
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
        width: 72,
        height: 72,
        background: 'var(--accent)',
        color: '#000',
        fontWeight: 800,
        fontSize: 40,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 8px 32px rgba(245,166,35,0.3)',
      }}>F</div>

      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
        Feemo Budget Builder
      </div>
      <div style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 48 }}>
        Smart production budget generator by Feemovision
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        <button
          onClick={onNewProject}
          style={{
            padding: '14px 32px',
            background: 'var(--accent)',
            color: '#000',
            fontWeight: 700,
            fontSize: 15,
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
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
            background: 'transparent',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: 15,
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text)'
          }}
        >
          Open Project…
        </button>
      </div>

      <div style={{ marginTop: 48, fontSize: 11, color: 'var(--text3)' }}>
        v1.0 · Feemovision
      </div>
    </div>
  )
}

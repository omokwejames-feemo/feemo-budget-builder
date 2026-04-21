import { useBudgetStore } from '../store/budgetStore'

interface FileScreenProps {
  currentFilePath: string | null
  hasUnsavedChanges: boolean
  onSave: () => void
  onSaveAs: () => Promise<void>
  onOpen: () => void | Promise<void>
  onClose: () => void
}

export default function FileScreen({
  currentFilePath,
  hasUnsavedChanges,
  onSave,
  onSaveAs,
  onOpen,
  onClose,
}: FileScreenProps) {
  const { project } = useBudgetStore()

  const fileName = currentFilePath
    ? currentFilePath.split('/').pop() ?? currentFilePath
    : null

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">File</div>
        <div className="screen-sub">Save, open, and manage your project file.</div>
      </div>

      {/* Current file status */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current File</span>
            {hasUnsavedChanges && (
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 4, padding: '2px 8px' }}>
                Unsaved changes
              </span>
            )}
          </div>
          {fileName ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{fileName}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{currentFilePath}</div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--text3)', fontStyle: 'italic' }}>
              New unsaved project — "{project.title || 'Untitled'}"
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <ActionRow
          icon="↓"
          title="Save"
          description="Instantly save to app storage — no dialog, no interruption"
          onClick={onSave}
          accent
          badge={hasUnsavedChanges ? 'Unsaved changes' : undefined}
        />
        <ActionRow
          icon="⎘"
          title="Save As…"
          description={currentFilePath ? `Export to a file — last saved to ${fileName}` : 'Export project as a .feemo file to any location on your computer'}
          onClick={onSaveAs}
        />
        <ActionRow
          icon="↑"
          title="Open Project…"
          description="Open a .feemo project file from your computer"
          onClick={onOpen}
        />
        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
        <ActionRow
          icon="✕"
          title="Close Project"
          description="Return to the home screen"
          onClick={onClose}
          danger
        />
      </div>
    </div>
  )
}

function ActionRow({
  icon, title, description, onClick, accent, danger, badge,
}: {
  icon: string
  title: string
  description: string
  onClick: () => void
  accent?: boolean
  danger?: boolean
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: accent ? 'rgba(245,166,35,0.06)' : danger ? 'rgba(231,76,60,0.04)' : 'var(--bg3)',
        border: `1px solid ${accent ? 'rgba(245,166,35,0.25)' : danger ? 'rgba(231,76,60,0.2)' : 'var(--border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = accent ? 'rgba(245,166,35,0.12)' : danger ? 'rgba(231,76,60,0.10)' : 'var(--bg2)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = accent ? 'rgba(245,166,35,0.06)' : danger ? 'rgba(231,76,60,0.04)' : 'var(--bg3)'
      }}
    >
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: accent ? 'var(--accent)' : danger ? 'var(--red)' : 'var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        color: accent ? '#000' : danger ? '#fff' : 'var(--text2)',
        flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: danger ? 'var(--red)' : 'var(--text)' }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 4, padding: '2px 6px' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{description}</div>
      </div>
      <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
    </button>
  )
}

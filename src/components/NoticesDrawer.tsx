// NoticesDrawer — Fix Batch 11
// Persistent panel listing all informational notices for the current project session.
// Notices survive navigation, project save/reopen, and manual dismissal marks the entry
// as read without deleting it until the user explicitly removes it.

import { useBudgetStore, AppNotice } from '../store/budgetStore'

const TYPE_ICON: Record<AppNotice['type'], string> = {
  rounding:   '≈',
  conflict:   '⚡',
  confidence: '~',
  wizard:     '✦',
  info:       'ℹ',
}

const TYPE_COLOUR: Record<AppNotice['type'], string> = {
  rounding:   '#f5a623',
  conflict:   '#ff6b6b',
  confidence: '#888',
  wizard:     '#a87fff',
  info:       '#4e9fff',
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface Props {
  onClose: () => void
  onNavigate: (screen: string) => void
}

export default function NoticesDrawer({ onClose, onNavigate }: Props) {
  const { notices, dismissNotice, clearAllNotices } = useBudgetStore()

  const active   = notices.filter(n => !n.dismissed)
  const archived = notices.filter(n => n.dismissed)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 420, maxWidth: '90vw',
        background: 'var(--bg2)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>🔔 Notices</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {active.length} unread · {archived.length} archived
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {notices.length > 0 && (
              <button
                onClick={() => clearAllNotices()}
                style={{
                  padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text3)', fontSize: 11, cursor: 'pointer',
                }}
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text3)', fontSize: 12, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notice list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {notices.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 48, color: 'var(--text3)', fontSize: 13 }}>
              No notices for this project.
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  {active.map(notice => (
                    <NoticeCard
                      key={notice.id}
                      notice={notice}
                      onDismiss={() => dismissNotice(notice.id)}
                      onNavigate={notice.targetScreen ? () => onNavigate(notice.targetScreen!) : undefined}
                    />
                  ))}
                </div>
              )}

              {archived.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Archived
                  </div>
                  {archived.map(notice => (
                    <NoticeCard
                      key={notice.id}
                      notice={notice}
                      archived
                      onDismiss={() => dismissNotice(notice.id)}
                      onNavigate={notice.targetScreen ? () => onNavigate(notice.targetScreen!) : undefined}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NoticeCard({ notice, archived, onDismiss, onNavigate }: {
  notice: AppNotice
  archived?: boolean
  onDismiss: () => void
  onNavigate?: () => void
}) {
  const colour = TYPE_COLOUR[notice.type]
  const icon   = TYPE_ICON[notice.type]

  return (
    <div style={{
      background: archived ? 'transparent' : 'var(--bg3)',
      border: `1px solid ${archived ? 'var(--border)' : colour + '44'}`,
      borderRadius: 10, padding: '14px 16px', marginBottom: 12,
      opacity: archived ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          fontSize: 15, color: colour,
          flexShrink: 0, marginTop: 1,
          width: 22, height: 22, borderRadius: '50%',
          background: colour + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
            {notice.message}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            {fmt(notice.timestamp)}
          </div>
        </div>
      </div>

      {!archived && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {onNavigate && (
            <button
              onClick={onNavigate}
              style={{
                padding: '5px 12px', background: colour + '22', border: `1px solid ${colour}44`,
                borderRadius: 5, color: colour, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to →
            </button>
          )}
          <button
            onClick={onDismiss}
            style={{
              padding: '5px 12px', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 5, color: 'var(--text3)', fontSize: 11, cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  progress?: number
  stripeColor?: string
  badge?: { text: string; variant: 'purple' | 'green' | 'amber' | 'red' | 'blue' }
}

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  purple: { bg: 'rgba(167,139,250,0.15)', color: 'var(--accent-purple)' },
  green:  { bg: 'rgba(34,201,138,0.12)',  color: 'var(--accent-green)' },
  amber:  { bg: 'rgba(245,158,11,0.12)',  color: 'var(--accent-amber)' },
  red:    { bg: 'rgba(240,90,90,0.12)',   color: 'var(--accent-red)' },
  blue:   { bg: 'rgba(59,130,246,0.12)',  color: 'var(--blue)' },
}

function KpiCard({ label, value, sub, progress, stripeColor, badge }: KpiCardProps) {
  const progressColor = progress === undefined ? 'var(--accent-blue)'
    : progress < 70 ? 'var(--accent-green)'
    : progress < 90 ? 'var(--accent-amber)'
    : 'var(--accent-red)'

  const stripe = stripeColor ?? 'var(--accent-blue)'
  const badgeStyle = badge ? BADGE_STYLES[badge.variant] : null

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      flex: 1,
      minWidth: 0,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* Coloured top stripe */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 3, background: stripe,
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
      }} />

      <div className="prod-kpi-label">{label}</div>
      <div className="prod-kpi-value">{value}</div>

      {badge && badgeStyle && (
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          marginTop: 6, marginBottom: sub ? 4 : 0,
          padding: '3px 10px', borderRadius: 100,
          fontSize: 11, fontWeight: 700,
          background: badgeStyle.bg, color: badgeStyle.color,
        }}>
          {badge.text}
        </div>
      )}

      {sub && !badge && <div className="prod-kpi-sub">{sub}</div>}

      {progress !== undefined && (
        <div className="prod-kpi-bar-track">
          <div className="prod-kpi-bar-fill" style={{ width: `${Math.min(100, progress)}%`, background: progressColor }} />
        </div>
      )}
    </div>
  )
}

interface Props {
  items: KpiCardProps[]
}

export default function KpiRow({ items }: Props) {
  return (
    <div className="prod-kpi-row">
      {items.map((item, i) => <KpiCard key={i} {...item} />)}
    </div>
  )
}

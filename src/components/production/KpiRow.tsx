interface KpiCardProps {
  label: string
  value: string
  sub?: string
  progress?: number
}

function KpiCard({ label, value, sub, progress }: KpiCardProps) {
  const color = progress === undefined ? 'var(--accent-blue)'
    : progress < 70 ? 'var(--accent-green)'
    : progress < 90 ? 'var(--accent-amber)'
    : 'var(--accent-red)'

  return (
    <div className="prod-kpi-card">
      <div className="prod-kpi-label">{label}</div>
      <div className="prod-kpi-value">{value}</div>
      {sub && <div className="prod-kpi-sub">{sub}</div>}
      {progress !== undefined && (
        <div className="prod-kpi-bar-track">
          <div className="prod-kpi-bar-fill" style={{ width: `${Math.min(100, progress)}%`, background: color }} />
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

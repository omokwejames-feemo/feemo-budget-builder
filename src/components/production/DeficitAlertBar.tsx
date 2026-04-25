import type { DeptStat } from '../../utils/deriveProductionStats'
import { formatCurrency } from '../../utils/formatCurrency'

interface Props {
  unsignedCount: number
  atRiskDepts: DeptStat[]
  currency: string
  prodNotices: { id: string; message: string }[]
}

export default function DeficitAlertBar({ unsignedCount, atRiskDepts, currency, prodNotices }: Props) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const hasAlerts = unsignedCount > 0 || atRiskDepts.length > 0 || prodNotices.length > 0

  return (
    <div className="prod-alerts-panel">
      <div className="prod-panel-label">Alerts</div>
      {unsignedCount > 0 && (
        <div className="prod-alert-row prod-alert-amber">
          <span>⚠</span>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {unsignedCount} unsigned schedule{unsignedCount > 1 ? 's' : ''} pending for over 48 hours
          </div>
        </div>
      )}
      {atRiskDepts.map(d => (
        <div key={d.code} className={`prod-alert-row ${d.status === 'OVER BUDGET' ? 'prod-alert-red' : 'prod-alert-amber'}`}>
          <span>{d.status === 'OVER BUDGET' ? '🔴' : '🟡'}</span>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{d.code}</strong> — {d.name}: {d.status.toLowerCase()}
            {d.remaining < 0 && ` (${fmt(Math.abs(d.remaining))} over)`}
          </div>
        </div>
      ))}
      {prodNotices.map(n => (
        <div key={n.id} className="prod-alert-row prod-alert-info">
          <span>ℹ</span>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.message}</div>
        </div>
      ))}
      {!hasAlerts && (
        <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '8px 0' }}>No active alerts.</div>
      )}
    </div>
  )
}

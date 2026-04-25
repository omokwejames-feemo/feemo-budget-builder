import type { DeptStat } from '../../utils/deriveProductionStats'
import { formatCurrency } from '../../utils/formatCurrency'

interface Props {
  deptRows: DeptStat[]
  currency: string
}

export default function DeptStatusTable({ deptRows, currency }: Props) {
  const fmt = (n: number) => formatCurrency(n, currency)

  if (deptRows.length === 0) {
    return (
      <div className="prod-panel">
        <div className="prod-panel-label">Department Status</div>
        <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '8px 0' }}>No department data available.</div>
      </div>
    )
  }

  return (
    <div className="prod-panel">
      <div className="prod-panel-label">Department Status</div>
      <table className="prod-dept-table">
        <thead>
          <tr>
            {['Department', 'Budget', 'Spent', 'Remaining', 'Status'].map(h => (
              <th key={h} className={h === 'Department' || h === 'Status' ? 'prod-th-left' : 'prod-th-right'}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deptRows.map((d, i) => (
            <tr key={d.code} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
              <td className="prod-td prod-td-dept">
                <span className="prod-dept-code">{d.code}</span>
                {d.name}
              </td>
              <td className="prod-td prod-td-num">{fmt(d.budgeted)}</td>
              <td className="prod-td prod-td-num">{fmt(d.spent)}</td>
              <td className="prod-td prod-td-num" style={{ color: d.remaining < 0 ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: d.remaining < 0 ? 700 : 400 }}>
                {d.remaining < 0 ? `-${fmt(Math.abs(d.remaining))}` : fmt(d.remaining)}
              </td>
              <td className="prod-td">
                <span className="prod-status-badge" style={{ color: d.statusColor }}>{d.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

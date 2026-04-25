import { useState } from 'react'
import { useBudgetStore, DEPARTMENTS } from '../store/budgetStore'
import type { DeptCode } from '../store/budgetStore'
import { formatCurrency } from '../utils/formatCurrency'

interface Props {
  onClose: () => void
}

export default function SyncDialog({ onClose }: Props) {
  const store = useBudgetStore()
  const { lineItems, forecastOverrides, project, integrityDiscrepancy, integritySourceDepartment } = store
  const currency = project.currency || 'NGN'
  const fmt = (n: number) => formatCurrency(n, currency)

  const forecastTotal = Object.values(forecastOverrides).reduce((s, v) => s + v, 0)
  const budgetTotal = Object.values(lineItems).reduce((sum, items) =>
    sum + items.reduce((s, item) => s + (item.rate || 0) * (item.qty || 1), 0), 0)

  const [choice, setChoice] = useState<'A' | 'B' | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  // Option A: scale forecast to match budget
  function applyOptionA() {
    if (forecastTotal === 0) return
    const scale = budgetTotal / forecastTotal
    const newOverrides: Record<string, number> = {}
    for (const [k, v] of Object.entries(forecastOverrides)) {
      newOverrides[k] = Math.round(v * scale)
    }
    for (const [k, v] of Object.entries(newOverrides)) {
      store.setForecastOverride(k, v)
    }
    store.setForecastLocked(false)
    store.setBudgetIntegrity('ok', 0, null)
    onClose()
  }

  // Option B: adjust largest dept line items to absorb discrepancy
  function applyOptionB() {
    // Find the dept with the most over/under-allocated line items
    const targetDeptCode = DEPARTMENTS.reduce((best, dept) => {
      const total = (lineItems[dept.code as DeptCode] || []).reduce((s, i) => s + (i.rate || 0) * (i.qty || 1), 0)
      const bestTotal = (lineItems[best.code as DeptCode] || []).reduce((s, i) => s + (i.rate || 0) * (i.qty || 1), 0)
      return total > bestTotal ? dept : best
    }, DEPARTMENTS[0])

    const deptItems = lineItems[targetDeptCode.code as DeptCode] || []
    if (deptItems.length === 0) { onClose(); return }

    // Distribute the discrepancy adjustment across all items in that dept proportionally
    const deptTotal = deptItems.reduce((s, i) => s + (i.rate || 0) * (i.qty || 1), 0)
    const adjustment = -integrityDiscrepancy // if forecast is over, reduce budget items
    for (const item of deptItems) {
      const share = deptTotal > 0 ? (item.rate * item.qty) / deptTotal : 0
      const newRate = Math.max(0, item.rate + (adjustment * share) / Math.max(item.qty, 1))
      store.updateLineItem(targetDeptCode.code as DeptCode, item.id, { rate: Math.round(newRate) })
    }
    store.setBudgetIntegrity('ok', 0, null)
    onClose()
  }

  // Preview table for option A
  const previewA = Object.entries(forecastOverrides).slice(0, 8).map(([k, v]) => ({
    key: k,
    before: v,
    after: Math.round(v * (forecastTotal > 0 ? budgetTotal / forecastTotal : 1)),
  }))

  // Preview for option B
  const targetDept = DEPARTMENTS.reduce((best, dept) => {
    const total = (lineItems[dept.code as DeptCode] || []).reduce((s, i) => s + (i.rate || 0) * (i.qty || 1), 0)
    const bestTotal = (lineItems[best.code as DeptCode] || []).reduce((s, i) => s + (i.rate || 0) * (i.qty || 1), 0)
    return total > bestTotal ? dept : best
  }, DEPARTMENTS[0])

  const shell: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const card: React.CSSProperties = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 14, padding: '32px 36px', width: '92%', maxWidth: 560,
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
  }

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Resolve Budget Mismatch</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Production Forecast: <strong style={{ color: 'var(--text-primary)' }}>{fmt(forecastTotal)}</strong>
          {' · '}
          Main Budget: <strong style={{ color: 'var(--text-primary)' }}>{fmt(budgetTotal)}</strong>
          {' · '}
          Difference: <strong style={{ color: 'var(--accent-amber)' }}>{fmt(Math.abs(integrityDiscrepancy))}</strong>
          {integritySourceDepartment && ` — largest gap in ${integritySourceDepartment}`}
        </div>

        {/* Option A */}
        <div
          onClick={() => setChoice('A')}
          style={{ padding: '14px 16px', background: choice === 'A' ? 'rgba(107,140,255,0.08)' : 'var(--bg-surface)', border: `1px solid ${choice === 'A' ? 'var(--accent-blue)' : 'var(--border-default)'}`, borderRadius: 8, cursor: 'pointer', marginBottom: 10 }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, marginBottom: 3 }}>
            Option A — Update Production Forecast to match my budget of {fmt(budgetTotal)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Scales all Forecast values proportionally to sum to the main budget total.</div>
          {choice === 'A' && previewA.length > 0 && (
            <table style={{ width: '100%', marginTop: 10, fontSize: 10, borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ textAlign: 'left', color: 'var(--text-ghost)', padding: '3px 6px' }}>Period</th>
                <th style={{ textAlign: 'right', color: 'var(--text-ghost)', padding: '3px 6px' }}>Before</th>
                <th style={{ textAlign: 'right', color: 'var(--text-ghost)', padding: '3px 6px' }}>After</th>
              </tr></thead>
              <tbody>{previewA.map(r => (
                <tr key={r.key}>
                  <td style={{ padding: '3px 6px', color: 'var(--text-muted)' }}>{r.key}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.before)}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.after)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {/* Option B */}
        <div
          onClick={() => setChoice('B')}
          style={{ padding: '14px 16px', background: choice === 'B' ? 'rgba(107,140,255,0.08)' : 'var(--bg-surface)', border: `1px solid ${choice === 'B' ? 'var(--accent-blue)' : 'var(--border-default)'}`, borderRadius: 8, cursor: 'pointer', marginBottom: 10 }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, marginBottom: 3 }}>
            Option B — Update main budget to match my Production Forecast of {fmt(forecastTotal)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Adjusts line items in <strong>{targetDept.code} — {targetDept.name}</strong> to absorb the {fmt(Math.abs(integrityDiscrepancy))} difference.
          </div>
        </div>

        {/* Option C */}
        <div
          onClick={() => { onClose() }}
          style={{ padding: '10px 16px', textAlign: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}
        >
          I will fix this manually — close dialog
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button
            disabled={!choice}
            onClick={() => { if (choice === 'A') applyOptionA(); else if (choice === 'B') applyOptionB() }}
            style={{ padding: '9px 22px', background: choice ? 'var(--accent-blue)' : 'var(--bg-surface)', color: choice ? '#fff' : 'var(--text-ghost)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: choice ? 'pointer' : 'default', fontFamily: 'inherit' }}
          >
            Apply Selected Option
          </button>
        </div>
      </div>
    </div>
  )
}

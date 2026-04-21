import { useState, useEffect, useRef } from 'react'
import { useBudgetStore, DEPARTMENTS, DeptCode, LineItem, getDeptTarget, getDeptActual } from '../store/budgetStore'

let idCounter = 1000
function newId() { return String(++idCounter) }

function fmtCur(n: number, cur = 'N') {
  if (!n && n !== 0) return '—'
  return `${cur}${n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtNum(n: number) {
  if (!n) return '—'
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function EditableCell({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      className="td-input"
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function FormattedNumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  if (editing) {
    return (
      <input
        className="td-input"
        type="number"
        value={raw}
        autoFocus
        onChange={e => setRaw(e.target.value)}
        onBlur={() => { setEditing(false); onChange(Number(raw) || 0) }}
        style={{ textAlign: 'right' }}
      />
    )
  }
  return (
    <div
      className="td-input"
      style={{ textAlign: 'right', cursor: 'text', userSelect: 'none', color: value > 0 ? 'inherit' : 'var(--text3)' }}
      onClick={() => { setRaw(String(value)); setEditing(true) }}
    >
      {value > 0 ? fmtNum(value) : '0'}
    </div>
  )
}

function DeptSection({ code }: { code: DeptCode }) {
  const store = useBudgetStore()
  const dept = DEPARTMENTS.find(d => d.code === code)!
  const items = store.lineItems[code] || []
  const target = getDeptTarget(code, store)
  const actual = getDeptActual(code, store)
  const variance = actual - target
  const cur = store.project.currency || 'N'

  function addRow() {
    const schedNo = `${code}${items.length + 1}`
    store.addLineItem(code, {
      id: newId(),
      schedNo,
      detail: '',
      qty: 1,
      rate: 0,
      unit: 'Flat',
      ie: 'E',
    })
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="alloc-code" style={{ fontSize: 13 }}>{code}</span>
          <span className="card-title">{dept.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
          <span style={{ color: 'var(--text2)' }}>Target: <strong style={{ color: 'var(--text)' }}>{fmtCur(target, cur)}</strong></span>
          <span style={{ color: 'var(--text2)' }}>Actual: <strong style={{ color: actual > target ? 'var(--red)' : 'var(--green)' }}>{fmtCur(actual, cur)}</strong></span>
          {target > 0 && (
            <span className={`badge ${Math.abs(variance) < 1 ? 'badge-ok' : variance > 0 ? 'badge-err' : 'badge-warn'}`}>
              {variance > 0 ? '+' : ''}{fmtCur(variance, cur)}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={addRow}>+ Line</button>
        </div>
      </div>
      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>SCH.NO.</th>
                <th>Detail / Description</th>
                <th style={{ width: 60, textAlign: 'right' }}>QTY</th>
                <th style={{ width: 110, textAlign: 'right' }}>Rate ({cur})</th>
                <th style={{ width: 80 }}>Unit</th>
                <th style={{ width: 40 }}>
                  <span title="I = Internal (in-house/overhead costs absorbed by production company)&#10;E = External (contracted, freelance, or outsourced)" style={{ cursor: 'help', borderBottom: '1px dotted var(--text3)' }}>I/E</span>
                </th>
                <th style={{ width: 130 }} className="td-num">Total ({cur})</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const total = item.qty * item.rate
                return (
                  <tr key={item.id}>
                    <td className="td-mono">
                      <EditableCell value={item.schedNo} onChange={v => store.updateLineItem(code, item.id, { schedNo: v })} />
                    </td>
                    <td>
                      <EditableCell value={item.detail} onChange={v => store.updateLineItem(code, item.id, { detail: v })} />
                    </td>
                    <td>
                      <FormattedNumberCell
                        value={item.qty}
                        onChange={v => store.updateLineItem(code, item.id, { qty: v })}
                      />
                    </td>
                    <td>
                      <FormattedNumberCell
                        value={item.rate}
                        onChange={v => store.updateLineItem(code, item.id, { rate: v })}
                      />
                    </td>
                    <td>
                      <select
                        className="td-input"
                        value={item.unit}
                        onChange={e => store.updateLineItem(code, item.id, { unit: e.target.value })}
                        style={{ padding: '4px 6px' }}
                      >
                        {['Flat', 'Day', 'Week', 'Month', 'Unit', 'Hour', 'Per Episode', 'Per Shoot Day'].map(u => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="td-input"
                        value={item.ie}
                        onChange={e => store.updateLineItem(code, item.id, { ie: e.target.value as 'I' | 'E' })}
                        style={{ padding: '4px 6px', color: item.ie === 'I' ? 'var(--blue)' : 'var(--green)', fontWeight: 700 }}
                      >
                        <option value="E">E</option>
                        <option value="I">I</option>
                      </select>
                    </td>
                    <td className="td-num" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCur(total, cur)}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ padding: '3px 7px' }}
                        onClick={() => store.removeLineItem(code, item.id)}
                      >✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="row-subtotal">
                <td colSpan={6}>TOTAL {dept.name.toUpperCase()}</td>
                <td className="td-num">{fmtCur(actual, cur)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {items.length === 0 && (
        <div style={{ padding: '20px 18px', color: 'var(--text3)', fontSize: 12 }}>
          No line items. <button className="btn btn-ghost btn-sm" onClick={addRow} style={{ marginLeft: 8 }}>+ Add first line</button>
        </div>
      )}
    </div>
  )
}

export default function ProductionBudget() {
  const store = useBudgetStore()
  const [activeDept, setActiveDept] = useState<DeptCode | 'all'>('all')
  const [overBudgetDismissed, setOverBudgetDismissed] = useState(false)
  const prevTotalRef = useRef(0)
  const cur = store.project.currency || 'N'

  const grandTotal = DEPARTMENTS.reduce((sum, d) => sum + getDeptActual(d.code as DeptCode, store), 0)
  const grandTarget = store.project.totalBudget

  const isOverBudget = grandTotal > grandTarget && grandTarget > 0
  const overBy = grandTotal - grandTarget

  // Reset dismissed state when total dips back under budget
  useEffect(() => {
    if (grandTotal <= grandTarget) setOverBudgetDismissed(false)
    if (grandTotal > grandTarget && prevTotalRef.current <= grandTarget) {
      setOverBudgetDismissed(false)
    }
    prevTotalRef.current = grandTotal
  }, [grandTotal, grandTarget])
  const feePct = store.project.productionFeePercent ?? 5
  const feeAmount = (feePct / 100) * grandTarget
  const subTotal = grandTotal - getDeptActual('II', store)
  const variance = grandTotal - grandTarget

  const visibleDepts = activeDept === 'all' ? DEPARTMENTS : DEPARTMENTS.filter(d => d.code === activeDept)

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Production Budget</div>
        <div className="screen-sub">Line-item budget per department. SCH.NO. auto-generates; edit freely. Click any rate/qty cell to edit.</div>
      </div>

      <div className="summary-stats" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Budget</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{fmtCur(grandTarget, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entered So Far</div>
          <div className="stat-value" style={{ fontSize: 16, color: grandTotal > grandTarget ? 'var(--red)' : 'var(--text)' }}>{fmtCur(grandTotal, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Production Fee ({feePct}%)</div>
          <div className="stat-value" style={{ fontSize: 16, color: 'var(--accent)' }}>{fmtCur(feeAmount, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-value" style={{ fontSize: 16, color: grandTarget - grandTotal < 0 ? 'var(--red)' : 'var(--green)' }}>
            {fmtCur(grandTarget - grandTotal, cur)}
          </div>
        </div>
      </div>

      {/* Dept filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <button
          className={`btn btn-sm ${activeDept === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveDept('all')}
        >All</button>
        {DEPARTMENTS.map(d => {
          const actual = getDeptActual(d.code as DeptCode, store)
          return (
            <button
              key={d.code}
              className={`btn btn-sm ${activeDept === d.code ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveDept(d.code as DeptCode)}
              style={{ position: 'relative' }}
            >
              {d.code}
              {actual > 0 && <span style={{ marginLeft: 4, color: activeDept === d.code ? '#000' : 'var(--accent)', fontSize: 10 }}>•</span>}
            </button>
          )
        })}
      </div>

      {visibleDepts.map(d => (
        <DeptSection key={d.code} code={d.code as DeptCode} />
      ))}

      {activeDept === 'all' && grandTotal > 0 && (
        <div className="card">
          <div style={{ padding: '14px 18px' }}>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr style={{ color: 'var(--text2)', fontSize: 13 }}>
                  <td>Below-the-line sub-total (excl. fee)</td>
                  <td className="td-num">{fmtCur(subTotal, cur)}</td>
                  <td style={{ width: 120 }} />
                </tr>
                <tr style={{ color: 'var(--accent)', fontSize: 13 }}>
                  <td>+ Production Fee / Contingency (II) — {feePct}%</td>
                  <td className="td-num">{fmtCur(feeAmount, cur)}</td>
                  <td />
                </tr>
                <tr className="row-total">
                  <td>GRAND TOTAL — ALL DEPARTMENTS</td>
                  <td className="td-num">{fmtCur(grandTotal, cur)}</td>
                  <td style={{ paddingLeft: 12, fontSize: 12, color: variance > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {Math.abs(variance) < 1 ? '✓ On budget' : variance > 0 ? `+${fmtCur(variance, cur)} over` : `${fmtCur(Math.abs(variance), cur)} under`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Over-budget warning dialog ── */}
      {isOverBudget && !overBudgetDismissed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--red)', borderRadius: 10, padding: 28, maxWidth: 460, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>⚠ Budget Exceeded</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 12, lineHeight: 1.7 }}>
              Your line items total <strong style={{ color: 'var(--text)' }}>{fmtCur(grandTotal, cur)}</strong>, which is{' '}
              <strong style={{ color: 'var(--red)' }}>{fmtCur(overBy, cur)} over</strong> the{' '}
              <strong style={{ color: 'var(--text)' }}>{fmtCur(grandTarget, cur)}</strong> total budget set in Assumptions.
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>
              Review the departments highlighted in red above and reduce their line items, or increase the total budget in the Assumptions Dashboard.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setOverBudgetDismissed(true)}>Understood</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useBudgetStore, DEPARTMENTS, DeptCode, LineItem, getDeptTarget, getDeptActual } from '../store/budgetStore'
import type { UploadAuditField } from '../store/budgetStore'
import { formatCurrency, formatAmount } from '../utils/formatCurrency'

let idCounter = 1000
function newId() { return String(++idCounter) }

// Legacy wrappers kept for backward compat with cell rendering below
function fmtCur(n: number, cur = 'NGN') {
  return formatCurrency(n, cur)
}

function fmtNum(n: number) {
  return formatAmount(n)
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
        onBlur={() => { setEditing(false); const n = parseFloat(raw); onChange(isNaN(n) || n < 0 ? 0 : n) }}
        onFocus={e => e.target.select()}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={{ textAlign: 'right' }}
      />
    )
  }
  return (
    <div
      className="td-input"
      style={{ textAlign: 'right', cursor: 'text', userSelect: 'none', color: value > 0 ? 'inherit' : 'var(--text3)' }}
      onClick={() => { setRaw(value > 0 ? String(value) : ''); setEditing(true) }}
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
      no: 1,
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
                <th style={{ width: 50, textAlign: 'right' }}>No.</th>
                <th style={{ width: 110, textAlign: 'right' }}>Rate ({cur})</th>
                <th style={{ width: 60, textAlign: 'right' }}>Qty</th>
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
                const total = (item.no ?? 1) * item.qty * item.rate
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
                        value={item.no ?? 1}
                        onChange={v => store.updateLineItem(code, item.id, { no: v })}
                      />
                    </td>
                    <td>
                      <FormattedNumberCell
                        value={item.rate}
                        onChange={v => store.updateLineItem(code, item.id, { rate: v })}
                      />
                    </td>
                    <td>
                      <FormattedNumberCell
                        value={item.qty}
                        onChange={v => store.updateLineItem(code, item.id, { qty: v })}
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
                <td colSpan={7}>TOTAL {dept.name.toUpperCase()}</td>
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

function UploadAuditPanel({ audit, onDismiss }: { audit: import('../store/budgetStore').UploadAudit; onDismiss: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const populated = audit.fieldsPopulated.filter(f => f.populated)
  const missing   = audit.fieldsPopulated.filter(f => !f.populated)

  return (
    <div style={{ marginBottom: 20, border: '1px solid rgba(78,159,255,0.35)', borderRadius: 10, background: 'rgba(78,159,255,0.06)', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer' }} onClick={() => setCollapsed(c => !c)}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#4e9fff' }}>📥 Upload Summary</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>
          {audit.fileName} · {new Date(audit.uploadedAt).toLocaleString()} · {audit.documentType}
        </span>
        {audit.crossCheckMessage && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>⚠ Rounding note</span>
        )}
        <button onClick={e => { e.stopPropagation(); onDismiss() }} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 16px 14px' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['Total Budget', audit.totalBudgetDetected],
              ['Line Items',   String(audit.lineItemCount)],
              ['Salary Roles', String(audit.salaryRoleCount)],
              ['Pmt Schedules',String(audit.paymentScheduleCount)],
              ['Fields Set',   `${populated.length} of ${audit.fieldsPopulated.length}`],
            ].map(([label, val]) => (
              <div key={label} style={{ fontSize: 11 }}>
                <div style={{ color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Fields populated */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 24px', marginBottom: missing.length > 0 ? 10 : 0 }}>
            {populated.map((f: UploadAuditField) => (
              <div key={f.field} style={{ fontSize: 11, color: 'var(--text2)' }}>
                <span style={{ color: '#4ec24e', marginRight: 4 }}>✓</span>{f.field}: <span style={{ color: 'var(--text)' }}>{f.value}</span>
              </div>
            ))}
          </div>
          {missing.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 4, marginTop: 6 }}>Not found in file — left blank:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {missing.map((f: UploadAuditField) => (
                  <span key={f.field} style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(128,128,128,0.12)', borderRadius: 3, color: 'var(--text3)' }}>{f.field}</span>
                ))}
              </div>
            </>
          )}

          {/* Cross-check note */}
          {audit.crossCheckMessage && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--accent)', background: 'rgba(245,166,35,0.08)', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
              ℹ {audit.crossCheckMessage}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProductionBudget() {
  const store = useBudgetStore()
  const [activeDept, setActiveDept] = useState<DeptCode | 'all'>('all')
  const [overBudgetDismissed, setOverBudgetDismissed] = useState(false)
  const [auditDismissed, setAuditDismissed] = useState(false)
  const prevTotalRef = useRef(0)
  const cur = store.project.currency || 'N'

  const grandTarget = store.project.totalBudget
  const feePct = store.project.productionFeePercent ?? 0
  const feeAmount = (feePct / 100) * grandTarget

  // Dept II is auto-calculated from the fee %; exclude its manual line items from totals
  const subTotal = DEPARTMENTS
    .filter(d => d.code !== 'II')
    .reduce((sum, d) => sum + getDeptActual(d.code as DeptCode, store), 0)
  const grandTotal = subTotal + feeAmount
  const variance = grandTotal - grandTarget

  // Suppress during bulk upload — line items may be written before totalBudget is finalised
  const isOverBudget = grandTotal > grandTarget && grandTarget > 0 && !store.isPopulatingFromUpload
  const overBy = grandTotal - grandTarget

  useEffect(() => {
    if (grandTotal <= grandTarget) setOverBudgetDismissed(false)
    if (grandTotal > grandTarget && prevTotalRef.current <= grandTarget && !store.isPopulatingFromUpload) {
      setOverBudgetDismissed(false)
    }
    prevTotalRef.current = grandTotal
  }, [grandTotal, grandTarget, store.isPopulatingFromUpload])

  // Reset audit dismissed state when a new audit arrives
  useEffect(() => { if (store.lastUploadAudit) setAuditDismissed(false) }, [store.lastUploadAudit])

  // Dept II is auto-calculated; never shown as an editable section
  const editableDepts = DEPARTMENTS.filter(d => d.code !== 'II')
  const visibleDepts = activeDept === 'all' ? editableDepts : editableDepts.filter(d => d.code === activeDept)

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Production Budget</div>
        <div className="screen-sub">Line-item budget per department. SCH.NO. auto-generates; edit freely. Click any rate/qty cell to edit.</div>
      </div>

      {/* Upload audit panel — shown after a file import, dismissed per-session */}
      {store.lastUploadAudit && !auditDismissed && (
        <UploadAuditPanel
          audit={store.lastUploadAudit}
          onDismiss={() => {
            setAuditDismissed(true)
            store.setLastUploadAudit(null)
          }}
        />
      )}

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
        {editableDepts.map(d => {
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

      {/* Dept II — auto-calculated, read-only */}
      {activeDept === 'all' && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(245,166,35,0.25)' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="alloc-code" style={{ fontSize: 13 }}>II</span>
              <span className="card-title">Contingency / Production Fee</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>Auto-calculated from Assumptions</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{feePct}% of budget</span>
              <span style={{ color: 'var(--text2)' }}>= <strong style={{ color: 'var(--accent)' }}>{fmtCur(feeAmount, cur)}</strong></span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>SCH.NO.</th>
                  <th>Detail / Description</th>
                  <th style={{ width: 60, textAlign: 'right' }}>QTY</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Rate ({cur})</th>
                  <th style={{ width: 80 }}>Unit</th>
                  <th style={{ width: 40 }}>I/E</th>
                  <th style={{ width: 130 }} className="td-num">Total ({cur})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>II1</td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>Production Fee / Contingency</td>
                  <td className="td-num" style={{ color: 'var(--text3)' }}>1</td>
                  <td className="td-num" style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{fmtCur(feeAmount, cur)}</td>
                  <td style={{ color: 'var(--text3)', fontSize: 12 }}>Flat</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700, fontSize: 12 }}>E</td>
                  <td className="td-num" style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCur(feeAmount, cur)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="row-subtotal">
                  <td colSpan={6}>TOTAL CONTINGENCY / PRODUCTION FEE</td>
                  <td className="td-num">{fmtCur(feeAmount, cur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
            To change this figure, update the Production Fee % in the Assumptions Dashboard.
          </div>
        </div>
      )}

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

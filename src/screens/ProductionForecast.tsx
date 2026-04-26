import { useState, useEffect } from 'react'
import { useBudgetStore, DEPARTMENTS, DeptCode, Installment, Timeline, getDeptTarget, getDeptBudget, getTotalMonths, getMonthLabel, getMonthPhase, DEPT_ACTIVE_PHASES } from '../store/budgetStore'
import { Issue } from '../hooks/useIssueDetector'
import { formatCurrency } from '../utils/formatCurrency'
import { formatPercent } from '../utils/formatPercent'

function fmtN(n: number, cur = 'NGN', brackets = false) {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  const s = formatCurrency(abs, cur)
  if (n < 0 && brackets) return `(${s})`
  return n < 0 ? `-${s}` : s
}

function suggestInstallmentTiming(
  installments: Installment[],
  paymentsPerMonth: number[],
  totalBudget: number,
  timeline: Timeline,
): Installment[] {
  const nMonths = paymentsPerMonth.length
  if (!nMonths || !installments.length) return installments.map(i => ({ ...i }))

  const suggested: Installment[] = installments.map(i => ({ ...i }))

  // Phase anchor months for "no-deficit" distribution (1-indexed, clamped to nMonths)
  const { developmentMonths: devM, preProdMonths: preM, shootMonths: shootM } = timeline
  const clamp = (m: number) => Math.max(1, Math.min(m, nMonths))
  const phaseAnchors = [
    clamp(1),                          // development start
    clamp(devM + 1),                   // pre-prod start
    clamp(devM + preM + 1),            // shoot start
    clamp(devM + preM + shootM + 1),   // post start
  ]

  // Sort installments largest-first so biggest payment gets the most critical slot
  const order = [...installments].sort((a, b) => b.percentage - a.percentage)
  const receipts = new Array(nMonths).fill(0) // running receipt schedule (index = month-1)

  order.forEach((inst, idx) => {
    const amount = (inst.percentage / 100) * totalBudget

    // Compute running balance WITHOUT this installment to find first deficit month
    let balance = 0
    let deficitMonth = 0
    for (let i = 0; i < nMonths; i++) {
      balance += receipts[i] - paymentsPerMonth[i]
      if (balance < 0) { deficitMonth = i + 1; break }
    }

    let month: number
    if (deficitMonth > 0) {
      // Place at the exact month cash runs out
      month = deficitMonth
    } else {
      // No deficit: spread across phase anchors weighted toward early production
      month = phaseAnchors[Math.min(idx, phaseAnchors.length - 1)]
    }

    month = clamp(month)
    receipts[month - 1] += amount

    const entry = suggested.find(s => s.id === inst.id)
    if (entry) entry.month = month
  })

  return suggested
}

function EditableForecastCell({ value, onSave, cur }: { value: number; onSave: (v: number) => void; cur: string }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  if (editing) {
    return (
      <input
        type="number"
        value={raw}
        autoFocus
        onChange={e => setRaw(e.target.value)}
        onBlur={() => { setEditing(false); onSave(Number(raw) || 0) }}
        onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(Number(raw) || 0) } }}
        style={{
          width: '100%', textAlign: 'right', background: 'var(--bg3)',
          border: '1px solid var(--accent)', borderRadius: 3,
          color: 'var(--text)', padding: '2px 4px', fontSize: 12,
        }}
      />
    )
  }
  return (
    <div
      onClick={() => { setRaw(String(value)); setEditing(true) }}
      title="Click to edit"
      style={{
        textAlign: 'right', cursor: 'text', fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        color: value > 0 ? 'var(--text)' : 'var(--text3)',
        padding: '2px 0',
      }}
    >
      {value > 0 ? fmtN(value, cur) : '—'}
    </div>
  )
}

export default function ProductionForecast({ issues = [] }: { issues?: Issue[] }) {
  const store = useBudgetStore()
  const { timeline, project, installments, forecastOverrides, forecastLocked, setForecastOverride, setInstallments, setForecastLocked, clearForecastOverrides } = store
  const totalMonths = getTotalMonths(timeline)
  const cur = project.currency || 'N'
  const months = Array.from({ length: totalMonths }, (_, i) => i + 1)

  const [deficitDismissed, setDeficitDismissed] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [suggestedSchedule, setSuggestedSchedule] = useState<Installment[] | null>(null)

  // ── Dept monthly spend — driven directly by line items, not salary roles ────
  const deptRows = DEPARTMENTS
    .map(dept => {
      const code = dept.code as DeptCode
      if (getDeptTarget(code, store) <= 0) return null  // 0% allocation = user excluded this dept
      const target = getDeptBudget(code, store)         // line items total if entered, else alloc%

      const activePhases = DEPT_ACTIVE_PHASES[code] ?? ['DEV', 'PRE-PROD', 'SHOOT', 'POST']
      const activeMonths = months.filter(m => activePhases.includes(getMonthPhase(m, timeline)))
      const perMonth = activeMonths.length > 0 ? target / activeMonths.length : 0

      const monthly = months.map(m => {
        const overrideKey = `${code}_${m}`
        if (forecastOverrides[overrideKey] !== undefined) return forecastOverrides[overrideKey]
        return activeMonths.includes(m) ? Math.round(perMonth) : 0
      })

      // Absorb rounding into last active month without an override
      const lastFreeMonth = [...activeMonths].reverse().find(m => forecastOverrides[`${code}_${m}`] === undefined)
      if (lastFreeMonth !== undefined) {
        const idx = months.indexOf(lastFreeMonth)
        const sumExcludingLast = monthly.reduce((s, v, i) => i === idx ? s : s + v, 0)
        monthly[idx] = Math.max(0, Math.round(target - sumExcludingLast))
      }

      const rowTotal = monthly.reduce((s, v) => s + v, 0)
      return { code, name: dept.name, monthly, total: rowTotal }
    })
    .filter(Boolean) as { code: DeptCode; name: string; monthly: number[]; total: number }[]

  const totalReceiptsPerMonth = months.map(m =>
    installments.filter(i => i.month === m).reduce((sum, i) => sum + (i.percentage / 100) * project.totalBudget, 0)
  )
  const totalPaymentsPerMonth = months.map((_, i) =>
    deptRows.reduce((sum, d) => sum + d.monthly[i], 0)
  )
  const netPerMonth = months.map((_, i) => totalReceiptsPerMonth[i] - totalPaymentsPerMonth[i])

  const openingBalance: number[] = []
  const closingBalance: number[] = []
  months.forEach((_, i) => {
    const opening = i === 0 ? 0 : closingBalance[i - 1]
    openingBalance.push(opening)
    closingBalance.push(opening + netPerMonth[i])
  })

  const grandReceipts = totalReceiptsPerMonth.reduce((s, v) => s + v, 0)
  const grandPayments = totalPaymentsPerMonth.reduce((s, v) => s + v, 0)

  const finalBalance = closingBalance[closingBalance.length - 1] ?? 0
  const lowestBalance = Math.min(...closingBalance)

  const deficitMonths = months
    .map((m, i) => ({ m, i, label: getMonthLabel(m, timeline, project.startDate), phase: getMonthPhase(m, timeline), balance: closingBalance[i], spend: totalPaymentsPerMonth[i] }))
    .filter(d => d.balance < 0)

  const hasDeficit = deficitMonths.length > 0

  // Show deficit dialog when deficit first appears
  useEffect(() => {
    if (hasDeficit && project.totalBudget > 0) setDeficitDismissed(false)
  }, [hasDeficit])

  const COL_LABEL = 220
  const COL_MONTH = 100
  const COL_TOTAL = 120

  const stickyItem = {
    position: 'sticky' as const,
    left: 0,
    background: 'var(--bg2)',
    zIndex: 1,
    boxShadow: '4px 0 8px rgba(0,0,0,0.5)',
    borderRight: '1px solid var(--border)',
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Production Forecast</div>
        <div className="screen-sub">
          BC-style cashflow matrix. Click any department cell to override its monthly spend.
        </div>
        {Object.keys(forecastOverrides).length > 0 && (
          <button
            className="btn btn-sm"
            style={{ marginTop: 8, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' }}
            onClick={clearForecastOverrides}
          >
            Reset to Calculated Values
          </button>
        )}
      </div>

      <div className="summary-stats" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Receipts</div>
          <div className="stat-value" style={{ fontSize: 16, color: 'var(--green)' }}>{fmtN(grandReceipts, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Payments</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{fmtN(grandPayments, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Closing Balance</div>
          <div className="stat-value" style={{ fontSize: 16, color: finalBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmtN(finalBalance, cur, true)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Lowest Balance</div>
          <div className="stat-value" style={{ fontSize: 16, color: lowestBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmtN(lowestBalance, cur, true)}
          </div>
        </div>
      </div>

      {forecastLocked && (
        <div style={{ background: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13 }}>
            Schedule locked — changes on Assumptions will not overwrite this schedule.
          </span>
          <button
            className="btn btn-sm"
            style={{ background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', flexShrink: 0 }}
            onClick={() => setForecastLocked(false)}
          >
            Reset Lock
          </button>
        </div>
      )}

      {issues.map(issue => (
        <div key={issue.id} style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 10,
          background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>{issue.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{issue.description}</div>
          </div>
        </div>
      ))}

      {hasDeficit && (
        <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>
            ⚠ Cashflow deficit in {deficitMonths.length} month{deficitMonths.length > 1 ? 's' : ''} — {deficitMonths.map(d => d.label).join(', ')}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="btn btn-sm"
              style={{ background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' }}
              onClick={() => setDeficitDismissed(false)}
            >
              Details
            </button>
            <button
              className="btn btn-sm"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 }}
              onClick={() => {
                const suggested = suggestInstallmentTiming(installments, totalPaymentsPerMonth, project.totalBudget, timeline)
                setInstallments(suggested)
                setForecastLocked(true)
              }}
            >
              Apply Fix
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: COL_LABEL + months.length * COL_MONTH + COL_TOTAL, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ minWidth: COL_LABEL, textAlign: 'left', ...stickyItem, zIndex: 2 }}>Item</th>
                {months.map(m => (
                  <th key={m} style={{ minWidth: COL_MONTH, textAlign: 'right', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{getMonthPhase(m, timeline)}</div>
                    <div style={{ fontSize: 11 }}>{getMonthLabel(m, timeline, project.startDate)}</div>
                  </th>
                ))}
                <th style={{ minWidth: COL_TOTAL, textAlign: 'right', paddingRight: 8, color: 'var(--accent)' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {/* RECEIPTS */}
              <tr style={{ background: 'rgba(80,180,80,0.08)' }}>
                <td colSpan={months.length + 2} style={{ padding: '6px 12px', fontWeight: 700, fontSize: 11, letterSpacing: 1, color: 'var(--green)', textTransform: 'uppercase' }}>RECEIPTS / INCOME</td>
              </tr>
              {installments.map(inst => {
                const monthly = months.map(m => m === inst.month ? (inst.percentage / 100) * project.totalBudget : 0)
                return (
                  <tr key={inst.id}>
                    <td style={{ padding: '6px 12px', ...stickyItem }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{inst.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatPercent(inst.percentage)} — {inst.trigger}</div>
                    </td>
                    {monthly.map((v, i) => (
                      <td key={i} style={{ textAlign: 'right', paddingRight: 8, paddingTop: 6, paddingBottom: 6, color: v > 0 ? 'var(--green)' : 'var(--text3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {v > 0 ? fmtN(v, cur) : '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--green)', fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtN((inst.percentage / 100) * project.totalBudget, cur)}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ background: 'rgba(80,180,80,0.06)', borderTop: '1px solid rgba(80,180,80,0.3)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: 'var(--green)', ...stickyItem, background: 'rgba(20,40,20,0.97)' }}>TOTAL RECEIPTS</td>
                {totalReceiptsPerMonth.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, color: v > 0 ? 'var(--green)' : 'var(--text3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {v > 0 ? fmtN(v, cur) : '—'}
                  </td>
                ))}
                <td style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, color: 'var(--green)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtN(grandReceipts, cur)}</td>
              </tr>

              {/* PAYMENTS */}
              <tr style={{ background: 'rgba(245,100,80,0.06)' }}>
                <td colSpan={months.length + 2} style={{ padding: '6px 12px', fontWeight: 700, fontSize: 11, letterSpacing: 1, color: 'var(--red)', textTransform: 'uppercase' }}>PAYMENTS / EXPENDITURE</td>
              </tr>
              {deptRows.map(dept => (
                <tr key={dept.code}>
                  <td style={{ padding: '5px 12px', ...stickyItem }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--accent)', marginRight: 8, fontWeight: 700, fontSize: 12 }}>{dept.code}</span>
                    <span style={{ fontSize: 12 }}>{dept.name}</span>
                  </td>
                  {dept.monthly.map((v, i) => (
                    <td key={i} style={{ paddingRight: 8, paddingTop: 3, paddingBottom: 3 }}>
                      <EditableForecastCell
                        value={v}
                        cur={cur}
                        onSave={newVal => setForecastOverride(`${dept.code}_${months[i]}`, newVal)}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', paddingRight: 8, fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtN(dept.total, cur)}</td>
                </tr>
              ))}
              <tr style={{ background: 'rgba(245,100,80,0.06)', borderTop: '1px solid rgba(245,100,80,0.25)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: 'var(--red)', ...stickyItem, background: 'rgba(40,15,15,0.97)' }}>TOTAL PAYMENTS</td>
                {totalPaymentsPerMonth.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, color: v > 0 ? 'var(--text)' : 'var(--text3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {v > 0 ? fmtN(v, cur) : '—'}
                  </td>
                ))}
                <td style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtN(grandPayments, cur)}</td>
              </tr>

              {/* CASHFLOW */}
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, ...stickyItem }}>NET MONTHLY CASHFLOW</td>
                {netPerMonth.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text3)' }}>
                    {v !== 0 ? fmtN(v, cur, true) : '—'}
                  </td>
                ))}
                <td />
              </tr>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text2)', ...stickyItem }}>OPENING BALANCE</td>
                {openingBalance.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', paddingRight: 8, fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(v, cur, true)}</td>
                ))}
                <td />
              </tr>
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 13, ...stickyItem }}>CLOSING BALANCE</td>
                {closingBalance.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', paddingRight: 8, paddingTop: 8, paddingBottom: 8, fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: v >= 0 ? 'var(--green)' : 'var(--red)', background: v < 0 ? 'rgba(220,50,50,0.1)' : undefined }}>
                    {fmtN(v, cur, true)}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Installment schedule */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><span className="card-title">Funding Installment Schedule</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Label</th><th>Trigger / Milestone</th>
                <th className="td-num">%</th><th className="td-num">Amount ({cur})</th><th>Month</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((inst, i) => (
                <tr key={inst.id}>
                  <td className="td-mono">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{inst.label}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{inst.trigger}</td>
                  <td className="td-num">{formatPercent(inst.percentage)}</td>
                  <td className="td-num" style={{ color: 'var(--green)' }}>{fmtN((inst.percentage / 100) * project.totalBudget, cur)}</td>
                  <td style={{ fontSize: 12 }}>Month {inst.month} — {getMonthLabel(inst.month, timeline, project.startDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Deficit warning dialog ── */}
      {hasDeficit && !deficitDismissed && !showSuggestion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--red)', borderRadius: 10, padding: 28, maxWidth: 520, width: '92%', boxShadow: '0 8px 40px rgba(0,0,0,0.7)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>⚠ Cashflow Deficit Detected</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
              Based on your current installment schedule and projected spending, there are cash shortfalls in the following months:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {deficitMonths.map(d => (
                <div key={d.m} style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 6, padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                    {d.label} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({d.phase})</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Projected spend: <strong style={{ color: 'var(--text)' }}>{fmtN(d.spend, cur)}</strong>
                    {'  ·  '}Closing balance: <strong style={{ color: 'var(--red)' }}>{fmtN(d.balance, cur, true)}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>
              This means the production will run out of cash before receiving the next payment. You can either adjust your installment schedule in Assumptions, or edit the monthly figures in the forecast above.
            </div>
            <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 6, padding: '12px 14px', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', marginBottom: 4 }}>Would you like the app to suggest a better installment schedule?</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>The app will redistribute your existing payment percentages across months to eliminate deficits, keeping the same total amounts.</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeficitDismissed(true)}>No, I'll adjust manually</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const suggested = suggestInstallmentTiming(installments, totalPaymentsPerMonth, project.totalBudget, timeline)
                  setSuggestedSchedule(suggested)
                  setShowSuggestion(true)
                }}
              >
                Yes, suggest a schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Suggestion dialog ── */}
      {showSuggestion && suggestedSchedule && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10, padding: 28, maxWidth: 520, width: '92%', boxShadow: '0 8px 40px rgba(0,0,0,0.7)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>Suggested Installment Schedule</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              To eliminate the cashflow deficits, here is a revised payment schedule that front-loads receipts before periods of heavy spend:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {suggestedSchedule.map((inst, i) => {
                const orig = installments.find(o => o.id === inst.id)
                const changed = orig && orig.month !== inst.month
                return (
                  <div key={inst.id} style={{ background: changed ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${changed ? 'rgba(245,166,35,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{inst.label} ({formatPercent(inst.percentage)})</span>
                      {changed && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Month changed</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                      {changed ? (
                        <>
                          Move from <strong style={{ color: 'var(--text3)' }}>Month {orig?.month}</strong>
                          {' → '}
                          <strong style={{ color: 'var(--green)' }}>Month {inst.month}</strong>
                          {' — '}
                          {getMonthLabel(inst.month, timeline, project.startDate)}
                        </>
                      ) : (
                        <>Keep at Month {inst.month} — {getMonthLabel(inst.month, timeline, project.startDate)}</>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20 }}>
              Applying this will update your installment schedule. You can still adjust further in Assumptions.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setShowSuggestion(false); setDeficitDismissed(true) }}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setInstallments(suggestedSchedule)
                  setForecastLocked(true)
                  setShowSuggestion(false)
                  setDeficitDismissed(true)
                  setSuggestedSchedule(null)
                }}
              >
                Apply Suggested Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useBudgetStore } from '../store/budgetStore'
import type { Installment } from '../store/budgetStore'
import { formatCurrency } from '../utils/formatCurrency'
import { formatPercent } from '../utils/formatPercent'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface MonthData {
  month: number
  spend: number
  cumSpend: number
  cumIncome: number
  deficit: number
}

interface InstallmentRec {
  month: number
  pct: number
  amount: number
  reason: string
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function buildCashflow(
  forecastOverrides: Record<string, number>,
  totalMonths: number,
): number[] {
  return Array.from({ length: totalMonths }, (_, i) => {
    const m = i + 1
    return Object.entries(forecastOverrides)
      .filter(([k]) => k.endsWith(`_${m}`))
      .reduce((s, [, v]) => s + v, 0)
  })
}

function computeInstallmentPlan(
  monthlySpend: number[],
  totalBudget: number,
  count: number,
): { recs: InstallmentRec[]; deficitMonths: number[] } {
  if (totalBudget === 0 || monthlySpend.length === 0) return { recs: [], deficitMonths: [] }

  const cumSpend = monthlySpend.reduce<number[]>((acc, v, i) => {
    acc.push((acc[i - 1] || 0) + v)
    return acc
  }, [])

  const totalMonths = monthlySpend.length
  const recs: InstallmentRec[] = []
  let cumulativeIncome = 0
  const deficitMonths: number[] = []

  if (count === 1) {
    recs.push({
      month: 1,
      pct: 100,
      amount: totalBudget,
      reason: 'Full budget received upfront to cover all production phases.',
    })
    return { recs, deficitMonths }
  }

  // Step 1: find first month where cumulative spend exceeds 0 → first installment arrives just before
  const firstSpendMonth = monthlySpend.findIndex(v => v > 0)
  const inst1Month = Math.max(1, firstSpendMonth) // month before first spend

  // First installment covers spend up to the first peak + 10% buffer
  const peakMonth = Math.round(totalMonths * 0.4) // ~40% through production
  const coverThrough = Math.min(peakMonth, totalMonths - 1)
  const targetCover = cumSpend[coverThrough] * 1.10 // 10% buffer
  const inst1Pct = Math.min(50, Math.ceil((targetCover / totalBudget) * 100))

  recs.push({
    month: inst1Month,
    pct: inst1Pct,
    amount: Math.round((inst1Pct / 100) * totalBudget),
    reason: `Covers costs through Month ${coverThrough + 1} with 10% buffer, arriving before principal photography begins.`,
  })
  cumulativeIncome = (inst1Pct / 100) * totalBudget

  // Step 2: distribute remaining installments across the rest of the timeline
  let remainingPct = 100 - inst1Pct
  const remainingCount = count - 1

  // Divide the remaining timeline into equal segments
  const segmentSize = Math.ceil((totalMonths - inst1Month) / remainingCount)

  for (let i = 0; i < remainingCount; i++) {
    const isLast = i === remainingCount - 1
    const segStart = inst1Month + i * segmentSize
    const segEnd = Math.min(segStart + segmentSize - 1, totalMonths)
    const segSpend = monthlySpend.slice(segStart, segEnd).reduce((s, v) => s + v, 0)
    const phaseDesc = segStart < Math.round(totalMonths * 0.6)
      ? 'principal photography and crew costs'
      : 'post-production and delivery'

    const thisPct = isLast ? remainingPct : Math.min(remainingPct - (remainingCount - i - 1), Math.max(10, Math.ceil((segSpend / totalBudget) * 100 * 1.1)))
    remainingPct -= isLast ? remainingPct : thisPct

    recs.push({
      month: Math.max(segStart, inst1Month + 1),
      pct: thisPct,
      amount: Math.round((thisPct / 100) * totalBudget),
      reason: `Covers ${phaseDesc} in Months ${segStart}–${segEnd}.`,
    })
    cumulativeIncome += (thisPct / 100) * totalBudget
  }

  // Validate: adjust final installment so total = 100%
  const totalPct = recs.reduce((s, r) => s + r.pct, 0)
  if (totalPct !== 100 && recs.length > 0) {
    const last = recs[recs.length - 1]
    last.pct += 100 - totalPct
    last.amount = Math.round((last.pct / 100) * totalBudget)
  }

  // Detect remaining deficit months (if any)
  let income = 0
  for (let i = 0; i < totalMonths; i++) {
    const m = i + 1
    const instThisMonth = recs.filter(r => r.month === m).reduce((s, r) => s + r.amount, 0)
    income += instThisMonth
    if (income < cumSpend[i]) deficitMonths.push(m)
  }

  return { recs, deficitMonths }
}

// ─── SVG Cashflow Chart ────────────────────────────────────────────────────────

function CashflowChart({
  monthlySpend,
  recs,
  totalBudget,
  deficitMonths,
  currency,
}: {
  monthlySpend: number[]
  recs: InstallmentRec[]
  totalBudget: number
  deficitMonths: number[]
  currency: string
}) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const W = 520, H = 120, PAD = { l: 40, r: 10, t: 10, b: 24 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const n = monthlySpend.length

  const cumSpend = monthlySpend.reduce<number[]>((acc, v, i) => {
    acc.push((acc[i - 1] || 0) + v)
    return acc
  }, [])

  const cumIncome: number[] = []
  let income = 0
  for (let i = 0; i < n; i++) {
    const m = i + 1
    income += recs.filter(r => r.month === m).reduce((s, r) => s + r.amount, 0)
    cumIncome.push(income)
  }

  const maxVal = Math.max(...cumSpend, totalBudget, 1)
  const xOf = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * innerW
  const yOf = (v: number) => PAD.t + innerH - (v / maxVal) * innerH

  const spendPath = cumSpend.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`).join(' ')
  const incomePath = cumIncome.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {/* Deficit shading */}
      {deficitMonths.map(m => {
        const i = m - 1
        const x = xOf(i) - innerW / (2 * Math.max(n - 1, 1))
        return (
          <rect key={m} x={x} y={PAD.t} width={innerW / Math.max(n - 1, 1)} height={innerH}
            fill="rgba(240,96,96,0.12)" />
        )
      })}

      {/* Installment bars */}
      {recs.map((r, idx) => {
        const i = r.month - 1
        return (
          <line key={idx} x1={xOf(i)} y1={PAD.t} x2={xOf(i)} y2={PAD.t + innerH}
            stroke="rgba(62,207,142,0.4)" strokeWidth={2} strokeDasharray="4 2" />
        )
      })}

      {/* Income line (green) */}
      <path d={incomePath} fill="none" stroke="#3ecf8e" strokeWidth={1.5} />

      {/* Spend line (red/blue) */}
      <path d={spendPath} fill="none" stroke="#6b8cff" strokeWidth={1.5} />

      {/* Axes */}
      <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} stroke="#1e2540" strokeWidth={1} />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH} stroke="#1e2540" strokeWidth={1} />

      {/* Month labels */}
      {Array.from({ length: n }, (_, i) => i + 1).filter((_, i) => i % Math.max(1, Math.floor(n / 6)) === 0).map(m => (
        <text key={m} x={xOf(m - 1)} y={H - 4} textAnchor="middle" fontSize={8} fill="#4a5580">M{m}</text>
      ))}

      {/* Legend */}
      <line x1={PAD.l} y1={8} x2={PAD.l + 12} y2={8} stroke="#6b8cff" strokeWidth={1.5} />
      <text x={PAD.l + 15} y={11} fontSize={8} fill="#4a5580">Cumulative Spend</text>
      <line x1={PAD.l + 100} y1={8} x2={PAD.l + 112} y2={8} stroke="#3ecf8e" strokeWidth={1.5} />
      <text x={PAD.l + 115} y={11} fontSize={8} fill="#4a5580">Income (installments)</text>
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InstallmentAdvisor() {
  const store = useBudgetStore()
  const { forecastOverrides, project, timeline, installments, setInstallments, setForecastLocked } = store
  const currency = project.currency || 'NGN'
  const fmt = (n: number) => formatCurrency(n, currency)

  const totalMonths = (timeline.developmentMonths || 0) + (timeline.preProdMonths || 0) +
    (timeline.shootMonths || 0) + (timeline.postMonths || 0)

  const hasForecast = Object.keys(forecastOverrides).length > 0

  const [desiredCount, setDesiredCount] = useState(3)
  const [showAdvisor, setShowAdvisor] = useState(false)
  const [applied, setApplied] = useState(false)

  const monthlySpend = useMemo(() =>
    buildCashflow(forecastOverrides, Math.max(totalMonths, 1)),
    [forecastOverrides, totalMonths]
  )

  const { recs, deficitMonths } = useMemo(() =>
    computeInstallmentPlan(monthlySpend, project.totalBudget, Math.max(1, desiredCount)),
    [monthlySpend, project.totalBudget, desiredCount]
  )

  const totalRecPct = recs.reduce((s, r) => s + r.pct, 0)

  function applyPlan() {
    const newInstallments: Installment[] = recs.map((r, i) => ({
      id: uid(),
      label: `Installment ${i + 1}`,
      percentage: r.pct,
      trigger: `Month ${r.month}`,
      month: r.month,
    }))
    setInstallments(newInstallments)
    setForecastLocked(true)
    setApplied(true)
    setTimeout(() => setApplied(false), 3000)
  }

  if (!hasForecast) {
    return (
      <div style={{ padding: '16px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Installment Advisor</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Add cashflow projections to the Production Forecast tab first, then return here for intelligent installment recommendations.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setShowAdvisor(v => !v)}
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: showAdvisor ? '1px solid var(--border-default)' : 'none' }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Installment Advisor</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>
            {deficitMonths.length > 0
              ? `${deficitMonths.length} deficit month(s) detected`
              : 'Deficit-free plan available'}
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showAdvisor ? '▲' : '▼'}</span>
      </div>

      {showAdvisor && (
        <div style={{ padding: '16px 20px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-ghost)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Number of Installments</div>
              <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 7, overflow: 'hidden' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setDesiredCount(n)}
                    style={{ padding: '7px 14px', background: desiredCount === n ? 'var(--accent-blue)' : 'var(--bg-surface)', color: desiredCount === n ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
                  >{n}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Budget: <strong style={{ color: 'var(--text-primary)' }}>{fmt(project.totalBudget)}</strong>
              {' · '}{totalMonths} months
            </div>
          </div>

          {/* Recommendation table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr>
                {['#', 'Month', 'Percentage', 'Amount', 'Why this timing'].map(h => (
                  <th key={h} style={{ textAlign: h === '#' || h === 'Month' || h === 'Percentage' ? 'center' : 'left', padding: '6px 10px', color: 'var(--text-ghost)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recs.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>Month {r.month}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>{formatPercent(r.pct)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{r.reason}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border-default)' }}>
                <td colSpan={2} style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>TOTAL</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: totalRecPct === 100 ? 'var(--accent-green)' : 'var(--accent-amber)', fontVariantNumeric: 'tabular-nums' }}>{formatPercent(totalRecPct)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(recs.reduce((s, r) => s + r.amount, 0))}</td>
                <td style={{ padding: '8px 10px', fontSize: 11, color: totalRecPct === 100 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                  {totalRecPct === 100 ? '✓ All deficits eliminated' : `⚠ ${formatPercent(100 - totalRecPct)} unallocated`}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Cashflow chart */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-ghost)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Cashflow Projection</div>
            <CashflowChart
              monthlySpend={monthlySpend}
              recs={recs}
              totalBudget={project.totalBudget}
              deficitMonths={deficitMonths}
              currency={currency}
            />
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-ghost)' }}>
              <span>— Blue: Cumulative spend</span>
              <span>— Green: Cumulative income</span>
              {deficitMonths.length > 0 && <span style={{ color: 'var(--accent-red)' }}>■ Deficit months (shaded)</span>}
              <span>| Green dashes: Installment receipt</span>
            </div>
          </div>

          {deficitMonths.length > 0 && (
            <div style={{ background: 'rgba(240,96,96,0.06)', border: '1px solid rgba(240,96,96,0.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: 'var(--accent-red)' }}>
              ⚠ {deficitMonths.length} deficit month(s) remain: Month{deficitMonths.length > 1 ? 's' : ''} {deficitMonths.join(', ')}. Consider increasing the installment count.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={applyPlan}
              style={{ padding: '10px 20px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {applied ? '✓ Applied' : 'Apply This Schedule'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              Writes to Installments in Assumptions · locks Production Forecast
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

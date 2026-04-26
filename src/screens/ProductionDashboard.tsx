import { useMemo } from 'react'
import { useBudgetStore } from '../store/budgetStore'
import { formatCurrency } from '../utils/formatCurrency'
import { formatPercent } from '../utils/formatPercent'
import { deriveProductionStats } from '../utils/deriveProductionStats'
import { derivePhaseLabel } from '../utils/derivePhaseLabel'
import { deriveNextMilestone } from '../utils/deriveNextMilestone'
import IdentityStrip from '../components/production/IdentityStrip'
import KpiRow from '../components/production/KpiRow'
import DeficitAlertBar from '../components/production/DeficitAlertBar'
import DeptBarChart from '../components/production/DeptBarChart'
import ShootProgressBlock from '../components/production/ShootProgressBlock'
import DeptStatusTable from '../components/production/DeptStatusTable'

const DEPT_COLORS = [
  '#a78bfa', '#22c98a', '#f59e0b', '#3b82f6', '#f05a5a',
  '#1ccfaf', '#8b5cf6', '#ec4899', '#10b981', '#f97316',
]

function CashflowChart({ totalBudget, installments, startDate, timeline, currency }: {
  totalBudget: number
  installments: { percentage: number; month: number }[]
  startDate: string
  timeline: { developmentMonths: number; preProdMonths: number; shootMonths: number; postMonths: number }
  currency: string
}) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const totalMonths = (timeline.developmentMonths || 0) + (timeline.preProdMonths || 0) + (timeline.shootMonths || 0) + (timeline.postMonths || 0)
  if (totalMonths < 1 || totalBudget <= 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '24px 0', textAlign: 'center' }}>No timeline set — cashflow unavailable.</div>
  }

  const monthlySpend = totalBudget / totalMonths
  const W = 480, H = 120, padL = 8, padR = 8, padT = 12, padB = 24
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const barW = Math.max(4, chartW / totalMonths - 3)

  // Build month labels from startDate
  const baseDate = startDate ? new Date(startDate) : new Date()
  const months: string[] = []
  for (let i = 0; i < totalMonths; i++) {
    const d = new Date(baseDate)
    d.setMonth(d.getMonth() + i)
    months.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }))
  }

  // Installment income per month (1-indexed months → 0-indexed)
  const incomeByMonth: Record<number, number> = {}
  installments.forEach(inst => {
    const m = inst.month - 1 // 0-indexed
    if (m >= 0 && m < totalMonths) {
      incomeByMonth[m] = (incomeByMonth[m] || 0) + (totalBudget * inst.percentage / 100)
    }
  })

  // Cumulative spend and income
  let cumSpend = 0
  let cumIncome = 0
  const spendPoints: { x: number; y: number; val: number }[] = []
  const incomePoints: { x: number; y: number; val: number }[] = []
  const maxVal = totalBudget

  for (let i = 0; i < totalMonths; i++) {
    cumSpend += monthlySpend
    cumIncome += (incomeByMonth[i] || 0)
    const x = padL + (i / totalMonths) * chartW + barW / 2
    spendPoints.push({ x, y: padT + chartH - (cumSpend / maxVal) * chartH, val: cumSpend })
    incomePoints.push({ x, y: padT + chartH - (cumIncome / maxVal) * chartH, val: cumIncome })
  }

  const spendPath = spendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const incomePath = incomePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  // Show only a few month labels
  const labelStep = Math.ceil(totalMonths / 6)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line
            key={t}
            x1={padL} y1={padT + chartH - t * chartH}
            x2={W - padR} y2={padT + chartH - t * chartH}
            stroke="var(--border-subtle)" strokeWidth={0.5}
          />
        ))}

        {/* Spend area fill */}
        <path
          d={`${spendPath} L${spendPoints[spendPoints.length - 1].x},${padT + chartH} L${spendPoints[0].x},${padT + chartH} Z`}
          fill="rgba(167,139,250,0.08)"
        />

        {/* Spend line */}
        <path d={spendPath} fill="none" stroke="var(--accent-purple)" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Income line */}
        <path d={incomePath} fill="none" stroke="var(--accent-green)" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="4 2" />

        {/* Installment verticals */}
        {Object.keys(incomeByMonth).map(mi => {
          const i = parseInt(mi)
          const x = padL + (i / totalMonths) * chartW + barW / 2
          return (
            <line key={i} x1={x} y1={padT} x2={x} y2={padT + chartH}
              stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
          )
        })}

        {/* Month labels */}
        {months.map((label, i) => i % labelStep === 0 ? (
          <text key={i}
            x={padL + (i / totalMonths) * chartW + barW / 2}
            y={H - 6}
            fontSize={7} fill="var(--text-ghost)" textAnchor="middle"
          >{label}</text>
        ) : null)}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <div style={{ width: 16, height: 2, background: 'var(--accent-purple)', borderRadius: 1 }} />
          Cum. Spend
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <div style={{ width: 16, height: 2, background: 'var(--accent-green)', borderRadius: 1 }} />
          Cum. Income
        </div>
        {installments.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {installments.length} installment{installments.length > 1 ? 's' : ''} · {fmt(totalBudget)}
          </div>
        )}
      </div>
    </div>
  )
}

function SpendByCategoryPanel({ deptRows, currency }: {
  deptRows: { code: string; name: string; budgeted: number; spent: number }[]
  currency: string
}) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const sorted = [...deptRows].filter(d => d.budgeted > 0).sort((a, b) => b.budgeted - a.budgeted).slice(0, 7)
  const maxBudget = sorted[0]?.budgeted || 1

  if (sorted.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '24px 0', textAlign: 'center' }}>No department allocations set.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((d, i) => {
        const color = DEPT_COLORS[i % DEPT_COLORS.length]
        const budgetWidth = (d.budgeted / maxBudget) * 100
        const spentWidth = d.budgeted > 0 ? Math.min(100, (d.spent / d.budgeted) * budgetWidth) : 0
        return (
          <div key={d.code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{d.name}</span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.budgeted)}</span>
            </div>
            <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${budgetWidth}%`, background: `${color}30`, borderRadius: 3, position: 'relative' }}>
                {spentWidth > 0 && (
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${(spentWidth / budgetWidth) * 100}%`, background: color, borderRadius: 3 }} />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ProductionDashboard() {
  const store = useBudgetStore()
  const { project, timeline, installments, expenditureDeductions } = store

  const currency = project.currency || 'NGN'
  const fmt = (n: number) => formatCurrency(n, currency)

  const stats = useMemo(() => deriveProductionStats(store), [store])
  const phase = useMemo(() => derivePhaseLabel(project.startDate, timeline), [project.startDate, timeline])
  const nextMilestone = useMemo(() => deriveNextMilestone(project.startDate, timeline, installments), [project.startDate, timeline, installments])

  if (!stats.hasData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
        <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '48px 56px', maxWidth: 420 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No Project Loaded</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>Load or create a project to see your Production Dashboard.</div>
        </div>
      </div>
    )
  }

  const { totalBudget, totalSpent, remaining, usedPct, deptRows, recentDeductions, unsignedOldSchedules, prodNotices } = stats

  const alertDepts = deptRows.filter(d => d.status === 'AT RISK' || d.status === 'OVER BUDGET')

  // KPI stripe + badge logic
  const spentStripe = usedPct > 90 ? 'var(--accent-red)' : usedPct > 70 ? 'var(--accent-amber)' : 'var(--accent-green)'
  const spentBadgeVariant: 'green' | 'amber' | 'red' = usedPct > 90 ? 'red' : usedPct > 70 ? 'amber' : 'green'
  const spentBadgeText = usedPct > 90 ? 'Critical' : usedPct > 70 ? 'Watch' : expenditureDeductions.length === 0 ? 'No Spend' : 'Healthy'

  const remainingStripe = remaining < 0 ? 'var(--accent-red)' : remaining < totalBudget * 0.1 ? 'var(--accent-amber)' : 'var(--accent-green)'
  const remainingBadge: { text: string; variant: 'green' | 'amber' | 'red' } = remaining < 0
    ? { text: 'Over Budget', variant: 'red' }
    : remaining < totalBudget * 0.1
    ? { text: 'Low', variant: 'amber' }
    : { text: 'Available', variant: 'green' }

  const kpiItems = [
    {
      label: 'Total Budget',
      value: fmt(totalBudget),
      sub: 'Approved',
      stripeColor: 'var(--accent-purple)',
      badge: { text: 'Budget', variant: 'purple' as const },
    },
    {
      label: 'Total Spent',
      value: fmt(totalSpent),
      stripeColor: spentStripe,
      badge: { text: spentBadgeText, variant: spentBadgeVariant },
    },
    {
      label: 'Remaining',
      value: fmt(remaining),
      stripeColor: remainingStripe,
      badge: remainingBadge,
    },
    {
      label: 'Budget Used',
      value: formatPercent(usedPct),
      sub: `${formatPercent(100 - usedPct)} remaining`,
      progress: usedPct,
      stripeColor: spentStripe,
    },
  ]

  return (
    <div className="prod-screen">

      {/* A. Identity Strip */}
      <IdentityStrip
        title={project.title}
        company={project.company}
        totalBudget={totalBudget}
        currency={currency}
        phase={phase}
        location={project.location}
        exchangeRate={project.exchangeRate}
        projectCurrency={project.currency}
      />

      {/* B. KPI Row */}
      <KpiRow items={kpiItems} />

      {/* C. Two-col: Spend vs Budget chart | Spend by Category */}
      <div className="prod-middle-row">
        <div className="prod-panel" style={{ flex: '3 1 0' }}>
          <div className="prod-panel-label">Spend vs Budget — By Department</div>
          {deptRows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '20px 0' }}>No department allocations set.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DeptBarChart depts={deptRows.map(d => ({ name: d.code, budgeted: d.budgeted, spent: d.spent }))} />
            </div>
          )}
        </div>

        <div className="prod-panel" style={{ flex: '2 1 0' }}>
          <div className="prod-panel-label">Budget Allocation</div>
          <SpendByCategoryPanel deptRows={deptRows} currency={currency} />
        </div>
      </div>

      {/* D. Two-col: Cashflow chart | Recent Transactions */}
      <div className="prod-middle-row">
        <div className="prod-panel" style={{ flex: '3 1 0' }}>
          <div className="prod-panel-label">Cashflow Projection</div>
          <CashflowChart
            totalBudget={totalBudget}
            installments={installments}
            startDate={project.startDate}
            timeline={timeline}
            currency={currency}
          />
        </div>

        <div className="prod-panel" style={{ flex: '2 1 0' }}>
          <div className="prod-panel-label">Recent Transactions</div>
          {recentDeductions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '8px 0' }}>No signed payment schedules yet.</div>
          ) : (
            recentDeductions.map((d, i) => (
              <div key={i} className="prod-txn-row" style={{ borderBottom: i < recentDeductions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{d.scheduleNumber}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>
                    {d.department} · {new Date(d.approvedAt).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(d.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* E. Shoot Progress */}
      <div className="prod-middle-row">
        <ShootProgressBlock
          shootDays={project.shootDays}
          location={project.location}
          startDate={project.startDate}
          nextMilestone={nextMilestone}
        />

        {/* Alerts */}
        <DeficitAlertBar
          unsignedCount={unsignedOldSchedules.length}
          atRiskDepts={alertDepts}
          currency={currency}
          prodNotices={prodNotices}
        />
      </div>

      {/* F. Department Status Table */}
      <DeptStatusTable deptRows={deptRows} currency={currency} />

    </div>
  )
}

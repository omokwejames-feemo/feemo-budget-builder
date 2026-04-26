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

function SpendByCategoryPanel({ deptRows }: {
  deptRows: { code: string; name: string; budgeted: number; spent: number }[]
}) {
  const totalBudget = deptRows.reduce((s, d) => s + d.budgeted, 0) || 1
  const sorted = [...deptRows].filter(d => d.budgeted > 0).sort((a, b) => b.budgeted - a.budgeted).slice(0, 6)
  const maxPct = (sorted[0]?.budgeted / totalBudget) * 100 || 1

  if (sorted.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '20px', textAlign: 'center' }}>No department allocations set.</div>
  }

  return (
    <>
      {sorted.map((d, i) => {
        const color = DEPT_COLORS[i % DEPT_COLORS.length]
        const pct = (d.budgeted / totalBudget) * 100
        const barWidth = (pct / maxPct) * 100
        return (
          <div key={d.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
            <div style={{ width: 60, height: 4, background: 'var(--border-subtle)', borderRadius: 100, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${barWidth}%`, background: color, borderRadius: 100 }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', width: 32, textAlign: 'right', flexShrink: 0 }}>{Math.round(pct)}%</div>
          </div>
        )
      })}
    </>
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
      badge: { text: 'Feature Film', variant: 'purple' as const },
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
      label: 'Shoot Days',
      value: `${project.shootDays ?? 0} days`,
      stripeColor: 'var(--accent-amber)',
      badge: { text: phase?.label || 'Pre-prod phase', variant: 'purple' as const },
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

      {/* C. Two-col: Budget by Department (list) | Spend by Category */}
      <div className="prod-middle-row">

        {/* Budget by Department — list style matching mockup */}
        <div className="prod-panel" style={{ flex: '3 1 0', padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Budget by Department</div>
              <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 2 }}>Spend vs allocation per dept</div>
            </div>
          </div>
          {deptRows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '20px' }}>No department allocations set.</div>
          ) : (
            deptRows.slice(0, 6).map(d => {
              const pct = d.budgeted > 0 ? Math.min(100, (d.spent / d.budgeted) * 100) : 0
              const barColor = d.status === 'OVER BUDGET' ? 'var(--accent-red)' : d.status === 'AT RISK' ? 'var(--accent-amber)' : 'var(--accent-green)'
              const chipBg = d.status === 'OVER BUDGET' ? 'rgba(240,90,90,0.1)' : d.status === 'AT RISK' ? 'rgba(245,158,11,0.1)' : 'rgba(34,201,138,0.1)'
              const chipColor = d.status === 'OVER BUDGET' ? 'var(--accent-red)' : d.status === 'AT RISK' ? 'var(--accent-amber)' : 'var(--accent-green)'
              const chipText = d.status === 'OVER BUDGET' ? 'Over budget' : d.status === 'AT RISK' ? 'Almost reached' : 'On track'
              return (
                <div key={d.code} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.code} · {d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{fmt(d.spent)} / {fmt(d.budgeted)}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: chipBg, color: chipColor, letterSpacing: '0.04em' }}>{chipText}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 100 }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="prod-panel" style={{ flex: '2 1 0', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Spend by Category</div>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 2 }}>Of total spent {fmt(totalSpent)}</div>
          </div>
          <div style={{ paddingBottom: 8 }}>
            <SpendByCategoryPanel deptRows={deptRows} />
          </div>
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

        <div className="prod-panel" style={{ flex: '2 1 0', padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Payments</div>
              <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 2 }}>Last signed schedules</div>
            </div>
          </div>
          {recentDeductions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '20px' }}>No signed payment schedules yet.</div>
          ) : (
            recentDeductions.map((d, i) => {
              const iconBg = i % 3 === 0 ? 'rgba(167,139,250,0.12)' : i % 3 === 1 ? 'rgba(34,201,138,0.1)' : 'rgba(245,158,11,0.1)'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📋</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.scheduleNumber} · {d.department}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 1 }}>Signed · {new Date(d.approvedAt).toLocaleDateString('en-GB')}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-red)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>−{fmt(d.amount)}</div>
                </div>
              )
            })
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

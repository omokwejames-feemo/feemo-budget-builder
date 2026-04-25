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

  const kpiItems = [
    { label: 'Total Budget', value: fmt(totalBudget), sub: 'Approved' },
    {
      label: 'Total Spent',
      value: fmt(totalSpent),
      sub: expenditureDeductions.length === 0 ? 'No signed schedules yet' : `${expenditureDeductions.length} schedule(s) processed`,
    },
    {
      label: 'Remaining Budget',
      value: fmt(remaining),
      sub: remaining < 0 ? 'Over budget' : 'Available',
    },
    {
      label: 'Budget Used',
      value: formatPercent(usedPct),
      sub: `${formatPercent(100 - usedPct)} remaining`,
      progress: usedPct,
    },
  ]

  const alertDepts = deptRows.filter(d => d.status === 'AT RISK' || d.status === 'OVER BUDGET')

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

      {/* Middle row: bar chart + shoot progress */}
      <div className="prod-middle-row">

        {/* C. Spend vs Budget chart */}
        <div className="prod-panel">
          <div className="prod-panel-label">Spend vs Budget — By Department</div>
          {deptRows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '20px 0' }}>No department allocations set.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DeptBarChart depts={deptRows.map(d => ({ name: d.code, budgeted: d.budgeted, spent: d.spent }))} />
            </div>
          )}
        </div>

        {/* E. Shoot Progress */}
        <ShootProgressBlock
          shootDays={project.shootDays}
          location={project.location}
          startDate={project.startDate}
          nextMilestone={nextMilestone}
        />
      </div>

      {/* F. Department Status Table */}
      <DeptStatusTable deptRows={deptRows} currency={currency} />

      {/* Bottom row: recent transactions + alerts */}
      <div className="prod-bottom-row">

        {/* G. Recent Transactions */}
        <div className="prod-panel">
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

        {/* H. Alerts */}
        <DeficitAlertBar
          unsignedCount={unsignedOldSchedules.length}
          atRiskDepts={alertDepts}
          currency={currency}
          prodNotices={prodNotices}
        />
      </div>
    </div>
  )
}

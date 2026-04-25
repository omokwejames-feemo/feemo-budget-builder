import { useMemo } from 'react'
import { useBudgetStore, DEPARTMENTS, getDeptTarget } from '../store/budgetStore'
import type { DeptCode } from '../store/budgetStore'
import { formatCurrency } from '../utils/formatCurrency'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivePhase(startDate: string, timeline: { preProdMonths: number; shootMonths: number }): string {
  if (!startDate) return 'Pre-Production'
  const start = new Date(startDate)
  const now = new Date()
  const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (monthsElapsed < 0) return 'Pre-Production'
  if (monthsElapsed < timeline.preProdMonths) return 'Pre-Production'
  if (monthsElapsed < timeline.preProdMonths + timeline.shootMonths) return 'Principal Photography'
  return 'Post-Production'
}

function phaseColor(phase: string) {
  if (phase === 'Principal Photography') return 'var(--accent-green)'
  if (phase === 'Post-Production') return 'var(--accent-blue)'
  return 'var(--accent-amber)'
}

function statusLabel(budgeted: number, spent: number): { label: string; color: string } {
  if (budgeted <= 0) return { label: 'NO BUDGET', color: 'var(--text-ghost)' }
  const remaining = budgeted - spent
  const pct = remaining / budgeted
  if (spent > budgeted) return { label: 'OVER BUDGET', color: 'var(--accent-red)' }
  if (pct <= 0.15) return { label: 'AT RISK', color: 'var(--accent-amber)' }
  return { label: 'ON TRACK', color: 'var(--accent-green)' }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, progress }: { label: string; value: string; sub?: string; progress?: number }) {
  const color = progress === undefined ? 'var(--accent-blue)'
    : progress < 70 ? 'var(--accent-green)'
    : progress < 90 ? 'var(--accent-amber)'
    : 'var(--accent-red)'

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '18px 20px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
      {progress !== undefined && (
        <div style={{ marginTop: 10, height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, progress)}%`, background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      )}
    </div>
  )
}

// ─── Horizontal bar chart (SVG) ───────────────────────────────────────────────

function DeptBarChart({ depts }: { depts: { name: string; budgeted: number; spent: number }[] }) {
  const maxVal = Math.max(...depts.flatMap(d => [d.budgeted, d.spent]), 1)
  const barH = 14
  const gap = 4
  const rowH = barH * 2 + gap + 20
  const labelW = 140
  const chartW = 340

  return (
    <svg width={labelW + chartW + 40} height={depts.length * rowH + 10} style={{ fontFamily: 'var(--font-ui)', overflow: 'visible' }}>
      {depts.map((d, i) => {
        const y = i * rowH
        const bW = (d.budgeted / maxVal) * chartW
        const sW = (d.spent / maxVal) * chartW
        const { color: sColor } = statusLabel(d.budgeted, d.spent)
        return (
          <g key={d.name}>
            <text x={labelW - 6} y={y + barH} textAnchor="end" fontSize={9} fill="var(--text-muted)" dominantBaseline="middle">{d.name}</text>
            {/* Budgeted bar */}
            <rect x={labelW} y={y} width={Math.max(bW, 2)} height={barH} rx={2} fill="var(--border-default)" />
            {/* Spent bar */}
            <rect x={labelW} y={y + barH + gap} width={Math.max(sW, 2)} height={barH} rx={2} fill={sColor} opacity={0.8} />
          </g>
        )
      })}
      {/* Legend */}
      <rect x={labelW} y={depts.length * rowH - 4} width={12} height={8} rx={1} fill="var(--border-default)" />
      <text x={labelW + 16} y={depts.length * rowH} fontSize={9} fill="var(--text-ghost)" dominantBaseline="middle">Budgeted</text>
      <rect x={labelW + 72} y={depts.length * rowH - 4} width={12} height={8} rx={1} fill="var(--accent-green)" opacity={0.8} />
      <text x={labelW + 88} y={depts.length * rowH} fontSize={9} fill="var(--text-ghost)" dominantBaseline="middle">Spent</text>
    </svg>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProductionDashboard() {
  const store = useBudgetStore()
  const { project, timeline, lineItems, expenditureDeductions, paymentSchedules, notices } = store

  const currency = project.currency || 'NGN'
  const fmt = (n: number) => formatCurrency(n, currency)

  const hasProject = !!project.title || project.totalBudget > 0

  // ── Compute totals ───────────────────────────────────────────────────────────

  const totalBudget = project.totalBudget

  const totalSpent = useMemo(
    () => expenditureDeductions.reduce((s, d) => s + d.amount, 0),
    [expenditureDeductions]
  )

  const remaining = totalBudget - totalSpent
  const usedPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  const phase = derivePhase(project.startDate, timeline)

  // ── Per-dept data ────────────────────────────────────────────────────────────

  const deptRows = useMemo(() => {
    return DEPARTMENTS.map(dept => {
      const budgeted = getDeptTarget(dept.code as DeptCode, store)
      const spent = expenditureDeductions
        .filter(d => d.budgetCode === dept.code)
        .reduce((s, d) => s + d.amount, 0)
      const deptRemaining = budgeted - spent
      const { label: status, color: statusColor } = statusLabel(budgeted, spent)
      return { code: dept.code, name: dept.name, budgeted, spent, remaining: deptRemaining, status, statusColor }
    }).filter(d => d.budgeted > 0 || d.spent > 0)
  }, [store, expenditureDeductions])

  // ── Recent transactions ──────────────────────────────────────────────────────

  const recentDeductions = useMemo(() => {
    return [...expenditureDeductions]
      .sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime())
      .slice(0, 5)
  }, [expenditureDeductions])

  // ── Production-relevant notices ──────────────────────────────────────────────

  const prodNotices = useMemo(
    () => notices.filter(n => !n.dismissed && (n.type === 'conflict' || n.type === 'info')).slice(0, 5),
    [notices]
  )

  // ── Unsigned schedules > 48 hours ────────────────────────────────────────────

  const unsignedOld = useMemo(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    return paymentSchedules.filter(s => s.status === 'draft' && new Date(s.createdAt).getTime() < cutoff)
  }, [paymentSchedules])

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!hasProject) {
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

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── A. Project Identity Strip ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '22px 28px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.2 }}>
            Production Dashboard — {project.title || 'Untitled Project'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            {project.company}{project.company && ' · '}
            {fmt(totalBudget)} approved budget
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '4px 12px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: phaseColor(phase) }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: phaseColor(phase), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{phase}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {project.location && <div>{project.location}</div>}
          {project.currency !== 'NGN' && project.currency !== '₦' && project.exchangeRate > 0 && (
            <div>1 {project.currency} = ₦{project.exchangeRate.toLocaleString()}</div>
          )}
        </div>
      </div>

      {/* ── B. Budget Health KPI Row ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard label="Total Budget" value={fmt(totalBudget)} sub="Approved" />
        <KpiCard
          label="Total Spent"
          value={fmt(totalSpent)}
          sub={expenditureDeductions.length === 0 ? 'No signed schedules yet' : `${expenditureDeductions.length} schedule(s) processed`}
        />
        <KpiCard
          label="Remaining Budget"
          value={fmt(remaining)}
          sub={remaining < 0 ? 'Over budget' : 'Available'}
        />
        <KpiCard
          label="Budget Used"
          value={`${usedPct.toFixed(1)}%`}
          sub={`${(100 - usedPct).toFixed(1)}% remaining`}
          progress={usedPct}
        />
      </div>

      {/* ── Middle row: bar chart + shoot progress ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 20, alignItems: 'start' }}>

        {/* ── C. Spend vs Budget — Dept Bar Chart ────────────────────────────── */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Spend vs Budget — By Department</div>
          {deptRows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '20px 0' }}>No department allocations set.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DeptBarChart depts={deptRows.map(d => ({ name: d.code, budgeted: d.budgeted, spent: d.spent }))} />
            </div>
          )}
        </div>

        {/* ── E. Shoot Progress Block ───────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Shoot Progress</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Shoot Days</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {project.shootDays > 0 ? `${project.shootDays}d` : '—'}
            </div>
            {project.shootDays > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Total scheduled shoot days</div>
            )}
          </div>

          {project.location && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Primary Location</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{project.location}</div>
            </div>
          )}

          {project.startDate && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Production Start</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {new Date(project.startDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── F. Department Status Table ────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '20px 22px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Department Status</div>
        {deptRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '8px 0' }}>No department data available.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Department', 'Budget', 'Spent', 'Remaining', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Department' || h === 'Status' ? 'left' : 'right', padding: '6px 10px', color: 'var(--text-ghost)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deptRows.map((d, i) => (
                <tr key={d.code} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: 6 }}>{d.code}</span>
                    {d.name}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.budgeted)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.spent)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: d.remaining < 0 ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: d.remaining < 0 ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                    {d.remaining < 0 ? `-${fmt(Math.abs(d.remaining))}` : fmt(d.remaining)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: d.statusColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Bottom row: recent transactions + notices ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── G. Recent Transactions Panel ────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Recent Transactions</div>
          {recentDeductions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '8px 0' }}>No signed payment schedules yet.</div>
          ) : (
            <>
              {recentDeductions.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < recentDeductions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
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
              ))}
            </>
          )}
        </div>

        {/* ── H. Notices / Alerts Panel ───────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Alerts</div>

          {unsignedOld.length > 0 && (
            <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>⚠</span>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {unsignedOld.length} unsigned schedule{unsignedOld.length > 1 ? 's' : ''} pending for over 48 hours
              </div>
            </div>
          )}

          {deptRows.filter(d => d.status === 'AT RISK' || d.status === 'OVER BUDGET').map(d => (
            <div key={d.code} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: d.status === 'OVER BUDGET' ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.08)', border: `1px solid ${d.status === 'OVER BUDGET' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)'}`, borderRadius: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{d.status === 'OVER BUDGET' ? '🔴' : '🟡'}</span>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>{d.code}</strong> — {d.name}: {d.status.toLowerCase()}
                {d.remaining < 0 && ` (${fmt(Math.abs(d.remaining))} over)`}
              </div>
            </div>
          ))}

          {prodNotices.map(n => (
            <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>ℹ</span>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.message}</div>
            </div>
          ))}

          {unsignedOld.length === 0 && deptRows.filter(d => d.status !== 'ON TRACK' && d.status !== 'NO BUDGET').length === 0 && prodNotices.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-ghost)', padding: '8px 0' }}>No active alerts.</div>
          )}
        </div>
      </div>
    </div>
  )
}

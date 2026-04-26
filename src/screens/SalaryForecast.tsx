import { useState } from 'react'
import {
  useBudgetStore, DEPARTMENTS, DeptCode, SalaryRole,
  getTotalMonths, getMonthLabel, getMonthPhase, getDeptTarget, getDeptBudget,
  DEPT_ACTIVE_PHASES
} from '../store/budgetStore'
import { formatCurrency } from '../utils/formatCurrency'

let rid = 2000
function newRoleId() { return String(++rid) }

function fmt(n: number, cur = 'NGN') {
  if (!n) return '—'
  return formatCurrency(n, cur)
}

const PHASES = ['dev', 'pre', 'shoot', 'post', 'all'] as const

function phaseForMonth(monthIndex: number, timeline: import('../store/budgetStore').Timeline): 'dev' | 'pre' | 'shoot' | 'post' {
  const { developmentMonths, preProdMonths, shootMonths } = timeline
  if (monthIndex <= developmentMonths) return 'dev'
  if (monthIndex <= developmentMonths + preProdMonths) return 'pre'
  if (monthIndex <= developmentMonths + preProdMonths + shootMonths) return 'shoot'
  return 'post'
}

function isPhaseActive(role: SalaryRole, monthPhase: 'dev' | 'pre' | 'shoot' | 'post'): boolean {
  if (role.phase === 'all') return true
  if (role.phase === 'dev') return monthPhase === 'dev'
  if (role.phase === 'pre') return monthPhase === 'pre'
  if (role.phase === 'shoot') return monthPhase === 'shoot'
  if (role.phase === 'post') return monthPhase === 'post'
  return false
}

const PHASE_MAP: Record<string, SalaryRole['phase']> = {
  'DEV': 'dev', 'PRE-PROD': 'pre', 'SHOOT': 'shoot', 'POST': 'post',
}

export default function SalaryForecast() {
  const store = useBudgetStore()
  const { timeline, project, salaryRoles, addSalaryRole, updateSalaryRole, removeSalaryRole, setSalaryRoles } = store
  const totalMonths = getTotalMonths(timeline)
  const cur = project.currency || 'N'
  const months = Array.from({ length: totalMonths }, (_, i) => i + 1)

  const [filterDept, setFilterDept] = useState<DeptCode | 'all'>('all')
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)

  function buildSyncedRoles(): SalaryRole[] {
    const newRoles: SalaryRole[] = []
    DEPARTMENTS.forEach(dept => {
      const code = dept.code as DeptCode
      const items = store.lineItems[code] || []
      if (items.length === 0) return

      if (getDeptTarget(code, store) <= 0) return  // skip depts the user has excluded (0% alloc)

      const activePhaseLabels = DEPT_ACTIVE_PHASES[code] ?? ['DEV', 'PRE-PROD', 'SHOOT', 'POST']
      const activeMonths = months.filter(m =>
        activePhaseLabels.includes(getMonthPhase(m, timeline))
      )
      if (activeMonths.length === 0) return

      const rolePhase: SalaryRole['phase'] =
        activePhaseLabels.length === 1
          ? (PHASE_MAP[activePhaseLabels[0]] ?? 'all')
          : 'all'

      items.forEach((item, idx) => {
        const total = (item.no ?? 1) * (item.qty ?? 0) * (item.rate ?? 0)
        if (total === 0) return
        const perMonth = Math.round(total / activeMonths.length)
        const monthlyAmounts: Record<number, number> = {}
        activeMonths.forEach((m, i) => {
          monthlyAmounts[m] = i === activeMonths.length - 1
            ? total - perMonth * (activeMonths.length - 1)
            : perMonth
        })
        newRoles.push({
          id: `sync_${code}_${item.id}`,
          schedNo: item.schedNo || `${code}${idx + 1}`,
          role: item.detail,
          deptCode: code,
          phase: rolePhase,
          monthlyAmounts,
        })
      })
    })
    return newRoles
  }

  function applySync() {
    setSalaryRoles(buildSyncedRoles())
    setShowSyncConfirm(false)
  }

  function addRole() {
    addSalaryRole({
      id: newRoleId(),
      schedNo: `${salaryRoles.length + 1}`,
      role: '',
      deptCode: 'A',
      phase: 'all',
      monthlyAmounts: {},
    })
  }

  const visibleRoles = filterDept === 'all' ? salaryRoles : salaryRoles.filter(r => r.deptCode === filterDept)

  const monthlyTotals = months.map(m =>
    salaryRoles.reduce((sum, r) => sum + (r.monthlyAmounts[m] || 0), 0)
  )

  const grandTotal = salaryRoles.reduce((sum, r) =>
    sum + Object.values(r.monthlyAmounts).reduce((s, v) => s + v, 0), 0
  )

  // Per-dept salary vs allocation comparison
  const deptSalaryBreakdown = DEPARTMENTS.map(dept => {
    const code = dept.code as DeptCode
    const deptRoles = salaryRoles.filter(r => r.deptCode === code)
    const salaryTotal = deptRoles.reduce((sum, r) =>
      sum + Object.values(r.monthlyAmounts).reduce((s, v) => s + v, 0), 0)
    if (salaryTotal === 0) return null
    const budget = getDeptBudget(code, store)
    const remaining = budget - salaryTotal
    return { code, name: dept.name, budget, salaryTotal, remaining, over: remaining < 0 }
  }).filter(Boolean) as { code: string; name: string; budget: number; salaryTotal: number; remaining: number; over: boolean }[]

  const totalSalaryAllocation = deptSalaryBreakdown.reduce((s, d) => s + d.budget, 0)
  const salaryOver = deptSalaryBreakdown.some(d => d.over)

  const cumulativeMonthly = months.reduce<number[]>((acc, _, i) => {
    acc.push((acc[i - 1] || 0) + monthlyTotals[i])
    return acc
  }, [])

  return (
    <div className="screen" style={{ maxWidth: '100%', paddingRight: 24 }}>
      <div className="screen-header">
        <div className="screen-title">Salary Forecast</div>
        <div className="screen-sub">
          Monthly salary per role. Red cells = amount entered in a phase the role isn't assigned to.
        </div>
      </div>

      {/* Phase legend */}
      <div className="phase-strip" style={{ marginBottom: 16 }}>
        {[
          { label: 'DEV', cls: 'badge-dev' },
          { label: 'PRE-PROD', cls: 'badge-pre' },
          { label: 'SHOOT', cls: 'badge-shoot' },
          { label: 'POST', cls: 'badge-post' },
        ].map(p => (
          <span key={p.label} className={`badge ${p.cls}`} style={{ padding: '4px 12px' }}>{p.label}</span>
        ))}
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text2)' }}>
          {totalMonths} months total
          {project.startDate && ` · starting ${new Date(project.startDate + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}`}
        </span>
      </div>

      {/* Dept filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button className={`btn btn-sm ${filterDept === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterDept('all')}>All</button>
        {DEPARTMENTS.map(d => (
          <button
            key={d.code}
            className={`btn btn-sm ${filterDept === d.code ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterDept(d.code as DeptCode)}
          >{d.code}</button>
        ))}
      </div>

      {deptSalaryBreakdown.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, color: 'var(--text2)', textTransform: 'uppercase' }}>
            Salary vs Dept Allocation
          </div>
          <div className="table-wrap">
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Dept</th>
                  <th style={{ minWidth: 120 }}>Name</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Allocation Budget</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Salary Total</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Remaining</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {deptSalaryBreakdown.map(d => (
                  <tr key={d.code}>
                    <td className="td-mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{d.code}</td>
                    <td>{d.name}</td>
                    <td className="td-num">{d.budget > 0 ? fmt(d.budget, cur) : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                    <td className="td-num" style={{ color: d.over ? 'var(--red)' : undefined }}>{fmt(d.salaryTotal, cur)}</td>
                    <td className="td-num" style={{ color: d.over ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                      {d.budget > 0 ? fmt(Math.abs(d.remaining), cur) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {d.budget <= 0
                        ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>no alloc</span>
                        : d.over
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>OVER</span>
                          : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="row-subtotal">
                  <td colSpan={2}>TOTAL</td>
                  <td className="td-num">{fmt(totalSalaryAllocation, cur)}</td>
                  <td className="td-num" style={{ color: salaryOver ? 'var(--red)' : undefined }}>{fmt(grandTotal, cur)}</td>
                  <td className="td-num" style={{ color: salaryOver ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                    {totalSalaryAllocation > 0 ? fmt(Math.abs(totalSalaryAllocation - grandTotal), cur) : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {totalSalaryAllocation > 0
                      ? salaryOver
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>OVER</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>OK</span>
                      : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={addRole}>+ Add Role</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSyncConfirm(true)}
            title="Replace all salary roles with amounts from the Budget line items, spread evenly across each dept's active months"
          >
            Sync from Budget
          </button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          Grand Total: <strong style={{ color: salaryOver ? 'var(--red)' : 'var(--text)' }}>{fmt(grandTotal, cur)}</strong>
          {totalSalaryAllocation > 0 && <span style={{ color: 'var(--text2)', marginLeft: 8 }}>/ {fmt(totalSalaryAllocation, cur)} allocated</span>}
        </span>
      </div>

      {showSyncConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, maxWidth: 480, width: '92%', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>Sync Salary Roles from Budget</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16 }}>
              This will <strong style={{ color: 'var(--text)' }}>replace all existing salary roles</strong> with entries generated directly from your Budget line items.
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
              <div>• Each line item becomes a salary role in its department</div>
              <div>• The total (no × qty × rate) is spread evenly across the dept's active phase months</div>
              <div>• After syncing, every role remains fully editable — adjust any monthly figure as needed</div>
              <div>• Run sync again any time you update the Budget to re-align</div>
            </div>
            {salaryRoles.length > 0 && (
              <div style={{ background: 'rgba(240,96,96,0.08)', border: '1px solid rgba(240,96,96,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
                ⚠ Your current <strong style={{ color: 'var(--text)' }}>{salaryRoles.length} salary role{salaryRoles.length > 1 ? 's' : ''}</strong> will be overwritten.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowSyncConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={applySync}>Sync Now</button>
            </div>
          </div>
        </div>
      )}

      {salaryRoles.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
            No roles yet. <button className="btn btn-ghost btn-sm" onClick={addRole} style={{ marginLeft: 8 }}>Add first role</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table style={{ fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>SCH</th>
                  <th style={{ minWidth: 140 }}>Role</th>
                  <th style={{ width: 60 }}>Dept</th>
                  <th style={{ width: 80 }}>Phase</th>
                  {months.map(m => {
                    const phase = phaseForMonth(m, timeline)
                    const label = getMonthLabel(m, timeline, project.startDate)
                    return (
                      <th key={m} style={{ width: 90, textAlign: 'right' }}>
                        <div>{label}</div>
                        <div style={{ marginTop: 2 }}>
                          <span className={`badge badge-${phase}`} style={{ fontSize: 9 }}>{phase.toUpperCase()}</span>
                        </div>
                      </th>
                    )
                  })}
                  <th style={{ width: 100, textAlign: 'right' }}>TOTAL</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRoles.map(role => {
                  const roleTotal = Object.values(role.monthlyAmounts).reduce((s, v) => s + v, 0)
                  return (
                    <tr key={role.id}>
                      <td className="td-mono">
                        <input
                          className="td-input"
                          value={role.schedNo}
                          onChange={e => updateSalaryRole(role.id, { schedNo: e.target.value })}
                          style={{ width: 42 }}
                        />
                      </td>
                      <td>
                        <input
                          className="td-input"
                          value={role.role}
                          onChange={e => updateSalaryRole(role.id, { role: e.target.value })}
                          placeholder="Role title..."
                          style={{ minWidth: 130 }}
                        />
                      </td>
                      <td>
                        <select
                          className="td-input"
                          value={role.deptCode}
                          onChange={e => updateSalaryRole(role.id, { deptCode: e.target.value as DeptCode })}
                          style={{ padding: '3px 4px', fontSize: 11 }}
                        >
                          {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.code}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="td-input"
                          value={role.phase}
                          onChange={e => updateSalaryRole(role.id, { phase: e.target.value as SalaryRole['phase'] })}
                          style={{ padding: '3px 4px', fontSize: 11 }}
                        >
                          {PHASES.map(p => <option key={p} value={p}>{p === 'all' ? 'All' : p.toUpperCase()}</option>)}
                        </select>
                      </td>
                      {months.map(m => {
                        const mPhase = phaseForMonth(m, timeline)
                        const active = isPhaseActive(role, mPhase)
                        const val = role.monthlyAmounts[m] || 0
                        const isWarn = !active && val > 0
                        return (
                          <td key={m} className={isWarn ? 'warn-cell' : ''} style={{ padding: '3px 6px' }}>
                            <input
                              className="td-input"
                              type="number"
                              value={val || ''}
                              onChange={e => {
                                const newAmts = { ...role.monthlyAmounts, [m]: Number(e.target.value) }
                                if (!e.target.value) delete newAmts[m]
                                updateSalaryRole(role.id, { monthlyAmounts: newAmts })
                              }}
                              style={{ textAlign: 'right', width: 80, color: isWarn ? 'var(--red)' : undefined }}
                              placeholder="—"
                              title={isWarn ? `⚠ ${role.role} is assigned to ${role.phase.toUpperCase()} phase only` : undefined}
                            />
                          </td>
                        )
                      })}
                      <td className="td-num" style={{ fontWeight: 600 }}>{fmt(roleTotal, cur)}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" style={{ padding: '3px 7px' }} onClick={() => removeSalaryRole(role.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="row-subtotal">
                  <td colSpan={4}>TOTAL MONTHLY SPEND</td>
                  {monthlyTotals.map((t, i) => (
                    <td key={i} className="td-num">{fmt(t, cur)}</td>
                  ))}
                  <td className="td-num">{fmt(grandTotal, cur)}</td>
                  <td />
                </tr>
                <tr style={{ background: 'rgba(52,152,219,0.05)' }}>
                  <td colSpan={4} style={{ fontSize: 11, color: 'var(--text2)' }}>CUMULATIVE SPEND</td>
                  {cumulativeMonthly.map((t, i) => (
                    <td key={i} className="td-num" style={{ fontSize: 11, color: 'var(--blue)' }}>{fmt(t, cur)}</td>
                  ))}
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

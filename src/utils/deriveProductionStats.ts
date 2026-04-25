import type { BudgetState, DeptCode } from '../store/budgetStore'
import { DEPARTMENTS, getDeptTarget } from '../store/budgetStore'

export interface DeptStat {
  code: string
  name: string
  budgeted: number
  spent: number
  remaining: number
  status: 'ON TRACK' | 'AT RISK' | 'OVER BUDGET' | 'NO BUDGET'
  statusColor: string
}

export interface ProductionStats {
  totalBudget: number
  totalSpent: number
  remaining: number
  usedPct: number
  deptRows: DeptStat[]
  recentDeductions: BudgetState['expenditureDeductions']
  unsignedOldSchedules: BudgetState['paymentSchedules']
  prodNotices: BudgetState['notices']
  hasData: boolean
}

function statusLabel(budgeted: number, spent: number): { label: DeptStat['status']; color: string } {
  if (budgeted <= 0) return { label: 'NO BUDGET', color: 'var(--text-ghost)' }
  const pct = (budgeted - spent) / budgeted
  if (spent > budgeted) return { label: 'OVER BUDGET', color: 'var(--accent-red)' }
  if (pct <= 0.15) return { label: 'AT RISK', color: 'var(--accent-amber)' }
  return { label: 'ON TRACK', color: 'var(--accent-green)' }
}

export function deriveProductionStats(store: Pick<BudgetState,
  'project' | 'lineItems' | 'deptAllocations' | 'expenditureDeductions' | 'paymentSchedules' | 'notices'
>): ProductionStats {
  const { project, expenditureDeductions, paymentSchedules, notices } = store

  const totalBudget = project.totalBudget
  const totalSpent = expenditureDeductions.reduce((s, d) => s + d.amount, 0)
  const remaining = totalBudget - totalSpent
  const usedPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  const deptRows: DeptStat[] = DEPARTMENTS.map(dept => {
    const budgeted = getDeptTarget(dept.code as DeptCode, store as BudgetState)
    const spent = expenditureDeductions
      .filter(d => d.budgetCode === dept.code)
      .reduce((s, d) => s + d.amount, 0)
    const { label: status, color: statusColor } = statusLabel(budgeted, spent)
    return { code: dept.code, name: dept.name, budgeted, spent, remaining: budgeted - spent, status, statusColor }
  }).filter(d => d.budgeted > 0 || d.spent > 0)

  const recentDeductions = [...expenditureDeductions]
    .sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime())
    .slice(0, 5)

  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  const unsignedOldSchedules = paymentSchedules.filter(
    s => s.status === 'draft' && new Date(s.createdAt).getTime() < cutoff
  )

  const prodNotices = notices
    .filter(n => !n.dismissed && (n.type === 'conflict' || n.type === 'info'))
    .slice(0, 5)

  // Show dashboard if any project data exists — title, budget, location, or dept data
  const hasData = !!project.title || totalBudget > 0 || !!project.location || deptRows.length > 0

  return { totalBudget, totalSpent, remaining, usedPct, deptRows, recentDeductions, unsignedOldSchedules, prodNotices, hasData }
}

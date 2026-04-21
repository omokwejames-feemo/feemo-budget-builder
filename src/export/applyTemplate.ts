import type { BudgetTemplate } from './templateData'
import type { BudgetState, DeptCode, LineItem, SalaryRole, Timeline } from '../store/budgetStore'
import { DEPARTMENTS, getDeptTarget } from '../store/budgetStore'
import { TEMPLATE_JURIYA, TEMPLATE_BC } from '../store/budgetStore'

let seq = 5000
const uid = () => String(++seq)

function activeMths(phase: SalaryRole['phase'], timeline: Timeline): number[] {
  const { developmentMonths: dev, preProdMonths: pre, shootMonths: shoot, postMonths: post } = timeline
  const months: number[] = []
  const devEnd = dev
  const preEnd = dev + pre
  const shootEnd = dev + pre + shoot
  const total = dev + pre + shoot + post
  for (let m = 1; m <= total; m++) {
    if (phase === 'all') { months.push(m); continue }
    if (phase === 'dev' && m <= devEnd) months.push(m)
    if (phase === 'pre' && m > devEnd && m <= preEnd) months.push(m)
    if (phase === 'shoot' && m > preEnd && m <= shootEnd) months.push(m)
    if (phase === 'post' && m > shootEnd) months.push(m)
  }
  return months
}

export function applyFullTemplate(
  template: BudgetTemplate,
  state: Pick<BudgetState, 'project' | 'deptAllocations' | 'timeline'> & {
    setDeptAllocation: BudgetState['setDeptAllocation']
    setLineItems: BudgetState['setLineItems']
    setSalaryRoles: BudgetState['setSalaryRoles']
  },
  deptPcts: Partial<Record<DeptCode, number>>,
) {
  const { project, timeline } = state
  const feePercent = project.productionFeePercent ?? 5

  // 1. Normalize dept allocations so non-II sum to (100 - fee)% and II = fee%
  // This guarantees all allocations total exactly 100% of totalBudget.
  const nonIISum = DEPARTMENTS
    .filter(d => d.code !== 'II')
    .reduce((sum, d) => sum + (deptPcts[d.code as DeptCode] ?? 0), 0)
  const targetNonII = 100 - feePercent
  const scale = nonIISum > 0 ? targetNonII / nonIISum : 1

  DEPARTMENTS.forEach(dept => {
    const code = dept.code as DeptCode
    if (code === 'II') {
      state.setDeptAllocation('II', parseFloat(feePercent.toFixed(2)))
    } else {
      const rawPct = (deptPcts[code] ?? 0) * scale
      state.setDeptAllocation(code, parseFloat(rawPct.toFixed(4)))
    }
  })

  // Compute targets using scaled allocations
  const scaledPcts: Partial<Record<DeptCode, number>> = {}
  DEPARTMENTS.forEach(dept => {
    const code = dept.code as DeptCode
    if (code === 'II') { scaledPcts[code] = feePercent }
    else { scaledPcts[code] = (deptPcts[code] ?? 0) * scale }
  })

  const getTarget = (code: DeptCode) => ((scaledPcts[code] ?? 0) / 100) * project.totalBudget

  // 2. Populate Production Budget line items
  DEPARTMENTS.forEach(dept => {
    const code = dept.code as DeptCode
    const tplItems = template.lineItems[code]
    if (!tplItems || tplItems.length === 0) { state.setLineItems(code, []); return }
    const target = getTarget(code)
    if (target <= 0) { state.setLineItems(code, []); return }

    const items: LineItem[] = tplItems.map(tpl => {
      // If this line item is a salary item, find its salary role and use monthly rate × months
      const salaryRole = tpl.isSalary
        ? template.salaryRoles.find(r => r.lineItemScheduleNo === tpl.schedNo && r.deptCode === code)
        : null

      if (salaryRole) {
        const roleTotalSalary = salaryRole.ratioOfDeptTarget * target
        const mths = activeMths(salaryRole.phase, timeline)
        if (mths.length > 1) {
          const monthlyRate = Math.round(roleTotalSalary / mths.length)
          return {
            id: uid(),
            schedNo: tpl.schedNo,
            detail: tpl.detail,
            qty: mths.length,
            rate: monthlyRate,
            unit: 'Month',
            ie: tpl.ie,
          }
        }
        // Single month — show as flat rate
        return {
          id: uid(),
          schedNo: tpl.schedNo,
          detail: tpl.detail,
          qty: 1,
          rate: Math.round(roleTotalSalary),
          unit: 'Flat',
          ie: tpl.ie,
        }
      }

      return {
        id: uid(),
        schedNo: tpl.schedNo,
        detail: tpl.detail,
        qty: tpl.qty,
        rate: Math.round((tpl.ratio * target) / tpl.qty),
        unit: tpl.unit,
        ie: tpl.ie,
      }
    })
    state.setLineItems(code, items)
  })

  // 3. Populate Salary Forecast roles
  const roles: SalaryRole[] = template.salaryRoles.map(tplRole => {
    const target = getTarget(tplRole.deptCode)
    const totalSalary = tplRole.ratioOfDeptTarget * target
    const mths = activeMths(tplRole.phase, timeline)
    const perMonth = mths.length > 0 ? Math.round(totalSalary / mths.length) : 0
    const monthlyAmounts: Record<number, number> = {}
    mths.forEach(m => { if (perMonth > 0) monthlyAmounts[m] = perMonth })
    return {
      id: uid(),
      schedNo: tplRole.schedNo,
      role: tplRole.role,
      deptCode: tplRole.deptCode,
      phase: tplRole.phase,
      monthlyAmounts,
    }
  })
  state.setSalaryRoles(roles)
}

export function applyParsedBudget(
  parsed: import('./parseUploadedBudget').ParsedBudget,
  state: Pick<BudgetState, 'project'> & {
    setProject: BudgetState['setProject']
    setDeptAllocation: BudgetState['setDeptAllocation']
    setLineItems: BudgetState['setLineItems']
    setSalaryRoles: BudgetState['setSalaryRoles']
  },
) {
  if (parsed.title) state.setProject({ title: parsed.title })
  if (parsed.totalBudget) state.setProject({ totalBudget: parsed.totalBudget })

  DEPARTMENTS.forEach(dept => {
    const pct = parsed.deptAllocations[dept.code as DeptCode]
    if (pct !== undefined) state.setDeptAllocation(dept.code as DeptCode, pct)
    const items = parsed.lineItems[dept.code as DeptCode]
    if (items) state.setLineItems(dept.code as DeptCode, items)
  })

  if (parsed.salaryRoles.length > 0) state.setSalaryRoles(parsed.salaryRoles)
}

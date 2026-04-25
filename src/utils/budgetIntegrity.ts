import type { BudgetState, DeptCode } from '../store/budgetStore'
import { DEPARTMENTS } from '../store/budgetStore'

export interface IntegrityResult {
  status: 'ok' | 'mismatch' | 'unchecked'
  budgetTotal: number
  forecastTotal: number
  discrepancy: number        // positive = forecast over budget, negative = under
  sourceDepartment: string | null
}

export function runIntegrityCheck(state: Pick<BudgetState, 'lineItems' | 'forecastOverrides' | 'project'>): IntegrityResult {
  const { lineItems, forecastOverrides, project } = state

  // Budget Grid total: sum rate * qty across all departments
  const hasBudgetData = Object.values(lineItems).some(items => items.length > 0)
  const budgetTotal = Object.values(lineItems).reduce((sum, items) =>
    sum + items.reduce((s, item) => s + (item.rate || 0) * (item.qty || 1), 0), 0)

  // Production Forecast total: sum all forecastOverrides values
  const hasForecastData = Object.keys(forecastOverrides).length > 0
  const forecastTotal = Object.values(forecastOverrides).reduce((s, v) => s + v, 0)

  if (!hasBudgetData || !hasForecastData) {
    return { status: 'unchecked', budgetTotal, forecastTotal, discrepancy: 0, sourceDepartment: null }
  }

  const discrepancy = forecastTotal - budgetTotal

  if (Math.abs(discrepancy) < 1) {
    return { status: 'ok', budgetTotal, forecastTotal, discrepancy, sourceDepartment: null }
  }

  // Find dept with largest gap
  let maxGap = 0
  let sourceDepartment: string | null = null
  for (const dept of DEPARTMENTS) {
    const deptBudget = (lineItems[dept.code as DeptCode] || [])
      .reduce((s, item) => s + (item.rate || 0) * (item.qty || 1), 0)
    const deptForecast = Object.entries(forecastOverrides)
      .filter(([k]) => k.startsWith(`${dept.code}_`))
      .reduce((s, [, v]) => s + v, 0)
    const gap = Math.abs(deptForecast - deptBudget)
    if (gap > maxGap) { maxGap = gap; sourceDepartment = `${dept.code} — ${dept.name}` }
  }

  return { status: 'mismatch', budgetTotal, forecastTotal, discrepancy, sourceDepartment }
}

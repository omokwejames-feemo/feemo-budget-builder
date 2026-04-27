import { useMemo } from 'react'
import { useBudgetStore, DEPARTMENTS, DeptCode, DEPT_ACTIVE_PHASES, getTotalMonths, getMonthPhase } from '../store/budgetStore'

export type IssueSeverity = 'warning' | 'error'
export type IssueScreen = 'timeline' | 'installments' | 'forecast'

export interface Issue {
  id: string
  severity: IssueSeverity
  screen: IssueScreen
  title: string
  description: string
  fixLabel?: string
  onFix?: () => void
}

export function useIssueDetector(): Issue[] {
  const store = useBudgetStore()
  const { project, timeline, installments, deptAllocations, setInstallments } = store
  const totalMonths = getTotalMonths(timeline)

  return useMemo(() => {
    const issues: Issue[] = []
    const budget = project.totalBudget

    // ── Timeline issues ────────────────────────────────────────────────────
    if (budget > 0 && totalMonths === 0) {
      issues.push({
        id: 'no-timeline',
        severity: 'error',
        screen: 'timeline',
        title: 'No production timeline set',
        description: 'Your budget is set but the project timeline has no months. Enter at least one phase to generate a forecast and payment schedule.',
      })
    }

    if (totalMonths > 0 && timeline.shootMonths === 0 && project.shootDays > 0) {
      issues.push({
        id: 'no-shoot-months',
        severity: 'warning',
        screen: 'timeline',
        title: 'Shoot days entered but shoot phase is 0 months',
        description: `You have ${project.shootDays} shoot days but no shoot months in your timeline. Add shoot months so the forecast distributes shoot costs correctly.`,
      })
    }

    // ── Installment issues ─────────────────────────────────────────────────
    if (budget > 0 && installments.length === 0) {
      issues.push({
        id: 'no-installments',
        severity: 'warning',
        screen: 'installments',
        title: 'No payment installments defined',
        description: 'No payment schedule has been set up. Add installment tranches in the Installments section so the forecast can show when funds arrive.',
      })
    }

    if (installments.length > 0) {
      const total = installments.reduce((s, i) => s + i.percentage, 0)
      const diff = Math.abs(total - 100)
      if (diff >= 0.1) {
        issues.push({
          id: 'installments-not-100',
          severity: 'error',
          screen: 'installments',
          title: `Installments total ${total.toFixed(1)}%, not 100%`,
          description: `Your payment tranches add up to ${total.toFixed(1)}%. They must total exactly 100% for the forecast and export to be accurate.`,
        })
      }
    }

    if (installments.some(i => i.month > totalMonths && totalMonths > 0)) {
      issues.push({
        id: 'installment-beyond-end',
        severity: 'warning',
        screen: 'installments',
        title: 'Installment scheduled beyond project end',
        description: 'One or more installments are set to a month that falls outside the total project duration. Check your timeline or installment months.',
        fixLabel: 'Clamp to last month',
        onFix: () => {
          setInstallments(installments.map(i => ({
            ...i,
            month: totalMonths > 0 ? Math.min(i.month, totalMonths) : i.month,
          })))
        },
      })
    }

    // ── Forecast / cashflow issues ─────────────────────────────────────────
    // Clamp here as a second safety layer — prevents RangeError if the value
    // somehow bypasses getTotalMonths (e.g. corrupt rehydrated state).
    const safeMonths = Math.min(totalMonths, 1200)
    if (safeMonths > 0 && budget > 0 && installments.length > 0) {
      // Compute simplified payments-per-month distribution
      const payments = new Array(safeMonths).fill(0)
      DEPARTMENTS.forEach(dept => {
        if (dept.code === 'II') return
        const target = (deptAllocations[dept.code as DeptCode] / 100) * budget
        if (!target) return
        const activePhases = DEPT_ACTIVE_PHASES[dept.code as DeptCode] ?? ['DEV', 'PRE-PROD', 'SHOOT', 'POST']
        const activeMonths: number[] = []
        for (let m = 1; m <= safeMonths; m++) {
          if (activePhases.includes(getMonthPhase(m, timeline))) activeMonths.push(m)
        }
        if (!activeMonths.length) return
        const perMonth = target / activeMonths.length
        activeMonths.forEach(m => { payments[m - 1] += perMonth })
      })

      // Compute receipts-per-month from installments
      const receipts = new Array(safeMonths).fill(0)
      installments.forEach(inst => {
        const m = Math.max(1, Math.min(inst.month, safeMonths))
        receipts[m - 1] += (inst.percentage / 100) * budget
      })

      // Find first negative balance month
      let balance = 0
      let firstGap = 0
      for (let i = 0; i < safeMonths; i++) {
        balance += receipts[i] - payments[i]
        if (balance < 0 && !firstGap) { firstGap = i + 1 }
      }

      if (firstGap > 0) {
        issues.push({
          id: 'cashflow-gap',
          severity: 'warning',
          screen: 'forecast',
          title: `Cash flow gap starting in Month ${firstGap}`,
          description: `Outgoing payments exceed incoming funds from Month ${firstGap}. Use "Suggest Installment Timing" on the Production Forecast screen to redistribute tranches and close the gap.`,
        })
      }
    }

    return issues
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, timeline, installments, deptAllocations, totalMonths])
}

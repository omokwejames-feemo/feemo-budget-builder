import type { BudgetState } from '../store/budgetStore'

export interface MilestoneInfo {
  label: string
  monthsAway: number | null
  date: string | null
}

export function deriveNextMilestone(
  startDate: string,
  timeline: Pick<BudgetState['timeline'], 'developmentMonths' | 'preProdMonths' | 'shootMonths' | 'postMonths'>,
  installments: BudgetState['installments']
): MilestoneInfo {
  if (!startDate) return { label: 'No start date set', monthsAway: null, date: null }

  const start = new Date(startDate + '-01')
  const now = new Date()
  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())

  const { developmentMonths, preProdMonths, shootMonths, postMonths } = timeline

  const phases = [
    { name: 'Start Pre-Production', offset: developmentMonths },
    { name: 'Principal Photography Begins', offset: developmentMonths + preProdMonths },
    { name: 'Post-Production Begins', offset: developmentMonths + preProdMonths + shootMonths },
    { name: 'Project Wrap', offset: developmentMonths + preProdMonths + shootMonths + postMonths },
  ]

  // Next installment coming up
  const nextInstallment = installments
    .filter(i => i.month > monthsElapsed)
    .sort((a, b) => a.month - b.month)[0]

  const candidates: { label: string; offset: number }[] = []

  for (const phase of phases) {
    if (phase.offset > monthsElapsed) candidates.push({ label: phase.name, offset: phase.offset })
  }
  if (nextInstallment) {
    candidates.push({ label: `Installment ${nextInstallment.label || nextInstallment.id}`, offset: nextInstallment.month })
  }

  if (candidates.length === 0) return { label: 'All milestones passed', monthsAway: null, date: null }

  candidates.sort((a, b) => a.offset - b.offset)
  const next = candidates[0]
  const monthsAway = next.offset - monthsElapsed

  const milestoneDate = new Date(start)
  milestoneDate.setMonth(milestoneDate.getMonth() + next.offset)
  const dateStr = milestoneDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return { label: next.label, monthsAway, date: dateStr }
}

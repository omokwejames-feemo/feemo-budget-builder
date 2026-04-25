export interface PhaseInfo {
  label: string
  color: string
  badgeClass: string
}

export function derivePhaseLabel(
  startDate: string,
  timeline: { developmentMonths: number; preProdMonths: number; shootMonths: number; postMonths?: number }
): PhaseInfo {
  if (!startDate) return { label: 'Development', color: 'var(--accent-blue)', badgeClass: 'badge-dev' }

  const start = new Date(startDate + '-01')
  const now = new Date()
  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())

  if (monthsElapsed < 0) return { label: 'Development', color: 'var(--accent-blue)', badgeClass: 'badge-dev' }

  const { developmentMonths, preProdMonths, shootMonths } = timeline
  if (monthsElapsed < developmentMonths) return { label: 'Development', color: 'var(--accent-blue)', badgeClass: 'badge-dev' }
  if (monthsElapsed < developmentMonths + preProdMonths) return { label: 'Pre-Production', color: 'var(--accent-amber)', badgeClass: 'badge-pre' }
  if (monthsElapsed < developmentMonths + preProdMonths + shootMonths) return { label: 'Principal Photography', color: 'var(--accent-green)', badgeClass: 'badge-shoot' }
  return { label: 'Post-Production', color: 'var(--accent-blue)', badgeClass: 'badge-post' }
}

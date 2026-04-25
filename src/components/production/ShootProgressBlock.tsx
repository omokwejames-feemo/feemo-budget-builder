import type { MilestoneInfo } from '../../utils/deriveNextMilestone'

interface Props {
  shootDays: number
  location: string
  startDate: string
  nextMilestone: MilestoneInfo
}

export default function ShootProgressBlock({ shootDays, location, startDate, nextMilestone }: Props) {
  return (
    <div className="prod-panel">
      <div className="prod-panel-label">Shoot Progress</div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Shoot Days</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {shootDays > 0 ? `${shootDays}d` : '—'}
        </div>
        {shootDays > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Total scheduled shoot days</div>
        )}
      </div>

      {location && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Primary Location</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{location}</div>
        </div>
      )}

      {startDate && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Production Start</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {new Date(startDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}

      {nextMilestone.label && nextMilestone.monthsAway !== null && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Next Milestone</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{nextMilestone.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 2 }}>
            {nextMilestone.monthsAway === 0 ? 'This month' : `In ${nextMilestone.monthsAway} month${nextMilestone.monthsAway !== 1 ? 's' : ''}`}
            {nextMilestone.date && ` · ${nextMilestone.date}`}
          </div>
        </div>
      )}
    </div>
  )
}

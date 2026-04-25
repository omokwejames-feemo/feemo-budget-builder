import type { PhaseInfo } from '../../utils/derivePhaseLabel'
import { formatCurrency } from '../../utils/formatCurrency'

interface Props {
  title: string
  company: string
  totalBudget: number
  currency: string
  phase: PhaseInfo
  location: string
  exchangeRate: number
  projectCurrency: string
}

export default function IdentityStrip({ title, company, totalBudget, currency, phase, location, exchangeRate, projectCurrency }: Props) {
  const fmt = (n: number) => formatCurrency(n, currency)
  return (
    <div className="prod-identity-strip">
      <div>
        <div className="prod-identity-title">Production Dashboard — {title || 'Untitled Project'}</div>
        <div className="prod-identity-sub">
          {company}{company && ' · '}
          {fmt(totalBudget)} approved budget
        </div>
        <div className="prod-phase-chip">
          <div className="prod-phase-dot" style={{ background: phase.color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: phase.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{phase.label}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>
          {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        {location && <div>{location}</div>}
        {projectCurrency !== 'NGN' && projectCurrency !== '₦' && exchangeRate > 0 && (
          <div>1 {projectCurrency} = ₦{exchangeRate.toLocaleString()}</div>
        )}
      </div>
    </div>
  )
}

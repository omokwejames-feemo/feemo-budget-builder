import { useState } from 'react'
import { useBudgetStore } from '../store/budgetStore'
import { formatCurrency } from '../utils/formatCurrency'
import SyncDialog from './SyncDialog'

interface Props {
  screens: string[]   // which screens show this banner
  currentScreen: string
}

export default function MismatchBanner({ screens, currentScreen }: Props) {
  const store = useBudgetStore()
  const [dismissed, setDismissed] = useState(false)
  const [showSync, setShowSync] = useState(false)

  const { budgetIntegrityStatus, integrityDiscrepancy, integritySourceDepartment, project } = store
  const currency = project.currency || 'NGN'

  if (!screens.includes(currentScreen)) return null
  if (budgetIntegrityStatus !== 'mismatch') return null
  if (dismissed) return null

  const over = integrityDiscrepancy > 0

  return (
    <>
      <div style={{
        background: 'rgba(245,166,35,0.08)',
        border: '1px solid rgba(245,166,35,0.3)',
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '0 0 14px 0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14 }}>⚠</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>Budget Mismatch Detected</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
            Your Production Forecast is {over ? 'over' : 'under'} the main budget by {formatCurrency(Math.abs(integrityDiscrepancy), currency)}.
            {integritySourceDepartment && ` Largest gap: ${integritySourceDepartment}.`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setShowSync(true)}
            style={{ padding: '5px 12px', background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 5, color: '#f5a623', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Resolve Mismatch
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Dismiss
          </button>
        </div>
      </div>
      {showSync && <SyncDialog onClose={() => setShowSync(false)} />}
    </>
  )
}

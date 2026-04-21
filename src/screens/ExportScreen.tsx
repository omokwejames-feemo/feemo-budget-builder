import { useState } from 'react'
import { useBudgetStore, DEPARTMENTS, DeptCode, getDeptTarget, getDeptActual, getTotalMonths } from '../store/budgetStore'
import { generateBudgetXlsx } from '../export/generateBudget'

function fmt(n: number, cur = 'N') {
  if (!n) return `${cur}0`
  return `${cur}${n.toLocaleString('en', { maximumFractionDigits: 0 })}`
}

declare global {
  interface Window {
    electronAPI?: {
      saveFile: (buffer: number[], name: string) => Promise<{ success: boolean; filePath?: string }>
      saveProject: (data: string, filePath: string) => Promise<{ success: boolean; filePath?: string }>
      saveProjectTo: (data: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>
      openProject: () => Promise<{ success: boolean; filePath?: string; data?: string }>
    }
  }
}

export default function ExportScreen() {
  const store = useBudgetStore()
  const { project, timeline, installments, salaryRoles } = store
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const cur = project.currency || 'N'

  const totalMonths = getTotalMonths(timeline)
  const grandBudget = project.totalBudget
  const entered = DEPARTMENTS.reduce((sum, d) => sum + getDeptActual(d.code as DeptCode, store), 0)
  const instPct = installments.reduce((s, i) => s + i.percentage, 0)
  const totalSalary = salaryRoles.reduce((sum, r) => sum + Object.values(r.monthlyAmounts).reduce((s, v) => s + v, 0), 0)

  const checks = [
    { label: 'Project title entered', ok: !!project.title },
    { label: 'Total budget > 0', ok: grandBudget > 0 },
    { label: 'Production start date set', ok: !!project.startDate },
    { label: 'Installments total 100%', ok: Math.abs(instPct - 100) < 0.1 },
    { label: 'At least one department has line items', ok: entered > 0 },
    { label: 'At least one salary role entered', ok: salaryRoles.length > 0 },
    { label: 'Timeline set (months > 0)', ok: totalMonths > 0 },
  ]

  const readyCount = checks.filter(c => c.ok).length

  async function handleExport() {
    setStatus('generating')
    setMessage('')
    try {
      const buffer = await generateBudgetXlsx(store)
      const arr = Array.from(new Uint8Array(buffer))
      const slug = (project.title || 'budget').replace(/\s+/g, '_')
      const filename = `${slug}_Budget_${new Date().toISOString().split('T')[0]}.xlsx`

      if (window.electronAPI) {
        const result = await window.electronAPI.saveFile(arr, filename)
        if (result.success) {
          setStatus('done')
          setMessage(`Saved to: ${result.filePath}`)
        } else {
          setStatus('idle')
        }
      } else {
        // Browser fallback (dev mode)
        const blob = new Blob([new Uint8Array(arr)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
        setStatus('done')
        setMessage(`Downloaded: ${filename}`)
      }
    } catch (e) {
      setStatus('error')
      setMessage(String(e))
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Export Budget</div>
        <div className="screen-sub">Generate a fully-formatted 7-sheet .xlsx workbook.</div>
      </div>

      {/* Summary stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <div className="stat-label">Project</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{project.title || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Budget</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{fmt(grandBudget, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Budget Entered</div>
          <div className="stat-value" style={{ fontSize: 16, color: entered > grandBudget ? 'var(--red)' : 'var(--text)' }}>{fmt(entered, cur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Salary Total</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{fmt(totalSalary, cur)}</div>
        </div>
      </div>

      {/* Pre-flight checks */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Pre-flight Checks</span>
          <span style={{ fontSize: 12, color: readyCount === checks.length ? 'var(--green)' : 'var(--text2)' }}>
            {readyCount}/{checks.length} ready
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {checks.map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: c.ok ? 'var(--green)' : 'var(--text3)', fontSize: 14 }}>{c.ok ? '✓' : '○'}</span>
                <span style={{ color: c.ok ? 'var(--text)' : 'var(--text2)' }}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export sheets preview */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><span className="card-title">Output Sheets</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { name: 'ASSUMPTIONS', desc: 'Master inputs dashboard' },
              { name: 'BUDGET SUMMARY', desc: `${DEPARTMENTS.length} departments, target vs actual` },
              { name: 'PRODUCTION BUDGET', desc: `${Object.values(store.lineItems).flat().length} line items, I/E coded` },
              { name: 'PAYMENT SCHEDULE', desc: `${installments.length} installment tranches` },
              { name: 'SALARY FORECAST', desc: `${salaryRoles.length} roles × ${totalMonths} months` },
              { name: 'PRODUCTION FORECAST', desc: 'BC-style cashflow matrix — receipts, payments, balances' },
            ].map(sheet => (
              <div key={sheet.name} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>{sheet.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{sheet.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export button */}
      <div className="export-box" onClick={status === 'generating' ? undefined : handleExport}
        style={{ cursor: status === 'generating' ? 'wait' : 'pointer' }}>
        <div className="export-icon">{status === 'done' ? '✓' : status === 'error' ? '✕' : '↓'}</div>
        <div className="export-title" style={{ color: status === 'done' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--text)' }}>
          {status === 'idle' && 'Export as .xlsx'}
          {status === 'generating' && 'Generating…'}
          {status === 'done' && 'Export Complete'}
          {status === 'error' && 'Export Failed'}
        </div>
        <div className="export-sub">
          {status === 'idle' && 'Click to generate and save your budget workbook'}
          {status === 'generating' && 'Building all 7 sheets…'}
          {status === 'done' || status === 'error' ? message : ''}
        </div>
        {status === 'idle' && (
          <button className="btn btn-primary" style={{ pointerEvents: 'none' }}>
            Generate Budget Workbook
          </button>
        )}
        {status === 'done' && (
          <button className="btn btn-ghost" onClick={e => { e.stopPropagation(); setStatus('idle') }}>
            Export Again
          </button>
        )}
      </div>
    </div>
  )
}

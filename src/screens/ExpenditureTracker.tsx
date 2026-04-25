import { useRef, useState } from 'react'
import { useBudgetStore, DEPARTMENTS, ExpenditureDeduction } from '../store/budgetStore'
import { getDeptTarget } from '../store/budgetStore'
import { formatAmount } from '../utils/formatCurrency'
import { formatPercent } from '../utils/formatPercent'

function fmt(n: number) {
  return formatAmount(n)
}

function uid() { return Math.random().toString(36).slice(2) }

// Simple text extraction from a PDF: look for the structured marker lines we embedded
async function extractPdfText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const ab = ev.target?.result as ArrayBuffer
      const u8 = new Uint8Array(ab)
      let text = ''
      for (let i = 0; i < u8.length - 1; i++) {
        // Extract printable ASCII from PDF stream
        if (u8[i] >= 32 && u8[i] < 127) text += String.fromCharCode(u8[i])
        else text += ' '
      }
      resolve(text)
    }
    reader.readAsArrayBuffer(file)
  })
}

export default function ExpenditureTracker() {
  const {
    paymentSchedules,
    expenditureDeductions,
    addExpenditureDeduction,
    removeExpenditureDeductions,
    updatePaymentSchedule,
    project,
    deptAllocations,
    lineItems,
  } = useBudgetStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [pendingUpload, setPendingUpload] = useState<{
    file: File
    scheduleId: string
    scheduleNumber: string
    rows: { budgetCode: string; department: string; amount: number }[]
  } | null>(null)
  const [sigConfirm, setSigConfirm] = useState({ line1: false, line2: false, line3: false })

  // Build per-dept summary
  const store = useBudgetStore.getState()
  const deptRows = DEPARTMENTS.map(dept => {
    const target = getDeptTarget(dept.code, store)
    const lineItemTotal = (lineItems[dept.code] || []).reduce((s, item) => s + item.qty * item.rate, 0)
    const deducted = expenditureDeductions
      .filter(d => d.budgetCode === dept.code)
      .reduce((s, d) => s + d.amount, 0)
    const remaining = target - deducted
    const pct = target > 0 ? (deducted / target) * 100 : 0
    return { dept, target, lineItemTotal, deducted, remaining, pct }
  }).filter(r => r.target > 0 || r.deducted > 0)

  const totalBudget = project.totalBudget
  const totalDeducted = expenditureDeductions.reduce((s, d) => s + d.amount, 0)
  const totalRemaining = totalBudget - totalDeducted

  // Approved schedules that haven't been processed yet
  const processedIds = new Set(expenditureDeductions.map(d => d.scheduleId))

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.name.endsWith('.pdf')) { setUploadMsg('Please select a PDF file.'); return }
    if (fileInputRef.current) fileInputRef.current.value = ''

    setUploading(true)
    setUploadMsg('Reading PDF…')

    // Try to find which schedule this PDF belongs to by looking for the schedule number
    const text = await extractPdfText(file)
    const matchedSchedule = paymentSchedules.find(s => text.includes(s.scheduleNumber))

    if (!matchedSchedule) {
      setUploadMsg('Could not match PDF to a known payment schedule. Ensure you are uploading an exported schedule from this project.')
      setUploading(false)
      return
    }

    if (processedIds.has(matchedSchedule.id)) {
      setUploadMsg(`${matchedSchedule.scheduleNumber} has already been processed and deducted.`)
      setUploading(false)
      return
    }

    const rows = matchedSchedule.rows.map(r => {
      const vat = r.paymentValue * (r.vatRate / 100)
      const wht = r.paymentValue * (r.whtRate / 100)
      return {
        budgetCode: r.budgetCode,
        department: r.department,
        amount: r.paymentValue + vat - wht,
      }
    })

    setPendingUpload({ file, scheduleId: matchedSchedule.id, scheduleNumber: matchedSchedule.scheduleNumber, rows })
    setSigConfirm({ line1: false, line2: false, line3: false })
    setUploadMsg('')
    setUploading(false)
  }

  function handleConfirmDeduction() {
    if (!pendingUpload) return
    if (!sigConfirm.line1 || !sigConfirm.line2 || !sigConfirm.line3) {
      setUploadMsg('All three signatures must be confirmed before processing.')
      return
    }

    const now = new Date().toISOString()
    pendingUpload.rows.forEach(row => {
      if (!row.budgetCode) return
      const deduction: ExpenditureDeduction = {
        scheduleId: pendingUpload.scheduleId,
        scheduleNumber: pendingUpload.scheduleNumber,
        budgetCode: row.budgetCode,
        department: row.department,
        amount: row.amount,
        approvedAt: now,
      }
      addExpenditureDeduction(deduction)
    })

    updatePaymentSchedule(pendingUpload.scheduleId, { status: 'approved', signedPdfPath: pendingUpload.file.name })
    setUploadMsg(`✓ ${pendingUpload.scheduleNumber} processed — amounts deducted from budget balances.`)
    setPendingUpload(null)
  }

  function handleUndoDeduction(scheduleId: string, scheduleNumber: string) {
    if (!confirm(`Reverse deductions from ${scheduleNumber}?`)) return
    removeExpenditureDeductions(scheduleId)
    updatePaymentSchedule(scheduleId, { status: 'exported' })
    setUploadMsg(`Deductions from ${scheduleNumber} reversed.`)
  }

  // Group deductions by schedule for the history table
  const deductionsBySchedule = Object.values(
    expenditureDeductions.reduce((acc, d) => {
      if (!acc[d.scheduleId]) acc[d.scheduleId] = { scheduleNumber: d.scheduleNumber, total: 0, approvedAt: d.approvedAt, scheduleId: d.scheduleId }
      acc[d.scheduleId].total += d.amount
      return acc
    }, {} as Record<string, { scheduleNumber: string; total: number; approvedAt: string; scheduleId: string }>)
  )

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Expenditure Tracker</div>
        <div className="screen-sub">
          Running budget balance per department after approved payment schedules are applied.
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Budget', value: totalBudget, color: 'var(--text)' },
          { label: 'Total Deducted', value: totalDeducted, color: 'var(--red)' },
          { label: 'Remaining Balance', value: totalRemaining, color: totalRemaining >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(c => (
          <div key={c.label} style={{
            padding: '16px 20px', background: 'var(--bg2)',
            border: '1px solid var(--border)', borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color, fontVariantNumeric: 'tabular-nums' }}>₦{fmt(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Upload signed PDF */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Upload Signed Payment Schedule</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
            Once a schedule has been physically signed and scanned, upload the PDF here.
            Confirm that all three authorisation signatures are present, then the amounts
            will be deducted from the relevant budget lines.
          </p>

          {!pendingUpload ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
              <button
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Reading…' : '↑ Upload Signed PDF'}
              </button>
              {uploadMsg && (
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: uploadMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
                }}>{uploadMsg}</span>
              )}
            </div>
          ) : (
            <div style={{
              padding: '16px', background: 'rgba(245,166,35,0.05)',
              border: '1px solid rgba(245,166,35,0.25)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                Matched: <span style={{ color: 'var(--accent)' }}>{pendingUpload.scheduleNumber}</span> — confirm signatures
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Check the uploaded PDF and confirm all three authorisation lines are signed:
              </div>
              {[
                { key: 'line1' as const, label: 'Line Producer (Prepared by) — signature present' },
                { key: 'line2' as const, label: 'Production Accountant (Reviewed by) — signature present' },
                { key: 'line3' as const, label: 'Executive Producer (Approved by) — signature present' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sigConfirm[key]}
                    onChange={e => setSigConfirm(s => ({ ...s, [key]: e.target.checked }))}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
                </label>
              ))}

              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>
                Line items to be deducted ({pendingUpload.rows.length} rows):
                {pendingUpload.rows.map((r, i) => (
                  <span key={i} style={{ display: 'block', marginTop: 2 }}>
                    [{r.budgetCode}] {r.department} — ₦{fmt(r.amount)}
                  </span>
                ))}
              </div>

              {uploadMsg && (
                <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, fontWeight: 600 }}>{uploadMsg}</div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!sigConfirm.line1 || !sigConfirm.line2 || !sigConfirm.line3}
                  onClick={handleConfirmDeduction}
                >
                  Process Deduction
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setPendingUpload(null); setUploadMsg('') }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Department balance table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Balance by Department</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {deptRows.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              Set department allocations in Assumptions to see balances here.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Code', 'Department', 'Budget Target', 'Line Items', 'Approved Spend', 'Remaining', 'Used %'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: h === 'Code' || h === 'Used %' ? 'center' : 'left',
                      background: 'var(--bg2)', color: 'var(--text3)',
                      fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
                      letterSpacing: '0.04em', borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptRows.map(({ dept, target, lineItemTotal, deducted, remaining, pct }) => (
                  <tr key={dept.code} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: 11 }}>{dept.code}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--text)' }}>{dept.name}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' }}>₦{fmt(target)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' }}>₦{fmt(lineItemTotal)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: deducted > 0 ? 'var(--red)' : 'var(--text3)' }}>
                      {deducted > 0 ? `₦${fmt(deducted)}` : '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                      ₦{fmt(remaining)}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--accent)' : 'var(--green)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{formatPercent(pct)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Approved schedule history */}
      {deductionsBySchedule.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Approved Schedule History</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Schedule', 'Total Deducted', 'Approved', ''].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left',
                      background: 'var(--bg2)', color: 'var(--text3)',
                      fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
                      letterSpacing: '0.04em', borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deductionsBySchedule.map(d => (
                  <tr key={d.scheduleId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--accent)' }}>{d.scheduleNumber}</td>
                    <td style={{ padding: '7px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--red)' }}>₦{fmt(d.total)}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--text3)' }}>{new Date(d.approvedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, color: 'var(--text3)' }}
                        onClick={() => handleUndoDeduction(d.scheduleId, d.scheduleNumber)}
                      >
                        Reverse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

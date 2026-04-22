import { useState, useRef } from 'react'
import { useBudgetStore, DEPARTMENTS, PaymentSchedule, PaymentScheduleRow } from '../store/budgetStore'

function uid() { return Math.random().toString(36).slice(2) }

function nextScheduleNumber(schedules: PaymentSchedule[]): string {
  const n = schedules.length + 1
  return `PS-${String(n).padStart(3, '0')}`
}

function calcAmountPayable(row: PaymentScheduleRow): number {
  const vat = row.paymentValue * (row.vatRate / 100)
  const wht = row.paymentValue * (row.whtRate / 100)
  return row.paymentValue + vat - wht
}

function fmt(n: number) {
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function deptNameFromCode(code: string): string {
  return DEPARTMENTS.find(d => d.code === code)?.name ?? ''
}

const emptyRow = (globalVat: number, globalWht: number): PaymentScheduleRow => ({
  id: uid(),
  payeeName: '',
  description: '',
  budgetCode: '',
  department: '',
  bankName: '',
  accountNumber: '',
  paymentValue: 0,
  vatRate: globalVat,
  whtRate: globalWht,
})

interface ScheduleEditorProps {
  schedule: PaymentSchedule
  onUpdate: (updates: Partial<PaymentSchedule>) => void
  onDelete: () => void
  onExport: () => void
  projectTitle: string
  existingCodes: string[]
}

function ScheduleEditor({ schedule, onUpdate, onDelete, onExport, projectTitle, existingCodes }: ScheduleEditorProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)

  function updateRow(id: string, field: keyof PaymentScheduleRow, value: string | number) {
    const rows = schedule.rows.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, [field]: value }
      if (field === 'budgetCode') {
        updated.department = deptNameFromCode(String(value))
      }
      return updated
    })
    onUpdate({ rows })
  }

  function addRow() {
    onUpdate({ rows: [...schedule.rows, emptyRow(schedule.globalVatRate, schedule.globalWhtRate)] })
  }

  function removeRow(id: string) {
    onUpdate({ rows: schedule.rows.filter(r => r.id !== id) })
  }

  function applyGlobalRates() {
    onUpdate({
      rows: schedule.rows.map(r => ({ ...r, vatRate: schedule.globalVatRate, whtRate: schedule.globalWhtRate }))
    })
  }

  const totalPaymentValue = schedule.rows.reduce((s, r) => s + r.paymentValue, 0)
  const totalVat = schedule.rows.reduce((s, r) => s + r.paymentValue * (r.vatRate / 100), 0)
  const totalWht = schedule.rows.reduce((s, r) => s + r.paymentValue * (r.whtRate / 100), 0)
  const totalPayable = schedule.rows.reduce((s, r) => s + calcAmountPayable(r), 0)

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      {/* Schedule header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px',
        background: 'var(--bg2)',
        borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }} onClick={() => setCollapsed(c => !c)}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.04em' }}>
          {schedule.scheduleNumber}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {projectTitle || 'Untitled Project'}
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: schedule.status === 'approved' ? 'rgba(26,122,74,0.12)' : schedule.status === 'exported' ? 'rgba(52,152,219,0.12)' : 'rgba(245,166,35,0.08)',
          color: schedule.status === 'approved' ? 'var(--green)' : schedule.status === 'exported' ? '#3498db' : 'var(--accent)',
          border: `1px solid ${schedule.status === 'approved' ? 'rgba(26,122,74,0.25)' : schedule.status === 'exported' ? 'rgba(52,152,219,0.25)' : 'rgba(245,166,35,0.2)'}`,
        }}>
          {schedule.status.toUpperCase()}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
          ₦{fmt(totalPayable)} payable
        </span>
        <span style={{ fontSize: 16, color: 'var(--text3)' }}>{collapsed ? '›' : '˅'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '18px 18px' }}>
          {/* Global rates */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 16px', marginBottom: 16,
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 8,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
              Global Rates
            </span>
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 10 }}>VAT Rate (%)</label>
              <input
                type="number" min={0} max={100} step={0.5}
                value={schedule.globalVatRate || ''}
                onChange={e => onUpdate({ globalVatRate: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 10 }}>WHT Rate (%)</label>
              <input
                type="number" min={0} max={100} step={0.5}
                value={schedule.globalWhtRate || ''}
                onChange={e => onUpdate({ globalWhtRate: Number(e.target.value) })}
                style={{ width: 80 }}
              />
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={applyGlobalRates}>
              Apply to all rows
            </button>
          </div>

          {/* Row table */}
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['S/N', 'Payee Name', 'Description', 'Budget Code', 'Department', 'Bank', 'Account No.', 'Payment Value', 'VAT %', 'WHT %', 'Amount Payable', ''].map(h => (
                    <th key={h} style={{
                      padding: '7px 8px', textAlign: 'left',
                      background: 'var(--bg3)', color: 'var(--text3)',
                      fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
                      letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      border: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row, idx) => {
                  const payable = calcAmountPayable(row)
                  const codeValid = !row.budgetCode || existingCodes.includes(row.budgetCode)
                  return (
                    <tr key={row.id} style={{ background: idx % 2 === 0 ? 'var(--bg)' : 'var(--bg3)' }}>
                      <td style={{ padding: '5px 8px', border: '1px solid var(--border)', color: 'var(--text3)', textAlign: 'center', minWidth: 36 }}>{idx + 1}</td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 130 }}>
                        <input className="td-input" value={row.payeeName} onChange={e => updateRow(row.id, 'payeeName', e.target.value)} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11 }} placeholder="Payee…" />
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 150 }}>
                        <input className="td-input" value={row.description} onChange={e => updateRow(row.id, 'description', e.target.value)} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11 }} placeholder="Description…" />
                      </td>
                      <td style={{ border: `1px solid ${codeValid ? 'var(--border)' : 'var(--red)'}`, padding: 2, minWidth: 90 }}>
                        <select
                          value={row.budgetCode}
                          onChange={e => updateRow(row.id, 'budgetCode', e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11 }}
                        >
                          <option value="">— Select —</option>
                          {DEPARTMENTS.map(d => (
                            <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: '5px 8px', minWidth: 130, fontSize: 11, color: 'var(--text2)' }}>
                        {row.department || '—'}
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 110 }}>
                        <input className="td-input" value={row.bankName} onChange={e => updateRow(row.id, 'bankName', e.target.value)} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11 }} placeholder="Bank…" />
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 110 }}>
                        <input className="td-input" value={row.accountNumber} onChange={e => updateRow(row.id, 'accountNumber', e.target.value)} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11 }} placeholder="0000000000" />
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 110 }}>
                        <input type="number" className="td-input" value={row.paymentValue || ''} onChange={e => updateRow(row.id, 'paymentValue', Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, textAlign: 'right' }} placeholder="0" />
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 64 }}>
                        <input type="number" value={row.vatRate || ''} onChange={e => updateRow(row.id, 'vatRate', Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, textAlign: 'right' }} />
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: 2, minWidth: 64 }}>
                        <input type="number" value={row.whtRate || ''} onChange={e => updateRow(row.id, 'whtRate', Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, textAlign: 'right' }} />
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: '5px 8px', minWidth: 120, textAlign: 'right', fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                        ₦{fmt(payable)}
                      </td>
                      <td style={{ border: '1px solid var(--border)', padding: '5px 6px', textAlign: 'center' }}>
                        <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => removeRow(row.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Totals row */}
              {schedule.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={7} style={{ padding: '7px 8px', fontWeight: 700, fontSize: 11, color: 'var(--text)', border: '1px solid var(--border)', textAlign: 'right', background: 'var(--bg2)' }}>TOTALS</td>
                    <td style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'right', border: '1px solid var(--border)', background: 'var(--bg2)', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>₦{fmt(totalPaymentValue)}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'right', border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 11, color: 'var(--text2)' }}>+₦{fmt(totalVat)}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'right', border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 11, color: 'var(--red)' }}>-₦{fmt(totalWht)}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 800, textAlign: 'right', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--green)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>₦{fmt(totalPayable)}</td>
                    <td style={{ border: '1px solid var(--border)', background: 'var(--bg2)' }} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <button className="btn btn-ghost btn-sm" onClick={addRow} style={{ marginBottom: 20 }}>
            + Add Row
          </button>

          {/* Authorisation blocks */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
            padding: '16px', background: 'var(--bg3)',
            border: '1px solid var(--border)', borderRadius: 8,
            marginBottom: 16,
          }}>
            {([
              { label: 'Prepared by: Line Producer', field: 'preparedBy' as const },
              { label: 'Reviewed by: Production Accountant', field: 'reviewedBy' as const },
              { label: 'Approved by: Executive Producer', field: 'approvedBy' as const },
            ] as const).map(({ label, field }) => (
              <div key={field} className="field" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 10 }}>{label}</label>
                <input
                  value={schedule[field]}
                  onChange={e => onUpdate({ [field]: e.target.value })}
                  placeholder="Full name"
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {exportConfirm ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>Export this payment schedule as PDF?</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => { setExportConfirm(false); onExport() }}
                >
                  Yes, Export PDF
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setExportConfirm(false)}>Cancel</button>
              </>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setExportConfirm(true)}
                disabled={schedule.rows.length === 0}
              >
                Export PDF…
              </button>
            )}
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--red)', marginLeft: 'auto' }}>Delete this schedule?</span>
                <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto', color: 'var(--red)', fontSize: 11 }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete Schedule
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PaymentScheduleCreator() {
  const {
    project,
    paymentSchedules,
    addPaymentSchedule,
    updatePaymentSchedule,
    removePaymentSchedule,
    companyProfile,
  } = useBudgetStore()

  const [exporting, setExporting] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState('')

  const existingCodes = DEPARTMENTS.map(d => d.code)

  function handleNewSchedule() {
    const schedule: PaymentSchedule = {
      id: uid(),
      scheduleNumber: nextScheduleNumber(paymentSchedules),
      globalVatRate: 7.5,
      globalWhtRate: 5,
      rows: [],
      preparedBy: '',
      reviewedBy: '',
      approvedBy: '',
      createdAt: new Date().toISOString(),
      status: 'draft',
    }
    addPaymentSchedule(schedule)
  }

  async function handleExport(schedule: PaymentSchedule) {
    if (!window.electronAPI) {
      alert('PDF export is only available in the desktop app.')
      return
    }
    setExporting(schedule.id)
    setExportMsg('')

    const totalPayable = schedule.rows.reduce((s, r) => {
      const vat = r.paymentValue * (r.vatRate / 100)
      const wht = r.paymentValue * (r.whtRate / 100)
      return s + r.paymentValue + vat - wht
    }, 0)
    const totalValue = schedule.rows.reduce((s, r) => s + r.paymentValue, 0)

    const logoHtml = companyProfile.logoDataUrl
      ? `<img src="${companyProfile.logoDataUrl}" alt="logo" style="height:60px;object-fit:contain;" />`
      : ''

    const companyHtml = [
      companyProfile.name && `<div style="font-weight:700;font-size:13px;">${companyProfile.name}</div>`,
      companyProfile.address && `<div style="font-size:11px;color:#555;">${companyProfile.address}</div>`,
      companyProfile.email && `<div style="font-size:11px;color:#555;">${companyProfile.email}</div>`,
      companyProfile.phone && `<div style="font-size:11px;color:#555;">${companyProfile.phone}</div>`,
    ].filter(Boolean).join('')

    const rowsHtml = schedule.rows.map((r, i) => {
      const vat = r.paymentValue * (r.vatRate / 100)
      const wht = r.paymentValue * (r.whtRate / 100)
      const payable = r.paymentValue + vat - wht
      return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;">${i + 1}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;">${r.payeeName}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;">${r.description}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;">${r.budgetCode}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;">${r.department}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;">${r.bankName}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;">${r.accountNumber}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:right;">₦${fmt(r.paymentValue)}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:right;">${r.vatRate}%</td>
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:right;">${r.whtRate}%</td>
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:right;font-weight:700;">₦${fmt(payable)}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${schedule.scheduleNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Calibri', Arial, sans-serif; font-size: 11px; color: #1a2030; padding: 30px 36px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1B2A4A; color: #fff; padding: 6px 7px; font-size: 10px; text-align: left; border: 1px solid #ccc; }
  .auth-block { border-top: 1px solid #1B2A4A; padding-top: 4px; margin-top: 30px; }
  .auth-label { font-size: 10px; color: #555; margin-bottom: 2px; }
  .auth-name { font-weight: 700; font-size: 12px; margin-bottom: 16px; }
  .sig-line { border-bottom: 1px solid #999; width: 180px; margin-bottom: 4px; height: 24px; }
  .sig-meta { font-size: 9px; color: #777; }
  .totals td { background: #e8ecf2; font-weight: 700; }
</style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;border-bottom:2px solid #1B2A4A;padding-bottom:16px;">
    <div>${logoHtml}${companyHtml ? `<div style="margin-top:${companyProfile.logoDataUrl ? '8px' : '0'}">${companyHtml}</div>` : ''}</div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:800;color:#1B2A4A;">PAYMENT SCHEDULE</div>
      <div style="font-size:13px;font-weight:700;margin:4px 0;">${schedule.scheduleNumber}</div>
      <div style="font-size:12px;color:#555;">Production: <strong>${project.title || 'Untitled'}</strong></div>
      <div style="font-size:11px;color:#777;margin-top:2px;">Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <!-- Table -->
  <table style="margin-bottom:16px;">
    <thead>
      <tr>
        <th style="width:36px;text-align:center;">S/N</th>
        <th>Payee's Name</th>
        <th>Description</th>
        <th style="width:60px;text-align:center;">Budget Code</th>
        <th>Department</th>
        <th>Bank</th>
        <th>Account No.</th>
        <th style="text-align:right;">Payment Value</th>
        <th style="text-align:right;">VAT</th>
        <th style="text-align:right;">WHT</th>
        <th style="text-align:right;">Amount Payable</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr class="totals">
        <td colspan="7" style="padding:6px 7px;border:1px solid #ddd;text-align:right;font-size:11px;">TOTAL</td>
        <td style="padding:6px 7px;border:1px solid #ddd;text-align:right;">₦${fmt(totalValue)}</td>
        <td style="padding:6px 7px;border:1px solid #ddd;"></td>
        <td style="padding:6px 7px;border:1px solid #ddd;"></td>
        <td style="padding:6px 7px;border:1px solid #ddd;text-align:right;color:#1a7a4a;">₦${fmt(totalPayable)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Authorisation -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;margin-top:36px;">
    ${[
      { role: 'Prepared by: Line Producer', name: schedule.preparedBy },
      { role: 'Reviewed by: Production Accountant', name: schedule.reviewedBy },
      { role: 'Approved by: Executive Producer', name: schedule.approvedBy },
    ].map(a => `
      <div>
        <div class="auth-label">${a.role}</div>
        <div class="auth-name">${a.name || '___________________________'}</div>
        <div style="margin-bottom:4px;">
          <div class="sig-line"></div>
          <div class="sig-meta">Signature</div>
        </div>
        <div style="margin-top:10px;">
          <div class="sig-line"></div>
          <div class="sig-meta">Date</div>
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>`

    try {
      const result = await window.electronAPI.printToPdf(html, `${project.title || 'Project'}_${schedule.scheduleNumber}.pdf`)
      if (result.success) {
        updatePaymentSchedule(schedule.id, { status: 'exported' })
        setExportMsg(`✓ Exported: ${result.filePath}`)
      } else {
        setExportMsg(`✕ Export failed: ${result.error ?? 'Unknown error'}`)
      }
    } catch (err) {
      setExportMsg(`✕ ${String(err)}`)
    }
    setExporting(null)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Payment Schedule Creator</div>
        <div className="screen-sub">
          Build, export, and track payment schedules for this production.
          Schedule numbers auto-increment per project.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          {paymentSchedules.length} schedule{paymentSchedules.length !== 1 ? 's' : ''} · Production: <strong style={{ color: 'var(--text)' }}>{project.title || 'Untitled'}</strong>
        </div>
        <button className="btn btn-primary" onClick={handleNewSchedule}>
          + New Schedule
        </button>
      </div>

      {exportMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12,
          background: exportMsg.startsWith('✓') ? 'rgba(26,122,74,0.08)' : 'rgba(231,76,60,0.08)',
          border: `1px solid ${exportMsg.startsWith('✓') ? 'rgba(26,122,74,0.25)' : 'rgba(231,76,60,0.25)'}`,
          color: exportMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
          fontWeight: 600,
        }}>
          {exportMsg}
        </div>
      )}

      {exporting && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          ⏳ Generating PDF…
        </div>
      )}

      {paymentSchedules.length === 0 ? (
        <div style={{
          padding: '48px 0', textAlign: 'center', color: 'var(--text3)',
          border: '1px dashed var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No payment schedules yet</div>
          <div style={{ fontSize: 12 }}>Click "+ New Schedule" to create your first payment schedule.</div>
        </div>
      ) : (
        paymentSchedules.map(schedule => (
          <ScheduleEditor
            key={schedule.id}
            schedule={schedule}
            onUpdate={updates => updatePaymentSchedule(schedule.id, updates)}
            onDelete={() => removePaymentSchedule(schedule.id)}
            onExport={() => handleExport(schedule)}
            projectTitle={project.title}
            existingCodes={existingCodes}
          />
        ))
      )}
    </div>
  )
}

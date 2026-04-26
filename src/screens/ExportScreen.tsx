import { useState } from 'react'
import { useBudgetStore, BudgetState, DEPARTMENTS, DeptCode, getDeptTarget, getDeptActual, getTotalMonths } from '../store/budgetStore'
import { generateBudgetXlsx } from '../export/generateBudget'
import { formatCurrency } from '../utils/formatCurrency'
import { formatPercent } from '../utils/formatPercent'
import { deriveProductionStats } from '../utils/deriveProductionStats'

function fmt(n: number, cur = 'NGN') { return formatCurrency(n, cur) }

function generateSummaryHtml(store: BudgetState): string {
  const { project, expenditureDeductions } = store
  const cur = project.currency || 'NGN'
  const stats = deriveProductionStats(store)
  const { totalBudget, totalSpent, remaining, usedPct } = stats
  const allDeds = [...expenditureDeductions].sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime())
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const deptRows2 = DEPARTMENTS.map(d => {
    const budgeted = getDeptTarget(d.code as DeptCode, store)
    const spent = expenditureDeductions.filter((x: BudgetState['expenditureDeductions'][0]) => x.budgetCode === d.code).reduce((s: number, x: BudgetState['expenditureDeductions'][0]) => s + x.amount, 0)
    return { code: d.code, name: d.name, budgeted, spent, remaining: budgeted - spent }
  }).filter(d => d.budgeted > 0 || d.spent > 0)

  const deptRowsHtml = deptRows2.map(d => {
    const pct = d.budgeted > 0 ? Math.min(100, (d.spent / d.budgeted) * 100).toFixed(1) : '0.0'
    const status = d.spent > d.budgeted ? 'OVER BUDGET' : d.budgeted > 0 && (d.budgeted - d.spent) / d.budgeted <= 0.15 ? 'AT RISK' : 'ON TRACK'
    const statusColor = status === 'OVER BUDGET' ? '#dc2626' : status === 'AT RISK' ? '#d97706' : '#059669'
    return `<tr>
      <td>${d.code}</td><td>${d.name}</td>
      <td class="num">${fmt(d.budgeted, cur)}</td>
      <td class="num">${fmt(d.spent, cur)}</td>
      <td class="num" style="color:${d.remaining < 0 ? '#dc2626' : '#059669'}">${fmt(d.remaining, cur)}</td>
      <td class="num">${pct}%</td>
      <td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:${statusColor}20;color:${statusColor}">${status}</span></td>
    </tr>`
  }).join('')

  const paymentsHtml = allDeds.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:20px">No approved payments recorded yet.</td></tr>'
    : allDeds.map((d, i) => `<tr>
        <td style="font-weight:600">${d.scheduleNumber}</td>
        <td>${d.department}</td>
        <td>${new Date(d.approvedAt).toLocaleDateString('en-GB')}</td>
        <td class="num" style="color:#dc2626;font-weight:700">−${fmt(d.amount, cur)}</td>
      </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${project.title || 'Project'} — Spend Summary</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',-apple-system,sans-serif;font-size:13px;color:#1a1d2e;background:#fff;padding:40px 48px}
@media print{body{padding:24px 32px}@page{margin:16mm}}
h1{font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#1a1d2e;margin-bottom:2px}
.meta{font-size:11px;color:#9ca3af;margin-bottom:32px}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--c,#7c3aed);border-radius:12px 12px 0 0}
.kpi-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
.kpi-value{font-size:20px;font-weight:800;color:#1a1d2e;letter-spacing:-0.5px;margin-bottom:4px}
.kpi-sub{font-size:10px;color:#6b7280;font-weight:500}
.section{margin-bottom:32px}
.section-title{font-size:15px;font-weight:700;color:#1a1d2e;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e2e8f0;background:#f8fafc}
td{padding:10px 12px;border-bottom:1px solid #f0f2f8;color:#374151}
tr:last-child td{border-bottom:none}
tr:hover td{background:#fafafa}
.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.bar-wrap{width:80px;height:5px;background:#e2e8f0;border-radius:100px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
.progress-bar{height:8px;background:#e2e8f0;border-radius:100px;overflow:hidden;margin-top:8px}
.progress-fill{height:100%;border-radius:100px;background:${usedPct > 90 ? '#dc2626' : usedPct > 70 ? '#d97706' : '#059669'}}
</style>
</head>
<body>
<h1>${project.title || 'Untitled Project'}</h1>
<div class="meta">${project.company || ''} &nbsp;·&nbsp; Spend Summary &nbsp;·&nbsp; Generated ${today}</div>

<div class="kpi-row">
  <div class="kpi" style="--c:#7c3aed">
    <div class="kpi-label">Total Budget</div>
    <div class="kpi-value">${fmt(totalBudget, cur)}</div>
    <div class="kpi-sub">Approved budget</div>
  </div>
  <div class="kpi" style="--c:${usedPct > 90 ? '#dc2626' : usedPct > 70 ? '#d97706' : '#059669'}">
    <div class="kpi-label">Total Spent</div>
    <div class="kpi-value">${fmt(totalSpent, cur)}</div>
    <div class="kpi-sub">${allDeds.length} approved schedule${allDeds.length !== 1 ? 's' : ''}</div>
  </div>
  <div class="kpi" style="--c:${remaining < 0 ? '#dc2626' : '#059669'}">
    <div class="kpi-label">Remaining</div>
    <div class="kpi-value">${fmt(remaining, cur)}</div>
    <div class="kpi-sub">${remaining < 0 ? 'Over budget' : 'Available'}</div>
  </div>
  <div class="kpi" style="--c:#d97706">
    <div class="kpi-label">Budget Used</div>
    <div class="kpi-value">${usedPct.toFixed(1)}%</div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, usedPct)}%"></div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Department Breakdown</div>
  <table>
    <thead><tr><th>Code</th><th>Department</th><th class="num">Budgeted</th><th class="num">Spent</th><th class="num">Remaining</th><th class="num">Used %</th><th>Status</th></tr></thead>
    <tbody>${deptRowsHtml}</tbody>
    <tfoot>
      <tr style="background:#f8fafc;font-weight:700">
        <td colspan="2" style="font-weight:700;font-size:12px">TOTAL</td>
        <td class="num">${fmt(totalBudget, cur)}</td>
        <td class="num">${fmt(totalSpent, cur)}</td>
        <td class="num" style="color:${remaining < 0 ? '#dc2626' : '#059669'}">${fmt(remaining, cur)}</td>
        <td class="num">${usedPct.toFixed(1)}%</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</div>

<div class="section">
  <div class="section-title">Payment History</div>
  <table>
    <thead><tr><th>Schedule</th><th>Department</th><th>Date</th><th class="num">Amount</th></tr></thead>
    <tbody>${paymentsHtml}</tbody>
    ${allDeds.length > 0 ? `<tfoot><tr style="background:#f8fafc;font-weight:700"><td colspan="3" style="font-weight:700">TOTAL PAID OUT</td><td class="num" style="color:#dc2626">−${fmt(totalSpent, cur)}</td></tr></tfoot>` : ''}
  </table>
</div>

<div class="footer">
  <span>Feemo Budget Manager &nbsp;·&nbsp; ${project.title || 'Project'}</span>
  <span>Generated ${today}</span>
</div>

</body>
</html>`
}

export default function ExportScreen() {
  const store = useBudgetStore()
  const { project, timeline, installments, salaryRoles, expenditureDeductions } = store
  const [xlsxStatus, setXlsxStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [xlsxMsg, setXlsxMsg] = useState('')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [pdfMsg, setPdfMsg] = useState('')

  const cur = project.currency || 'NGN'
  const totalMonths = getTotalMonths(timeline)
  const grandBudget = project.totalBudget
  const entered = DEPARTMENTS.reduce((sum, d) => sum + getDeptActual(d.code as DeptCode, store), 0)
  const instPct = installments.reduce((s, i) => s + i.percentage, 0)
  const totalSalary = salaryRoles.reduce((sum, r) => sum + Object.values(r.monthlyAmounts).reduce((s, v) => s + v, 0), 0)

  const stats = deriveProductionStats(store)
  const { totalSpent, remaining, usedPct, deptRows } = stats
  const allDeds = [...expenditureDeductions].sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime())

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

  async function handleExcelExport() {
    setXlsxStatus('busy')
    setXlsxMsg('')
    try {
      const buffer = await generateBudgetXlsx(store)
      const arr = Array.from(new Uint8Array(buffer))
      const slug = (project.title || 'budget').replace(/\s+/g, '_')
      const filename = `${slug}_Budget_${new Date().toISOString().split('T')[0]}.xlsx`
      if (window.electronAPI) {
        const result = await window.electronAPI.saveFile(arr, filename)
        if (result.success) { setXlsxStatus('done'); setXlsxMsg(`Saved: ${result.filePath}`) }
        else setXlsxStatus('idle')
      } else {
        const blob = new Blob([new Uint8Array(arr)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
        setXlsxStatus('done'); setXlsxMsg(`Downloaded: ${filename}`)
      }
    } catch (e) { setXlsxStatus('error'); setXlsxMsg(String(e)) }
  }

  async function handlePdfSummary() {
    setPdfStatus('busy')
    setPdfMsg('')
    try {
      const html = generateSummaryHtml(store)
      const slug = (project.title || 'spend-summary').replace(/\s+/g, '_')
      const filename = `${slug}_Spend_Summary_${new Date().toISOString().split('T')[0]}.pdf`
      if (window.electronAPI) {
        const result = await window.electronAPI.printToPdf(html, filename)
        if (result.success) { setPdfStatus('done'); setPdfMsg(`Saved: ${result.filePath}`) }
        else { setPdfStatus('idle') }
      } else {
        // Browser fallback: open in new tab for manual save-as-PDF
        const w = window.open('', '_blank', 'width=900,height=700')
        if (w) { w.document.write(html); w.document.close() }
        setPdfStatus('done'); setPdfMsg('Opened in new tab — use File > Save as PDF')
      }
    } catch (e) { setPdfStatus('error'); setPdfMsg(String(e)) }
  }

  const spentStripe = usedPct > 90 ? 'var(--accent-red)' : usedPct > 70 ? 'var(--accent-amber)' : 'var(--accent-green)'

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Export &amp; Reports</div>
        <div className="screen-sub">Download your budget workbook or a live spend summary.</div>
      </div>

      {/* ── Spend Summary KPIs ── */}
      {grandBudget > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Budget', value: fmt(grandBudget, cur), sub: 'Approved', stripe: 'var(--accent-purple)' },
            { label: 'Total Spent', value: fmt(totalSpent, cur), sub: `${allDeds.length} approved schedule${allDeds.length !== 1 ? 's' : ''}`, stripe: spentStripe },
            { label: 'Remaining', value: fmt(remaining, cur), sub: remaining < 0 ? 'Over budget' : 'Available', stripe: remaining < 0 ? 'var(--accent-red)' : 'var(--accent-green)' },
            { label: 'Budget Used', value: formatPercent(usedPct), sub: `${formatPercent(100 - usedPct)} remaining`, stripe: spentStripe },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.stripe, borderRadius: '14px 14px 0 0' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Two download options ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        {/* Excel Workbook */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Full Budget Workbook</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            Complete 6-sheet Excel file — Assumptions, Budget Summary, Line Items, Payment Schedule, Salary Forecast, and Production Forecast.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {['ASSUMPTIONS', 'BUDGET SUMMARY', 'LINE ITEMS', 'SALARY', 'FORECAST'].map(s => (
              <span key={s} style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.08)', color: 'var(--accent-purple)', letterSpacing: '0.04em' }}>{s}</span>
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={xlsxStatus === 'busy'}
            onClick={handleExcelExport}
          >
            {xlsxStatus === 'busy' ? 'Generating…' : xlsxStatus === 'done' ? '✓ Export Complete' : '↓ Download Excel Workbook'}
          </button>
          {xlsxMsg && <div style={{ fontSize: 10, color: xlsxStatus === 'error' ? 'var(--accent-red)' : 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>{xlsxMsg}</div>}
          {xlsxStatus === 'done' && (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => { setXlsxStatus('idle'); setXlsxMsg('') }}>Export Again</button>
          )}
        </div>

        {/* PDF Spend Summary */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>PDF Spend Summary</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            One-page spend report showing total budget vs spent, department breakdown, and full payment history. Opens in a print dialog — save as PDF.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {['SPEND OVERVIEW', 'DEPT BREAKDOWN', 'PAYMENT HISTORY'].map(s => (
              <span key={s} style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(5,150,105,0.08)', color: 'var(--accent-green)', letterSpacing: '0.04em' }}>{s}</span>
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', background: 'var(--accent-green)', boxShadow: '0 4px 14px rgba(5,150,105,0.25)' }}
            onClick={handlePdfSummary}
            disabled={grandBudget === 0 || pdfStatus === 'busy'}
          >
            {pdfStatus === 'busy' ? 'Generating…' : pdfStatus === 'done' ? '✓ PDF Saved' : '↓ Download PDF Summary'}
          </button>
          {grandBudget === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>Set a total budget first to enable this export.</div>}
          {pdfMsg && <div style={{ fontSize: 10, color: pdfStatus === 'error' ? 'var(--accent-red)' : 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>{pdfMsg}</div>}
          {pdfStatus === 'done' && (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => { setPdfStatus('idle'); setPdfMsg('') }}>Export Again</button>
          )}
        </div>
      </div>

      {/* ── Department breakdown table ── */}
      {deptRows.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, marginBottom: 24, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Department Spend Breakdown</div>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{deptRows.length} active departments</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Code', 'Department', 'Budgeted', 'Spent', 'Remaining', 'Used %', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Code' || h === 'Department' || h === 'Status' ? 'left' : 'right', padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptRows.map((d, i) => {
                  const pct = d.budgeted > 0 ? (d.spent / d.budgeted) * 100 : 0
                  const chipBg = d.status === 'OVER BUDGET' ? 'rgba(240,90,90,0.1)' : d.status === 'AT RISK' ? 'rgba(245,158,11,0.1)' : 'rgba(34,201,138,0.1)'
                  const chipColor = d.status === 'OVER BUDGET' ? 'var(--accent-red)' : d.status === 'AT RISK' ? 'var(--accent-amber)' : 'var(--accent-green)'
                  const chipText = d.status === 'OVER BUDGET' ? 'Over budget' : d.status === 'AT RISK' ? 'At risk' : 'On track'
                  return (
                    <tr key={d.code} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-purple)' }}>{d.code}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{d.name}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmt(d.budgeted, cur)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: d.spent > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{fmt(d.spent, cur)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: d.remaining < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{fmt(d.remaining, cur)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: 48, height: 4, background: 'var(--border-subtle)', borderRadius: 100, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: chipColor, borderRadius: 100 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', minWidth: 36, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100, background: chipBg, color: chipColor }}>{chipText}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-default)' }}>
                  <td colSpan={2} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>TOTAL</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(grandBudget, cur)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSpent, cur)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: remaining < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{fmt(remaining, cur)}</td>
                  <td colSpan={2} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPercent(usedPct)} used</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Payment history ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, marginBottom: 24, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Payment History</div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{allDeds.length} approved payment{allDeds.length !== 1 ? 's' : ''}</div>
        </div>
        {allDeds.length === 0 ? (
          <div style={{ padding: '24px 20px', fontSize: 12, color: 'var(--text-ghost)', textAlign: 'center' }}>No approved payment schedules recorded yet. Approve schedules in the Expenditure Tracker.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Schedule', 'Department', 'Date', 'Amount'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDeds.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{d.scheduleNumber}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{d.department}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{new Date(d.approvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-red)', fontVariantNumeric: 'tabular-nums' }}>−{fmt(d.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-default)' }}>
                  <td colSpan={3} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>TOTAL PAID OUT</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-red)', fontVariantNumeric: 'tabular-nums' }}>−{fmt(totalSpent, cur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Pre-flight checks ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Pre-flight Checks</span>
          <span style={{ fontSize: 12, color: readyCount === checks.length ? 'var(--green)' : 'var(--text2)' }}>{readyCount}/{checks.length} ready</span>
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
    </div>
  )
}

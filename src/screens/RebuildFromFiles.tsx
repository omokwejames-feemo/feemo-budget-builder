import { useState, useRef } from 'react'
import { useBudgetStore, DEPARTMENTS, PaymentSchedule, PaymentScheduleRow, ExpenditureDeduction } from '../store/budgetStore'
import ExcelJS from 'exceljs'

function uid() { return Math.random().toString(36).slice(2) }

// Parse ASSUMPTIONS sheet for basic project details
async function parseAssumptionsSheet(ws: ExcelJS.Worksheet): Promise<Record<string, string | number>> {
  const result: Record<string, string | number> = {}
  ws.eachRow((row) => {
    const label = String(row.getCell(1).value ?? '').trim().toLowerCase()
    const value = row.getCell(2).value
    if (label.includes('title') || label.includes('production title')) result.title = String(value ?? '')
    if (label.includes('company') && !label.includes('email') && !label.includes('phone')) result.company = String(value ?? '')
    if (label.includes('total budget') || label.includes('budget')) result.totalBudget = Number(value) || 0
    if (label.includes('format')) result.format = String(value ?? '')
    if (label.includes('location')) result.location = String(value ?? '')
    if (label.includes('currency')) result.currency = String(value ?? '')
    if (label.includes('start date') || label.includes('production start')) result.startDate = String(value ?? '')
  })
  return result
}

type BudgetLineRaw = { schedNo: string; detail: string; no: number; qty: number; rate: number; unit: string; ie: 'I' | 'E' }

// Parse PRODUCTION BUDGET sheet for line items
// Column layout: 1=sched no, 2=detail, 3=no., 4=qty, 5=rate, 6=unit, 7=i/e, 8=total
async function parseBudgetSheet(ws: ExcelJS.Worksheet): Promise<Record<string, BudgetLineRaw[]>> {
  const result: Record<string, BudgetLineRaw[]> = {}
  let currentCode = ''
  ws.eachRow((row) => {
    const c1 = String(row.getCell(1).value ?? '').trim()
    const c2 = String(row.getCell(2).value ?? '').trim()
    // Dept header row: first col is code like A, B, GG etc
    const deptMatch = DEPARTMENTS.find(d => d.code === c1 && !c2)
    if (deptMatch) { currentCode = deptMatch.code; return }
    if (!currentCode) return
    const no = Number(row.getCell(3).value) || 1
    const qty = Number(row.getCell(4).value) || 0
    const rate = Number(row.getCell(5).value) || 0
    if (!c2 || (!qty && !rate)) return
    if (!result[currentCode]) result[currentCode] = []
    result[currentCode].push({
      schedNo: c1 || '',
      detail: c2,
      no: no || 1,
      qty: qty || 1,
      rate: rate || 0,
      unit: String(row.getCell(6).value ?? 'flat'),
      ie: (String(row.getCell(7).value ?? 'E').toUpperCase() === 'I' ? 'I' : 'E') as 'I' | 'E',
    })
  })
  return result
}

// Extract text from a PDF to find schedule info
async function extractPdfText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const ab = ev.target?.result as ArrayBuffer
      const u8 = new Uint8Array(ab)
      let text = ''
      for (let i = 0; i < u8.length - 1; i++) {
        if (u8[i] >= 32 && u8[i] < 127) text += String.fromCharCode(u8[i])
        else text += ' '
      }
      resolve(text)
    }
    reader.readAsArrayBuffer(file)
  })
}

// Naive parser: find PS-XXX schedule numbers and payee/amount patterns in PDF text
function parsePdfSchedule(text: string, scheduleNumber: string): {
  rows: Partial<PaymentScheduleRow>[]
  preparedBy: string
  reviewedBy: string
  approvedBy: string
} {
  const rows: Partial<PaymentScheduleRow>[] = []

  // Look for dept codes mentioned alongside amounts (very rough heuristic)
  const deptCodes = DEPARTMENTS.map(d => d.code) as string[]
  const lines = text.split(/\s+/).filter(Boolean)
  for (let i = 0; i < lines.length - 3; i++) {
    const code = lines[i]
    if (deptCodes.includes(code)) {
      // next numeric value is likely the amount
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const n = parseFloat(lines[j].replace(/,/g, ''))
        if (!isNaN(n) && n > 0) {
          rows.push({
            id: uid(),
            budgetCode: code,
            department: DEPARTMENTS.find(d => d.code === code)?.name ?? '',
            paymentValue: n,
            vatRate: 7.5,
            whtRate: 5,
            payeeName: '',
            description: '',
            bankName: '',
            accountNumber: '',
          })
          break
        }
      }
    }
  }

  // Rough authority extraction (look for "Line Producer" or "Production Accountant" context)
  const prepMatch = text.match(/(?:Prepared by|Line Producer)[:\s]+([A-Za-z ]{3,40})/i)
  const reviewMatch = text.match(/(?:Reviewed by|Production Accountant)[:\s]+([A-Za-z ]{3,40})/i)
  const approveMatch = text.match(/(?:Approved by|Executive Producer)[:\s]+([A-Za-z ]{3,40})/i)

  return {
    rows,
    preparedBy: prepMatch?.[1]?.trim() ?? '',
    reviewedBy: reviewMatch?.[1]?.trim() ?? '',
    approvedBy: approveMatch?.[1]?.trim() ?? '',
  }
}

interface RebuildFromFilesProps {
  onRebuilt: () => void
}

export default function RebuildFromFiles({ onRebuilt }: RebuildFromFilesProps) {
  const store = useBudgetStore()
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [xlsxFile, setXlsxFile] = useState<File | null>(null)
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [rebuilding, setRebuilding] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  function handleXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setXlsxFile(f)
    if (xlsxInputRef.current) xlsxInputRef.current.value = ''
  }

  function handlePdfs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPdfFiles(prev => [...prev, ...files])
    if (pdfInputRef.current) pdfInputRef.current.value = ''
  }

  async function handleRebuild() {
    if (!xlsxFile && pdfFiles.length === 0) return
    setRebuilding(true)
    setLog([])
    setDone(false)

    store.resetStore()
    addLog('Starting rebuild from uploaded files…')

    // ── Parse Excel budget ────────────────────────────────────────────────
    if (xlsxFile) {
      try {
        addLog(`Reading Excel file: ${xlsxFile.name}`)
        const buf = await xlsxFile.arrayBuffer()
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buf)

        // ASSUMPTIONS sheet
        const assSheet = wb.getWorksheet('ASSUMPTIONS') ?? wb.worksheets[0]
        if (assSheet) {
          const proj = await parseAssumptionsSheet(assSheet)
          store.setProject({
            title: String(proj.title ?? ''),
            company: String(proj.company ?? ''),
            totalBudget: Number(proj.totalBudget) || 0,
            format: String(proj.format || 'Feature Film'),
            location: String(proj.location ?? ''),
            currency: String(proj.currency || '₦'),
            startDate: String(proj.startDate ?? ''),
          })
          addLog(`  ✓ Project details restored: "${proj.title}"`)
        }

        // PRODUCTION BUDGET sheet
        const budgetSheet = wb.getWorksheet('PRODUCTION BUDGET')
        if (budgetSheet) {
          const items = await parseBudgetSheet(budgetSheet)
          let lineCount = 0
          Object.entries(items).forEach(([code, rows]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            store.setLineItems(code as any, rows.map(r => ({ ...r, id: uid() })))
            lineCount += rows.length
          })
          addLog(`  ✓ Production Budget: ${lineCount} line items restored`)
        }

        addLog(`✓ Excel file processed: ${xlsxFile.name}`)
      } catch (err) {
        addLog(`✕ Error reading Excel: ${String(err)}`)
      }
    }

    // ── Parse PDF payment schedules ───────────────────────────────────────
    let scheduleIndex = store.paymentSchedules.length
    for (const pdfFile of pdfFiles) {
      try {
        addLog(`Reading PDF: ${pdfFile.name}`)
        const text = await extractPdfText(pdfFile)

        // Try to find schedule number in text
        const schedMatch = text.match(/PS-\d{3}/i)
        const scheduleNumber = schedMatch ? schedMatch[0].toUpperCase() : `PS-${String(++scheduleIndex).padStart(3, '0')}`

        const parsed = parsePdfSchedule(text, scheduleNumber)

        const schedule: PaymentSchedule = {
          id: uid(),
          scheduleNumber,
          globalVatRate: 7.5,
          globalWhtRate: 5,
          rows: parsed.rows.map(r => ({
            id: r.id ?? uid(),
            payeeName: r.payeeName ?? '',
            description: r.description ?? '',
            budgetCode: r.budgetCode ?? '',
            department: r.department ?? '',
            bankName: r.bankName ?? '',
            accountNumber: r.accountNumber ?? '',
            paymentValue: r.paymentValue ?? 0,
            vatRate: r.vatRate ?? 7.5,
            whtRate: r.whtRate ?? 5,
          })),
          preparedBy: parsed.preparedBy,
          reviewedBy: parsed.reviewedBy,
          approvedBy: parsed.approvedBy,
          createdAt: new Date().toISOString(),
          status: 'exported',
        }

        store.addPaymentSchedule(schedule)

        // If all three auth names found, auto-approve and create deductions
        if (parsed.preparedBy && parsed.reviewedBy && parsed.approvedBy) {
          const now = new Date().toISOString()
          schedule.rows.forEach(r => {
            if (!r.budgetCode) return
            const vat = r.paymentValue * (r.vatRate / 100)
            const wht = r.paymentValue * (r.whtRate / 100)
            const deduction: ExpenditureDeduction = {
              scheduleId: schedule.id,
              scheduleNumber,
              budgetCode: r.budgetCode,
              department: r.department,
              amount: r.paymentValue + vat - wht,
              approvedAt: now,
            }
            store.addExpenditureDeduction(deduction)
          })
          store.updatePaymentSchedule(schedule.id, { status: 'approved' })
          addLog(`  ✓ ${scheduleNumber}: ${schedule.rows.length} rows · auto-approved (3 signatories detected)`)
        } else {
          addLog(`  ✓ ${scheduleNumber}: ${schedule.rows.length} rows · status: exported (signatures not fully detected)`)
        }
      } catch (err) {
        addLog(`  ✕ Error reading ${pdfFile.name}: ${String(err)}`)
      }
    }

    addLog('─────────────────────────────────────────')
    addLog('Rebuild complete. Review and adjust any imported data as needed.')
    setRebuilding(false)
    setDone(true)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="./feemo-logo.png"
            alt="Feemovision"
            style={{ width: 64, height: 64, objectFit: 'contain' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 12 }}>
            Rebuild from Files
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
            Reconstruct a project from your exported Excel budget and payment schedule PDFs.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Step 1 — Upload your Budget Excel file</span>
          </div>
          <div className="card-body">
            <input ref={xlsxInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleXlsx} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => xlsxInputRef.current?.click()}>
                Choose .xlsx file
              </button>
              {xlsxFile
                ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {xlsxFile.name}</span>
                : <span style={{ fontSize: 12, color: 'var(--text3)' }}>No file selected</span>}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Step 2 — Upload signed payment schedule PDFs (optional)</span>
          </div>
          <div className="card-body">
            <input ref={pdfInputRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }} onChange={handlePdfs} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: pdfFiles.length > 0 ? 12 : 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => pdfInputRef.current?.click()}>
                Add PDF(s)
              </button>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{pdfFiles.length} file{pdfFiles.length !== 1 ? 's' : ''} selected</span>
            </div>
            {pdfFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pdfFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--accent)' }}>📄</span>
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{f.name}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '1px 6px', fontSize: 10 }}
                      onClick={() => setPdfFiles(p => p.filter((_, j) => j !== i))}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            disabled={(!xlsxFile && pdfFiles.length === 0) || rebuilding}
            style={{ flex: 1 }}
            onClick={handleRebuild}
          >
            {rebuilding ? 'Rebuilding…' : 'Rebuild Project'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => window.history.back()}
          >
            Cancel
          </button>
        </div>

        {log.length > 0 && (
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '14px 16px', fontSize: 12,
            fontFamily: 'monospace', lineHeight: 1.7,
            maxHeight: 260, overflowY: 'auto',
          }}>
            {log.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith('✓') ? 'var(--green)' : line.startsWith('✕') ? 'var(--red)' : line.startsWith('─') ? 'var(--border)' : 'var(--text2)',
              }}>{line}</div>
            ))}
          </div>
        )}

        {done && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button className="btn btn-primary" onClick={onRebuilt}>
              Open Rebuilt Project →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import ExcelJS from 'exceljs'
import type { DeptCode, LineItem, SalaryRole, Timeline } from '../store/budgetStore'
import { DEPARTMENTS } from '../store/budgetStore'

let idSeq = 9000
const uid = () => String(++idSeq)

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as ExcelJS.CellFormulaValue).result ?? '')
  return String(v)
}

function cellNum(cell: ExcelJS.Cell): number {
  const v = cell.value
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && 'result' in (v as object)) return Number((v as ExcelJS.CellFormulaValue).result ?? 0)
  return Number(v) || 0
}

export interface ParsedBudget {
  deptAllocations: Partial<Record<DeptCode, number>>
  lineItems: Partial<Record<DeptCode, LineItem[]>>
  salaryRoles: SalaryRole[]
  totalBudget?: number
  title?: string
  warnings: string[]
}

const DEPT_CODES = new Set(DEPARTMENTS.map(d => d.code))

function matchDeptCode(text: string): DeptCode | null {
  // Try to find a dept code at start of text (e.g. "G. Camera", "FF Post")
  const upper = text.trim().toUpperCase()
  // Check two-letter codes first (AA, DD, EE, FF, GG, HH, II)
  for (const code of ['AA', 'DD', 'EE', 'FF', 'GG', 'HH', 'II']) {
    if (upper.startsWith(code)) return code as DeptCode
  }
  // Single letter
  const single = upper[0]
  if (DEPT_CODES.has(single as DeptCode)) return single as DeptCode
  return null
}

export async function parseUploadedBudget(file: File): Promise<ParsedBudget> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const result: ParsedBudget = {
    deptAllocations: {},
    lineItems: {},
    salaryRoles: [],
    warnings: [],
  }

  // ── ASSUMPTIONS sheet ──────────────────────────────────────────────────────
  const assumSheet = wb.getWorksheet('ASSUMPTIONS') ?? wb.getWorksheet('Assumptions')
  if (assumSheet) {
    assumSheet.eachRow((row) => {
      const col1 = cellStr(row.getCell(1))
      const col2 = row.getCell(2)
      // Total budget
      if (/total.budget/i.test(col1)) {
        const v = cellNum(col2)
        if (v > 0) result.totalBudget = v
      }
      // Title
      if (/production.title/i.test(col1)) {
        const s = cellStr(col2)
        if (s) result.title = s
      }
      // Dept allocations — row where col1 is "A. ..." or col2 is a % number
      const code = matchDeptCode(col1)
      if (code) {
        const pctCell = row.getCell(2)
        const pct = cellNum(pctCell)
        if (pct > 0 && pct <= 1) {
          result.deptAllocations[code] = parseFloat((pct * 100).toFixed(1))
        } else if (pct > 1 && pct <= 100) {
          result.deptAllocations[code] = pct
        }
      }
    })
  } else {
    result.warnings.push('No ASSUMPTIONS sheet found — dept allocations not imported.')
  }

  // ── PRODUCTION BUDGET sheet ────────────────────────────────────────────────
  const budgetSheet = wb.getWorksheet('PRODUCTION BUDGET') ?? wb.getWorksheet('Production Budget')
  if (budgetSheet) {
    let currentDept: DeptCode | null = null

    // Detect 8-col (new) vs 7-col (old) format by inspecting header row
    // New: col3=NO., col4=QTY, col5=RATE, col6=UNIT, col7=I/E, col8=TOTAL
    // Old: col3=QTY, col4=RATE, col5=UNIT, col6=I/E, col7=TOTAL
    let useNewFormat = true // default to new
    budgetSheet.eachRow((row, rowNum) => {
      if (rowNum > 6) return
      const c3 = cellStr(row.getCell(3)).trim().toUpperCase()
      if (c3 === 'QTY' || c3 === 'QUANTITY') { useNewFormat = false }
      else if (c3 === 'NO.' || c3 === 'NO' || c3 === 'NUMBER') { useNewFormat = true }
    })

    budgetSheet.eachRow((row) => {
      const c1 = cellStr(row.getCell(1))
      const c2 = cellStr(row.getCell(2))

      // Detect section headers — dept code in col 1 or 2
      const codeFromC1 = matchDeptCode(c1)
      const codeFromC2 = matchDeptCode(c2)
      const detectedCode = codeFromC1 ?? codeFromC2
      if (detectedCode && (c2.length > 2 || c1.length > 2)) {
        const combined = (c1 + c2).toUpperCase()
        const dept = DEPARTMENTS.find(d => d.code === detectedCode)
        if (dept && combined.length > 3) {
          currentDept = detectedCode
          if (!result.lineItems[currentDept]) result.lineItems[currentDept] = []
        }
      }

      if (!currentDept) return

      const schedNo = c1.trim()
      const detail = c2.trim()

      // Skip totals, headers, and summary rows
      if (!detail) return
      if (/^(TOTAL|DEPT\.?\s*TARGET|SCH\.?NO\.?|DETAIL|NO\.?|RATE|QTY|UNIT|GRAND\s*TOTAL|BELOW.THE.LINE|ABOVE.THE.LINE|SUB.?TOTAL)/i.test(detail)) return
      if (!schedNo && detail.length < 2) return

      let no: number, qty: number, rate: number, unit: string, ie: 'I' | 'E', totalFromSheet: number
      if (useNewFormat) {
        // col3=NO., col4=QTY, col5=RATE, col6=UNIT, col7=I/E, col8=TOTAL
        no = cellNum(row.getCell(3)) || 1
        qty = cellNum(row.getCell(4)) || 1
        rate = cellNum(row.getCell(5))
        unit = cellStr(row.getCell(6)) || 'Flat'
        ie = cellStr(row.getCell(7)).trim().toUpperCase() === 'E' ? 'E' : 'I'
        totalFromSheet = cellNum(row.getCell(8))
      } else {
        // col3=QTY, col4=RATE, col5=UNIT, col6=I/E, col7=TOTAL
        no = 1
        qty = cellNum(row.getCell(3)) || 1
        rate = cellNum(row.getCell(4))
        unit = cellStr(row.getCell(5)) || 'Flat'
        ie = cellStr(row.getCell(6)).trim().toUpperCase() === 'E' ? 'E' : 'I'
        totalFromSheet = cellNum(row.getCell(7))
      }

      const effectiveRate = rate > 0 ? rate : (no * qty > 0 ? totalFromSheet / (no * qty) : totalFromSheet)

      if ((effectiveRate > 0 || totalFromSheet > 0) && detail.length > 1) {
        result.lineItems[currentDept]!.push({
          id: uid(),
          schedNo: schedNo || `${currentDept}${(result.lineItems[currentDept]?.length ?? 0) + 1}`,
          detail,
          no,
          qty,
          rate: Math.round(effectiveRate),
          unit,
          ie,
        })
      }
    })
  } else {
    result.warnings.push('No PRODUCTION BUDGET sheet found — line items not imported.')
  }

  // ── SALARY FORECAST sheet ──────────────────────────────────────────────────
  // Column pattern: # | ROLE | Month1 | Month2 | ... | TOTAL | SOURCE
  const salarySheet = wb.getWorksheet('SALARY FORECAST') ?? wb.getWorksheet('Salary Forecast')
  if (salarySheet) {
    // Find month columns (row 2 or 3 typically)
    let monthColStart = 3
    let monthColEnd = 3
    let headerRow: ExcelJS.Row | null = null

    salarySheet.eachRow((row, rowNum) => {
      if (rowNum > 5) return
      // Look for a row where col 3 onwards has month-like content
      const c3 = cellStr(row.getCell(3))
      if (/month|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(c3)) {
        headerRow = row
        monthColStart = 3
        // Find end of months (before TOTAL)
        for (let c = 3; c <= 20; c++) {
          const v = cellStr(row.getCell(c))
          if (/total/i.test(v)) { monthColEnd = c - 1; break }
          monthColEnd = c
        }
      }
    })

    const numMonths = monthColEnd - monthColStart + 1

    salarySheet.eachRow((row, rowNum) => {
      if (rowNum <= 3) return // skip headers
      const schedNo = cellStr(row.getCell(1))
      const roleText = cellStr(row.getCell(2))
      if (!roleText || /^(SUBTOTAL|TOTAL|CUMULATIVE|ROLE)/i.test(roleText)) return

      // Try to identify dept from sched no
      const code = matchDeptCode(schedNo)

      const monthlyAmounts: Record<number, number> = {}
      for (let i = 0; i < numMonths; i++) {
        const v = cellNum(row.getCell(monthColStart + i))
        if (v > 0) monthlyAmounts[i + 1] = v
      }

      if (Object.keys(monthlyAmounts).length === 0) return

      result.salaryRoles.push({
        id: uid(),
        schedNo,
        role: roleText,
        deptCode: (code ?? 'F') as DeptCode,
        phase: 'all',
        monthlyAmounts,
      })
    })
  } else {
    result.warnings.push('No SALARY FORECAST sheet found — salary roles not imported.')
  }

  return result
}

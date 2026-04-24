// Intelligent multi-sheet workbook parser — Fix Batch 8 + 9
// Scans every sheet in a workbook, classifies by content type, runs
// type-specific parsers, scores confidence, and flags cross-sheet conflicts.

import ExcelJS from 'exceljs'
import type { DeptCode, LineItem, SalaryRole, PaymentSchedule, PaymentScheduleRow } from '../store/budgetStore'
import { DEPARTMENTS } from '../store/budgetStore'
import { SHEET_KEYWORDS, DEPT_ALIASES, COL_HEADER_PATTERNS } from './keywords'
export type { SheetType, BudgetDocumentType } from './keywords'
import type { SheetType, BudgetDocumentType } from './keywords'
import { BUDGET_DOC_TYPE_LABELS } from './keywords'
export { BUDGET_DOC_TYPE_LABELS }

// ─── Public types ─────────────────────────────────────────────────────────────

export type Confidence = 'high' | 'medium' | 'low'

export interface ScoredField<T> {
  value: T
  confidence: Confidence
  source: string
}

export interface SheetClassification {
  name: string
  type: SheetType
  score: number
  ambiguous: boolean
  alternativeType?: SheetType
  rowCount: number
}

export interface ParsedConflict {
  field: string
  label: string
  sources: Array<{ sheet: string; value: number | string }>
  chosenSource: string | null
}

export type ParsedPaymentSchedule = Partial<PaymentSchedule> & { _sheetName: string }

export interface ParsedForecastRow {
  label: string
  deptCode: DeptCode | null
  monthlyValues: Record<number, number>
}

export interface ParsedWorkbook {
  // Scalar fields — each carries confidence and source sheet
  title: ScoredField<string> | null
  company: ScoredField<string> | null
  totalBudget: ScoredField<number> | null
  currency: ScoredField<string> | null
  shootDays: ScoredField<number> | null
  startDate: ScoredField<string> | null
  productionFeePercent: ScoredField<number> | null
  contingencyPercent: ScoredField<number> | null
  vatRate: ScoredField<number> | null
  whtRate: ScoredField<number> | null
  developmentMonths: ScoredField<number> | null
  preProdMonths: ScoredField<number> | null
  shootMonths: ScoredField<number> | null
  postMonths: ScoredField<number> | null

  // Collections
  deptAllocations: Partial<Record<DeptCode, ScoredField<number>>>  // absolute amounts from budget sheets
  deptAllocationsRaw: Partial<Record<DeptCode, number>>            // percentages from assumptions sheets
  lineItems: Partial<Record<DeptCode, LineItem[]>>
  salaryRoles: SalaryRole[]
  paymentSchedules: ParsedPaymentSchedule[]
  forecastRows: ParsedForecastRow[]

  // Conflicts & meta
  conflicts: ParsedConflict[]
  sheets: SheetClassification[]
  warnings: string[]

  // Document-level classification (added in Fix Batch 9)
  documentType: BudgetDocumentType
  matchStats: {
    lineItemTotal: number   // total line items extracted across all sheets
    deptCoverage: number   // 0–1 fraction of departments that have any data
  }

  // Raw buffer retained for targeted fallback re-parsing (Fix Batch 11)
  _rawBuffer?: ArrayBuffer
}

// SHEET_KEYWORDS and DEPT_ALIASES are imported from ./keywords (Fix Batch 9)

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in (v as object))
    return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('')
  if (typeof v === 'object' && 'result' in (v as object))
    return String((v as ExcelJS.CellFormulaValue).result ?? '')
  return String(v)
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v !== null && 'result' in (v as object)) {
    const r = (v as ExcelJS.CellFormulaValue).result
    if (typeof r === 'number') return r
  }
  const s = cellStr(cell).replace(/[,\s₦$£€]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 %.]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/[,\s₦$£€%]/g, ''))
  return isNaN(n) ? null : n
}

function detectCurrency(text: string): string | null {
  const t = text.toLowerCase()
  if (text.includes('₦') || t.includes('ngn') || t.includes('naira')) return 'NGN'
  if (text.includes('$') || t.includes('usd') || t.includes('dollar')) return 'USD'
  if (text.includes('£') || t.includes('gbp') || t.includes('pound')) return 'GBP'
  if (text.includes('€') || t.includes('eur') || t.includes('euro')) return 'EUR'
  return null
}

let _seq = 20000
const uid = () => `up_${++_seq}`

// ─── Department matching ──────────────────────────────────────────────────────

function matchDept(text: string): DeptCode | null {
  if (!text || !text.trim()) return null
  const upper = text.trim().toUpperCase()

  // Two-letter code prefix first
  for (const code of ['AA', 'DD', 'EE', 'FF', 'GG', 'HH', 'II']) {
    if (upper.startsWith(code) && (upper.length === 2 || /^[A-Z]{2}[\s.\-/]/.test(upper)))
      return code as DeptCode
  }
  // Single-letter code prefix
  if (/^[A-T][\s.\-/]/.test(upper) || (upper.length === 1 && /^[A-T]$/.test(upper)))
    return upper[0] as DeptCode

  const t = norm(text)
  for (const [code, aliases] of Object.entries(DEPT_ALIASES)) {
    if (aliases.some(a => t.includes(a))) return code as DeptCode
  }
  return null
}

// ─── Sheet classification ─────────────────────────────────────────────────────

function extractSheetText(ws: ExcelJS.Worksheet, maxRows = 12): string {
  const parts: string[] = [norm(ws.name)]
  let count = 0
  ws.eachRow(row => {
    if (count++ >= maxRows) return
    row.eachCell(cell => {
      const t = norm(cellStr(cell))
      if (t.length > 1) parts.push(t)
    })
  })
  return parts.join(' ')
}

function scoreType(text: string, type: SheetType): number {
  if (type === 'unknown') return 0
  const kws = SHEET_KEYWORDS[type]
  let hits = 0
  for (const kw of kws) {
    if (text.includes(norm(kw))) hits++
  }
  return hits / kws.length
}

function classifySheet(ws: ExcelJS.Worksheet): SheetClassification {
  const text = extractSheetText(ws)
  const types: SheetType[] = [
    'assumptions', 'budget-summary', 'salary-forecast',
    'production-forecast', 'production-timeline', 'payment-schedule', 'dept-allocations',
  ]
  const scored = types
    .map(t => ({ type: t, score: scoreType(text, t) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const second = scored[1]

  // Also check sheet name alone for payment schedule
  const nameLower = ws.name.toLowerCase()
  if (/^ps[\-\s]?\d+/i.test(ws.name) || nameLower.includes('payment schedule')) {
    return { name: ws.name, type: 'payment-schedule', score: 1, ambiguous: false, rowCount: ws.rowCount }
  }

  if (best.score < 0.12) {
    return { name: ws.name, type: 'unknown', score: 0, ambiguous: false, rowCount: ws.rowCount }
  }

  const ambiguous = second.score > 0 && best.score > 0 &&
    (best.score - second.score) / best.score < 0.2

  return {
    name: ws.name,
    type: best.type,
    score: best.score,
    ambiguous,
    alternativeType: ambiguous ? second.type : undefined,
    rowCount: ws.rowCount,
  }
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

function denseTexts(row: ExcelJS.Row, cols = 14): string[] {
  return Array.from({ length: cols }, (_, i) => {
    const c = row.getCell(i + 1)
    return cellStr(c)
  })
}

function denseNums(row: ExcelJS.Row, cols = 14): (number | null)[] {
  return Array.from({ length: cols }, (_, i) => cellNum(row.getCell(i + 1)))
}

function extractPercent(row: ExcelJS.Row): number | null {
  for (let c = 1; c <= 10; c++) {
    const s = cellStr(row.getCell(c))
    if (s.includes('%')) {
      const v = parseFloat(s.replace('%', '').replace(/[,\s]/g, ''))
      if (!isNaN(v) && v > 0 && v <= 50) return v
    }
    const n = cellNum(row.getCell(c))
    if (n !== null && n > 0 && n <= 1) return parseFloat((n * 100).toFixed(2))
    if (n !== null && n > 1 && n <= 50) return n
  }
  return null
}

function tryParseDate(s: string): Date | null {
  if (!s || s.length < 6) return null
  // DD/MM/YYYY (Nigerian format preferred)
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1])
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d
  }
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) { const d = new Date(s); if (!isNaN(d.getTime())) return d }
  // "January 2025" or "Jan-2025"
  const my = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s\-,](\d{4})$/i)
  if (my) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    const m = months.indexOf(my[1].toLowerCase().slice(0, 3))
    if (m >= 0) return new Date(+my[2], m, 1)
  }
  return null
}

// ─── Assumptions parser ───────────────────────────────────────────────────────

function parseAssumptionsSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { deptAllocationsRaw: {} }

  ws.eachRow(row => {
    const texts = denseTexts(row, 8)
    const nums = denseNums(row, 8)
    const col1 = norm(texts[0])
    const col2 = texts[1].trim()

    // Currency from any cell
    if (!r.currency) {
      for (const t of texts) {
        const cur = detectCurrency(t)
        if (cur) { r.currency = { value: cur, confidence: 'high', source: sheetName }; break }
      }
    }

    // Total budget
    if (!r.totalBudget && /total.?budget|budget.?total/.test(col1)) {
      const v = nums.find(n => n !== null && n > 1000) ?? null
      if (v) r.totalBudget = { value: v, confidence: 'high', source: sheetName }
    }

    // Title
    if (!r.title && /production.?title|project.?title|film.?title|show.?title/.test(col1)) {
      const s = col2 || texts[2]?.trim()
      if (s && s.length > 0 && s.length < 150)
        r.title = { value: s, confidence: 'high', source: sheetName }
    }

    // Company
    if (!r.company && /production.?company|company.?name/.test(col1)) {
      const s = col2 || texts[2]?.trim()
      if (s && s.length > 0 && s.length < 150)
        r.company = { value: s, confidence: 'high', source: sheetName }
    }

    // Shoot days
    if (!r.shootDays && /shoot.?day|shooting.?day|camera.?day/.test(col1)) {
      const v = nums.find(n => n !== null && n >= 1 && n <= 365) ?? null
      if (v) r.shootDays = { value: v, confidence: 'high', source: sheetName }
    }

    // Start date
    if (!r.startDate && /start.?date|production.?start|commencement/.test(col1)) {
      const s = col2 || texts[2]?.trim()
      const d = tryParseDate(s)
      if (d) r.startDate = { value: d.toISOString().split('T')[0], confidence: 'high', source: sheetName }
    }

    // Production fee %
    if (/production.?fee|producer.?fee|management.?fee/.test(col1)) {
      const pct = extractPercent(row)
      if (pct !== null) r.productionFeePercent = { value: pct, confidence: 'high', source: sheetName }
    }

    // Contingency %
    if (/contingency/.test(col1)) {
      const pct = extractPercent(row)
      if (pct !== null) r.contingencyPercent = { value: pct, confidence: 'high', source: sheetName }
    }

    // VAT
    if (!r.vatRate && /\bvat\b|value.?added.?tax/.test(col1)) {
      const pct = extractPercent(row)
      if (pct !== null) r.vatRate = { value: pct, confidence: 'high', source: sheetName }
    }

    // WHT
    if (!r.whtRate && /\bwht\b|withholding/.test(col1)) {
      const pct = extractPercent(row)
      if (pct !== null) r.whtRate = { value: pct, confidence: 'high', source: sheetName }
    }

    // Dept allocation % from assumptions sheet
    const deptCode = matchDept(texts[0])
    if (deptCode) {
      const pct = extractPercent(row)
      if (pct !== null && !r.deptAllocationsRaw![deptCode])
        r.deptAllocationsRaw![deptCode] = pct
    }
  })

  return r
}

// ─── Dynamic column map detection ────────────────────────────────────────────

interface BudgetColMap { detail: number; qty: number; rate: number; unit: number; total: number }

function detectBudgetColMap(ws: ExcelJS.Worksheet): BudgetColMap {
  const defaults: BudgetColMap = { detail: 1, qty: 2, rate: 3, unit: 4, total: -1 }
  for (let rn = 1; rn <= 8; rn++) {
    const texts = denseTexts(ws.getRow(rn), 16).map(t => norm(t))
    let hits = 0
    const map: Partial<BudgetColMap> = {}
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i]
      if (!t) continue
      if (COL_HEADER_PATTERNS.detail.test(t) && map.detail === undefined)  { map.detail = i; hits++ }
      if (COL_HEADER_PATTERNS.qty.test(t) && map.qty === undefined)        { map.qty = i; hits++ }
      if (COL_HEADER_PATTERNS.rate.test(t) && map.rate === undefined)      { map.rate = i; hits++ }
      if (COL_HEADER_PATTERNS.unit.test(t) && map.unit === undefined)      { map.unit = i }
      if (COL_HEADER_PATTERNS.total.test(t) && map.total === undefined)    { map.total = i }
    }
    if (hits >= 2) return { ...defaults, ...map }
  }
  return defaults
}

// ─── Budget summary parser ────────────────────────────────────────────────────

function parseBudgetSummarySheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { lineItems: {}, deptAllocations: {} }
  let currentDept: DeptCode | null = null
  const colMap = detectBudgetColMap(ws)

  ws.eachRow((row, rowNum) => {
    const texts = denseTexts(row, 12)
    const nums = denseNums(row, 12)
    const col1 = texts[0].trim()
    const col2 = texts[1].trim()
    const col1n = norm(col1)

    // Currency
    if (!r.currency) {
      for (const t of texts) {
        const cur = detectCurrency(t)
        if (cur) { r.currency = { value: cur, confidence: 'medium', source: sheetName }; break }
      }
    }

    // Grand total / total budget row
    if (!r.totalBudget && /grand.?total|total.?budget|total.?production/.test(col1n)) {
      const candidates = nums.filter(n => n !== null && (n as number) > 10000) as number[]
      if (candidates.length) {
        r.totalBudget = { value: Math.max(...candidates), confidence: 'high', source: sheetName }
      }
    }

    // Title
    if (!r.title && /production.?title|project.?title|film.?title/.test(col1n)) {
      const s = col2 || texts[2]?.trim()
      if (s && s.length < 150) r.title = { value: s, confidence: 'medium', source: sheetName }
    }

    // Skip header rows
    if (rowNum <= 4 && /sch|sched|detail|no\.|rate|qty|unit/i.test(col1 + col2)) return

    // Department header detection
    const deptCode = matchDept(col1) ?? matchDept(col2)
    const hasText = (col1.length > 1 || col2.length > 1)
    const positiveNums = nums.filter(n => n !== null && (n as number) > 0) as number[]

    if (deptCode && hasText) {
      currentDept = deptCode
      if (!r.lineItems![currentDept]) r.lineItems![currentDept] = []

      // If the dept header row itself has a large number → dept total
      if (positiveNums.length > 0) {
        const largest = Math.max(...positiveNums)
        if (largest > 1000 && !r.deptAllocations![currentDept]) {
          r.deptAllocations![currentDept] = { value: largest, confidence: 'high', source: sheetName }
        }
      }
      return
    }

    // Subtotal / total row within a department
    if (/^(total|subtotal|dept.?target|dept.?total)/.test(col1n) || /^(total|subtotal)/.test(norm(col2))) {
      if (currentDept && !r.deptAllocations![currentDept] && positiveNums.length) {
        const largest = Math.max(...positiveNums)
        if (largest > 1000)
          r.deptAllocations![currentDept] = { value: largest, confidence: 'high', source: sheetName }
      }
      return
    }

    if (!currentDept) return

    // Skip header-like rows
    const detail = col2 || col1
    if (!detail || detail.length < 2) return
    if (/^(sch\.?no|sched|detail|no\.|rate|qty|unit|i\/e|\d+\.\s*$)/i.test(detail)) return

    // Extract line item values
    const largeNums = positiveNums.filter(n => n > 10)
    if (!largeNums.length) return

    // Use detected column map — fall back to largest number for total
    const total = colMap.total >= 0 && nums[colMap.total] !== null
      ? (nums[colMap.total] as number)
      : Math.max(...largeNums)
    const schedNo = col1.length > 0 && col1.length <= 6 && !/^[a-z]/i.test(col1) ? col1 : ''
    const qty = (nums[colMap.qty] ?? nums[colMap.qty + 1] ?? null) as number | null
    const rate = (nums[colMap.rate] ?? nums[colMap.rate + 1] ?? null) as number | null
    const unit = (texts[colMap.unit] || texts[colMap.unit + 1] || 'Flat').slice(0, 20)

    const effectiveRate = (rate && rate > 0 && rate !== total) ? rate : total
    const effectiveQty = (qty && qty > 0 && qty < 5000 && qty !== total) ? qty : 1

    r.lineItems![currentDept]!.push({
      id: uid(),
      schedNo: schedNo || `${currentDept}${(r.lineItems![currentDept]?.length ?? 0) + 1}`,
      detail: detail.slice(0, 80),
      qty: effectiveQty,
      rate: Math.round(effectiveRate),
      unit: unit || 'Flat',
      ie: 'I',
    })
  })

  return r
}

// ─── Salary forecast parser ───────────────────────────────────────────────────

function parseSalaryForecastSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { salaryRoles: [] }

  let monthHeaderRow = -1
  let monthColStart = -1
  let monthColEnd = -1

  // Scan first 6 rows for month header
  for (let rowNum = 1; rowNum <= 6; rowNum++) {
    const row = ws.getRow(rowNum)
    for (let c = 2; c <= 24; c++) {
      const t = norm(cellStr(row.getCell(c)))
      if (/^(month|m\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{4})/.test(t)) {
        monthHeaderRow = rowNum
        monthColStart = c
        break
      }
    }
    if (monthHeaderRow > 0) break
  }

  if (monthColStart > 0) {
    const hRow = ws.getRow(monthHeaderRow)
    for (let c = monthColStart + 1; c <= 36; c++) {
      const t = norm(cellStr(hRow.getCell(c)))
      if (/total|sum|grand/.test(t)) { monthColEnd = c - 1; break }
      if (t.length > 0) monthColEnd = c
      else if (c > monthColStart + 2) { monthColEnd = c - 1; break }
    }
  }

  if (monthColEnd < monthColStart) monthColEnd = monthColStart + 11 // fallback 12 months

  ws.eachRow((row, rowNum) => {
    if (rowNum <= Math.max(monthHeaderRow, 2)) return

    const texts = denseTexts(row, Math.max(monthColEnd + 2, 14))
    const col1 = texts[0].trim()
    const col2 = texts[1].trim()
    const roleText = col2 || col1
    if (!roleText || roleText.length < 2) return
    if (/^(total|subtotal|cumulative|grand|role|name|position|#|no\.|department)/i.test(roleText)) return

    const deptCode = matchDept(col1) ?? matchDept(col2) ?? null

    const monthlyAmounts: Record<number, number> = {}
    if (monthColStart > 0) {
      for (let i = 0; i <= monthColEnd - monthColStart; i++) {
        const v = cellNum(row.getCell(monthColStart + i))
        if (v !== null && v > 0) monthlyAmounts[i + 1] = v
      }
    } else {
      // Fallback: scan numeric columns 3–20
      for (let c = 3; c <= 20; c++) {
        const v = cellNum(row.getCell(c))
        if (v !== null && v > 0) monthlyAmounts[c - 2] = v
      }
    }

    if (Object.keys(monthlyAmounts).length === 0) return

    r.salaryRoles!.push({
      id: uid(),
      schedNo: col1.length <= 6 ? col1 : '',
      role: roleText.slice(0, 80),
      deptCode: (deptCode ?? 'F') as DeptCode,
      phase: 'all',
      monthlyAmounts,
    })
  })

  return r
}

// ─── Production forecast parser ───────────────────────────────────────────────

function parseProductionForecastSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { forecastRows: [] }

  let monthHeaderRow = -1
  let monthColStart = -1
  let monthColEnd = -1

  for (let rowNum = 1; rowNum <= 6; rowNum++) {
    const row = ws.getRow(rowNum)
    for (let c = 1; c <= 28; c++) {
      const t = norm(cellStr(row.getCell(c)))
      if (/^(month|m\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{4})/.test(t)) {
        monthHeaderRow = rowNum; monthColStart = c; break
      }
    }
    if (monthHeaderRow > 0) break
  }

  if (monthColStart > 0) {
    const hRow = ws.getRow(monthHeaderRow)
    for (let c = monthColStart + 1; c <= 36; c++) {
      const t = norm(cellStr(hRow.getCell(c)))
      if (/total|sum|cumul/.test(t) && c > monthColStart) { monthColEnd = c - 1; break }
      if (t.length > 0) monthColEnd = c
      else if (c > monthColStart + 2) { monthColEnd = c - 1; break }
    }
  }

  if (monthColStart < 0 || monthColEnd < monthColStart) return r

  ws.eachRow((row, rowNum) => {
    if (rowNum <= monthHeaderRow) return
    const col1 = cellStr(row.getCell(1)).trim()
    const col2 = cellStr(row.getCell(2)).trim()
    const label = col1 || col2
    if (!label) return
    if (/^(total|cumulative|grand|running)/i.test(label)) return

    const deptCode = matchDept(label)
    const monthlyValues: Record<number, number> = {}
    for (let i = 0; i <= monthColEnd - monthColStart; i++) {
      const v = cellNum(row.getCell(monthColStart + i))
      if (v !== null && Math.abs(v) > 0) monthlyValues[i + 1] = v
    }
    if (Object.keys(monthlyValues).length > 0)
      r.forecastRows!.push({ label, deptCode, monthlyValues })
  })

  return r
}

// ─── Production timeline parser ───────────────────────────────────────────────

function parseProductionTimelineSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = {}

  const phases: Record<string, { weeks: number | null }> = {
    dev: { weeks: null }, pre: { weeks: null },
    shoot: { weeks: null }, post: { weeks: null },
  }

  let earliestDate: Date | null = null

  ws.eachRow(row => {
    const texts = denseTexts(row, 10)
    const nums = denseNums(row, 10)
    const col1 = norm(texts[0])

    // Date detection
    for (let c = 0; c < 10; c++) {
      const cv = row.getCell(c + 1).value
      let d: Date | null = null
      if (cv instanceof Date) d = cv
      else d = tryParseDate(texts[c])
      if (d && d.getFullYear() > 2000) {
        if (!earliestDate || d < earliestDate) earliestDate = d
      }
    }

    const weekNum = nums.find(n => n !== null && (n as number) >= 1 && (n as number) <= 104) as number | null

    if (/development|dev.?phase/.test(col1) && !phases.dev.weeks && weekNum)
      phases.dev.weeks = weekNum
    if (/pre.?prod|pre.?production|prep/.test(col1) && !phases.pre.weeks && weekNum)
      phases.pre.weeks = weekNum
    if (/principal|shoot|photography/.test(col1) && !phases.shoot.weeks && weekNum)
      phases.shoot.weeks = weekNum
    if (/post.?prod|post.?production|edit|grade|delivery/.test(col1) && !phases.post.weeks && weekNum)
      phases.post.weeks = weekNum
  })

  const wk2mo = (w: number) => Math.round(w / 4.33 * 10) / 10

  if (phases.dev.weeks) r.developmentMonths = { value: wk2mo(phases.dev.weeks), confidence: 'medium', source: sheetName }
  if (phases.pre.weeks) r.preProdMonths = { value: wk2mo(phases.pre.weeks), confidence: 'medium', source: sheetName }
  if (phases.shoot.weeks) r.shootMonths = { value: wk2mo(phases.shoot.weeks), confidence: 'medium', source: sheetName }
  if (phases.post.weeks) r.postMonths = { value: wk2mo(phases.post.weeks), confidence: 'medium', source: sheetName }
  if (earliestDate) r.startDate = { value: (earliestDate as Date).toISOString().split('T')[0], confidence: 'medium', source: sheetName }

  return r
}

// ─── Payment schedule parser ──────────────────────────────────────────────────

function parsePaymentScheduleSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { paymentSchedules: [] }

  // Extract schedule number from sheet name or header
  let scheduleNumber = sheetName.replace(/\s+/g, '-').toUpperCase()
  const psMatch = sheetName.match(/PS[\-\s]?(\d+)/i)
  if (psMatch) scheduleNumber = `PS-${psMatch[1].padStart(3, '0')}`

  // Find column header row
  const colMap: Record<string, number> = {}
  let headerRowNum = -1

  for (let rn = 1; rn <= 10; rn++) {
    const row = ws.getRow(rn)
    const texts = denseTexts(row, 16).map(norm)
    let found = 0

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i]
      if (!t) continue
      if (/payee|pay.?to|beneficiary/.test(t)) { colMap.payee = i + 1; found++; headerRowNum = rn }
      if (/description|narration|detail/.test(t)) { colMap.description = i + 1; found++ }
      if (/budget.?code|sch|^code$/.test(t) && !colMap.budgetCode) { colMap.budgetCode = i + 1 }
      if (/^bank/.test(t)) { colMap.bank = i + 1; found++ }
      if (/account|acct/.test(t)) { colMap.account = i + 1 }
      if (/payment.?value|gross.?payment|gross.?amount/.test(t)) { colMap.value = i + 1; found++ }
      if (/\bvat\b/.test(t) && !colMap.vat) colMap.vat = i + 1
      if (/\bwht\b|withholding/.test(t) && !colMap.wht) colMap.wht = i + 1
      if (/amount.?payable|net.?payable|net.?payment/.test(t)) colMap.net = i + 1
    }
    if (found >= 2) break
  }

  if (headerRowNum < 0 || !colMap.payee) return r

  const rows: PaymentScheduleRow[] = []
  let globalVat = 0
  let globalWht = 0

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return
    const payee = cellStr(row.getCell(colMap.payee ?? 1)).trim()
    if (!payee || payee.length < 2) return
    if (/^(total|subtotal|prepared|reviewed|approved|signature|authoris)/i.test(payee)) return

    const paymentValue = cellNum(row.getCell(colMap.value ?? 4))
    if (!paymentValue || paymentValue <= 0) return

    const budgetCodeRaw = cellStr(row.getCell(colMap.budgetCode ?? 3)).trim()
    const deptCode = matchDept(budgetCodeRaw) ?? matchDept(payee)
    const dept = DEPARTMENTS.find(d => d.code === deptCode)

    const vatVal = colMap.vat ? (cellNum(row.getCell(colMap.vat)) ?? 0) : 0
    const whtVal = colMap.wht ? (cellNum(row.getCell(colMap.wht)) ?? 0) : 0

    // Accumulate global rates
    if (vatVal > 0 && vatVal <= 50) globalVat = vatVal
    if (whtVal > 0 && whtVal <= 50) globalWht = whtVal

    rows.push({
      id: uid(),
      payeeName: payee.slice(0, 80),
      description: cellStr(row.getCell(colMap.description ?? 2)).trim().slice(0, 100),
      budgetCode: budgetCodeRaw || deptCode || '',
      department: dept?.name || deptCode || '',
      bankName: colMap.bank ? cellStr(row.getCell(colMap.bank)).trim() : '',
      accountNumber: colMap.account ? cellStr(row.getCell(colMap.account)).trim() : '',
      paymentValue,
      vatRate: vatVal <= 1 ? vatVal * 100 : vatVal,
      whtRate: whtVal <= 1 ? whtVal * 100 : whtVal,
    })
  })

  if (rows.length > 0) {
    r.paymentSchedules!.push({
      _sheetName: sheetName,
      id: uid(),
      scheduleNumber,
      globalVatRate: globalVat <= 1 ? globalVat * 100 : globalVat,
      globalWhtRate: globalWht <= 1 ? globalWht * 100 : globalWht,
      rows,
      preparedBy: '',
      reviewedBy: '',
      approvedBy: '',
      createdAt: new Date().toISOString(),
      status: 'draft',
    })
  }

  return r
}

// ─── Merge results ────────────────────────────────────────────────────────────

const SCALAR_KEYS = [
  'title', 'company', 'totalBudget', 'currency', 'shootDays', 'startDate',
  'productionFeePercent', 'contingencyPercent', 'vatRate', 'whtRate',
  'developmentMonths', 'preProdMonths', 'shootMonths', 'postMonths',
] as const

function mergeResults(parts: Partial<ParsedWorkbook>[], sheets: SheetClassification[]): ParsedWorkbook {
  const result: ParsedWorkbook = {
    title: null, company: null, totalBudget: null, currency: null,
    shootDays: null, startDate: null, productionFeePercent: null,
    contingencyPercent: null, vatRate: null, whtRate: null,
    developmentMonths: null, preProdMonths: null, shootMonths: null, postMonths: null,
    deptAllocations: {}, deptAllocationsRaw: {},
    lineItems: {}, salaryRoles: [], paymentSchedules: [], forecastRows: [],
    conflicts: [], sheets, warnings: [],
    documentType: 'unknown',
    matchStats: { lineItemTotal: 0, deptCoverage: 0 },
  }

  for (const key of SCALAR_KEYS) {
    const candidates = parts
      .map(p => (p as Record<string, unknown>)[key] as ScoredField<unknown> | undefined)
      .filter(Boolean) as ScoredField<unknown>[]
    if (!candidates.length) continue
    const best = candidates.find(c => c.confidence === 'high') ?? candidates[0]
    ;(result as unknown as Record<string, unknown>)[key] = best
  }

  for (const part of parts) {
    // Line items — merge by dept
    for (const [code, items] of Object.entries(part.lineItems ?? {})) {
      const k = code as DeptCode
      if (!result.lineItems[k]) result.lineItems[k] = []
      result.lineItems[k]!.push(...(items ?? []))
    }
    // Dept allocations (absolute) — prefer high confidence
    for (const [code, scored] of Object.entries(part.deptAllocations ?? {})) {
      const k = code as DeptCode
      const existing = result.deptAllocations[k]
      if (!existing || (scored!.confidence === 'high' && existing.confidence !== 'high'))
        result.deptAllocations[k] = scored!
    }
    // Dept allocations raw (%)
    for (const [code, pct] of Object.entries(part.deptAllocationsRaw ?? {})) {
      const k = code as DeptCode
      if (!result.deptAllocationsRaw[k]) result.deptAllocationsRaw[k] = pct!
    }
    result.salaryRoles.push(...(part.salaryRoles ?? []))
    result.paymentSchedules.push(...(part.paymentSchedules ?? []))
    result.forecastRows.push(...(part.forecastRows ?? []))
    result.warnings.push(...(part.warnings ?? []))
  }

  return result
}

// ─── Cross-sheet conflict detection ──────────────────────────────────────────

function detectConflicts(result: ParsedWorkbook): void {
  const conflicts: ParsedConflict[] = []

  // Salary totals vs dept allocation amounts
  const salaryByDept: Partial<Record<DeptCode, { total: number; sheet: string }>> = {}
  for (const role of result.salaryRoles) {
    const total = Object.values(role.monthlyAmounts).reduce((s, v) => s + v, 0)
    salaryByDept[role.deptCode] = {
      total: (salaryByDept[role.deptCode]?.total ?? 0) + total,
      sheet: 'Salary Forecast',
    }
  }

  for (const [code, scored] of Object.entries(result.deptAllocations) as [DeptCode, ScoredField<number>][]) {
    const sal = salaryByDept[code]
    if (!sal || sal.total <= 0 || scored.value <= 0) continue
    const diff = Math.abs(sal.total - scored.value) / Math.max(sal.total, scored.value)
    if (diff > 0.08) {
      const dept = DEPARTMENTS.find(d => d.code === code)
      conflicts.push({
        field: `dept_${code}`,
        label: `${dept?.name ?? code} total`,
        sources: [
          { sheet: scored.source, value: scored.value },
          { sheet: sal.sheet, value: Math.round(sal.total) },
        ],
        chosenSource: null,
      })
    }
  }

  result.conflicts = conflicts
}

// ─── Document type detection ──────────────────────────────────────────────────

function detectDocumentType(result: ParsedWorkbook): BudgetDocumentType {
  const types = result.sheets.map(s => s.type).filter(t => t !== 'unknown') as Exclude<SheetType, 'unknown'>[]
  const has = (t: Exclude<SheetType, 'unknown'>) => types.includes(t)

  const hasBudget   = has('budget-summary')
  const hasForecast = has('production-forecast')
  const hasSalary   = has('salary-forecast')
  const hasDeptOnly = has('dept-allocations') || has('assumptions')
  const lineTotal   = result.matchStats.lineItemTotal

  // Full production budget: has a budget-summary sheet with extracted line items
  if (hasBudget && lineTotal > 0) return 'full-production-budget'

  // Budget sheet present but no line items extracted → dept summary level
  if (hasBudget && lineTotal === 0) {
    const mainTypes = [hasForecast, hasSalary].filter(Boolean).length
    if (mainTypes >= 1) return 'mixed'
    return 'dept-summary'
  }

  // No budget-summary sheet
  const mainTypes = [hasForecast, hasSalary].filter(Boolean).length
  if (mainTypes >= 2) return 'mixed'
  if (hasForecast) return 'production-forecast'
  if (hasSalary) return 'salary-forecast'
  if (hasDeptOnly) return 'dept-summary'
  return 'unknown'
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function parseBudgetBuffer(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const sheets: SheetClassification[] = []
  const parts: Partial<ParsedWorkbook>[] = []
  const unclassified: string[] = []

  for (const ws of wb.worksheets) {
    if (!ws.rowCount || ws.rowCount < 2) continue

    const classification = classifySheet(ws)
    sheets.push(classification)

    let part: Partial<ParsedWorkbook> = {}

    switch (classification.type) {
      case 'assumptions':     part = parseAssumptionsSheet(ws, ws.name); break
      case 'dept-allocations':part = parseAssumptionsSheet(ws, ws.name); break
      case 'budget-summary':  part = parseBudgetSummarySheet(ws, ws.name); break
      case 'salary-forecast': part = parseSalaryForecastSheet(ws, ws.name); break
      case 'production-forecast': part = parseProductionForecastSheet(ws, ws.name); break
      case 'production-timeline': part = parseProductionTimelineSheet(ws, ws.name); break
      case 'payment-schedule': part = parsePaymentScheduleSheet(ws, ws.name); break
      case 'unknown':         unclassified.push(ws.name); break
    }

    if (Object.keys(part).length > 0) parts.push(part)
  }

  const result = mergeResults(parts, sheets)

  if (unclassified.length) {
    result.warnings.push(
      `${unclassified.length} sheet${unclassified.length > 1 ? 's' : ''} could not be classified and were skipped: ${unclassified.join(', ')}.`
    )
  }

  // Compute match stats before type detection
  const lineItemTotal = Object.values(result.lineItems).reduce((s, arr) => s + (arr?.length ?? 0), 0)
  const deptsWithData = DEPARTMENTS.filter(d =>
    (result.lineItems[d.code]?.length ?? 0) > 0 ||
    result.deptAllocations[d.code] !== undefined ||
    result.deptAllocationsRaw[d.code] !== undefined
  ).length
  result.matchStats = {
    lineItemTotal,
    deptCoverage: deptsWithData / DEPARTMENTS.length,
  }

  result.documentType = detectDocumentType(result)
  detectConflicts(result)
  result._rawBuffer = buffer   // retain for targeted fallback re-parsing
  return result
}

// ─── Single-sheet re-parser for fallback dialog ───────────────────────────────
// Re-parses one named sheet from the same buffer, returning a partial ParsedWorkbook
// with only what that sheet produced (salary roles, forecast rows, etc.).

export async function parseSingleSheet(buffer: ArrayBuffer, sheetName: string): Promise<Pick<ParsedWorkbook, 'salaryRoles' | 'forecastRows'>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const ws = wb.getWorksheet(sheetName)
  if (!ws || ws.rowCount < 2) {
    return { salaryRoles: [], forecastRows: [] }
  }

  // Try both salary and forecast parsers — caller decides which result to use
  const salaryPart   = parseSalaryForecastSheet(ws, sheetName)
  const forecastPart = parseProductionForecastSheet(ws, sheetName)

  return {
    salaryRoles:  (salaryPart.salaryRoles  as SalaryRole[])        ?? [],
    forecastRows: (forecastPart.forecastRows as ParsedForecastRow[]) ?? [],
  }
}

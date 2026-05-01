// Intelligent multi-sheet workbook parser
// Deep scan: island detection, column inference, formatting signals,
// cross-sheet reconciliation, and statistical outlier filtering.

import ExcelJS from 'exceljs'
import type { DeptCode, LineItem, SalaryRole, PaymentSchedule, PaymentScheduleRow } from '../store/budgetStore'
import { DEPARTMENTS } from '../store/budgetStore'
import { SHEET_KEYWORDS, DEPT_ALIASES, COL_HEADER_PATTERNS } from './keywords'
export type { SheetType, BudgetDocumentType } from './keywords'
import type { SheetType, BudgetDocumentType } from './keywords'
import { BUDGET_DOC_TYPE_LABELS } from './keywords'
export { BUDGET_DOC_TYPE_LABELS }
import { detectIslands, pickDataIsland, detectOutlierRows } from './islandDetector'
import type { IslandResult } from './islandDetector'
import { findStructuralHeaderRow, inferColMapFromFormat, rowIsStructural } from './cellFormatting'
import { inferColumnRoles, mergeColMaps } from './colInference'
import { computeWorkbookFingerprint, getStoredColMaps, storeColMaps, getStoredCorrections, applyCorrections } from './parserStore'

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

  // Column maps derived per sheet (for Option 6 column mapper UI)
  colMaps: Record<string, Partial<BudgetColMap>>

  // Raw buffer retained for targeted fallback re-parsing (Fix Batch 11)
  _rawBuffer?: ArrayBuffer
}

// SHEET_KEYWORDS and DEPT_ALIASES are imported from ./keywords (Fix Batch 9)

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) {
    // Merged cell — read from master rather than returning empty
    const master = (cell as any).master
    if (master && master !== cell) return cellStr(master)
    return ''
  }
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

    // Raw (pre-norm) label — needed for abbreviated labels like "V.A.T" that norm() mangles
    const rawLabel = texts[0].trim().toUpperCase().replace(/\s+/g, ' ')

    // Total budget
    if (!r.totalBudget && /total.?budget|budget.?total|overall.?budget|gross.?budget|project.?budget|total.?cost|project.?cost|total.?project/.test(col1)) {
      const v = nums.find(n => n !== null && n > 1000) ?? null
      if (v) r.totalBudget = { value: v, confidence: 'high', source: sheetName }
    }

    // Title — covers "Production Title", "Project Name", "Film Name", "Programme Title", bare "Title"
    if (!r.title && /production.?title|project.?title|film.?title|show.?title|programme.?title|production.?name|project.?name|film.?name|show.?name|programme.?name|^title$/.test(col1)) {
      const s = col2 || texts[2]?.trim()
      if (s && s.length > 0 && s.length < 150)
        r.title = { value: s, confidence: 'high', source: sheetName }
    }

    // Company — covers "Production House", "Client", "Agency", "Brand"
    if (!r.company && /production.?company|company.?name|production.?house|client.?name|^client$|agency.?name|^agency$|brand.?name/.test(col1)) {
      const s = col2 || texts[2]?.trim()
      if (s && s.length > 0 && s.length < 150)
        r.company = { value: s, confidence: 'high', source: sheetName }
    }

    // Shoot days — covers "No. of Days", "Production Days", "Filming Days", "Days of Shoot"
    if (!r.shootDays && /shoot.?day|shooting.?day|camera.?day|production.?day|filming.?day|no.?of.?day|number.?of.?day|days.?of.?shoot|^shoot$/.test(col1)) {
      const v = nums.find(n => n !== null && n >= 1 && n <= 365) ?? null
      if (v) r.shootDays = { value: v, confidence: 'high', source: sheetName }
    }

    // Start date — covers "Shoot Date", "Production Date", "Commencement Date"
    if (!r.startDate && /start.?date|production.?start|commencement|shoot.?date|production.?date|commencement.?date|^start$/.test(col1)) {
      const s = col2 || texts[2]?.trim()
      const d = tryParseDate(s)
      if (d) r.startDate = { value: d.toISOString().split('T')[0], confidence: 'high', source: sheetName }
    }

    // Production fee % — covers "Mgmt Fee", "Prod Fee", "Overhead Fee"
    if (/production.?fee|producer.?fee|management.?fee|mgmt.?fee|prod.?fee|overhead.?fee/.test(col1)) {
      const pct = extractPercent(row)
      if (pct !== null) r.productionFeePercent = { value: pct, confidence: 'high', source: sheetName }
    }

    // Contingency %
    if (/contingency|reserve.?fund|contingency.?reserve/.test(col1)) {
      const pct = extractPercent(row)
      if (pct !== null) r.contingencyPercent = { value: pct, confidence: 'high', source: sheetName }
    }

    // VAT — rawLabel handles "V.A.T" which norm() turns into "v a t" breaking \bvat\b
    if (!r.vatRate && (/\bvat\b|value.?added.?tax/.test(col1) || /^V\.?A\.?T\b/.test(rawLabel))) {
      const pct = extractPercent(row)
      if (pct !== null) r.vatRate = { value: pct, confidence: 'high', source: sheetName }
    }

    // WHT — same fix for "W.H.T"
    if (!r.whtRate && (/\bwht\b|withholding/.test(col1) || /^W\.?H\.?T\b/.test(rawLabel))) {
      const pct = extractPercent(row)
      if (pct !== null) r.whtRate = { value: pct, confidence: 'high', source: sheetName }
    }

    // Phase durations — often listed in assumptions as months
    if (!r.developmentMonths && /development.?month|dev.?month|development.?period|dev.?period/.test(col1)) {
      const v = nums.find(n => n !== null && n >= 0.5 && n <= 36) ?? null
      if (v) r.developmentMonths = { value: v, confidence: 'high', source: sheetName }
    }
    if (!r.preProdMonths && /pre.?prod.?month|prep.?month|pre.?production.?month|pre.?prod.?period|prep.?period/.test(col1)) {
      const v = nums.find(n => n !== null && n >= 0.5 && n <= 36) ?? null
      if (v) r.preProdMonths = { value: v, confidence: 'high', source: sheetName }
    }
    if (!r.shootMonths && /shoot.?month|principal.?month|shoot.?period|production.?month/.test(col1)) {
      const v = nums.find(n => n !== null && n >= 0.5 && n <= 36) ?? null
      if (v) r.shootMonths = { value: v, confidence: 'high', source: sheetName }
    }
    if (!r.postMonths && /post.?prod.?month|post.?month|post.?production.?month|post.?period/.test(col1)) {
      const v = nums.find(n => n !== null && n >= 0.5 && n <= 36) ?? null
      if (v) r.postMonths = { value: v, confidence: 'high', source: sheetName }
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

export interface BudgetColMap { detail: number; no: number; qty: number; rate: number; unit: number; total: number; ie: number; schedNo: number }

function detectBudgetColMap(ws: ExcelJS.Worksheet, island?: IslandResult, storedMap?: Partial<BudgetColMap>): BudgetColMap {
  const defaults: BudgetColMap = { detail: 1, no: -1, qty: 2, rate: 3, unit: 4, total: -1, ie: -1, schedNo: -1 }

  // ── Step 1: keyword header scan (extended to 25 rows, island-bounded) ────
  const scanStart = island ? island.topRow : 1
  const scanLimit = island ? Math.min(island.topRow + 19, island.bottomRow) : Math.min(25, ws.rowCount)
  let keywordMap: Partial<BudgetColMap> = {}

  for (let rn = scanStart; rn <= scanLimit; rn++) {
    const texts = denseTexts(ws.getRow(rn), 20).map(t => norm(t))
    let hits = 0
    const rowMap: Partial<BudgetColMap> = {}
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i]
      if (!t) continue
      if (COL_HEADER_PATTERNS.detail.test(t) && rowMap.detail === undefined)   { rowMap.detail = i; hits++ }
      if (COL_HEADER_PATTERNS.no.test(t) && rowMap.no === undefined)           { rowMap.no = i }
      if (COL_HEADER_PATTERNS.qty.test(t) && rowMap.qty === undefined)         { rowMap.qty = i; hits++ }
      if (COL_HEADER_PATTERNS.rate.test(t) && rowMap.rate === undefined)       { rowMap.rate = i; hits++ }
      if (COL_HEADER_PATTERNS.unit.test(t) && rowMap.unit === undefined)       { rowMap.unit = i }
      if (COL_HEADER_PATTERNS.total.test(t) && rowMap.total === undefined)     { rowMap.total = i }
      if (COL_HEADER_PATTERNS.ie.test(t) && rowMap.ie === undefined)           { rowMap.ie = i }
      if (COL_HEADER_PATTERNS.schedNo.test(t) && rowMap.schedNo === undefined) { rowMap.schedNo = i }
    }
    if (hits >= 2) { keywordMap = rowMap; break }
  }

  // ── Step 2: cell formatting signals ──────────────────────────────────────
  let formatMap: Partial<BudgetColMap> = {}
  if (island) {
    const hRow = findStructuralHeaderRow(ws, island)
    if (hRow !== null) formatMap = inferColMapFromFormat(ws, island, hRow)
  }

  // ── Step 3: data shape inference ─────────────────────────────────────────
  const dataStart = island
    ? ((findStructuralHeaderRow(ws, island) ?? island.topRow) + 1)
    : scanLimit + 1
  const inferResult = island
    ? inferColumnRoles(ws, island, dataStart)
    : { profiles: [], map: {}, confidence: 0 }

  // ── Step 4: merge all four sources (stored map has highest priority) ─────
  const { map } = mergeColMaps(keywordMap, inferResult, formatMap)
  return { ...defaults, ...map, ...(storedMap ?? {}) }
}

// ─── Budget summary parser ────────────────────────────────────────────────────

function parseBudgetSummarySheet(ws: ExcelJS.Worksheet, sheetName: string, storedColMap?: Partial<BudgetColMap>): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { lineItems: {}, deptAllocations: {} }
  let currentDept: DeptCode | null = null

  // Island detection — find the main data table, handles sheets with long header blocks
  const islands = detectIslands(ws, { minRows: 3, minCols: 2, emptyRowTolerance: 3 })
  const island  = pickDataIsland(islands, 3) ?? undefined

  const colMap = detectBudgetColMap(ws, island, storedColMap)

  // Determine the row range to iterate — use island bounds if detected
  const iterStart = island ? island.topRow : 1
  const iterEnd   = island ? island.bottomRow : ws.rowCount

  // Collect total column values per dept section for outlier detection
  const deptTotalValues: Map<DeptCode, number[]> = new Map()
  const deptRowIndices:  Map<DeptCode, number[]> = new Map()

  // Pass 1: collect all line item candidates (bounded by island)
  interface RawItem { rowNum: number; dept: DeptCode; detail: string; no: number; qty: number; rate: number; unit: string; ie: 'I'|'E'; schedNo: string; totalVal: number }
  const rawItems: RawItem[] = []

  for (let rowNum = iterStart; rowNum <= iterEnd; rowNum++) {
    const row = ws.getRow(rowNum)
    const texts = denseTexts(row, 14)
    const nums  = denseNums(row, 14)
    const col1  = texts[0].trim()
    const col2  = texts[1].trim()
    const col1n = norm(col1)

    // Currency scan (any row)
    if (!r.currency) {
      for (const t of texts) {
        const cur = detectCurrency(t)
        if (cur) { r.currency = { value: cur, confidence: 'medium', source: sheetName }; break }
      }
    }

    // Grand total row
    if (!r.totalBudget && /grand.?total|total.?budget|total.?production|overall.?budget|gross.?budget|project.?budget|total.?cost|budget.?total/.test(col1n)) {
      const candidates = nums.filter(n => n !== null && (n as number) > 10000) as number[]
      if (candidates.length) r.totalBudget = { value: Math.max(...candidates), confidence: 'high', source: sheetName }
    }

    // Title
    if (!r.title && /production.?title|project.?title|film.?title|show.?title|programme.?title|production.?name|project.?name|film.?name|^title$/.test(col1n)) {
      const s = col2 || texts[2]?.trim()
      if (s && s.length < 150) r.title = { value: s, confidence: 'medium', source: sheetName }
    }

    // Skip column header rows
    if (/^(sch\.?no|sched|detail|no\.|rate|qty|unit|i\/e)/i.test(col1 + col2) && (nums.every(n => n === null))) continue

    const positiveNums = nums.filter(n => n !== null && (n as number) > 0) as number[]

    // Structural rows (bold/filled) that aren't data: dept header or total
    const isStructural = island ? rowIsStructural(ws, rowNum, { left: island.leftCol, right: island.rightCol }) : false

    // Department header detection
    const deptCode = matchDept(col1) ?? matchDept(col2)
    if (deptCode && (col1.length > 1 || col2.length > 1)) {
      currentDept = deptCode
      if (!r.lineItems![currentDept]) r.lineItems![currentDept] = []
      if (positiveNums.length > 0) {
        const largest = Math.max(...positiveNums)
        if (largest > 1000 && !r.deptAllocations![currentDept])
          r.deptAllocations![currentDept] = { value: largest, confidence: 'high', source: sheetName }
      }
      continue
    }

    // Subtotal / total rows — extract dept total but skip as line item
    if (/^(total|subtotal|sub.?total|dept.?target|dept.?total|grand.?total|below.?the.?line|above.?the.?line)/.test(col1n)
      || /^(total|subtotal|grand)/.test(norm(col2))
      || (isStructural && positiveNums.length <= 2 && positiveNums.length > 0)) {
      if (currentDept && !r.deptAllocations![currentDept] && positiveNums.length) {
        const largest = Math.max(...positiveNums)
        if (largest > 1000) r.deptAllocations![currentDept] = { value: largest, confidence: 'high', source: sheetName }
      }
      continue
    }

    if (!currentDept) continue

    const detail = col2 || col1
    if (!detail || detail.length < 2) continue
    if (/^(sch\.?no|sched|detail|no\.|rate|qty|unit|i\/e|grand.?total|below.?the.?line|above.?the.?line|sub.?total|\d+\.\s*$)/i.test(detail)) continue

    const largeNums = positiveNums.filter(n => n > 10)
    if (!largeNums.length) continue

    const totalVal = colMap.total >= 0 && nums[colMap.total] !== null
      ? (nums[colMap.total] as number) : Math.max(...largeNums)
    const schedNoRaw = colMap.schedNo >= 0 && texts[colMap.schedNo]
      ? texts[colMap.schedNo] : (col1.length > 0 && col1.length <= 6 && !/^[a-z]/i.test(col1) ? col1 : '')
    const noRaw  = (colMap.no   >= 0 ? nums[colMap.no]   : null) as number | null
    const qty    = (colMap.qty  >= 0 ? nums[colMap.qty]  : null) as number | null
    const rate   = (colMap.rate >= 0 ? nums[colMap.rate] : null) as number | null
    const unit   = (texts[colMap.unit] || 'Flat').slice(0, 20)
    const ieRaw  = colMap.ie >= 0 ? texts[colMap.ie]?.trim().toUpperCase() : ''

    rawItems.push({
      rowNum,
      dept: currentDept,
      detail: detail.slice(0, 80),
      no:    noRaw && noRaw > 0 && noRaw < 500 && noRaw !== totalVal ? noRaw : 1,
      qty:   qty   && qty   > 0 && qty   < 5000 && qty   !== totalVal ? qty   : 1,
      rate:  Math.round(rate && rate > 0 && rate !== totalVal ? rate : totalVal),
      unit:  unit || 'Flat',
      ie:    ieRaw === 'E' ? 'E' : 'I',
      schedNo: schedNoRaw,
      totalVal,
    })

    // Track values per dept for outlier detection
    if (!deptTotalValues.has(currentDept)) { deptTotalValues.set(currentDept, []); deptRowIndices.set(currentDept, []) }
    deptTotalValues.get(currentDept)!.push(totalVal)
    deptRowIndices.get(currentDept)!.push(rawItems.length - 1)
  }

  // Pass 2: Option 7 — outlier detection per dept, filter subtotals missed by keyword scan
  const outlierSet = new Set<number>()
  for (const [dept, values] of deptTotalValues.entries()) {
    const indices = deptRowIndices.get(dept)!
    const outliers = detectOutlierRows(values, { multiplier: 4, minMedian: 500 })
    for (const oi of outliers) outlierSet.add(indices[oi])
  }

  // Pass 3: commit non-outlier items to result
  for (let i = 0; i < rawItems.length; i++) {
    if (outlierSet.has(i)) continue
    const item = rawItems[i]
    if (!r.lineItems![item.dept]) r.lineItems![item.dept] = []
    r.lineItems![item.dept]!.push({
      id: uid(),
      schedNo: item.schedNo || `${item.dept}${(r.lineItems![item.dept]?.length ?? 0) + 1}`,
      detail:  item.detail,
      no:      item.no,
      qty:     item.qty,
      rate:    item.rate,
      unit:    item.unit,
      ie:      item.ie,
    })
  }

  return r
}

// ─── Salary forecast parser ───────────────────────────────────────────────────

function parseSalaryForecastSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { salaryRoles: [] }

  // Island detection — locate the data table, skip header branding blocks
  const islands = detectIslands(ws, { minRows: 3, minCols: 3, emptyRowTolerance: 2 })
  const island  = pickDataIsland(islands, 3) ?? undefined

  const scanTop    = island ? island.topRow : 1
  const scanBottom = island ? island.bottomRow : ws.rowCount
  // Expand scan range to 25 rows to handle sheets with long intro blocks
  const scanLimit = Math.min(scanTop + 24, scanBottom)

  let monthHeaderRow = -1
  let monthColStart = -1
  let monthColEnd = -1

  for (let rowNum = scanTop; rowNum <= scanLimit; rowNum++) {
    const row = ws.getRow(rowNum)
    for (let c = 2; c <= 28; c++) {
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
    for (let c = monthColStart + 1; c <= 40; c++) {
      const t = norm(cellStr(hRow.getCell(c)))
      if (/total|sum|grand/.test(t)) { monthColEnd = c - 1; break }
      if (t.length > 0) monthColEnd = c
      else if (c > monthColStart + 2) { monthColEnd = c - 1; break }
    }
  }

  if (monthColEnd < monthColStart) monthColEnd = monthColStart + 11 // fallback 12 months

  const dataStart = monthHeaderRow > 0 ? monthHeaderRow + 1 : (island ? island.topRow + 1 : 3)

  for (let rowNum = dataStart; rowNum <= scanBottom; rowNum++) {
    const row = ws.getRow(rowNum)
    const texts = denseTexts(row, Math.max(monthColEnd + 2, 14))
    const col1 = texts[0].trim()
    const col2 = texts[1].trim()
    const roleText = col2 || col1
    if (!roleText || roleText.length < 2) continue
    if (/^(total|subtotal|cumulative|grand|role|name|position|#|no\.|department)/i.test(roleText)) continue

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

    if (Object.keys(monthlyAmounts).length === 0) continue

    r.salaryRoles!.push({
      id: uid(),
      schedNo: col1.length <= 6 ? col1 : '',
      role: roleText.slice(0, 80),
      deptCode: (deptCode ?? 'F') as DeptCode,
      phase: 'all',
      monthlyAmounts,
    })
  }

  return r
}

// ─── Production forecast parser ───────────────────────────────────────────────

function parseProductionForecastSheet(ws: ExcelJS.Worksheet, sheetName: string): Partial<ParsedWorkbook> {
  const r: Partial<ParsedWorkbook> = { forecastRows: [] }

  // Island detection
  const islands = detectIslands(ws, { minRows: 3, minCols: 3, emptyRowTolerance: 2 })
  const island  = pickDataIsland(islands, 3) ?? undefined

  const scanTop    = island ? island.topRow : 1
  const scanBottom = island ? island.bottomRow : ws.rowCount
  const scanLimit  = Math.min(scanTop + 24, scanBottom)

  let monthHeaderRow = -1
  let monthColStart = -1
  let monthColEnd = -1

  for (let rowNum = scanTop; rowNum <= scanLimit; rowNum++) {
    const row = ws.getRow(rowNum)
    for (let c = 1; c <= 32; c++) {
      const t = norm(cellStr(row.getCell(c)))
      if (/^(month|m\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{4})/.test(t)) {
        monthHeaderRow = rowNum; monthColStart = c; break
      }
    }
    if (monthHeaderRow > 0) break
  }

  if (monthColStart > 0) {
    const hRow = ws.getRow(monthHeaderRow)
    for (let c = monthColStart + 1; c <= 40; c++) {
      const t = norm(cellStr(hRow.getCell(c)))
      if (/total|sum|cumul/.test(t) && c > monthColStart) { monthColEnd = c - 1; break }
      if (t.length > 0) monthColEnd = c
      else if (c > monthColStart + 2) { monthColEnd = c - 1; break }
    }
  }

  if (monthColStart < 0 || monthColEnd < monthColStart) return r

  const dataStart = monthHeaderRow + 1

  for (let rowNum = dataStart; rowNum <= scanBottom; rowNum++) {
    const row = ws.getRow(rowNum)
    const col1 = cellStr(row.getCell(island?.leftCol ?? 1)).trim()
    const col2 = cellStr(row.getCell(island ? island.leftCol + 1 : 2)).trim()
    const label = col1 || col2
    if (!label) continue
    if (/^(total|cumulative|grand|running)/i.test(label)) continue

    const deptCode = matchDept(label)
    const monthlyValues: Record<number, number> = {}
    for (let i = 0; i <= monthColEnd - monthColStart; i++) {
      const v = cellNum(row.getCell(monthColStart + i))
      if (v !== null && Math.abs(v) > 0) monthlyValues[i + 1] = v
    }
    if (Object.keys(monthlyValues).length > 0)
      r.forecastRows!.push({ label, deptCode, monthlyValues })
  }

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
    colMaps: {},
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

// ─── Option 4: Cross-sheet reconciliation ────────────────────────────────────
// Compares totals derived from line items vs dept allocation amounts.
// When they agree (within 5%) the allocation confidence is upgraded to 'high'.
// When they disagree significantly, a warning is added so the UI can surface it.

function reconcileSheets(result: ParsedWorkbook): void {
  for (const dept of DEPARTMENTS) {
    const code = dept.code as DeptCode
    const items = result.lineItems[code] ?? []
    if (items.length === 0) continue

    // Sum: no × qty × rate for each line item
    const lineTotal = items.reduce((sum, li) => sum + li.no * li.qty * li.rate, 0)
    if (lineTotal <= 0) continue

    const alloc = result.deptAllocations[code]
    if (!alloc) {
      // No allocation yet — derive it from line items
      result.deptAllocations[code] = {
        value: Math.round(lineTotal),
        confidence: 'medium',
        source: 'line-item-sum',
      }
      continue
    }

    const diff = Math.abs(alloc.value - lineTotal) / Math.max(alloc.value, lineTotal)

    if (diff <= 0.05) {
      // Within 5% tolerance — cross-validates, upgrade confidence
      result.deptAllocations[code] = { ...alloc, confidence: 'high' }
    } else if (diff <= 0.15) {
      // Minor discrepancy — keep allocation but note it
      result.warnings.push(
        `${dept.name}: line-item sum (${Math.round(lineTotal).toLocaleString()}) differs ${(diff * 100).toFixed(1)}% from sheet allocation (${alloc.value.toLocaleString()}).`
      )
    } else {
      // Large discrepancy — prefer the larger value and downgrade confidence
      const larger = lineTotal > alloc.value ? lineTotal : alloc.value
      const src    = lineTotal > alloc.value ? 'line-item-sum' : alloc.source
      result.deptAllocations[code] = { value: Math.round(larger), confidence: 'low', source: src }
      result.warnings.push(
        `${dept.name}: large mismatch — line-item sum ${Math.round(lineTotal).toLocaleString()} vs allocation ${alloc.value.toLocaleString()} (${(diff * 100).toFixed(0)}% gap). Using larger figure.`
      )
    }
  }

  // If we still have no totalBudget, derive it from dept allocations
  if (!result.totalBudget) {
    const allocTotal = Object.values(result.deptAllocations).reduce((s, sf) => s + (sf?.value ?? 0), 0)
    if (allocTotal > 10000) {
      result.totalBudget = { value: Math.round(allocTotal), confidence: 'medium', source: 'dept-alloc-sum' }
    }
  }

  // Also reconcile salary totals against dept allocations
  const salaryByDept: Partial<Record<DeptCode, number>> = {}
  for (const role of result.salaryRoles) {
    const total = Object.values(role.monthlyAmounts).reduce((s, v) => s + v, 0)
    salaryByDept[role.deptCode] = (salaryByDept[role.deptCode] ?? 0) + total
  }

  for (const [code, salTotal] of Object.entries(salaryByDept) as [DeptCode, number][]) {
    if (!salTotal) continue
    const alloc = result.deptAllocations[code]
    if (!alloc) {
      result.deptAllocations[code] = { value: Math.round(salTotal), confidence: 'low', source: 'salary-sum' }
    }
  }
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

  // Option 5: check fingerprint store for known column maps from prior imports
  const fingerprint = computeWorkbookFingerprint(wb)
  const [storedColMapsData, storedCorrections] = await Promise.all([
    getStoredColMaps(fingerprint),
    getStoredCorrections(fingerprint),
  ])

  const sheets: SheetClassification[] = []
  const parts: Partial<ParsedWorkbook>[] = []
  const unclassified: string[] = []
  const derivedColMaps: Record<string, Partial<BudgetColMap>> = {}

  for (const ws of wb.worksheets) {
    if (!ws.rowCount || ws.rowCount < 2) continue

    const classification = classifySheet(ws)
    sheets.push(classification)

    let part: Partial<ParsedWorkbook> = {}
    const storedMap = storedColMapsData?.[ws.name] ?? undefined

    switch (classification.type) {
      case 'assumptions':         part = parseAssumptionsSheet(ws, ws.name); break
      case 'dept-allocations':    part = parseAssumptionsSheet(ws, ws.name); break
      case 'budget-summary': {
        part = parseBudgetSummarySheet(ws, ws.name, storedMap)
        // Capture column map for fingerprint storage
        const island = pickDataIsland(detectIslands(ws, { minRows: 3, minCols: 2, emptyRowTolerance: 3 }), 3) ?? undefined
        derivedColMaps[ws.name] = detectBudgetColMap(ws, island, storedMap)
        break
      }
      case 'salary-forecast':     part = parseSalaryForecastSheet(ws, ws.name); break
      case 'production-forecast': part = parseProductionForecastSheet(ws, ws.name); break
      case 'production-timeline': part = parseProductionTimelineSheet(ws, ws.name); break
      case 'payment-schedule':    part = parsePaymentScheduleSheet(ws, ws.name); break
      case 'unknown':             unclassified.push(ws.name); break
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
  reconcileSheets(result)    // Option 4: cross-sheet math validation + confidence upgrades
  detectConflicts(result)

  // Attach column maps to result (Option 6: column mapper UI can display these)
  result.colMaps = derivedColMaps

  // Option 5: persist derived column maps for future imports of the same template
  if (Object.keys(derivedColMaps).length > 0) {
    storeColMaps(fingerprint, derivedColMaps).catch(() => {})  // fire-and-forget
  }

  // Option 8: apply stored user corrections (overrides inferred values)
  if (Object.keys(storedCorrections).length > 0) {
    applyCorrections(result as unknown as Record<string, unknown>, storedCorrections)
  }

  result._rawBuffer = buffer   // retain for targeted fallback re-parsing
  return result
}

// ─── Re-parse budget sheet with user-corrected column map ────────────────────
// Used by the Column Mapper UI (Option 6) when the user adjusts column roles.

export async function reparseBudgetSheetWithColMap(
  buffer: ArrayBuffer,
  sheetName: string,
  correctedColMap: BudgetColMap
): Promise<Pick<ParsedWorkbook, 'lineItems' | 'deptAllocations'>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.getWorksheet(sheetName)
  if (!ws || ws.rowCount < 2) return { lineItems: {}, deptAllocations: {} }

  const part = parseBudgetSummarySheet(ws, sheetName, correctedColMap)
  return {
    lineItems:      part.lineItems      ?? {},
    deptAllocations: part.deptAllocations ?? {},
  }
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

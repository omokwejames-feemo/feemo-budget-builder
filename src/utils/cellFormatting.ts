// Option 3 — Cell formatting as structure signals
// Reads ExcelJS style metadata (bold, fill colour, borders, merged cells) to
// identify section headers, totals rows, and column label rows without relying
// on keyword matching.

import ExcelJS from 'exceljs'
import type { IslandResult } from './islandDetector'
import type { BudgetColMap } from './budgetParser'

export interface CellFormatInfo {
  bold: boolean
  hasFill: boolean
  fillArgb: string | null
  hasBottomBorder: boolean
  isMerged: boolean
}

export function getCellFormat(cell: ExcelJS.Cell): CellFormatInfo {
  const style = (cell as any).style ?? {}
  const font  = style.font ?? {}
  const fill  = style.fill ?? {}
  const border = style.border ?? {}

  const fgColor = fill.fgColor?.argb ?? fill.fgColor?.theme ?? null
  const isDefaultFill = !fgColor || fgColor === 'FF000000' || fgColor === '00000000' || fgColor === 'FFFFFFFF'

  return {
    bold: !!(font.bold),
    hasFill: !isDefaultFill && fill.type === 'pattern' && fill.pattern !== 'none',
    fillArgb: isDefaultFill ? null : (fill.fgColor?.argb ?? null),
    hasBottomBorder: !!(border.bottom?.style),
    isMerged: !!(cell as any).isMerged,
  }
}

// Returns true if a row looks like a structural row (section header or totals):
// >= half its non-empty cells are bold, OR the row has a background fill.
export function rowIsStructural(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  colRange: { left: number; right: number }
): boolean {
  const row = ws.getRow(rowNum)
  let boldCount = 0, filledCount = 0, nonEmpty = 0

  for (let c = colRange.left; c <= colRange.right; c++) {
    const cell = row.getCell(c)
    const val = cell.value
    if (val === null || val === undefined || val === '') continue
    nonEmpty++
    const fmt = getCellFormat(cell)
    if (fmt.bold) boldCount++
    if (fmt.hasFill) filledCount++
  }

  if (nonEmpty === 0) return false
  return filledCount > 0 || boldCount >= Math.ceil(nonEmpty / 2)
}

// Find the first row within an island that looks like a column-header row.
// Prefers: structural row (bold/filled) that contains short text values (not numbers).
// Falls back to the first row of the island that has >= 3 text cells.
export function findStructuralHeaderRow(
  ws: ExcelJS.Worksheet,
  island: IslandResult
): number | null {
  const colRange = { left: island.leftCol, right: island.rightCol }

  // Scan at most the first 20 rows of the island
  const scanLimit = Math.min(island.topRow + 19, island.bottomRow)

  for (let r = island.topRow; r <= scanLimit; r++) {
    if (!rowIsStructural(ws, r, colRange)) continue
    // Confirm it looks like a header (mostly short text, not numbers)
    const row = ws.getRow(r)
    let textCells = 0, numCells = 0
    for (let c = colRange.left; c <= colRange.right; c++) {
      const v = row.getCell(c).value
      if (v === null || v === undefined || v === '') continue
      if (typeof v === 'number') numCells++
      else textCells++
    }
    if (textCells >= numCells) return r
  }

  // Fallback: first row with >= 3 text cells
  for (let r = island.topRow; r <= scanLimit; r++) {
    const row = ws.getRow(r)
    let textCells = 0
    for (let c = colRange.left; c <= colRange.right; c++) {
      const v = row.getCell(c).value
      if (v !== null && v !== undefined && v !== '' && typeof v !== 'number') textCells++
    }
    if (textCells >= 3) return r
  }

  return null
}

// Build a partial BudgetColMap by looking at which columns in the header row
// contain bold cells — these are the most reliable column label indicators.
// Returns column indices (1-indexed) for any role it can confidently assign.
export function inferColMapFromFormat(
  ws: ExcelJS.Worksheet,
  island: IslandResult,
  headerRow: number
): Partial<BudgetColMap> {
  const row = ws.getRow(headerRow)
  const map: Partial<BudgetColMap> = {}
  const colRange = { left: island.leftCol, right: island.rightCol }

  // Collect bold cell positions — these are column labels
  const boldCols: Array<{ col: number; text: string }> = []
  for (let c = colRange.left; c <= colRange.right; c++) {
    const cell = row.getCell(c)
    const fmt = getCellFormat(cell)
    const v = cell.value
    if (!v || (v === null)) continue
    const text = String(v).toLowerCase().trim()
    if (fmt.bold && text.length > 0) boldCols.push({ col: c, text })
  }

  // Map bold label text to column roles using simple patterns
  for (const { col, text } of boldCols) {
    if (/detail|description|item|particulars|line.?item/.test(text) && map.detail === undefined)
      map.detail = col - 1 // zero-indexed offset from col 1
    if (/^no\.?$|^#$|^num/.test(text) && map.no === undefined) map.no = col - 1
    if (/\bqty\b|quantity/.test(text) && map.qty === undefined) map.qty = col - 1
    if (/\brate\b|\bprice\b|unit.?cost/.test(text) && map.rate === undefined) map.rate = col - 1
    if (/\bunit\b|\btype\b|measure/.test(text) && map.unit === undefined) map.unit = col - 1
    if (/^total$|line.?total|^amount$/.test(text) && map.total === undefined) map.total = col - 1
    if (/^i\/?e$|internal|local.?expat/.test(text) && map.ie === undefined) map.ie = col - 1
    if (/sch\.?\s*no|sched|^code$|^ref/.test(text) && map.schedNo === undefined) map.schedNo = col - 1
  }

  return map
}

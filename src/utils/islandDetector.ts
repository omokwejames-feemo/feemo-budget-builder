// Option 1 — Table island detection
// Option 7 — Statistical outlier detection for totals rows
//
// Scans worksheets for contiguous populated regions so parsers can operate
// on bounded data areas rather than the full sheet (which often starts with
// 10–20 rows of branding, logos, and blank spacer rows).

import ExcelJS from 'exceljs'

export interface IslandResult {
  topRow: number      // 1-indexed, inclusive
  bottomRow: number
  leftCol: number
  rightCol: number
  density: number     // 0–1 fraction of cells in the bounding box that are non-empty
  rowCount: number
  colCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cellHasValue(cell: ExcelJS.Cell): boolean {
  if (cell.value === null || cell.value === undefined || cell.value === '') return false
  const master = (cell as any).master
  if (master && master !== cell) return cellHasValue(master)
  return true
}

function rowPopulatedCols(ws: ExcelJS.Worksheet, rowNum: number, maxCol: number): number {
  let count = 0
  const row = ws.getRow(rowNum)
  for (let c = 1; c <= maxCol; c++) {
    if (cellHasValue(row.getCell(c))) count++
  }
  return count
}

// ─── Island detection ─────────────────────────────────────────────────────────

export function detectIslands(
  ws: ExcelJS.Worksheet,
  options: { minRows?: number; minCols?: number; emptyRowTolerance?: number; maxRows?: number } = {}
): IslandResult[] {
  const { minRows = 3, minCols = 2, emptyRowTolerance = 2, maxRows = 500 } = options

  const totalRows = Math.min(ws.rowCount, maxRows)
  const totalCols = ws.columnCount || 20

  // Build a quick occupancy map: row → array of occupied col indices
  const occupied: Map<number, Set<number>> = new Map()
  for (let r = 1; r <= totalRows; r++) {
    const row = ws.getRow(r)
    const cols = new Set<number>()
    for (let c = 1; c <= totalCols; c++) {
      if (cellHasValue(row.getCell(c))) cols.add(c)
    }
    if (cols.size > 0) occupied.set(r, cols)
  }

  const islands: IslandResult[] = []
  let islandStart = -1
  let emptyStreak = 0
  let islandRows: number[] = []

  const finaliseIsland = () => {
    if (islandRows.length < minRows) return
    // Compute bounding box
    let leftCol = Infinity, rightCol = -Infinity
    for (const r of islandRows) {
      const cols = occupied.get(r)
      if (!cols) continue
      for (const c of cols) {
        if (c < leftCol) leftCol = c
        if (c > rightCol) rightCol = c
      }
    }
    const colCount = rightCol - leftCol + 1
    if (colCount < minCols || leftCol === Infinity) return

    // Count populated cells for density
    let populated = 0, total = 0
    for (const r of islandRows) {
      const cols = occupied.get(r) ?? new Set()
      for (let c = leftCol; c <= rightCol; c++) {
        total++
        if (cols.has(c)) populated++
      }
    }

    islands.push({
      topRow: islandRows[0],
      bottomRow: islandRows[islandRows.length - 1],
      leftCol,
      rightCol,
      density: total > 0 ? populated / total : 0,
      rowCount: islandRows.length,
      colCount,
    })
  }

  for (let r = 1; r <= totalRows; r++) {
    if (occupied.has(r)) {
      if (islandStart < 0) { islandStart = r; islandRows = [] }
      islandRows.push(r)
      emptyStreak = 0
    } else {
      emptyStreak++
      if (islandStart >= 0) {
        if (emptyStreak > emptyRowTolerance) {
          finaliseIsland()
          islandStart = -1
          islandRows = []
          emptyStreak = 0
        }
      }
    }
  }
  if (islandStart >= 0) finaliseIsland()

  return islands
}

// Pick the island most likely to be the main data table.
// Prefers: widest columns (>=3), then largest row count.
export function pickDataIsland(islands: IslandResult[], minCols = 3): IslandResult | null {
  const candidates = islands.filter(i => i.colCount >= minCols)
  if (!candidates.length) return islands.sort((a, b) => b.rowCount - a.rowCount)[0] ?? null
  return candidates.sort((a, b) => b.rowCount - a.rowCount)[0]
}

// Return the best island that covers a given absolute row range (for validation).
export function islandContainsRow(island: IslandResult, rowNum: number): boolean {
  return rowNum >= island.topRow && rowNum <= island.bottomRow
}

// ─── Option 7: Outlier row detection ─────────────────────────────────────────
// Given an array of numbers (one per data row within an island section),
// return the set of zero-based indices that look like totals/subtotals.
// A row is an outlier if its value is > multiplier × the median of all values.

export function detectOutlierRows(
  values: (number | null)[],
  options: { multiplier?: number; minMedian?: number } = {}
): Set<number> {
  const { multiplier = 3, minMedian = 100 } = options
  const valid = values.filter((v): v is number => v !== null && v > 0)
  if (valid.length < 3) return new Set()

  const sorted = [...valid].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median < minMedian) return new Set()

  const threshold = median * multiplier
  const outliers = new Set<number>()
  values.forEach((v, i) => { if (v !== null && v > threshold) outliers.add(i) })
  return outliers
}

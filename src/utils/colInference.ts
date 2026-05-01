// Option 2 — Column role inference from data shape
// Analyses the distribution of values within each column of an island to
// infer its role without requiring column header keywords.

import ExcelJS from 'exceljs'
import type { IslandResult } from './islandDetector'
import type { BudgetColMap } from './budgetParser'

export type ColRole = 'detail' | 'no' | 'qty' | 'rate' | 'unit' | 'total' | 'ie' | 'schedNo' | 'unknown'

export interface ColProfile {
  colIndex: number     // 1-indexed absolute column
  role: ColRole
  confidence: number   // 0–1
  sampleSize: number
}

export interface ColInferenceResult {
  profiles: ColProfile[]
  // Partial BudgetColMap built from inferred roles (zero-indexed offsets from col 1)
  map: Partial<BudgetColMap>
  confidence: number   // mean confidence across assigned columns
}

const UNIT_WORDS = /^(flat|day|days|week|weeks|month|months|hour|hours|lump|night|nights|call|calls|trip|trips|set|sets|item|items|each|lot|lots|shift|shifts)$/i
const IE_WORDS   = /^(i|e|local|expat|expatriate|internal|external|in|ex)$/i
const SCHED_CODE = /^[A-Z]{1,2}\d+$/

function cellValue(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) {
    const master = (cell as any).master
    if (master && master !== cell) return cellValue(master)
    return ''
  }
  if (typeof v === 'object' && 'richText' in (v as object))
    return (v as any).richText.map((r: any) => r.text).join('').trim()
  if (typeof v === 'object' && 'result' in (v as object))
    return String((v as any).result ?? '').trim()
  return String(v).trim()
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/[,\s₦$£€%]/g, ''))
  return isNaN(n) ? null : n
}

// ─── Profile a single column within the island ────────────────────────────────

function profileColumn(
  ws: ExcelJS.Worksheet,
  colIndex: number,
  island: IslandResult,
  dataStartRow: number,
  sampleRows: number
): ColProfile {
  const endRow = Math.min(dataStartRow + sampleRows - 1, island.bottomRow)

  const texts: string[] = []
  const nums: number[] = []

  for (let r = dataStartRow; r <= endRow; r++) {
    const raw = cellValue(ws.getRow(r).getCell(colIndex))
    if (!raw) continue
    texts.push(raw)
    const n = parseNum(raw)
    if (n !== null) nums.push(n)
  }

  const total = texts.length
  if (total === 0) return { colIndex, role: 'unknown', confidence: 0, sampleSize: 0 }

  const numFraction  = nums.length / total
  const textFraction = 1 - numFraction

  // I/E column: almost all values are one of a tiny set of codes
  const ieMatches = texts.filter(t => IE_WORDS.test(t.trim())).length
  if (ieMatches / total >= 0.7)
    return { colIndex, role: 'ie', confidence: ieMatches / total, sampleSize: total }

  // Unit column: mostly short unit words
  const unitMatches = texts.filter(t => UNIT_WORDS.test(t.trim())).length
  if (unitMatches / total >= 0.55)
    return { colIndex, role: 'unit', confidence: unitMatches / total, sampleSize: total }

  // SchedNo column: mostly short alphanumeric codes
  const schedMatches = texts.filter(t => SCHED_CODE.test(t.trim())).length
  if (schedMatches / total >= 0.5 && textFraction >= 0.5)
    return { colIndex, role: 'schedNo', confidence: schedMatches / total, sampleSize: total }

  // Numeric columns
  if (numFraction >= 0.6 && nums.length >= 2) {
    const sorted = [...nums].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const max    = Math.max(...nums)
    const min    = Math.min(...nums)

    // Small integers 1–50: qty or no
    if (max <= 50 && min >= 1 && median <= 30 && nums.every(n => Number.isInteger(n)))
      return { colIndex, role: median <= 10 ? 'no' : 'qty', confidence: 0.75, sampleSize: total }

    // Large numbers: rate or total
    if (median >= 1000)
      return { colIndex, role: 'rate', confidence: 0.65, sampleSize: total }

    if (median >= 100)
      return { colIndex, role: 'rate', confidence: 0.5, sampleSize: total }
  }

  // Long text column with high non-empty rate: detail
  const avgLen = texts.reduce((s, t) => s + t.length, 0) / total
  if (textFraction >= 0.7 && avgLen >= 8)
    return { colIndex, role: 'detail', confidence: 0.7, sampleSize: total }

  return { colIndex, role: 'unknown', confidence: 0, sampleSize: total }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function inferColumnRoles(
  ws: ExcelJS.Worksheet,
  island: IslandResult,
  dataStartRow?: number,
  sampleRows = 30
): ColInferenceResult {
  const start = dataStartRow ?? island.topRow
  const profiles: ColProfile[] = []

  for (let c = island.leftCol; c <= island.rightCol; c++) {
    profiles.push(profileColumn(ws, c, island, start, sampleRows))
  }

  // If two columns got the same role, keep only the higher-confidence one
  const seen = new Map<ColRole, ColProfile>()
  for (const p of profiles) {
    if (p.role === 'unknown') continue
    const existing = seen.get(p.role)
    if (!existing || p.confidence > existing.confidence) seen.set(p.role, p)
  }

  // Upgrade: if we have two 'rate' columns, call the larger-median one 'total'
  const rateCandidates = profiles.filter(p => p.role === 'rate').sort((a, b) => b.confidence - a.confidence)
  if (rateCandidates.length >= 2) {
    const [first, second] = rateCandidates
    // Get medians to differentiate
    const med = (p: ColProfile) => {
      const ns: number[] = []
      const end = Math.min(start + sampleRows - 1, island.bottomRow)
      for (let r = start; r <= end; r++) {
        const raw = cellValue(ws.getRow(r).getCell(p.colIndex))
        const n = parseNum(raw)
        if (n !== null && n > 0) ns.push(n)
      }
      if (!ns.length) return 0
      const s = [...ns].sort((a, b) => a - b)
      return s[Math.floor(s.length / 2)]
    }
    if (med(first) < med(second)) {
      seen.set('total', { ...second, role: 'total' })
      seen.set('rate',  { ...first, role: 'rate' })
    } else {
      seen.set('total', { ...first, role: 'total' })
      seen.set('rate',  { ...second, role: 'rate' })
    }
  }

  // Build BudgetColMap (zero-indexed offset from column 1)
  const map: Partial<BudgetColMap> = {}
  for (const [role, profile] of seen.entries()) {
    const offset = profile.colIndex - 1
    if (role === 'detail')  map.detail  = offset
    if (role === 'no')      map.no      = offset
    if (role === 'qty')     map.qty     = offset
    if (role === 'rate')    map.rate    = offset
    if (role === 'unit')    map.unit    = offset
    if (role === 'total')   map.total   = offset
    if (role === 'ie')      map.ie      = offset
    if (role === 'schedNo') map.schedNo = offset
  }

  const assigned = [...seen.values()].filter(p => p.role !== 'unknown')
  const confidence = assigned.length
    ? assigned.reduce((s, p) => s + p.confidence, 0) / assigned.length
    : 0

  return { profiles, map, confidence }
}

// Merge three column map sources into one final BudgetColMap.
// Priority: keyword header (explicit) > format signals (structural) > data inference.
// Returns the merged map and an overall confidence score.
export function mergeColMaps(
  keywordMap: Partial<BudgetColMap>,
  inferenceResult: ColInferenceResult,
  formatMap: Partial<BudgetColMap>
): { map: BudgetColMap; confidence: number } {
  const defaults: BudgetColMap = { detail: 1, no: -1, qty: 2, rate: 3, unit: 4, total: -1, ie: -1, schedNo: -1 }
  // Layer: inference < format < keyword (later wins)
  const merged: BudgetColMap = {
    ...defaults,
    ...inferenceResult.map,
    ...formatMap,
    ...keywordMap,
  }
  // Remove duplicates: if two roles map to the same column, keyword-assigned one wins
  const usedCols = new Map<number, keyof BudgetColMap>()
  for (const [k, v] of Object.entries(merged) as [keyof BudgetColMap, number][]) {
    if (v < 0) continue
    if (keywordMap[k] !== undefined) { usedCols.set(v, k); continue }
    if (usedCols.has(v)) {
      // conflict — clear the lower-priority assignment
      merged[k] = -1
    } else {
      usedCols.set(v, k)
    }
  }

  const assigned = (Object.values(merged) as number[]).filter(v => v >= 0).length
  const confidence = Math.min(1, assigned / 5 + inferenceResult.confidence * 0.3)

  return { map: merged, confidence }
}

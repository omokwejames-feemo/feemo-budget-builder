// Option 5 — Format fingerprinting
// Option 8 — Progressive learning
//
// Computes a structural fingerprint for each workbook and persists:
//   • column maps derived from a successful parse (so future imports skip inference)
//   • user corrections keyed by field name (so the same fix isn't needed twice)

import ExcelJS from 'exceljs'
import type { BudgetColMap } from './budgetParser'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FingerprintEntry {
  colMaps: Record<string, Partial<BudgetColMap>>   // sheetName → column map
  corrections: Record<string, unknown>              // fieldName → corrected value
  useCount: number
  lastUsed: string   // ISO date string
}

type ParserStoreData = Record<string, FingerprintEntry>

// ─── Fingerprint computation ──────────────────────────────────────────────────
// Creates a lightweight structural key from the workbook's sheet names and
// column/row counts.  Content-independent so the same template always matches.

export function computeWorkbookFingerprint(wb: ExcelJS.Workbook): string {
  const parts: string[] = wb.worksheets
    .filter(ws => ws.rowCount > 1)
    .map(ws => {
      const colCount = ws.columnCount || 0
      const rowBand = ws.rowCount < 50 ? 'S' : ws.rowCount < 200 ? 'M' : 'L'
      return `${ws.name.toLowerCase().replace(/\s+/g, '_')}:${colCount}:${rowBand}`
    })
    .sort()

  // Simple djb2 hash — no crypto API needed, collision risk acceptable here
  let h = 5381
  const str = parts.join('|')
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h >>> 0  // keep unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0')
}

// ─── IPC bridge (safe — undefined in non-Electron environments) ──────────────

const api = typeof window !== 'undefined' ? (window as any).electronAPI : null

async function loadStore(): Promise<ParserStoreData> {
  if (!api?.parserStoreGet) return {}
  try { return (await api.parserStoreGet()) as ParserStoreData }
  catch { return {} }
}

async function saveStore(data: ParserStoreData): Promise<void> {
  if (!api?.parserStoreSet) return
  try { await api.parserStoreSet(data as Record<string, unknown>) }
  catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getStoredColMaps(
  fingerprint: string
): Promise<Record<string, Partial<BudgetColMap>> | null> {
  const store = await loadStore()
  const entry = store[fingerprint]
  if (!entry || !entry.colMaps || Object.keys(entry.colMaps).length === 0) return null
  return entry.colMaps
}

export async function getStoredCorrections(
  fingerprint: string
): Promise<Record<string, unknown>> {
  const store = await loadStore()
  return store[fingerprint]?.corrections ?? {}
}

export async function storeColMaps(
  fingerprint: string,
  colMaps: Record<string, Partial<BudgetColMap>>
): Promise<void> {
  const store = await loadStore()
  const existing = store[fingerprint] ?? { colMaps: {}, corrections: {}, useCount: 0, lastUsed: '' }
  store[fingerprint] = {
    ...existing,
    colMaps: { ...existing.colMaps, ...colMaps },
    useCount: existing.useCount + 1,
    lastUsed: new Date().toISOString().split('T')[0],
  }
  await saveStore(store)
}

// Called when the user manually corrects a parsed field value.
// On the next import with the same fingerprint, the corrected value is applied.
export async function recordCorrection(
  fingerprint: string,
  field: string,
  value: unknown
): Promise<void> {
  const store = await loadStore()
  const existing = store[fingerprint] ?? { colMaps: {}, corrections: {}, useCount: 0, lastUsed: '' }
  store[fingerprint] = {
    ...existing,
    corrections: { ...existing.corrections, [field]: value },
    lastUsed: new Date().toISOString().split('T')[0],
  }
  await saveStore(store)
}

// Apply stored corrections to a parsed workbook result.
// Corrections override any inferred value; they carry 'high' confidence.
export function applyCorrections(
  result: Record<string, unknown>,
  corrections: Record<string, unknown>
): void {
  for (const [field, value] of Object.entries(corrections)) {
    if (value === null || value === undefined) continue
    // Scalar fields are wrapped in ScoredField; collections are not
    const current = result[field]
    if (current && typeof current === 'object' && 'confidence' in (current as object)) {
      result[field] = { value, confidence: 'high', source: 'user-correction' }
    } else if (current === null || current === undefined) {
      // If the field was null, set it as a scored field
      result[field] = { value, confidence: 'high', source: 'user-correction' }
    }
  }
}

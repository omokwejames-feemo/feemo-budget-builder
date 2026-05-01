// Option 6 — User-guided column mapper
// Shows the first few rows of data from the budget sheet and lets the user
// assign a role to each column via dropdowns.  On confirm, triggers a re-parse
// with the corrected column map.

import { useState, useEffect } from 'react'
import ExcelJS from 'exceljs'
import type { BudgetColMap } from '../utils/budgetParser'

export type ColRole = 'detail' | 'no' | 'qty' | 'rate' | 'unit' | 'total' | 'ie' | 'schedNo' | 'ignore'

const ROLE_LABELS: Record<ColRole, string> = {
  detail:  'Description',
  no:      'No.',
  qty:     'Qty',
  rate:    'Rate',
  unit:    'Unit',
  total:   'Total',
  ie:      'I/E',
  schedNo: 'Sched No.',
  ignore:  '— Ignore —',
}

interface Props {
  buffer: ArrayBuffer
  sheetName: string
  currentColMap: Partial<BudgetColMap>
  onConfirm: (corrected: BudgetColMap) => void
  onClose: () => void
}

const DEFAULTS: BudgetColMap = { detail: 1, no: -1, qty: 2, rate: 3, unit: 4, total: -1, ie: -1, schedNo: -1 }
const PREVIEW_ROWS = 8

export default function ColumnMapper({ buffer, sheetName, currentColMap, onConfirm, onClose }: Props) {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows]       = useState<string[][]>([])
  const [roles, setRoles]     = useState<ColRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSheet()
  }, [buffer, sheetName])

  async function loadSheet() {
    setLoading(true)
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      const ws = wb.getWorksheet(sheetName)
      if (!ws) { setLoading(false); return }

      // Detect data area
      const colCount = Math.min(ws.columnCount || 14, 14)
      const maxRow   = Math.min(ws.rowCount, 30)

      // Find first non-empty row in data
      let startRow = 1
      for (let r = 1; r <= maxRow; r++) {
        const row = ws.getRow(r)
        let nonEmpty = 0
        for (let c = 1; c <= colCount; c++) {
          const v = row.getCell(c).value
          if (v !== null && v !== undefined && String(v).trim().length > 0) nonEmpty++
        }
        if (nonEmpty >= 3) { startRow = r; break }
      }

      // Extract header row (first content row) + PREVIEW_ROWS of data
      const headerRow = ws.getRow(startRow)
      const hdrs: string[] = []
      for (let c = 1; c <= colCount; c++) {
        const v = headerRow.getCell(c).value
        hdrs.push(v !== null && v !== undefined ? String(v).trim().slice(0, 20) : `Col ${c}`)
      }
      setHeaders(hdrs)

      const dataRows: string[][] = []
      for (let r = startRow + 1; r <= Math.min(startRow + PREVIEW_ROWS, maxRow); r++) {
        const row = ws.getRow(r)
        const cells: string[] = []
        for (let c = 1; c <= colCount; c++) {
          const v = row.getCell(c).value
          if (v === null || v === undefined) { cells.push(''); continue }
          if (typeof v === 'object' && 'result' in (v as object)) cells.push(String((v as any).result ?? ''))
          else if (typeof v === 'object' && 'richText' in (v as object)) cells.push((v as any).richText.map((r: any) => r.text).join(''))
          else cells.push(String(v).trim().slice(0, 20))
        }
        dataRows.push(cells)
      }
      setRows(dataRows)

      // Initialise role assignments from current column map
      const merged: BudgetColMap = { ...DEFAULTS, ...currentColMap }
      const initRoles: ColRole[] = hdrs.map((_, i) => {
        const offset = i  // 0-indexed
        if (merged.detail  === offset) return 'detail'
        if (merged.no      === offset) return 'no'
        if (merged.qty     === offset) return 'qty'
        if (merged.rate    === offset) return 'rate'
        if (merged.unit    === offset) return 'unit'
        if (merged.total   === offset) return 'total'
        if (merged.ie      === offset) return 'ie'
        if (merged.schedNo === offset) return 'schedNo'
        return 'ignore'
      })
      setRoles(initRoles)
    } catch {}
    setLoading(false)
  }

  function setRole(colIdx: number, role: ColRole) {
    setRoles(prev => {
      const next = [...prev]
      // If role is not ignore, clear it from any other column first
      if (role !== 'ignore') {
        for (let i = 0; i < next.length; i++) {
          if (i !== colIdx && next[i] === role) next[i] = 'ignore'
        }
      }
      next[colIdx] = role
      return next
    })
  }

  function buildColMap(): BudgetColMap {
    const map: BudgetColMap = { ...DEFAULTS }
    roles.forEach((role, i) => {
      if (role === 'ignore') return
      if (role === 'detail')  map.detail  = i
      if (role === 'no')      map.no      = i
      if (role === 'qty')     map.qty     = i
      if (role === 'rate')    map.rate    = i
      if (role === 'unit')    map.unit    = i
      if (role === 'total')   map.total   = i
      if (role === 'ie')      map.ie      = i
      if (role === 'schedNo') map.schedNo = i
    })
    return map
  }

  const S = {
    overlay: {
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    },
    modal: {
      background: 'var(--bg)', borderRadius: 12, padding: 28, maxWidth: 860, width: '95vw',
      maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    },
    h2: { fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 },
    sub: { fontSize: 12, color: 'var(--text3)', marginBottom: 20 },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 },
    th: { padding: '6px 8px', background: 'var(--bg2)', color: 'var(--text3)', fontWeight: 600, textAlign: 'left' as const, borderBottom: '1px solid var(--border)' },
    td: { padding: '5px 8px', color: 'var(--text)', borderBottom: '1px solid var(--border2, rgba(255,255,255,0.05))', verticalAlign: 'top' as const },
    select: { fontSize: 11, padding: '3px 6px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'inherit', width: '100%' },
    footer: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 },
    btnPrimary: { padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13 },
    btnGhost:   { padding: '9px 20px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>
        <div style={S.h2}>Fix Column Mapping — {sheetName}</div>
        <div style={S.sub}>
          Assign a role to each column. We'll re-parse the sheet using your assignments.
          Only the Description column is required — all others are optional.
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading sheet preview…</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                {headers.map((hdr, i) => (
                  <th key={i} style={S.th}>
                    <div style={{ marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }} title={hdr}>{hdr || `Col ${i+1}`}</div>
                    <select
                      value={roles[i] ?? 'ignore'}
                      onChange={e => setRole(i, e.target.value as ColRole)}
                      style={{ ...S.select, color: roles[i] !== 'ignore' ? 'var(--accent)' : 'var(--text3)' }}
                    >
                      {(Object.keys(ROLE_LABELS) as ColRole[]).map(role => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ ...S.td, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={S.footer}>
          <button style={S.btnGhost} onClick={onClose}>Cancel</button>
          <button
            style={S.btnPrimary}
            disabled={loading || !roles.some(r => r === 'detail')}
            onClick={() => onConfirm(buildColMap())}
          >
            Re-parse with These Columns
          </button>
        </div>
      </div>
    </div>
  )
}

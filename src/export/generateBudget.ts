import ExcelJS from 'exceljs'
import type { BudgetState, DeptCode } from '../store/budgetStore'
import { DEPARTMENTS, getTotalMonths, getMonthLabel, getMonthPhase, getDeptTarget, getDeptActual } from '../store/budgetStore'

// Column letter (handles AA, AB…)
function col(n: number): string {
  let s = ''
  while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s; n = Math.floor((n - 1) / 26) }
  return s
}

const FONT = 'Calibri'
const NUM  = '#,##0;(#,##0);"-"'

const C = {
  navy:      'FF1B2A4A',
  white:     'FFFFFFFF',
  offWhite:  'FFF8F9FB',
  lightGray: 'FFE8ECF2',
  sectionBg: 'FFD8DDE8',
  border:    'FFBDC3CF',
  borderDk:  'FF8A93A5',
  text:      'FF1A2030',
  muted:     'FF6B7280',
  green:     'FF1A7A4A',
  greenBg:   'FFE6F4EC',
  red:       'FFCC2233',
  redBg:     'FFF9E8EA',
  blue:      'FF2355A7',
  rcptHdr:   'FF1A5C32',
  pmtHdr:    'FF8C1C1C',
}

function bAll() {
  return {
    top:    { style: 'thin' as const, color: { argb: C.border } },
    left:   { style: 'thin' as const, color: { argb: C.border } },
    bottom: { style: 'thin' as const, color: { argb: C.border } },
    right:  { style: 'thin' as const, color: { argb: C.border } },
  }
}
function bDk() {
  return {
    top:    { style: 'thin' as const, color: { argb: C.borderDk } },
    left:   { style: 'thin' as const, color: { argb: C.border } },
    bottom: { style: 'thin' as const, color: { argb: C.borderDk } },
    right:  { style: 'thin' as const, color: { argb: C.border } },
  }
}

function g(ws: ExcelJS.Worksheet, r: number, c: number) { return ws.getCell(r, c) }

function setTitleRow(ws: ExcelJS.Worksheet, r: number, endCol: number, title: string, sub?: string) {
  ws.mergeCells(r, 1, r, endCol)
  const c = g(ws, r, 1)
  c.value = title
  c.font = { name: FONT, bold: true, size: 13, color: { argb: C.navy } }
  c.alignment = { horizontal: 'left', vertical: 'middle' }
  c.border = { bottom: { style: 'medium', color: { argb: C.navy } } }
  ws.getRow(r).height = 26
  if (sub) {
    ws.mergeCells(r + 1, 1, r + 1, endCol)
    const s = g(ws, r + 1, 1)
    s.value = sub
    s.font = { name: FONT, italic: true, size: 9, color: { argb: C.muted } }
    s.alignment = { horizontal: 'left', vertical: 'middle' }
    ws.getRow(r + 1).height = 14
  }
}

function setColHdr(ws: ExcelJS.Worksheet, r: number, c: number, val: string, align: 'left'|'right'|'center' = 'center') {
  const cell = g(ws, r, c)
  cell.value = val
  cell.font = { name: FONT, bold: true, size: 9, color: { argb: C.white } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true }
  cell.border = bAll()
}

function setSectionHdr(ws: ExcelJS.Worksheet, r: number, endCol: number, label: string, bg = C.sectionBg, fg = C.navy) {
  ws.mergeCells(r, 1, r, endCol)
  const c = g(ws, r, 1)
  c.value = label
  c.font = { name: FONT, bold: true, size: 9, color: { argb: fg } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(r).height = 16
}

function setData(ws: ExcelJS.Worksheet, r: number, c: number, val: ExcelJS.CellValue, opts: {
  bold?: boolean; italic?: boolean; color?: string; bg?: string;
  align?: 'left'|'right'|'center'; numFmt?: string; size?: number
} = {}) {
  const cell = g(ws, r, c)
  cell.value = val
  cell.font = { name: FONT, bold: opts.bold, italic: opts.italic, size: opts.size ?? 10, color: { argb: opts.color ?? C.text } }
  if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
  if (opts.numFmt) cell.numFmt = opts.numFmt
  if (opts.align) cell.alignment = { horizontal: opts.align, vertical: 'middle' }
  cell.border = bAll()
}

function setSubtotal(ws: ExcelJS.Worksheet, r: number, endCol: number, label: string, nums: { col: number; value?: number; formula?: string }[]) {
  for (let c = 1; c <= endCol; c++) {
    const cell = g(ws, r, c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lightGray } }
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.navy } }
    cell.border = bDk()
  }
  g(ws, r, 1).value = label
  for (const { col: c, value, formula } of nums) {
    const cell = g(ws, r, c)
    if (formula) cell.value = { formula }
    else if (value !== undefined) cell.value = value
    cell.numFmt = NUM
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  ws.getRow(r).height = 18
}

function setGrandTotal(ws: ExcelJS.Worksheet, r: number, endCol: number, label: string, nums: { col: number; value?: number; formula?: string }[]) {
  for (let c = 1; c <= endCol; c++) {
    const cell = g(ws, r, c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.white } }
    cell.border = {
      top: { style: 'medium', color: { argb: C.navy } },
      bottom: { style: 'medium', color: { argb: C.navy } },
      left: { style: 'thin', color: { argb: C.borderDk } },
      right: { style: 'thin', color: { argb: C.borderDk } },
    }
  }
  g(ws, r, 1).value = label
  for (const { col: c, value, formula } of nums) {
    const cell = g(ws, r, c)
    if (formula) cell.value = { formula }
    else if (value !== undefined) cell.value = value
    cell.numFmt = NUM
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  ws.getRow(r).height = 20
}

const DEPT_PHASES: Partial<Record<DeptCode, string[]>> = {
  A: ['DEV'], B: ['DEV','PRE-PROD'], C: ['DEV','PRE-PROD','SHOOT'],
  D: ['PRE-PROD','SHOOT'], E: ['SHOOT'], F: ['DEV','PRE-PROD','SHOOT','POST'],
  G: ['PRE-PROD','SHOOT'], H: ['SHOOT'], I: ['SHOOT'], J: ['PRE-PROD','SHOOT'],
  K: ['PRE-PROD','SHOOT'], L: ['PRE-PROD','SHOOT'], M: ['PRE-PROD','SHOOT'],
  N: ['PRE-PROD','SHOOT'], O: ['SHOOT'], P: ['SHOOT'], Q: ['PRE-PROD','SHOOT'],
  R: ['PRE-PROD','SHOOT','POST'], S: ['PRE-PROD','SHOOT','POST'], T: ['SHOOT'],
  AA: ['SHOOT'], DD: ['POST'], EE: ['POST'], FF: ['POST'],
  GG: ['DEV','PRE-PROD','SHOOT','POST'], HH: ['DEV','PRE-PROD','SHOOT','POST'],
  II: ['DEV','PRE-PROD','SHOOT','POST'],
}

const PHASE_COLORS: Record<string, string> = {
  DEV: 'FF2D5299', 'PRE-PROD': 'FF1E6B47', SHOOT: 'FF6B4E1E', POST: 'FF4A1E6B',
}

export async function generateBudgetXlsx(state: BudgetState): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Feemo Budget Builder'; wb.created = new Date()

  const { project, timeline, installments, deptAllocations, lineItems, salaryRoles, forecastOverrides } = state
  const totalMonths = getTotalMonths(timeline)
  const months = Array.from({ length: totalMonths }, (_, i) => i + 1)
  const cur = project.currency || 'N'
  const feePct = project.productionFeePercent ?? 5

  // ── 1. ASSUMPTIONS ──────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('ASSUMPTIONS', { properties: { tabColor: { argb: '1B2A4A' } } })
    ws.columns = [{ width: 34 }, { width: 26 }, { width: 36 }]
    let r = 1
    setTitleRow(ws, r, 3,
      `${project.title || 'PRODUCTION'} — PRODUCTION ASSUMPTIONS`,
      `Total Budget: ${cur}${project.totalBudget.toLocaleString()} | Currency: ${cur}`)
    r += 3

    setSectionHdr(ws, r, 3, 'PROJECT DETAILS'); r++
    const pf: [string, ExcelJS.CellValue, string?][] = [
      ['Production Title', project.title],
      ['Production Company', project.company],
      [`Total Budget (${cur})`, project.totalBudget, NUM],
      ['Format', project.format],
      ['Duration (mins)', project.duration],
      ['Shoot Days', project.shootDays],
      ['Shoot Location', project.location],
      ['Currency', cur],
      ['Start Date', project.startDate],
      ['Production Fee %', feePct / 100, '0.0%'],
    ]
    for (const [lbl, val, fmt] of pf) {
      setData(ws, r, 1, lbl, { color: C.muted, size: 9 })
      const c = g(ws, r, 2); c.value = val; c.border = bAll()
      c.font = { name: FONT, size: 10, bold: true, color: { argb: C.blue } }
      if (fmt) { c.numFmt = fmt; c.alignment = { horizontal: 'right', vertical: 'middle' } }
      ws.getRow(r).height = 17; r++
    }

    r++
    setSectionHdr(ws, r, 3, 'PRODUCTION TIMELINE'); r++
    const tl: [string, number, boolean][] = [
      ['Development (months)', timeline.developmentMonths, false],
      ['Pre-Production (months)', timeline.preProdMonths, false],
      ['Shoot (months)', timeline.shootMonths, false],
      ['Post-Production (months)', timeline.postMonths, false],
      ['TOTAL PRODUCTION PERIOD', totalMonths, true],
    ]
    for (const [lbl, val, isTotal] of tl) {
      setData(ws, r, 1, lbl, { color: isTotal ? C.navy : C.muted, bold: isTotal, size: 9 })
      const c = g(ws, r, 2); c.value = val; c.border = bAll()
      c.font = { name: FONT, size: 10, bold: isTotal, color: { argb: isTotal ? C.navy : C.blue } }
      c.alignment = { horizontal: 'right', vertical: 'middle' }
      if (isTotal) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lightGray } }
      ws.getRow(r).height = 17; r++
    }

    r++
    setSectionHdr(ws, r, 3, 'FUNDING INSTALLMENTS'); r++
    setColHdr(ws, r, 1, 'INSTALLMENT', 'left')
    setColHdr(ws, r, 2, '% OF BUDGET')
    setColHdr(ws, r, 3, 'TRIGGER / MILESTONE', 'left')
    ws.getRow(r).height = 18; r++
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i]
      const bg = i % 2 === 0 ? C.white : C.offWhite
      setData(ws, r, 1, inst.label, { bold: true, bg })
      const p = g(ws, r, 2); p.value = inst.percentage / 100; p.numFmt = '0.0%'; p.border = bAll()
      p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      p.alignment = { horizontal: 'right', vertical: 'middle' }
      p.font = { name: FONT, size: 10, color: { argb: C.blue } }
      setData(ws, r, 3, inst.trigger, { color: C.muted, italic: true, bg })
      ws.getRow(r).height = 17; r++
    }
    setSubtotal(ws, r, 3, 'CHECK — Total % (must equal 100%)', [
      { col: 2, value: installments.reduce((s, i) => s + i.percentage, 0) / 100 }
    ])
    g(ws, r, 2).numFmt = '0.0%'
    r += 2

    setSectionHdr(ws, r, 3, 'DEPARTMENT % ALLOCATIONS'); r++
    setColHdr(ws, r, 1, 'DEPARTMENT', 'left')
    setColHdr(ws, r, 2, '% ALLOCATION')
    setColHdr(ws, r, 3, `TARGET BUDGET (${cur})`)
    ws.getRow(r).height = 18; r++
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      const dept = DEPARTMENTS[i]
      const pct = deptAllocations[dept.code] || 0
      const target = (pct / 100) * project.totalBudget
      const bg = i % 2 === 0 ? C.white : C.offWhite
      setData(ws, r, 1, `${dept.code}. ${dept.name}`, { bg, size: 9 })
      const p = g(ws, r, 2); p.value = pct / 100; p.numFmt = '0.00%'; p.border = bAll()
      p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      p.alignment = { horizontal: 'right', vertical: 'middle' }
      p.font = { name: FONT, size: 10, color: { argb: C.blue } }
      const t = g(ws, r, 3); t.value = target; t.numFmt = NUM; t.border = bAll()
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      t.alignment = { horizontal: 'right', vertical: 'middle' }
      t.font = { name: FONT, size: 10, color: { argb: C.green } }
      ws.getRow(r).height = 17; r++
    }
    setGrandTotal(ws, r, 3, 'TOTAL ALLOCATION', [
      { col: 2, value: DEPARTMENTS.reduce((s, d) => s + (deptAllocations[d.code] || 0), 0) / 100 },
      { col: 3, value: DEPARTMENTS.reduce((s, d) => s + ((deptAllocations[d.code] || 0) / 100) * project.totalBudget, 0) },
    ])
    g(ws, r, 2).numFmt = '0.00%'
    ws.views = [{ state: 'frozen', ySplit: 3 }]
  }

  // ── 2. BUDGET SUMMARY ──────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('BUDGET SUMMARY')
    ws.columns = [{ width: 6 }, { width: 32 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }]
    let r = 1
    setTitleRow(ws, r, 6,
      `BUDGET SUMMARY — ${project.title || 'PRODUCTION'}`,
      `Format: ${project.format} | ${project.shootDays} shoot days | ${project.location || '—'}`)
    r += 3

    setColHdr(ws, r, 1, 'CODE')
    setColHdr(ws, r, 2, 'DEPARTMENT', 'left')
    setColHdr(ws, r, 3, `TARGET (${cur})`)
    setColHdr(ws, r, 4, `ACTUAL (${cur})`)
    setColHdr(ws, r, 5, `VARIANCE (${cur})`)
    setColHdr(ws, r, 6, 'STATUS')
    ws.getRow(r).height = 18; r++

    let grandTarget = 0, grandActual = 0
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      const dept = DEPARTMENTS[i]
      const target = getDeptTarget(dept.code, state)
      const actual = getDeptActual(dept.code, state)
      const variance = actual - target
      grandTarget += target; grandActual += actual
      const bg = i % 2 === 0 ? C.white : C.offWhite
      setData(ws, r, 1, dept.code, { bold: true, color: C.navy, align: 'center', bg })
      setData(ws, r, 2, dept.name, { bg })
      const t = g(ws, r, 3); t.value = target; t.numFmt = NUM; t.border = bAll()
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      t.alignment = { horizontal: 'right', vertical: 'middle' }; t.font = { name: FONT, size: 10 }
      const a = g(ws, r, 4); a.value = actual; a.numFmt = NUM; a.border = bAll()
      a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      a.alignment = { horizontal: 'right', vertical: 'middle' }
      a.font = { name: FONT, size: 10, color: { argb: actual > target && target > 0 ? C.red : C.text } }
      const v = g(ws, r, 5); v.value = variance; v.numFmt = NUM; v.border = bAll()
      v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      v.alignment = { horizontal: 'right', vertical: 'middle' }
      v.font = { name: FONT, size: 10, color: { argb: variance > 0 ? C.red : variance < 0 ? C.green : C.muted } }
      const status = Math.abs(variance) < 1 ? 'ON TARGET' : variance > 0 ? 'OVER' : 'UNDER'
      setData(ws, r, 6, status, { bold: true, align: 'center', bg,
        color: status === 'ON TARGET' ? C.green : status === 'OVER' ? C.red : C.muted })
      ws.getRow(r).height = 17; r++
    }
    setGrandTotal(ws, r, 6, 'GRAND TOTAL', [
      { col: 3, value: grandTarget }, { col: 4, value: grandActual }, { col: 5, value: grandActual - grandTarget }
    ])
  }

  // ── 3. PRODUCTION BUDGET ───────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('PRODUCTION BUDGET')
    ws.columns = [{ width: 9 }, { width: 36 }, { width: 7 }, { width: 7 }, { width: 14 }, { width: 10 }, { width: 5 }, { width: 14 }]
    let r = 1
    setTitleRow(ws, r, 8,
      `PRODUCTION BUDGET — ${project.title || 'PRODUCTION'}`,
      `Total Budget: ${cur}${project.totalBudget.toLocaleString()} | Currency: ${cur}`)
    r += 3

    setColHdr(ws, r, 1, 'SCH NO.', 'center')
    setColHdr(ws, r, 2, 'DETAIL / DESCRIPTION', 'left')
    setColHdr(ws, r, 3, 'NO.', 'center')
    setColHdr(ws, r, 4, 'QTY', 'center')
    setColHdr(ws, r, 5, `RATE (${cur})`)
    setColHdr(ws, r, 6, 'UNIT', 'center')
    setColHdr(ws, r, 7, 'I/E', 'center')
    setColHdr(ws, r, 8, `TOTAL (${cur})`)
    ws.getRow(r).height = 18; r++

    for (const dept of DEPARTMENTS) {
      const items = lineItems[dept.code] || []
      const target = getDeptTarget(dept.code, state)
      setSectionHdr(ws, r, 8, `${dept.code}. ${dept.name.toUpperCase()}  |  Target: ${cur}${Math.round(target).toLocaleString()}`)
      r++

      if (items.length === 0) {
        ws.mergeCells(r, 1, r, 8)
        const cell = g(ws, r, 1)
        cell.value = 'No line items entered'
        cell.font = { name: FONT, italic: true, size: 9, color: { argb: C.muted } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        ws.getRow(r).height = 15; r++
      } else {
        const itemStartR = r
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const bg = i % 2 === 0 ? C.white : C.offWhite
          setData(ws, r, 1, item.schedNo, { align: 'center', color: C.muted, size: 9, bg })
          setData(ws, r, 2, item.detail, { bg })
          const no = g(ws, r, 3); no.value = item.no ?? 1; no.numFmt = '#,##0'; no.border = bAll()
          no.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          no.alignment = { horizontal: 'right', vertical: 'middle' }; no.font = { name: FONT, size: 10 }
          const qty = g(ws, r, 4); qty.value = item.qty; qty.numFmt = '#,##0'; qty.border = bAll()
          qty.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          qty.alignment = { horizontal: 'right', vertical: 'middle' }; qty.font = { name: FONT, size: 10 }
          const rate = g(ws, r, 5); rate.value = item.rate; rate.numFmt = NUM; rate.border = bAll()
          rate.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          rate.alignment = { horizontal: 'right', vertical: 'middle' }
          rate.font = { name: FONT, size: 10, color: { argb: C.blue } }
          setData(ws, r, 6, item.unit, { align: 'center', color: C.muted, size: 9, bg })
          setData(ws, r, 7, item.ie, { align: 'center', bold: true, bg,
            color: item.ie === 'I' ? C.blue : C.green })
          const tot = g(ws, r, 8); tot.value = { formula: `C${r}*D${r}*E${r}` }; tot.numFmt = NUM; tot.border = bAll()
          tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          tot.alignment = { horizontal: 'right', vertical: 'middle' }; tot.font = { name: FONT, size: 10, bold: true }
          ws.getRow(r).height = 17; r++
        }
        setSubtotal(ws, r, 8, `TOTAL — ${dept.name.toUpperCase()}`, [
          { col: 8, formula: `SUM(H${itemStartR}:H${r - 1})` }
        ])
        r++
      }
      r++
    }

    const grandActual = DEPARTMENTS.reduce((s, d) => s + getDeptActual(d.code, state), 0)
    const feeAmt = (feePct / 100) * project.totalBudget
    const subTotal = grandActual - getDeptActual('II', state)
    r++
    setSubtotal(ws, r, 8, `BELOW-THE-LINE SUB-TOTAL (excl. Contingency/Fee)`, [{ col: 8, value: subTotal }]); r++
    setSubtotal(ws, r, 8, `+ PRODUCTION FEE / CONTINGENCY (II) — ${feePct}%`, [{ col: 8, value: feeAmt }])
    for (let c = 1; c <= 8; c++) g(ws, r, c).font = { name: FONT, bold: true, size: 10, color: { argb: 'FFC49A2A' } }
    r++
    setGrandTotal(ws, r, 8, `GRAND TOTAL — ALL DEPARTMENTS (${cur})`, [{ col: 8, value: subTotal + feeAmt }])

    ws.views = [{ state: 'frozen', ySplit: 4 }]
  }

  // ── 4. PAYMENT SCHEDULE ────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('PAYMENT SCHEDULE')
    ws.columns = [{ width: 6 }, { width: 26 }, { width: 38 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 20 }]
    let r = 1
    setTitleRow(ws, r, 7, `PAYMENT SCHEDULE — ${project.title || 'PRODUCTION'}`)
    r += 3

    setColHdr(ws, r, 1, '#')
    setColHdr(ws, r, 2, 'INSTALLMENT', 'left')
    setColHdr(ws, r, 3, 'TRIGGER / MILESTONE', 'left')
    setColHdr(ws, r, 4, '% OF BUDGET')
    setColHdr(ws, r, 5, `AMOUNT (${cur})`)
    setColHdr(ws, r, 6, `RUNNING BALANCE (${cur})`)
    setColHdr(ws, r, 7, 'TIMING')
    ws.getRow(r).height = 18; r++

    let running = project.totalBudget
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i]
      const amt = (inst.percentage / 100) * project.totalBudget
      running -= amt
      const bg = i % 2 === 0 ? C.white : C.offWhite
      setData(ws, r, 1, i + 1, { bold: true, align: 'center', bg })
      setData(ws, r, 2, inst.label, { bold: true, bg })
      setData(ws, r, 3, inst.trigger, { color: C.muted, italic: true, bg })
      const p = g(ws, r, 4); p.value = inst.percentage / 100; p.numFmt = '0.0%'; p.border = bAll()
      p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      p.alignment = { horizontal: 'right', vertical: 'middle' }; p.font = { name: FONT, size: 10 }
      const a = g(ws, r, 5); a.value = amt; a.numFmt = NUM; a.border = bAll()
      a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      a.alignment = { horizontal: 'right', vertical: 'middle' }
      a.font = { name: FONT, size: 10, bold: true, color: { argb: C.green } }
      const b = g(ws, r, 6); b.value = running; b.numFmt = NUM; b.border = bAll()
      b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      b.alignment = { horizontal: 'right', vertical: 'middle' }
      b.font = { name: FONT, size: 10, color: { argb: running < 0 ? C.red : C.text } }
      setData(ws, r, 7, `Month ${inst.month} — ${getMonthLabel(inst.month, timeline, project.startDate)}`, { color: C.muted, bg })
      ws.getRow(r).height = 17; r++
    }
    setGrandTotal(ws, r, 7, 'TOTAL BUDGET', [
      { col: 4, value: installments.reduce((s, i) => s + i.percentage, 0) / 100 },
      { col: 5, value: project.totalBudget },
    ])
    g(ws, r, 4).numFmt = '0.0%'
  }

  // ── 5. SALARY FORECAST ─────────────────────────────────────────────────────
  {
    const endCol = 2 + totalMonths + 1
    const ws = wb.addWorksheet('SALARY FORECAST')
    const colWidths: Partial<ExcelJS.Column>[] = [{ width: 9 }, { width: 30 }]
    months.forEach(() => colWidths.push({ width: 13 }))
    colWidths.push({ width: 15 })
    ws.columns = colWidths

    let r = 1
    setTitleRow(ws, r, endCol,
      `SALARY FORECAST — ${project.title || 'PRODUCTION'}`,
      `${salaryRoles.length} roles · ${totalMonths} months`)
    r += 3

    setColHdr(ws, r, 1, '#', 'center')
    setColHdr(ws, r, 2, 'ROLE / LINE ITEM', 'left')
    months.forEach((m, i) => {
      setColHdr(ws, r, 3 + i, `${getMonthLabel(m, timeline, project.startDate)}\n${getMonthPhase(m, timeline)}`)
    })
    setColHdr(ws, r, 3 + totalMonths, `TOTAL (${cur})`)
    ws.getRow(r).height = 30; r++

    const deptGroups = DEPARTMENTS
      .map(d => ({ dept: d, roles: salaryRoles.filter(role => role.deptCode === d.code) }))
      .filter(x => x.roles.length > 0)

    for (const { dept, roles } of deptGroups) {
      setSectionHdr(ws, r, endCol, `${dept.code}. ${dept.name.toUpperCase()}`); r++
      const deptStartR = r
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i]
        const bg = i % 2 === 0 ? C.white : C.offWhite
        setData(ws, r, 1, role.schedNo, { align: 'center', color: C.muted, size: 9, bg })
        setData(ws, r, 2, role.role, { bg })
        let rowTotal = 0
        months.forEach((m, mi) => {
          const val = role.monthlyAmounts[m] || 0; rowTotal += val
          const c = g(ws, r, 3 + mi)
          c.value = val > 0 ? val : null
          c.numFmt = NUM; c.border = bAll()
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          c.alignment = { horizontal: 'right', vertical: 'middle' }
          c.font = { name: FONT, size: 9, color: { argb: val > 0 ? C.text : C.muted } }
        })
        const tot = g(ws, r, 3 + totalMonths); tot.value = rowTotal; tot.numFmt = NUM; tot.border = bAll()
        tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        tot.alignment = { horizontal: 'right', vertical: 'middle' }
        tot.font = { name: FONT, size: 10, bold: true, color: { argb: C.green } }
        ws.getRow(r).height = 17; r++
      }
      const deptMthTotals = months.map(m => roles.reduce((s, rl) => s + (rl.monthlyAmounts[m] || 0), 0))
      setSubtotal(ws, r, endCol, `SUBTOTAL — ${dept.name.toUpperCase()}`, [
        ...deptMthTotals.map((v, i) => ({ col: 3 + i, value: v })),
        { col: 3 + totalMonths, value: deptMthTotals.reduce((s, v) => s + v, 0) },
      ])
      r += 2
    }

    const mthTotals = months.map(m => salaryRoles.reduce((s, rl) => s + (rl.monthlyAmounts[m] || 0), 0))
    setGrandTotal(ws, r, endCol, 'TOTAL SALARY SPEND', [
      ...mthTotals.map((v, i) => ({ col: 3 + i, value: v })),
      { col: 3 + totalMonths, value: mthTotals.reduce((s, v) => s + v, 0) },
    ])
    r++
    let cum = 0
    g(ws, r, 1).value = 'CUMULATIVE'; ws.mergeCells(r, 1, r, 2)
    g(ws, r, 1).font = { name: FONT, bold: true, size: 9, color: { argb: C.blue } }
    mthTotals.forEach((v, i) => {
      cum += v
      const c = g(ws, r, 3 + i); c.value = cum; c.numFmt = NUM; c.border = bAll()
      c.alignment = { horizontal: 'right', vertical: 'middle' }
      c.font = { name: FONT, size: 9, color: { argb: C.blue } }
    })
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }]
  }

  // ── 6. PRODUCTION FORECAST — BC-style cashflow matrix ─────────────────────
  {
    const endCol = 1 + totalMonths + 1  // col1=Item, cols 2..n+1=months, last=Total
    const ws = wb.addWorksheet('PRODUCTION FORECAST')
    const colWidths: Partial<ExcelJS.Column>[] = [{ width: 34 }]
    months.forEach(() => colWidths.push({ width: 13 }))
    colWidths.push({ width: 15 })
    ws.columns = colWidths

    let r = 1
    setTitleRow(ws, r, endCol,
      `PRODUCTION FORECAST — ${project.title || 'PRODUCTION'}`,
      'Cashflow matrix: Receipts vs Payments by month')
    r += 3

    // Phase banner row
    {
      const phases = ['DEV', 'PRE-PROD', 'SHOOT', 'POST']
      // Column 1 = item label - leave header empty
      const itemHdr = g(ws, r, 1)
      itemHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      let phStart = 2
      for (const ph of phases) {
        const phMonths = months.filter(m => getMonthPhase(m, timeline) === ph)
        if (phMonths.length === 0) continue
        const phEnd = phStart + phMonths.length - 1
        if (phEnd >= phStart) ws.mergeCells(r, phStart, r, phEnd)
        const c = g(ws, r, phStart)
        c.value = ph
        c.font = { name: FONT, bold: true, size: 9, color: { argb: C.white } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PHASE_COLORS[ph] ?? C.navy } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        phStart = phEnd + 1
      }
      // Total column header
      const totHdr = g(ws, r, endCol)
      totHdr.value = 'TOTAL'
      totHdr.font = { name: FONT, bold: true, size: 9, color: { argb: C.white } }
      totHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      totHdr.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(r).height = 16; r++
    }

    // Month header row
    setColHdr(ws, r, 1, 'ITEM', 'left')
    months.forEach((m, i) => {
      setColHdr(ws, r, 2 + i, getMonthLabel(m, timeline, project.startDate))
    })
    setColHdr(ws, r, endCol, `TOTAL (${cur})`)
    ws.getRow(r).height = 22; r++

    // ─── RECEIPTS ─────────────────────────────────────────────────────────
    setSectionHdr(ws, r, endCol, 'RECEIPTS / INCOME', 'FFD6EDE0', C.rcptHdr); r++

    const totalReceiptsPerMonth = months.map(m =>
      installments.filter(i => i.month === m).reduce((sum, i) => sum + (i.percentage / 100) * project.totalBudget, 0)
    )

    for (const inst of installments) {
      const amounts = months.map(m => m === inst.month ? (inst.percentage / 100) * project.totalBudget : 0)
      const instTotal = (inst.percentage / 100) * project.totalBudget
      const lc = g(ws, r, 1)
      lc.value = `${inst.label}\n${inst.percentage}% — ${inst.trigger}`
      lc.font = { name: FONT, size: 9, color: { argb: C.text } }
      lc.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.greenBg } }
      lc.border = bAll()
      ws.getRow(r).height = 26

      amounts.forEach((v, i) => {
        const c = g(ws, r, 2 + i)
        c.value = v > 0 ? v : null; c.numFmt = NUM; c.border = bAll()
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v > 0 ? C.greenBg : C.white } }
        c.alignment = { horizontal: 'right', vertical: 'middle' }
        c.font = { name: FONT, size: 9, bold: v > 0, color: { argb: v > 0 ? C.green : C.muted } }
      })
      const tc = g(ws, r, endCol); tc.value = instTotal; tc.numFmt = NUM; tc.border = bAll()
      tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.greenBg } }
      tc.alignment = { horizontal: 'right', vertical: 'middle' }
      tc.font = { name: FONT, size: 9, bold: true, color: { argb: C.green } }
      r++
    }

    // TOTAL RECEIPTS
    setSubtotal(ws, r, endCol, 'TOTAL RECEIPTS', [
      ...totalReceiptsPerMonth.map((v, i) => ({ col: 2 + i, value: v })),
      { col: endCol, value: totalReceiptsPerMonth.reduce((s, v) => s + v, 0) },
    ])
    for (let c = 1; c <= endCol; c++) {
      const cell = g(ws, r, c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8DEC8' } }
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.rcptHdr } }
    }
    r += 2

    // ─── PAYMENTS ─────────────────────────────────────────────────────────
    setSectionHdr(ws, r, endCol, 'PAYMENTS / EXPENDITURE', 'FFF8E4E0', C.pmtHdr); r++

    const totalPaymentsPerMonth = new Array(totalMonths).fill(0)
    const deptRows: { code: string; name: string; monthly: number[]; total: number }[] = []

    for (const dept of DEPARTMENTS) {
      const code = dept.code as DeptCode
      const actual = getDeptActual(code, state)
      if (actual <= 0) continue
      const deptSalaryRoles = salaryRoles.filter(rl => rl.deptCode === code)
      const salaryByMonth = months.map(m => deptSalaryRoles.reduce((sum, rl) => sum + (rl.monthlyAmounts[m] || 0), 0))
      const totalSalary = salaryByMonth.reduce((s, v) => s + v, 0)
      const nonSalary = Math.max(0, actual - totalSalary)
      const activePhases = DEPT_PHASES[code] ?? ['DEV', 'PRE-PROD', 'SHOOT', 'POST']
      const activeMonths = months.filter(m => activePhases.includes(getMonthPhase(m, timeline)))
      const nonSalaryPerMonth = activeMonths.length > 0 ? nonSalary / activeMonths.length : 0
      const monthly = months.map((m, i) => {
        const ok = forecastOverrides[`${code}_${m}`]
        if (ok !== undefined) return ok
        return Math.round(salaryByMonth[i] + (activeMonths.includes(m) ? nonSalaryPerMonth : 0))
      })
      const rowTotal = monthly.reduce((s, v) => s + v, 0)
      monthly.forEach((v, i) => { totalPaymentsPerMonth[i] += v })
      deptRows.push({ code, name: dept.name, monthly, total: rowTotal })
    }

    for (let di = 0; di < deptRows.length; di++) {
      const dept = deptRows[di]
      const bg = di % 2 === 0 ? C.white : C.offWhite
      const lc = g(ws, r, 1)
      lc.value = `${dept.code}. ${dept.name}`
      lc.font = { name: FONT, size: 9, color: { argb: C.text } }
      lc.alignment = { horizontal: 'left', vertical: 'middle' }
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      lc.border = bAll()
      ws.getRow(r).height = 17
      dept.monthly.forEach((v, i) => {
        const c = g(ws, r, 2 + i); c.value = v > 0 ? v : null; c.numFmt = NUM; c.border = bAll()
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        c.alignment = { horizontal: 'right', vertical: 'middle' }
        c.font = { name: FONT, size: 9, color: { argb: v > 0 ? C.text : C.muted } }
      })
      const tc = g(ws, r, endCol); tc.value = dept.total; tc.numFmt = NUM; tc.border = bAll()
      tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      tc.alignment = { horizontal: 'right', vertical: 'middle' }
      tc.font = { name: FONT, size: 10, bold: true }
      r++
    }

    // TOTAL PAYMENTS
    setSubtotal(ws, r, endCol, 'TOTAL PAYMENTS', [
      ...totalPaymentsPerMonth.map((v, i) => ({ col: 2 + i, value: v })),
      { col: endCol, value: totalPaymentsPerMonth.reduce((s, v) => s + v, 0) },
    ])
    for (let c = 1; c <= endCol; c++) {
      const cell = g(ws, r, c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5C8C0' } }
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.pmtHdr } }
    }
    r += 2

    // ─── CASHFLOW ROWS ────────────────────────────────────────────────────
    const netPerMonth = months.map((_, i) => totalReceiptsPerMonth[i] - totalPaymentsPerMonth[i])
    const openingBalance: number[] = []
    const closingBalance: number[] = []
    months.forEach((_, i) => {
      const opening = i === 0 ? 0 : closingBalance[i - 1]
      openingBalance.push(opening)
      closingBalance.push(opening + netPerMonth[i])
    })

    // NET MONTHLY CASHFLOW
    setSubtotal(ws, r, endCol, 'NET MONTHLY CASHFLOW', netPerMonth.map((v, i) => ({ col: 2 + i, value: v })))
    for (let ci = 0; ci < netPerMonth.length; ci++) {
      const c = g(ws, r, 2 + ci)
      c.font = { name: FONT, bold: true, size: 10, color: { argb: netPerMonth[ci] >= 0 ? C.green : C.red } }
    }
    r++

    // OPENING BALANCE
    for (let c = 1; c <= endCol; c++) {
      const cell = g(ws, r, c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.offWhite } }
      cell.border = bAll(); cell.font = { name: FONT, size: 9, color: { argb: C.muted } }
    }
    g(ws, r, 1).value = 'OPENING BALANCE'
    openingBalance.forEach((v, i) => {
      const c = g(ws, r, 2 + i); c.value = v; c.numFmt = NUM
      c.alignment = { horizontal: 'right', vertical: 'middle' }
    })
    ws.getRow(r).height = 17; r++

    // CLOSING BALANCE
    setGrandTotal(ws, r, endCol, 'CLOSING BALANCE',
      closingBalance.map((v, i) => ({ col: 2 + i, value: v }))
    )
    for (let ci = 0; ci < closingBalance.length; ci++) {
      const c = g(ws, r, 2 + ci)
      c.font = { name: FONT, bold: true, size: 11, color: { argb: closingBalance[ci] >= 0 ? C.green : C.red } }
      if (closingBalance[ci] < 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.redBg } }
    }

    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 6 }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  return buffer
}

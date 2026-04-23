// Budget Parser — reads an Excel workbook buffer and extracts production budget data.
// Uses ExcelJS (already a project dependency).

import ExcelJS from 'exceljs'
import { DEPARTMENTS, DeptCode, LineItem } from '../store/budgetStore'

export interface ParsedBudget {
  // Project details
  title: string | null
  company: string | null
  totalBudget: number | null
  currency: string | null
  shootDays: number | null
  startDate: string | null

  // Assumptions
  productionFeePercent: number | null
  contingencyPercent: number | null
  vatRate: number | null
  whtRate: number | null

  // Timeline (months)
  developmentMonths: number | null
  preProdMonths: number | null
  shootMonths: number | null
  postMonths: number | null

  // Departments
  deptAllocations: Partial<Record<DeptCode, number>>
  lineItems: Partial<Record<DeptCode, LineItem[]>>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in (v as object)) {
    return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('')
  }
  if (typeof v === 'object' && 'result' in (v as object)) {
    return String((v as ExcelJS.CellFormulaValue).result ?? '')
  }
  return String(v)
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v !== null && 'result' in (v as object)) {
    const r = (v as ExcelJS.CellFormulaValue).result
    if (typeof r === 'number') return r
  }
  const parsed = parseFloat(cellText(cell))
  return isNaN(parsed) ? null : parsed
}

function lc(s: string) { return s.toLowerCase() }

function matchesDept(text: string): DeptCode | null {
  const t = lc(text)
  for (const dept of DEPARTMENTS) {
    if (t.includes(lc(dept.name))) return dept.code
    // Short name fragments
    if (dept.code === 'G' && (t.includes('camera') || t.includes('cam dept'))) return 'G'
    if (dept.code === 'H' && t.includes('sound')) return 'H'
    if (dept.code === 'I' && t.includes('light')) return 'I'
    if (dept.code === 'J' && t.includes('art dept')) return 'J'
    if (dept.code === 'E' && (t.includes('cast') || t.includes('talent'))) return 'E'
    if (dept.code === 'FF' && (t.includes('post') || t.includes('edit') || t.includes('colour') || t.includes('color') || t.includes('grade') || t.includes('sound mix') || t.includes('vfx') || t.includes('online') || t.includes('delivery'))) return 'FF'
    if (dept.code === 'II' && (t.includes('contingency') || t.includes('production fee'))) return 'II'
    if (dept.code === 'GG' && t.includes('overhead')) return 'GG'
    if (dept.code === 'EE' && t.includes('music')) return 'EE'
    if (dept.code === 'S' && t.includes('travel')) return 'S'
    if (dept.code === 'T' && (t.includes('accommodation') || t.includes('meals') || t.includes('hotel'))) return 'T'
    if (dept.code === 'Q' && t.includes('location')) return 'Q'
    if (dept.code === 'R' && (t.includes('vehicle') || t.includes('transport'))) return 'R'
    if (dept.code === 'M' && t.includes('wardrobe')) return 'M'
    if (dept.code === 'N' && (t.includes('makeup') || t.includes('make-up') || t.includes('hair') || t.includes('sfx'))) return 'N'
    if (dept.code === 'HH' && t.includes('insurance')) return 'HH'
  }
  return null
}

// Detect currency symbol or code in a string
function detectCurrency(text: string): string | null {
  if (text.includes('₦') || lc(text).includes('ngn')) return 'NGN'
  if (text.includes('$')) return 'USD'
  if (text.includes('£')) return 'GBP'
  if (text.includes('€')) return 'EUR'
  return null
}

// Infer a percentage from a value and its base (contingency amount / subtotal)
function inferPercent(amount: number, base: number): number | null {
  if (base <= 0 || amount <= 0) return null
  const pct = (amount / base) * 100
  // Sanity check — production percentages are typically 0.5–30%
  if (pct < 0.1 || pct > 50) return null
  return Math.round(pct * 100) / 100
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parseBudgetBuffer(buffer: ArrayBuffer): Promise<ParsedBudget> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const result: ParsedBudget = {
    title: null, company: null, totalBudget: null, currency: null,
    shootDays: null, startDate: null,
    productionFeePercent: null, contingencyPercent: null, vatRate: null, whtRate: null,
    developmentMonths: null, preProdMonths: null, shootMonths: null, postMonths: null,
    deptAllocations: {}, lineItems: {},
  }

  let subtotalForInference: number | null = null
  let contingencyAmount: number | null = null
  let productionFeeAmount: number | null = null

  for (const ws of wb.worksheets) {
    ws.eachRow((row, rowNum) => {
      const cells = row.values as ExcelJS.CellValue[]
      // cells[0] is undefined (1-based), so we iterate from 1
      const texts = cells.slice(1).map(c => {
        if (c === null || c === undefined) return ''
        if (typeof c === 'object' && 'richText' in (c as object)) {
          return (c as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('')
        }
        if (typeof c === 'object' && 'result' in (c as object)) {
          return String((c as ExcelJS.CellFormulaValue).result ?? '')
        }
        return String(c)
      })
      const nums = cells.slice(1).map(c => {
        if (typeof c === 'number') return c
        if (typeof c === 'object' && c !== null && 'result' in (c as object)) {
          const r = (c as ExcelJS.CellFormulaValue).result
          if (typeof r === 'number') return r
        }
        return null
      })

      for (let i = 0; i < texts.length; i++) {
        const t = texts[i]
        const tl = lc(t)
        const firstNum = nums.find(n => n !== null) ?? null
        const adjacentNum = nums[i + 1] ?? nums[i] ?? null

        // ── Currency detection ────────────────────────────────────────────
        if (!result.currency) {
          const cur = detectCurrency(t)
          if (cur) result.currency = cur
        }

        // ── Project title ─────────────────────────────────────────────────
        if (!result.title && (tl.includes('production title') || tl.includes('project title') || tl.includes('film title') || tl.includes('show title'))) {
          const next = texts[i + 1] ?? texts[i + 2] ?? null
          if (next && next.trim() && next.trim().length < 120) result.title = next.trim()
        }

        // ── Company ───────────────────────────────────────────────────────
        if (!result.company && (tl.includes('production company') || tl.includes('company name') || tl.includes('prod. company'))) {
          const next = texts[i + 1] ?? texts[i + 2] ?? null
          if (next && next.trim() && next.trim().length < 120) result.company = next.trim()
        }

        // ── Total budget ──────────────────────────────────────────────────
        if (!result.totalBudget && (tl.includes('total budget') || tl.includes('grand total') || tl.includes('total production'))) {
          for (let j = i + 1; j < Math.min(i + 6, nums.length); j++) {
            if (nums[j] && (nums[j] as number) > 1000) { result.totalBudget = nums[j] as number; break }
          }
          if (!result.totalBudget && firstNum && firstNum > 1000) result.totalBudget = firstNum
        }

        // ── Shoot days ────────────────────────────────────────────────────
        if (!result.shootDays && (tl.includes('shoot day') || tl.includes('shooting day') || tl.includes('camera day') || tl.includes('principal photography'))) {
          for (let j = i; j < Math.min(i + 5, nums.length); j++) {
            if (nums[j] && (nums[j] as number) >= 1 && (nums[j] as number) <= 365) {
              result.shootDays = nums[j] as number; break
            }
          }
        }

        // ── Production fee ────────────────────────────────────────────────
        if (tl.includes('production fee') || tl.includes('producer fee') || tl.includes('management fee')) {
          // Check if a % sign is in the row
          const pctCell = texts.find(tx => tx.includes('%'))
          if (pctCell) {
            const pctVal = parseFloat(pctCell.replace('%', ''))
            if (!isNaN(pctVal) && pctVal > 0 && pctVal <= 30) result.productionFeePercent = pctVal
          }
          // Store amount for later inference
          for (let j = i; j < Math.min(i + 6, nums.length); j++) {
            if (nums[j] && (nums[j] as number) > 0) { productionFeeAmount = nums[j] as number; break }
          }
        }

        // ── Contingency ───────────────────────────────────────────────────
        if (tl.includes('contingency')) {
          const pctCell = texts.find(tx => tx.includes('%'))
          if (pctCell) {
            const pctVal = parseFloat(pctCell.replace('%', ''))
            if (!isNaN(pctVal) && pctVal > 0 && pctVal <= 30) result.contingencyPercent = pctVal
          }
          for (let j = i; j < Math.min(i + 6, nums.length); j++) {
            if (nums[j] && (nums[j] as number) > 0) { contingencyAmount = nums[j] as number; break }
          }
        }

        // ── VAT ───────────────────────────────────────────────────────────
        if (!result.vatRate && (tl.includes('vat') || tl.includes('value added tax'))) {
          const pctCell = texts.find(tx => tx.includes('%'))
          if (pctCell) {
            const v = parseFloat(pctCell.replace('%', ''))
            if (!isNaN(v) && v > 0 && v <= 30) result.vatRate = v
          }
          if (!result.vatRate && adjacentNum && adjacentNum > 0 && adjacentNum <= 30) result.vatRate = adjacentNum
        }

        // ── WHT ───────────────────────────────────────────────────────────
        if (!result.whtRate && (tl.includes('wht') || tl.includes('withholding') || tl.includes('withholding tax'))) {
          const pctCell = texts.find(tx => tx.includes('%'))
          if (pctCell) {
            const v = parseFloat(pctCell.replace('%', ''))
            if (!isNaN(v) && v > 0 && v <= 30) result.whtRate = v
          }
          if (!result.whtRate && adjacentNum && adjacentNum > 0 && adjacentNum <= 30) result.whtRate = adjacentNum
        }

        // ── Subtotal (for inference) ───────────────────────────────────────
        if ((tl.includes('subtotal') || tl.includes('sub total') || tl.includes('below the line') || tl.includes('total below')) && !subtotalForInference) {
          for (let j = i; j < Math.min(i + 6, nums.length); j++) {
            if (nums[j] && (nums[j] as number) > 10000) { subtotalForInference = nums[j] as number; break }
          }
        }

        // ── Timeline signals ──────────────────────────────────────────────
        // Pre-production
        if (!result.preProdMonths && (tl.includes('pre-prod') || tl.includes('pre production') || tl.includes('pre-production') || tl.includes('prep'))) {
          const weeks = nums.find(n => n !== null && (n as number) >= 1 && (n as number) <= 52)
          if (weeks) result.preProdMonths = Math.round((weeks as number) / 4.33 * 10) / 10
        }
        // Post production
        if (!result.postMonths && (tl.includes('post production') || tl.includes('post-production') || tl.includes('edit') || tl.includes('grade') || tl.includes('mix') || tl.includes('delivery'))) {
          const weeks = nums.find(n => n !== null && (n as number) >= 1 && (n as number) <= 52)
          if (weeks) result.postMonths = Math.round((weeks as number) / 4.33 * 10) / 10
        }
        // Development
        if (!result.developmentMonths && (tl.includes('development') || tl.includes('dev phase') || tl.includes('script'))) {
          const weeks = nums.find(n => n !== null && (n as number) >= 1 && (n as number) <= 52)
          if (weeks) result.developmentMonths = Math.round((weeks as number) / 4.33 * 10) / 10
        }

        // ── Department allocations ─────────────────────────────────────────
        const deptCode = matchesDept(t)
        if (deptCode) {
          // Find largest number in this row — likely the dept total
          const deptTotal = nums.reduce((best: number | null, n) => {
            if (n === null) return best
            if (best === null || (n as number) > best) return n as number
            return best
          }, null)
          if (deptTotal && deptTotal > 0 && !(result.deptAllocations[deptCode])) {
            result.deptAllocations[deptCode] = deptTotal
          }

          // ── Line items within the dept ───────────────────────────────────
          // Look at next few rows after the dept header
          const items = result.lineItems[deptCode] ?? []
          const detailText = texts.filter(tx => tx.trim() && tx !== t).join(' ').trim()
          if (detailText && nums.some(n => n !== null && (n as number) > 0)) {
            const rate = nums.find(n => n !== null && (n as number) > 0) ?? 0
            items.push({
              id: `${deptCode}-${rowNum}-${i}`,
              schedNo: deptCode,
              detail: detailText.slice(0, 80),
              qty: 1,
              rate: rate as number,
              unit: 'item',
              ie: 'I',
            })
            result.lineItems[deptCode] = items
          }
        }

        // ── Shoot months from shoot days ──────────────────────────────────
        if (!result.shootMonths && result.shootDays) {
          result.shootMonths = Math.round((result.shootDays / 5) / 4.33 * 10) / 10
        }
      }
    })
  }

  // ── Infer percentages from amounts if still missing ───────────────────────
  const base = result.totalBudget ?? subtotalForInference
  if (base && base > 0) {
    if (!result.contingencyPercent && contingencyAmount) {
      result.contingencyPercent = inferPercent(contingencyAmount, base)
    }
    if (!result.productionFeePercent && productionFeeAmount) {
      result.productionFeePercent = inferPercent(productionFeeAmount, base)
    }
  }

  return result
}

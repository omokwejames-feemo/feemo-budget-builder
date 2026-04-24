// Single source of truth for all keyword dictionaries used in parsing and classification.
// No circular imports — only imports from budgetStore.

import type { DeptCode } from '../store/budgetStore'

// ─── Sheet type (defined here to avoid circular dependency with budgetParser) ──

export type SheetType =
  | 'budget-summary'
  | 'salary-forecast'
  | 'production-forecast'
  | 'production-timeline'
  | 'payment-schedule'
  | 'assumptions'
  | 'dept-allocations'
  | 'unknown'

// ─── Budget document type (workbook-level classification) ──────────────────────

export type BudgetDocumentType =
  | 'full-production-budget'  // Has detailed line items with qty/rate/unit
  | 'production-forecast'     // Primarily a cashflow / monthly forecast
  | 'salary-forecast'         // Primarily a payroll / crew budget
  | 'dept-summary'            // High-level dept totals only, no line items
  | 'mixed'                   // Multiple types across sheets
  | 'unknown'

export const BUDGET_DOC_TYPE_LABELS: Record<BudgetDocumentType, string> = {
  'full-production-budget': 'Full Production Budget',
  'production-forecast':    'Production Forecast / Cashflow',
  'salary-forecast':        'Salary / Crew Budget',
  'dept-summary':           'Departmental Summary',
  'mixed':                  'Mixed / Multi-Type Workbook',
  'unknown':                'Unknown',
}

// ─── Sheet keyword lists ──────────────────────────────────────────────────────

export const SHEET_KEYWORDS: Record<SheetType, string[]> = {
  'budget-summary': [
    'budget', 'production budget', 'line item', 'sch no', 'sched no', 'schedule no',
    'detail', 'allocated', 'qty', 'unit', 'department', 'code', 'below the line',
    'grand total', 'total budget', 'ie', 'i e', 'above the line',
  ],
  'salary-forecast': [
    'salary', 'payroll', 'crew', 'cast', 'personnel', 'role', 'position', 'name',
    'daily rate', 'weekly rate', 'flat fee', 'gross', 'net', 'paye', 'tax',
    'monthly salary', 'days', 'weeks', 'shoot days', 'fee',
  ],
  'production-forecast': [
    'forecast', 'cashflow', 'cash flow', 'monthly', 'drawdown', 'period',
    'cumulative', 'running total', 'projection', 'installment', 'disbursement',
    'month 1', 'month 2', 'month 3',
  ],
  'production-timeline': [
    'timeline', 'gantt', 'phase', 'milestone', 'start date', 'end date',
    'duration', 'weeks', 'pre-production', 'principal photography', 'post-production',
    'development', 'delivery', 'wrap', 'schedule',
  ],
  'payment-schedule': [
    'payment schedule', 'payee', 'amount payable', 'account number', 'bank',
    'wht', 'vat', 'net payable', 'invoice', 'prepared by', 'approved by',
    'ps-', 'payment no', 'beneficiary', 'gross payment',
  ],
  'assumptions': [
    'assumption', 'production fee', 'contingency', 'vat rate', 'wht rate',
    'currency', 'overhead', 'insurance', 'completion bond', 'exchange rate',
    'percentage', 'rate %', 'project details', 'total budget',
  ],
  'dept-allocations': [
    'department', 'allocation', 'breakdown', 'total per department', 'dept',
    'percentage', 'split', 'budget breakdown', 'dept %',
  ],
  'unknown': [],
}

// ─── Department keyword aliases ───────────────────────────────────────────────

export const DEPT_ALIASES: Partial<Record<DeptCode, string[]>> = {
  A:  ['research', 'development', 'r&d', 'r & d'],
  B:  ['script', 'writer', 'screenplay', 'writing'],
  C:  ['producer', 'production manager', 'prod manager', 'line producer'],
  D:  ['director', 'dop', 'director of photography'],
  E:  ['cast', 'talent', 'actor', 'actress', 'presenter', 'artiste'],
  F:  ['production staff', 'general crew', 'runner', 'coordinator'],
  G:  ['camera', 'cam dept', 'grip', 'focus puller'],
  H:  ['sound', 'audio', 'boom'],
  I:  ['lighting', 'light', 'electrical', 'gaffer', 'spark'],
  J:  ['art dept', 'art direction', 'set design', 'production design'],
  K:  ['set', 'set build', 'construction'],
  L:  ['props', 'properties'],
  M:  ['wardrobe', 'costume', 'stylist'],
  N:  ['makeup', 'make-up', 'hair', 'sfx makeup', 'mua'],
  O:  ['picture vehicle', 'featured vehicle'],
  P:  ['studio', 'facility', 'ob van', 'ob facility'],
  Q:  ['location', 'location fee', 'scout'],
  R:  ['vehicle', 'transport', 'logistics', 'driver'],
  S:  ['travel', 'flight', 'airfare', 'per diem travel'],
  T:  ['accommodation', 'hotel', 'meal', 'per diem', 'catering', 'feeding'],
  AA: ['stock', 'media', 'tape', 'card', 'raw stock'],
  DD: ['graphic', 'motion graphic', 'title', 'animation'],
  EE: ['music', 'composer', 'soundtrack', 'score'],
  FF: ['post', 'edit', 'colour', 'color', 'grade', 'mix', 'vfx', 'visual effect', 'online', 'delivery', 'post-production', 'post production'],
  GG: ['overhead', 'office', 'admin', 'overheads'],
  HH: ['insurance', 'bond', 'completion bond'],
  II: ['contingency', 'production fee', 'reserve', 'management fee'],
}

// ─── Budget column header keywords (for dynamic column detection) ─────────────

export const COL_HEADER_PATTERNS = {
  detail:  /detail|description|item|budget.?head|line.?item|particulars/,
  no:      /^no\.?$|^#$|^count$|^num(?:ber)?$|^nos?\.?$/,
  qty:     /\bqty\b|quantity|no\.?\s*of/,
  rate:    /\brate\b|\bprice\b|unit.?cost|cost.?per/,
  unit:    /\bunit\b|\btype\b|measure/,
  total:   /^total$|line.?total|amount|sub.?total/,
  schedNo: /sch\.?\s*no|sched|^code$|^ref/,
}

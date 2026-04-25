// Budget Upload Screen — Fix Batch 8 + 9
// Multi-sheet aware confirmation UI with budget type detection banner,
// population routing per type, and wizard trigger for sparse documents.

import { useState, useEffect } from 'react'
import {
  parseBudgetBuffer,
  ParsedWorkbook,
  ParsedConflict,
  SheetClassification,
  SheetType,
  Confidence,
  ScoredField,
  BudgetDocumentType,
  BUDGET_DOC_TYPE_LABELS,
} from '../utils/budgetParser'
import { useBudgetStore, DEPARTMENTS, DeptCode } from '../store/budgetStore'
import BudgetWizard, { WizardExtras } from '../components/BudgetWizard'
import { WizardErrorBoundary } from '../components/ErrorBoundary'

interface Props { onDone: () => void; onCancel: () => void }

// ─── Tiny shared style helpers ────────────────────────────────────────────────

const S = {
  page:   { height: '100vh', overflow: 'auto', background: 'var(--bg)', padding: '32px 0' } as React.CSSProperties,
  wrap:   { maxWidth: 860, margin: '0 auto', padding: '0 32px' } as React.CSSProperties,
  h1:     { fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 } as React.CSSProperties,
  sub:    { fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 24 } as React.CSSProperties,
  sec:    { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' },
  grid2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' } as React.CSSProperties,
  row:    { display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16 } as React.CSSProperties,
  btnPrimary: { padding: '11px 28px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' } as React.CSSProperties,
  btnGhost:   { padding: '11px 20px', background: 'transparent', color: 'var(--text3)', fontWeight: 600, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' } as React.CSSProperties,
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function Badge({ conf }: { conf: Confidence }) {
  const map: Record<Confidence, { label: string; color: string; bg: string }> = {
    high:   { label: '✓ High',   color: 'var(--green)',  bg: 'rgba(80,200,80,0.12)' },
    medium: { label: '~ Medium', color: 'var(--accent)', bg: 'rgba(245,166,35,0.12)' },
    low:    { label: '? Low',    color: '#888',           bg: 'rgba(128,128,128,0.12)' },
  }
  const m = map[conf]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: m.color, background: m.bg, padding: '2px 7px', borderRadius: 4, marginLeft: 6 }}>
      {m.label}
    </span>
  )
}

// ─── Sheet type label ─────────────────────────────────────────────────────────

const TYPE_LABEL: Record<SheetType, string> = {
  'budget-summary':      'Budget Summary',
  'salary-forecast':     'Salary Forecast',
  'production-forecast': 'Production Forecast',
  'production-timeline': 'Production Timeline',
  'payment-schedule':    'Payment Schedule',
  'assumptions':         'Assumptions',
  'dept-allocations':    'Dept Allocations',
  'unknown':             'Unclassified',
}

const TYPE_COLOUR: Record<SheetType, string> = {
  'budget-summary':      '#4e9fff',
  'salary-forecast':     '#a87fff',
  'production-forecast': '#ff9f4e',
  'production-timeline': '#4effb3',
  'payment-schedule':    '#ff4e7a',
  'assumptions':         '#f5a623',
  'dept-allocations':    '#4effe0',
  'unknown':             '#555',
}

// ─── Editable field ───────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', scored, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; scored?: ScoredField<unknown> | null; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {scored && <Badge conf={scored.confidence} />}
        {scored && <span style={{ fontSize: 10, color: '#444', marginLeft: 4 }}>from "{scored.source}"</span>}
      </div>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        style={{ width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
    </div>
  )
}

// ─── Section nav ──────────────────────────────────────────────────────────────

type Section = 'summary' | 'project' | 'departments' | 'lineitems' | 'salary' | 'schedules' | 'conflicts'

function SectionNav({ active, onChange, counts }: {
  active: Section; onChange: (s: Section) => void
  counts: Partial<Record<Section, number>>
}) {
  const items: { id: Section; label: string }[] = [
    { id: 'summary',     label: 'Sheets' },
    { id: 'project',     label: 'Project & Assumptions' },
    { id: 'departments', label: 'Departments' },
    { id: 'lineitems',   label: 'Line Items' },
    { id: 'salary',      label: 'Salary' },
    { id: 'schedules',   label: 'Payments' },
    { id: 'conflicts',   label: 'Conflicts' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
      {items.map(item => {
        const count = counts[item.id]
        const isActive = active === item.id
        return (
          <button key={item.id} onClick={() => onChange(item.id)} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: isActive ? 'var(--accent)' : 'var(--bg2)',
            color: isActive ? '#000' : 'var(--text3)',
            border: isActive ? 'none' : '1px solid var(--border)',
          }}>
            {item.label}{count !== undefined && count > 0 ? ` (${count})` : ''}
          </button>
        )
      })}
    </div>
  )
}

// ─── Editable state ───────────────────────────────────────────────────────────

interface EditState {
  title: string; company: string; totalBudget: string; currency: string
  shootDays: string; startDate: string; productionFeePercent: string
  contingencyPercent: string; vatRate: string; whtRate: string
  developmentMonths: string; preProdMonths: string; shootMonths: string; postMonths: string
  deptPct: Partial<Record<DeptCode, string>>
}

function toEditState(pw: ParsedWorkbook): EditState {
  const sf = <T,>(f: ScoredField<T> | null) => (f ? String(f.value) : '')

  // Build dept percentages: prefer raw %, else convert absolute using totalBudget
  const totalBudget = pw.totalBudget?.value ?? 0
  const deptPct: Partial<Record<DeptCode, string>> = {}

  for (const dept of DEPARTMENTS) {
    const raw = pw.deptAllocationsRaw[dept.code]
    if (raw !== undefined) { deptPct[dept.code] = String(raw); continue }
    const abs = pw.deptAllocations[dept.code]
    if (abs && totalBudget > 0) {
      deptPct[dept.code] = ((abs.value / totalBudget) * 100).toFixed(2)
    }
  }

  return {
    title: sf(pw.title), company: sf(pw.company), totalBudget: sf(pw.totalBudget),
    currency: sf(pw.currency), shootDays: sf(pw.shootDays), startDate: sf(pw.startDate),
    productionFeePercent: sf(pw.productionFeePercent), contingencyPercent: sf(pw.contingencyPercent),
    vatRate: sf(pw.vatRate), whtRate: sf(pw.whtRate),
    developmentMonths: sf(pw.developmentMonths), preProdMonths: sf(pw.preProdMonths),
    shootMonths: sf(pw.shootMonths), postMonths: sf(pw.postMonths),
    deptPct,
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Salary role name matching ────────────────────────────────────────────────
// Fuzzy-match parsed role names against existing grid roles so we don't create
// duplicates when uploading into a project that already has salary rows.

const ROLE_ALIASES: Record<string, string[]> = {
  'director':          ['director', 'dir'],
  'dop':               ['dop', 'dp', 'director of photography', 'cinematographer'],
  'producer':          ['producer', 'exec producer', 'executive producer', 'line producer'],
  'editor':            ['editor', 'film editor', 'picture editor'],
  'sound':             ['sound', 'sound designer', 'sound mixer', 'boom operator'],
  'gaffer':            ['gaffer', 'chief electrician'],
  'art director':      ['art director', 'art dept head', 'production designer'],
  'makeup':            ['makeup', 'make-up', 'mua', 'hair and makeup'],
  'wardrobe':          ['wardrobe', 'costume designer', 'stylist'],
  'runner':            ['runner', 'production runner', 'pa', 'production assistant'],
}

function normRole(s: string) { return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() }

function roleNamesMatch(a: string, b: string): boolean {
  const na = normRole(a), nb = normRole(b)
  if (na === nb) return true
  for (const aliases of Object.values(ROLE_ALIASES)) {
    if (aliases.includes(na) && aliases.includes(nb)) return true
  }
  return false
}

function mergeSalaryRoles(
  parsed: import('../store/budgetStore').SalaryRole[],
  existing: import('../store/budgetStore').SalaryRole[],
): import('../store/budgetStore').SalaryRole[] {
  if (existing.length === 0) return parsed   // fresh project — just use parsed roles
  const result = [...existing]
  for (const p of parsed) {
    const idx = result.findIndex(e => roleNamesMatch(e.role, p.role) && e.deptCode === p.deptCode)
    if (idx >= 0) {
      // Update existing row's monthly amounts, keep everything else
      result[idx] = { ...result[idx], monthlyAmounts: { ...result[idx].monthlyAmounts, ...p.monthlyAmounts } }
    } else {
      result.push(p)  // no match — append
    }
  }
  return result
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Fallback sheet selector state ───────────────────────────────────────────

interface PendingFallback {
  needsSalary:   boolean
  needsForecast: boolean
  sheetNames:    string[]
  step:          'salary' | 'forecast'
}

// Sheet type options for the Page Declaration dialog (Stage 2)
const DECLARATION_OPTIONS = [
  { key: 'budget-summary',      label: 'Budget Summary',                    desc: 'Overview of all department totals' },
  { key: 'production-budget',   label: 'Production Budget',                 desc: 'Full line-item breakdown by department' },
  { key: 'salary-forecast',     label: 'Salary Forecast',                   desc: 'Crew and cast rates and schedules' },
  { key: 'production-forecast', label: 'Production Forecast / Cashflow',    desc: 'Week-by-week spend projection' },
  { key: 'payment-schedule',    label: 'Payment Schedule',                  desc: 'Individual payment entries' },
  { key: 'production-timeline', label: 'Timeline / Schedule',               desc: 'Shoot dates and milestones' },
  { key: 'assumptions',         label: 'Assumptions',                       desc: 'Project parameters, shoot days, rates' },
] as const

type DeclarationKey = typeof DECLARATION_OPTIONS[number]['key']

export default function BudgetUploadScreen({ onDone, onCancel }: Props) {
  const store = useBudgetStore()

  // ── Upload flow stage ──────────────────────────────────────────────────────
  const [uploadFlowStage, setUploadFlowStage] = useState<
    'file-select' | 'page-declaration' | 'parsing' | 'parse-error' | 'confirm'
  >('file-select')

  // Page declaration checklist
  const [declaredTypes, setDeclaredTypes] = useState<Set<DeclarationKey>>(new Set())
  // Parsed buffer held between stage 2 and stage 3
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)

  // Parse progress (stage 3)
  const [parseProgressLabel, setParseProgressLabel] = useState('Scanning file…')
  const [parseProgressPct, setParseProgressPct] = useState(0)
  const [parseTookTooLong, setParseTookTooLong] = useState(false)
  const [parseError, setParseError] = useState('')

  // Existing confirm-stage state
  const [pw, setPw] = useState<ParsedWorkbook | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [conflicts, setConflicts] = useState<ParsedConflict[]>([])
  const [section, setSection] = useState<Section>('summary')
  const [detectedType, setDetectedType] = useState<BudgetDocumentType>('unknown')
  const [typeOverride, setTypeOverride] = useState<BudgetDocumentType | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardExtras, setWizardExtras] = useState<WizardExtras | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false)
  const [pendingFallback, setPendingFallback] = useState<PendingFallback | null>(null)
  const [fallbackSheet, setFallbackSheet] = useState('')
  const [fallbackParsing, setFallbackParsing] = useState(false)
  const [fallbackError, setFallbackError] = useState('')

  // Stage 1: file select on mount
  useEffect(() => { handleFileSelect() }, [])

  // Stage 1 — OS file dialog → buffer → show page declaration
  async function handleFileSelect() {
    if (!window.electronAPI) { setParseError('Electron API not available.'); setUploadFlowStage('parse-error'); return }
    const res = await window.electronAPI.openXlsxBudget()
    if (!res.success || !res.buffer) { onCancel(); return }
    if (res.filePath) setUploadedFileName(res.filePath.split('/').pop() ?? res.filePath)
    setFileBuffer(new Uint8Array(res.buffer).buffer)
    setUploadFlowStage('page-declaration')
  }

  // Stage 3 — parse the buffer with progress simulation
  async function handleScanFile() {
    if (!fileBuffer) return
    setUploadFlowStage('parsing')
    setParseTookTooLong(false)

    // Progress label sequence based on declared types
    const labels: string[] = [
      ...Array.from(declaredTypes).map(t => {
        const opt = DECLARATION_OPTIONS.find(o => o.key === t)
        return `Scanning ${opt?.label ?? t}…`
      }),
      'Reconciling data…',
      'Finalising…',
    ]
    let labelIdx = 0
    const labelInterval = setInterval(() => {
      labelIdx = Math.min(labelIdx + 1, labels.length - 1)
      setParseProgressLabel(labels[labelIdx])
      setParseProgressPct(Math.min(85, Math.round((labelIdx / labels.length) * 100)))
    }, 600)

    // Warn if taking > 10s
    const tooLongTimer = setTimeout(() => setParseTookTooLong(true), 10000)

    try {
      // File-size guard: for files > 500KB, defer parse to next tick so loading UI renders
      if (fileBuffer.byteLength > 500 * 1024) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      const result = await parseBudgetBuffer(fileBuffer)
      clearInterval(labelInterval)
      clearTimeout(tooLongTimer)
      setParseProgressPct(100)
      setParseProgressLabel('Done!')

      await new Promise(resolve => setTimeout(resolve, 300))

      setPw(result)
      setEdit(toEditState(result))
      setConflicts(result.conflicts.map(c => ({ ...c, chosenSource: null })))
      setDetectedType(result.documentType)
      if (result.conflicts.length > 0) setSection('conflicts')
      else setSection('summary')
      setUploadFlowStage('confirm')

      const isSparse = result.documentType === 'dept-summary' || result.matchStats.deptCoverage < 0.6
      if (isSparse) setShowWizard(true)
    } catch (err) {
      clearInterval(labelInterval)
      clearTimeout(tooLongTimer)
      setParseError(String(err))
      setUploadFlowStage('parse-error')
    }
  }

  // Legacy alias used by existing code below
  const stage = uploadFlowStage === 'confirm' ? 'confirm' : uploadFlowStage === 'parse-error' ? 'error' : 'parsing'

  function upEdit(key: keyof EditState, value: string) {
    setEdit(prev => prev ? { ...prev, [key]: value } : prev)
  }
  function upDeptPct(code: DeptCode, value: string) {
    setEdit(prev => prev ? { ...prev, deptPct: { ...prev.deptPct, [code]: value } } : prev)
  }
  function resolveConflict(field: string, sheet: string) {
    setConflicts(prev => prev.map(c => c.field === field ? { ...c, chosenSource: sheet } : c))
  }

  function handleWizardComplete(updatedEdit: EditState, extras: WizardExtras) {
    setEdit(updatedEdit)
    setWizardExtras(extras)
    setShowWizard(false)
  }

  function handleCommit() {
    if (!edit || !pw) return

    // Show overwrite warning first if the project already has data
    const hasExistingData = store.project.totalBudget > 0 ||
      DEPARTMENTS.some(d => (store.lineItems[d.code]?.length ?? 0) > 0)
    if (hasExistingData && !showOverwriteWarning) {
      setShowOverwriteWarning(true)
      return
    }
    setShowOverwriteWarning(false)

    doCommit()
  }

  function doCommit() {
    if (!edit || !pw) return
    const n  = (s: string) => { const v = parseFloat(s); return isNaN(v) ? 0 : v }
    const ns = (s: string) => { const v = parseFloat(s); return isNaN(v) ? undefined : v }
    const cur = edit.currency || store.project.currency || ''

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 1 — Raise the population flag so validation checks are suppressed while
    //          we write data. This prevents the "Budget Exceeded" dialog from firing
    //          before totalBudget and line items are both finalised.
    // ─────────────────────────────────────────────────────────────────────────────
    store.setIsPopulatingFromUpload(true)

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 2 — Assumptions first (totalBudget MUST be written before line items so
    //          that the budget-exceeded check compares against the right figure).
    // ─────────────────────────────────────────────────────────────────────────────
    store.setProject({
      title:               edit.title    || undefined,
      company:             edit.company  || undefined,
      totalBudget:         ns(edit.totalBudget),
      currency:            edit.currency || undefined,
      shootDays:           ns(edit.shootDays),
      startDate:           edit.startDate || undefined,
      productionFeePercent: ns(edit.productionFeePercent),
      // Wizard extras override parsed values if present
      ...(wizardExtras ? {
        format:          wizardExtras.format          || undefined,
        episodes:        wizardExtras.episodes         || undefined,
        episodeDuration: wizardExtras.episodeDuration  || undefined,
        location:        wizardExtras.location         || undefined,
        shootDays:       wizardExtras.shootDays        || undefined,
      } : {}),
    })

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 3 — Timeline
    // ─────────────────────────────────────────────────────────────────────────────
    store.setTimeline({
      developmentMonths: ns(edit.developmentMonths),
      preProdMonths:     ns(edit.preProdMonths),
      shootMonths:       ns(edit.shootMonths),
      postMonths:        ns(edit.postMonths),
    })

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 4 — Department allocations (contingency first, then all depts)
    // ─────────────────────────────────────────────────────────────────────────────
    if (edit.contingencyPercent) store.setDeptAllocation('II', n(edit.contingencyPercent))

    for (const dept of DEPARTMENTS) {
      const pctStr = edit.deptPct[dept.code]
      if (!pctStr) continue
      const pct = n(pctStr)
      if (pct > 0) store.setDeptAllocation(dept.code, pct)
    }

    // Apply any user-resolved conflict values
    for (const conflict of conflicts) {
      if (!conflict.chosenSource || !conflict.field.startsWith('dept_')) continue
      const code = conflict.field.replace('dept_', '') as DeptCode
      const chosen = conflict.sources.find(s => s.sheet === conflict.chosenSource)
      if (chosen && typeof chosen.value === 'number') {
        const tb = n(edit.totalBudget)
        if (tb > 0) store.setDeptAllocation(code, (chosen.value / tb) * 100)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 5 — Line items (now safe — totalBudget already written)
    // ─────────────────────────────────────────────────────────────────────────────
    for (const [code, items] of Object.entries(pw.lineItems)) {
      if (items && items.length > 0) store.setLineItems(code as DeptCode, items)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 6 — Salary roles (merge into existing grid instead of wholesale replace)
    // ─────────────────────────────────────────────────────────────────────────────
    if (pw.salaryRoles.length > 0) {
      store.setSalaryRoles(mergeSalaryRoles(pw.salaryRoles, store.salaryRoles))
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 7 — Forecast overrides (cashflow monthly figures)
    // ─────────────────────────────────────────────────────────────────────────────
    for (const row of pw.forecastRows) {
      if (!row.deptCode) continue
      for (const [month, value] of Object.entries(row.monthlyValues)) {
        if (value > 0) store.setForecastOverride(`${row.deptCode}_${month}`, value)
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 8 — Wizard installments
    // ─────────────────────────────────────────────────────────────────────────────
    if (wizardExtras && wizardExtras.installments.length > 0) {
      store.setInstallments(wizardExtras.installments.map((inst, i) => ({
        id: `wiz_${i}`,
        label: `Installment ${i + 1}`,
        percentage: inst.pct,
        trigger: '',
        month: inst.month,
      })))
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 9 — Payment schedules (as drafts)
    // ─────────────────────────────────────────────────────────────────────────────
    const vat = n(edit.vatRate)
    const wht = n(edit.whtRate)
    for (const ps of pw.paymentSchedules) {
      if (!ps.rows || ps.rows.length === 0) continue
      store.addPaymentSchedule({
        id:             ps.id ?? String(Date.now()),
        scheduleNumber: ps.scheduleNumber ?? 'PS-001',
        globalVatRate:  ps.globalVatRate || vat,
        globalWhtRate:  ps.globalWhtRate || wht,
        rows:           ps.rows,
        preparedBy:     ps.preparedBy ?? '',
        reviewedBy:     ps.reviewedBy ?? '',
        approvedBy:     ps.approvedBy ?? '',
        createdAt:      ps.createdAt ?? new Date().toISOString(),
        status:         'draft',
      })
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 10 — Clear the population flag now that all data is written
    // ─────────────────────────────────────────────────────────────────────────────
    store.setIsPopulatingFromUpload(false)

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 11 — Soft cross-check: compare line item sum vs stated totalBudget.
    //           >1% delta gets an informational note — NOT an error, NOT red.
    // ─────────────────────────────────────────────────────────────────────────────
    const lineItemTotal = Object.values(pw.lineItems)
      .reduce((s, items) => s + (items?.reduce((ss, item) => ss + item.qty * item.rate, 0) ?? 0), 0)
    const tb = n(edit.totalBudget)
    let crossCheckMessage: string | null = null
    if (tb > 0 && lineItemTotal > 0) {
      const diff = Math.abs(lineItemTotal - tb)
      if (diff / tb > 0.01) {
        const fmtN = (x: number) => `${cur}${x.toLocaleString('en', { maximumFractionDigits: 0 })}`
        crossCheckMessage =
          `Line item total ${fmtN(lineItemTotal)} differs from stated budget ${fmtN(tb)} ` +
          `by ${fmtN(diff)} (${((diff / tb) * 100).toFixed(1)}%). ` +
          `This may be due to rounding or an unallocated reserve. ` +
          `You can adjust in the budget grid or update the total in Assumptions.`
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 12 — Build and store the upload audit log (visible on Production Budget
    //           screen as a collapsible panel).
    // ─────────────────────────────────────────────────────────────────────────────
    const auditFields: import('../store/budgetStore').UploadAuditField[] = [
      { field: 'Total Budget',         value: edit.totalBudget ? `${cur}${Number(edit.totalBudget).toLocaleString()}` : '', populated: !!edit.totalBudget },
      { field: 'Currency',             value: edit.currency,        populated: !!edit.currency },
      { field: 'Production Title',     value: edit.title,           populated: !!edit.title },
      { field: 'Company',              value: edit.company,         populated: !!edit.company },
      { field: 'Shoot Days',           value: edit.shootDays,       populated: !!edit.shootDays },
      { field: 'Start Date',           value: edit.startDate,       populated: !!edit.startDate },
      { field: 'Production Fee %',     value: edit.productionFeePercent, populated: !!edit.productionFeePercent },
      { field: 'Contingency %',        value: edit.contingencyPercent,   populated: !!edit.contingencyPercent },
      { field: 'VAT Rate %',           value: edit.vatRate,              populated: !!edit.vatRate },
      { field: 'WHT Rate %',           value: edit.whtRate,              populated: !!edit.whtRate },
      { field: 'Dev Months',           value: edit.developmentMonths,    populated: !!edit.developmentMonths },
      { field: 'Pre-Prod Months',      value: edit.preProdMonths,        populated: !!edit.preProdMonths },
      { field: 'Shoot Months',         value: edit.shootMonths,          populated: !!edit.shootMonths },
      { field: 'Post-Prod Months',     value: edit.postMonths,           populated: !!edit.postMonths },
    ]

    store.setLastUploadAudit({
      fileName:            uploadedFileName || 'uploaded-budget.xlsx',
      uploadedAt:          new Date().toISOString(),
      documentType:        BUDGET_DOC_TYPE_LABELS[typeOverride ?? detectedType],
      totalBudgetDetected: edit.totalBudget ? `${cur}${Number(edit.totalBudget).toLocaleString()}` : '—',
      fieldsPopulated:     auditFields,
      lineItemCount:       Object.values(pw.lineItems).reduce((s, arr) => s + (arr?.length ?? 0), 0),
      salaryRoleCount:     pw.salaryRoles.length,
      paymentScheduleCount: pw.paymentSchedules.filter(ps => (ps.rows?.length ?? 0) > 0).length,
      crossCheckMessage,
    })

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 13 — Emit persistent notices for rounding variance and low-confidence fields
    // ─────────────────────────────────────────────────────────────────────────────
    if (crossCheckMessage) {
      store.addNotice({ type: 'rounding', message: crossCheckMessage, targetScreen: 'assumptions' })
    }

    // Low-confidence fields notice
    const lowConf = auditFields.filter(f => !f.populated)
    if (lowConf.length > 0) {
      store.addNotice({
        type: 'confidence',
        message: `${lowConf.length} field(s) could not be auto-detected from "${uploadedFileName || 'your file'}": ${lowConf.map(f => f.field).join(', ')}. Review in Assumptions.`,
        targetScreen: 'assumptions',
      })
    }

    // Check salary and forecast population and trigger fallback if needed
    const salaryPopulated  = pw.salaryRoles.length > 0
    const forecastPopulated = pw.forecastRows.some(r => Object.values(r.monthlyValues).some(v => v > 0))
    const sheetNames = pw.sheets.map(s => s.name)

    if (!salaryPopulated || !forecastPopulated) {
      setPendingFallback({
        needsSalary:   !salaryPopulated,
        needsForecast: !forecastPopulated,
        sheetNames,
        step: !salaryPopulated ? 'salary' : 'forecast',
      })
      // Don't call onDone yet — wait for fallback resolution
      return
    }

    onDone()
  }

  // ─── Fallback: re-parse a user-selected sheet for salary or forecast ──────────

  async function handleFallbackSubmit() {
    if (!pw || !fallbackSheet || !pendingFallback) return
    setFallbackParsing(true)
    setFallbackError('')

    try {
      // Find the sheet by name in the already-parsed workbook
      const sheet = pw.sheets.find(s => s.name === fallbackSheet)
      if (!sheet) {
        setFallbackError('Sheet not found. Please select again.')
        setFallbackParsing(false)
        return
      }

      const { parseSingleSheet } = await import('../utils/budgetParser')
      const result = await parseSingleSheet(pw._rawBuffer!, fallbackSheet)

      if (pendingFallback.step === 'salary') {
        if (result.salaryRoles.length === 0) {
          setFallbackError(
            'This sheet could not be reliably parsed as a salary forecast. ' +
            'You can enter salary data manually on the Salary Forecast page, or skip this step.'
          )
          setFallbackParsing(false)
          return
        }
        store.setSalaryRoles(mergeSalaryRoles(result.salaryRoles, store.salaryRoles))
        store.addNotice({
          type: 'info',
          message: `Salary forecast populated from sheet "${fallbackSheet}" (${result.salaryRoles.length} roles).`,
          targetScreen: 'salary',
        })

        // Now check forecast
        if (pendingFallback.needsForecast) {
          setPendingFallback(prev => prev ? { ...prev, step: 'forecast' } : null)
          setFallbackSheet('')
          setFallbackParsing(false)
          return
        }
      } else {
        // forecast step
        const hasForecasts = result.forecastRows.some(r => Object.values(r.monthlyValues).some(v => v > 0))
        if (!hasForecasts) {
          setFallbackError(
            'This sheet could not be reliably parsed as a production forecast. ' +
            'You can enter forecast data manually on the Production Forecast page, or skip.'
          )
          setFallbackParsing(false)
          return
        }
        for (const row of result.forecastRows) {
          if (!row.deptCode) continue
          for (const [month, value] of Object.entries(row.monthlyValues)) {
            if (value > 0) store.setForecastOverride(`${row.deptCode}_${month}`, value)
          }
        }
        store.addNotice({
          type: 'info',
          message: `Production forecast populated from sheet "${fallbackSheet}".`,
          targetScreen: 'forecast',
        })
      }

      setPendingFallback(null)
      onDone()
    } catch {
      setFallbackError('An error occurred while parsing the selected sheet.')
      setFallbackParsing(false)
    }
  }

  function handleFallbackSkip() {
    if (!pendingFallback) return
    if (pendingFallback.step === 'salary' && pendingFallback.needsForecast) {
      store.addNotice({
        type: 'info',
        message: 'Salary forecast was not populated — complete it manually on the Salary Forecast page.',
        targetScreen: 'salary',
      })
      setPendingFallback(prev => prev ? { ...prev, step: 'forecast' } : null)
      setFallbackSheet('')
      setFallbackError('')
      return
    }
    if (pendingFallback.step === 'forecast') {
      store.addNotice({
        type: 'info',
        message: 'Production forecast was not populated — complete it manually on the Production Forecast page.',
        targetScreen: 'forecast',
      })
    }
    setPendingFallback(null)
    onDone()
  }

  // ─── Fallback sheet selector dialog ──────────────────────────────────────────

  if (pendingFallback) {
    const isSalary = pendingFallback.step === 'salary'
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 32 }}>
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '36px 40px', maxWidth: 540, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 16, textAlign: 'center' }}>{isSalary ? '👥' : '📈'}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            {isSalary ? 'Salary Forecast Not Detected' : 'Production Forecast Not Detected'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, marginBottom: 20 }}>
            {isSalary
              ? 'The salary forecast could not be automatically populated from your budget file. Your Excel workbook may have a separate sheet for crew salaries. Please identify which sheet contains your salary data.'
              : 'A production forecast (cashflow schedule) was not detected in your file. If your workbook has a forecast or cashflow sheet, please identify it here.'}
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Select sheet
            </div>
            <select
              value={fallbackSheet}
              onChange={e => { setFallbackSheet(e.target.value); setFallbackError('') }}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 7, color: 'var(--text)', fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            >
              <option value="">— Choose a sheet —</option>
              {pendingFallback.sheetNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {fallbackError && (
            <div style={{
              padding: '10px 14px', background: 'rgba(255,100,100,0.08)',
              border: '1px solid rgba(255,100,100,0.3)', borderRadius: 7,
              fontSize: 12, color: '#ff6b6b', lineHeight: 1.6, marginBottom: 14,
            }}>
              {fallbackError}
              {fallbackError.includes('could not be reliably') && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setPendingFallback(null); onDone() }}
                    style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text3)', fontSize: 11, cursor: 'pointer' }}
                  >
                    Skip for now
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={handleFallbackSkip}
              style={S.btnGhost}
              disabled={fallbackParsing}
            >
              Skip
            </button>
            <button
              onClick={handleFallbackSubmit}
              style={{ ...S.btnPrimary, opacity: (!fallbackSheet || fallbackParsing) ? 0.5 : 1 }}
              disabled={!fallbackSheet || fallbackParsing}
            >
              {fallbackParsing ? 'Parsing…' : 'Use this sheet →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Stage 1: file-select (waiting for OS dialog) ───────────────────────────

  if (uploadFlowStage === 'file-select') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Opening file dialog…</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Select your Excel budget in the file dialog</div>
        </div>
      </div>
    )
  }

  // ─── Stage 2: page declaration dialog ────────────────────────────────────────

  if (uploadFlowStage === 'page-declaration') {
    const toggleType = (key: DeclarationKey) => {
      setDeclaredTypes(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key); else next.add(key)
        return next
      })
    }
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ background: 'var(--bg-surface, #1a1a1a)', border: '1px solid var(--border, #333)', borderRadius: 16, padding: '40px 48px', maxWidth: 580, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #4e9fff)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Upload Budget — Step 2 of 4
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text, #fff)', marginBottom: 6 }}>What did you upload?</div>
          <div style={{ fontSize: 13, color: 'var(--text3, #888)', marginBottom: 28, lineHeight: 1.6 }}>
            Tell us what's in <strong style={{ color: 'var(--text, #fff)' }}>{uploadedFileName || 'this file'}</strong> so we can read it correctly.
            <br />Select all that apply.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {DECLARATION_OPTIONS.map(opt => {
              const checked = declaredTypes.has(opt.key)
              return (
                <label
                  key={opt.key}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
                    background: checked ? 'rgba(78,159,255,0.08)' : 'var(--bg2, #141414)',
                    border: `1px solid ${checked ? 'rgba(78,159,255,0.4)' : 'var(--border, #333)'}`,
                    borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(opt.key)}
                    style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--accent, #4e9fff)' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #fff)', marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3, #888)' }}>{opt.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text3, #888)', marginBottom: 20, fontStyle: 'italic' }}>
            Not sure? Select all that might apply. The app will only read what it finds.
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={S.btnGhost}>Cancel</button>
            <button
              onClick={handleScanFile}
              disabled={declaredTypes.size === 0}
              style={{
                ...S.btnPrimary,
                opacity: declaredTypes.size === 0 ? 0.4 : 1,
                cursor: declaredTypes.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Scan File →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Stage 3: parsing with loading bar ───────────────────────────────────────

  if (uploadFlowStage === 'parsing') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, width: '90%' }}>
          <div style={{ fontSize: 32, marginBottom: 20 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #fff)', marginBottom: 8 }}>Reading your file</div>
          <div style={{ fontSize: 13, color: 'var(--text3, #888)', marginBottom: 24 }}>{parseProgressLabel}</div>

          {/* Progress bar */}
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${parseProgressPct}%`,
              background: 'var(--accent, #4e9fff)',
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3, #888)', marginBottom: 24 }}>{parseProgressPct}%</div>

          {parseTookTooLong && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--accent-amber, #f5a623)', marginBottom: 12 }}>
                Still working on a large file…
              </div>
              <button onClick={onCancel} style={{ ...S.btnGhost, fontSize: 12 }}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Stage: error ────────────────────────────────────────────────────────────

  if (uploadFlowStage === 'parse-error') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Could not read this file</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, lineHeight: 1.7 }}>
            {parseError || 'Ensure the file is a valid .xlsx workbook and is not locked by another application.'}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => { setUploadFlowStage('file-select'); handleFileSelect() }} style={S.btnPrimary}>Try Again</button>
            <button onClick={onCancel} style={S.btnGhost}>Continue Without Upload</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Stage: confirm ──────────────────────────────────────────────────────────

  if (!pw || !edit) return null

  const detectedDepts = DEPARTMENTS.filter(d => edit.deptPct[d.code] && parseFloat(edit.deptPct[d.code]!) > 0)
  const lineItemCount = Object.values(pw.lineItems).reduce((s, arr) => s + (arr?.length ?? 0), 0)
  const unresolved = conflicts.filter(c => !c.chosenSource).length

  const sectionCounts: Partial<Record<Section, number>> = {
    summary:     pw.sheets.length,
    lineitems:   lineItemCount,
    salary:      pw.salaryRoles.length,
    schedules:   pw.paymentSchedules.length,
    conflicts:   conflicts.length,
    departments: detectedDepts.length,
  }

  // Sheet summary stats
  const classifiedCount = pw.sheets.filter(s => s.type !== 'unknown').length
  const deptAllocCount  = Object.keys(pw.deptAllocations).length + Object.keys(pw.deptAllocationsRaw).length

  return (
    <>
    <div style={S.page}>
      <div style={S.wrap}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={S.h1}>Review Parsed Workbook</div>
          <div style={S.sub}>
            {classifiedCount} of {pw.sheets.length} sheets classified · {lineItemCount} line items · {pw.salaryRoles.length} salary roles
            {conflicts.length > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} to resolve</span>}
            {pw.warnings.length > 0 && <span style={{ color: '#888' }}> · {pw.warnings.length} warning{pw.warnings.length > 1 ? 's' : ''}</span>}
          </div>

          {/* Document type detection banner */}
          {(() => {
            const activeType = typeOverride ?? detectedType
            const docLabel = BUDGET_DOC_TYPE_LABELS[activeType]
            const isSparse = activeType === 'dept-summary' || pw.matchStats.deptCoverage < 0.6
            const allTypes: BudgetDocumentType[] = [
              'full-production-budget', 'production-forecast', 'salary-forecast',
              'dept-summary', 'mixed', 'unknown',
            ]
            return (
              <div style={{ background: 'rgba(78,159,255,0.08)', border: '1px solid rgba(78,159,255,0.25)', borderRadius: 8, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#4e9fff', fontWeight: 600 }}>
                  Detected: {docLabel}
                </span>
                <select
                  value={typeOverride ?? detectedType}
                  onChange={e => setTypeOverride(e.target.value as BudgetDocumentType)}
                  style={{ fontSize: 11, padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text3)', fontFamily: 'inherit' }}
                >
                  {allTypes.map(t => (
                    <option key={t} value={t}>{BUDGET_DOC_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {isSparse && !showWizard && (
                  <button
                    onClick={() => setShowWizard(true)}
                    style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >
                    Open Budget Wizard
                  </button>
                )}
                {isSparse && (
                  <span style={{ fontSize: 11, color: '#888' }}>
                    Sparse document — wizard recommended to fill in missing fields
                  </span>
                )}
              </div>
            )
          })()}

          {/* Warnings strip */}
          {pw.warnings.length > 0 && (
            <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              {pw.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text3)', marginBottom: i < pw.warnings.length - 1 ? 4 : 0 }}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pre-population summary ──────────────────────────────────────────── */}
        {(() => {
          const checks: [string, string][] = [
            ['Total Budget',     edit.totalBudget],
            ['Currency',         edit.currency],
            ['Production Title', edit.title],
            ['Company',          edit.company],
            ['Shoot Days',       edit.shootDays],
            ['Start Date',       edit.startDate],
            ['Production Fee %', edit.productionFeePercent],
            ['Contingency %',    edit.contingencyPercent],
            ['VAT Rate %',       edit.vatRate],
            ['WHT Rate %',       edit.whtRate],
            ['Dev Months',       edit.developmentMonths],
            ['Pre-Prod Months',  edit.preProdMonths],
            ['Shoot Months',     edit.shootMonths],
            ['Post-Prod Months', edit.postMonths],
          ]
          const fieldsWill = checks.filter(([, v]) => !!v).map(([l]) => l)
          const fieldsWont = checks.filter(([, v]) => !v).map(([l]) => l)

          const activeType = typeOverride ?? detectedType
          const docLabel   = BUDGET_DOC_TYPE_LABELS[activeType]
          const tbDisplay  = edit.totalBudget
            ? `${edit.currency || ''}${Number(edit.totalBudget).toLocaleString()}`
            : '—'
          const deptCount  = Object.keys(pw.deptAllocations).length +
                             Object.keys(pw.deptAllocationsRaw).length
          const psCount    = pw.paymentSchedules.filter(ps => (ps.rows?.length ?? 0) > 0).length

          const statStyle: React.CSSProperties = { minWidth: 110 }
          const statLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }
          const statVal:   React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text)' }

          return (
            <div style={{ background: 'rgba(80,200,80,0.06)', border: '1px solid rgba(80,200,80,0.22)', borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>What will be imported</div>

              {/* Stats row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', marginBottom: 14 }}>
                <div style={statStyle}><div style={statLabel}>Type</div><div style={{ ...statVal, fontSize: 12 }}>{docLabel}</div></div>
                <div style={statStyle}><div style={statLabel}>Total Budget</div><div style={statVal}>{tbDisplay}</div></div>
                <div style={statStyle}><div style={statLabel}>Line Items</div><div style={statVal}>{lineItemCount}</div></div>
                <div style={statStyle}><div style={statLabel}>Salary Roles</div><div style={statVal}>{pw.salaryRoles.length}</div></div>
                <div style={statStyle}><div style={statLabel}>Dept Allocations</div><div style={statVal}>{deptCount}</div></div>
                <div style={statStyle}><div style={statLabel}>Pmt Schedules</div><div style={statVal}>{psCount}</div></div>
              </div>

              {/* Fields that will be populated */}
              {fieldsWill.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>
                    Assumption fields that will be set ({fieldsWill.length}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {fieldsWill.map(f => (
                      <span key={f} style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'rgba(80,200,80,0.12)', padding: '2px 8px', borderRadius: 4 }}>
                        ✓ {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Fields that won't be populated */}
              {fieldsWont.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>
                    Not detected — will be left blank ({fieldsWont.length}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {fieldsWont.map(f => (
                      <span key={f} style={{ fontSize: 11, color: '#666', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4 }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        <SectionNav active={section} onChange={setSection} counts={sectionCounts} />

        {/* ── Section: Sheets summary ─────────────────────────────────────────── */}
        {section === 'summary' && (
          <div>
            <div style={S.sec}>Sheet Classification</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 24 }}>
              {pw.sheets.map(sh => (
                <div key={sh.name} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLOUR[sh.type], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sh.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: TYPE_COLOUR[sh.type], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                    {TYPE_LABEL[sh.type]}
                    {sh.ambiguous && <span style={{ color: '#888', fontWeight: 400, marginLeft: 4 }}>(ambiguous)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#555' }}>
                    {sh.rowCount} rows · {Math.round(sh.score * 100)}% confidence
                    {sh.ambiguous && sh.alternativeType && <span style={{ color: '#888' }}> · alt: {TYPE_LABEL[sh.alternativeType]}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section: Project & Assumptions ─────────────────────────────────── */}
        {section === 'project' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.sec}>Project Details</div>
              <div style={S.grid2}>
                <Field label="Production Title"   value={edit.title}   onChange={v => upEdit('title', v)}   scored={pw.title} />
                <Field label="Production Company" value={edit.company} onChange={v => upEdit('company', v)} scored={pw.company} />
                <Field label="Total Budget"       value={edit.totalBudget} onChange={v => upEdit('totalBudget', v)} type="number" scored={pw.totalBudget} />
                <Field label="Currency"           value={edit.currency} onChange={v => upEdit('currency', v)} scored={pw.currency} placeholder="e.g. NGN" />
                <Field label="Shoot Days"         value={edit.shootDays} onChange={v => upEdit('shootDays', v)} type="number" scored={pw.shootDays} />
                <Field label="Start Date"         value={edit.startDate} onChange={v => upEdit('startDate', v)} scored={pw.startDate} placeholder="YYYY-MM-DD" />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={S.sec}>Assumptions</div>
              <div style={S.grid2}>
                <Field label="Production Fee %" value={edit.productionFeePercent} onChange={v => upEdit('productionFeePercent', v)} type="number" scored={pw.productionFeePercent} placeholder="e.g. 10" />
                <Field label="Contingency %"    value={edit.contingencyPercent}   onChange={v => upEdit('contingencyPercent', v)}   type="number" scored={pw.contingencyPercent}   placeholder="e.g. 5" />
                <Field label="VAT Rate %"       value={edit.vatRate}              onChange={v => upEdit('vatRate', v)}              type="number" scored={pw.vatRate}              placeholder="e.g. 7.5" />
                <Field label="WHT Rate %"       value={edit.whtRate}              onChange={v => upEdit('whtRate', v)}              type="number" scored={pw.whtRate}              placeholder="e.g. 5" />
              </div>
            </div>

            <div>
              <div style={S.sec}>Production Timeline (months)</div>
              <div style={S.grid2}>
                <Field label="Development"    value={edit.developmentMonths} onChange={v => upEdit('developmentMonths', v)} type="number" scored={pw.developmentMonths} placeholder="e.g. 1" />
                <Field label="Pre-Production" value={edit.preProdMonths}    onChange={v => upEdit('preProdMonths', v)}    type="number" scored={pw.preProdMonths}    placeholder="e.g. 2" />
                <Field label="Shoot Period"   value={edit.shootMonths}      onChange={v => upEdit('shootMonths', v)}      type="number" scored={pw.shootMonths}      placeholder="e.g. 1" />
                <Field label="Post-Production"value={edit.postMonths}       onChange={v => upEdit('postMonths', v)}       type="number" scored={pw.postMonths}       placeholder="e.g. 3" />
              </div>
            </div>
          </div>
        )}

        {/* ── Section: Departments ────────────────────────────────────────────── */}
        {section === 'departments' && (
          <div>
            <div style={S.sec}>Department Allocations (%)</div>
            {detectedDepts.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>No department allocations detected. You can set them manually from the Assumptions screen.</p>
            )}
            <div style={S.grid2}>
              {DEPARTMENTS.map(dept => {
                const pct = edit.deptPct[dept.code] ?? ''
                const absScore = pw.deptAllocations[dept.code]
                const hasRaw   = pw.deptAllocationsRaw[dept.code] !== undefined
                if (!pct && !absScore) return null
                return (
                  <div key={dept.code} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {dept.code} — {dept.name}
                      </span>
                      {hasRaw && <Badge conf="high" />}
                      {!hasRaw && absScore && <Badge conf={absScore.confidence} />}
                    </div>
                    <input
                      type="number" value={pct}
                      onChange={e => upDeptPct(dept.code, e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder="% allocation"
                      style={{ width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                    {!hasRaw && absScore && (
                      <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>
                        Absolute: {absScore.value.toLocaleString()} from "{absScore.source}"
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Undetected depts */}
            {(() => {
              const undetected = DEPARTMENTS.filter(d => !edit.deptPct[d.code] && !pw.deptAllocations[d.code])
              if (!undetected.length) return null
              return (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>Not detected ({undetected.length} departments) — set manually if needed:</div>
                  <div style={S.grid2}>
                    {undetected.map(dept => (
                      <div key={dept.code} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{dept.code} — {dept.name}</div>
                        <input
                          type="number" value={edit.deptPct[dept.code] ?? ''}
                          onChange={e => upDeptPct(dept.code, e.target.value)}
                          onFocus={e => e.target.select()}
                          placeholder="% allocation"
                          style={{ width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: '#555', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Section: Line items ─────────────────────────────────────────────── */}
        {section === 'lineitems' && (
          <div>
            <div style={S.sec}>Line Items by Department</div>
            {lineItemCount === 0 && <p style={{ fontSize: 13, color: 'var(--text3)' }}>No line items detected. Upload a sheet classified as Budget Summary to import them.</p>}
            {DEPARTMENTS.map(dept => {
              const items = pw.lineItems[dept.code]
              if (!items || items.length === 0) return null
              return (
                <div key={dept.code} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                    {dept.code} — {dept.name}
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg2)' }}>
                        {['Sched No', 'Detail', 'Qty', 'Rate', 'Unit'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 50).map((item, i) => (
                        <tr key={item.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg2)' }}>
                          <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{item.schedNo}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text)' }}>{item.detail}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{item.qty}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{item.rate.toLocaleString()}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {items.length > 50 && <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>…and {items.length - 50} more items</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Section: Salary ─────────────────────────────────────────────────── */}
        {section === 'salary' && (
          <div>
            <div style={S.sec}>Salary Roles Detected</div>
            {pw.salaryRoles.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)' }}>No salary roles detected. Upload a sheet classified as Salary Forecast to import them.</p>}
            {pw.salaryRoles.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)' }}>
                    {['Sched No', 'Role', 'Department', 'Monthly Total'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pw.salaryRoles.slice(0, 100).map((role, i) => {
                    const total = Object.values(role.monthlyAmounts).reduce((s, v) => s + v, 0)
                    const dept = DEPARTMENTS.find(d => d.code === role.deptCode)
                    return (
                      <tr key={role.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg2)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{role.schedNo}</td>
                        <td style={{ padding: '5px 10px', color: 'var(--text)' }}>{role.role}</td>
                        <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{dept?.name ?? role.deptCode}</td>
                        <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{total.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {pw.salaryRoles.length > 100 && <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>…and {pw.salaryRoles.length - 100} more roles</div>}
          </div>
        )}

        {/* ── Section: Payment schedules ──────────────────────────────────────── */}
        {section === 'schedules' && (
          <div>
            <div style={S.sec}>Payment Schedules Detected</div>
            {pw.paymentSchedules.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)' }}>No payment schedules detected. Sheets named PS-XXX or containing payee/bank/account headers are imported as payment schedules.</p>}
            {pw.paymentSchedules.map((ps, idx) => (
              <div key={idx} style={{ marginBottom: 24, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{ps.scheduleNumber}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>from sheet "{(ps as any)._sheetName}"</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'rgba(245,166,35,0.12)', padding: '2px 8px', borderRadius: 4 }}>Draft</span>
                  <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>{ps.rows?.length ?? 0} rows</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Payee', 'Description', 'Budget Code', 'Bank', 'Payment Value'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ps.rows ?? []).slice(0, 20).map((row, i) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text)' }}>{row.payeeName}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text3)' }}>{row.description}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text3)' }}>{row.budgetCode}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text3)' }}>{row.bankName}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text3)' }}>{row.paymentValue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(ps.rows?.length ?? 0) > 20 && <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>…and {(ps.rows?.length ?? 0) - 20} more rows</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── Section: Conflicts ──────────────────────────────────────────────── */}
        {section === 'conflicts' && (
          <div>
            <div style={S.sec}>Cross-Sheet Conflicts</div>
            {conflicts.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>✓ No conflicts detected — all figures are consistent across sheets.</div>
            )}
            {conflicts.map((conflict, idx) => {
              const isResolved = !!conflict.chosenSource
              return (
                <div key={conflict.field} style={{ marginBottom: 20, background: isResolved ? 'rgba(80,200,80,0.05)' : 'rgba(245,166,35,0.05)', border: `1px solid ${isResolved ? 'rgba(80,200,80,0.2)' : 'rgba(245,166,35,0.3)'}`, borderRadius: 8, padding: '16px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    Conflict {idx + 1}: {conflict.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                    The same field has different values in different sheets. Select which source to trust.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conflict.sources.map(source => {
                      const isChosen = conflict.chosenSource === source.sheet
                      return (
                        <label key={source.sheet} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: isChosen ? 'rgba(245,166,35,0.15)' : 'var(--bg2)', border: `1px solid ${isChosen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`conflict_${conflict.field}`}
                            checked={isChosen}
                            onChange={() => resolveConflict(conflict.field, source.sheet)}
                          />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                              {typeof source.value === 'number' ? source.value.toLocaleString() : source.value}
                            </div>
                            <div style={{ fontSize: 11, color: '#666' }}>from "{source.sheet}"</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  {isResolved && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 8, fontWeight: 600 }}>✓ Resolved — using value from "{conflict.chosenSource}"</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Action row ──────────────────────────────────────────────────────── */}
        <div style={{ ...S.row, marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          {unresolved > 0 && (
            <div style={{ flex: 1, fontSize: 12, color: 'var(--accent)', fontWeight: 600, alignSelf: 'center' }}>
              ⚠ {unresolved} conflict{unresolved > 1 ? 's' : ''} unresolved — you can still import, unresolved fields will use the first detected value.
            </div>
          )}
          <button onClick={onCancel} style={S.btnGhost}>Cancel</button>
          <button
            onClick={() => setSection('project')}
            style={{ ...S.btnGhost, display: section !== 'project' ? 'inline-block' : 'none' }}
          >
            Edit Details
          </button>
          <button onClick={() => setShowWizard(true)} style={S.btnGhost}>Run Wizard</button>
          <button onClick={handleCommit} style={S.btnPrimary}>
            Load into Project →
          </button>
        </div>

      </div>
    </div>

    {/* Budget Wizard modal — wrapped in error boundary to prevent app crash */}
    {showWizard && edit && pw && (
      <WizardErrorBoundary onClose={() => setShowWizard(false)}>
        <BudgetWizard
          initialEdit={edit}
          parsedWorkbook={pw}
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
        />
      </WizardErrorBoundary>
    )}

    {/* Overwrite warning modal */}
    {showOverwriteWarning && (() => {
      const existingLineItems = DEPARTMENTS.reduce((s, d) => s + (store.lineItems[d.code]?.length ?? 0), 0)
      const existingAssumptions = [
        store.project.totalBudget > 0,
        !!store.project.title,
        !!store.project.company,
        !!store.project.currency,
        !!store.project.shootDays,
        !!store.project.startDate,
        !!store.project.productionFeePercent,
      ].filter(Boolean).length
      const existingSalaryRoles = store.salaryRoles.length

      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 36px', maxWidth: 480, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 28, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Overwrite existing data?</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.75, marginBottom: 24 }}>
              This project already has data entered:
              {existingLineItems > 0 && (
                <><br />· <strong style={{ color: 'var(--text)' }}>{existingLineItems}</strong> line item{existingLineItems !== 1 ? 's' : ''}</>
              )}
              {existingSalaryRoles > 0 && (
                <><br />· <strong style={{ color: 'var(--text)' }}>{existingSalaryRoles}</strong> salary role{existingSalaryRoles !== 1 ? 's' : ''} (will be merged, not replaced)</>
              )}
              {existingAssumptions > 0 && (
                <><br />· <strong style={{ color: 'var(--text)' }}>{existingAssumptions}</strong> assumption field{existingAssumptions !== 1 ? 's' : ''}</>
              )}
              <br /><br />
              Importing this workbook will <strong style={{ color: 'var(--text)' }}>replace</strong> existing line items and overwrite matching assumption fields. Previously entered data will be lost.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowOverwriteWarning(false)} style={S.btnGhost}>Cancel</button>
              <button
                onClick={() => { setShowOverwriteWarning(false); doCommit() }}
                style={{ ...S.btnPrimary, background: '#c0392b', color: '#fff' }}
              >
                Yes, overwrite →
              </button>
            </div>
          </div>
        </div>
      )
    })()}
    </>
  )
}

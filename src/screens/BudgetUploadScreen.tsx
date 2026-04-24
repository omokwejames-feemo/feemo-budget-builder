// Budget Upload Screen — Fix Batch 8
// Multi-sheet aware confirmation UI. Organised by section with confidence
// badges, conflict resolution, and a single commit pass.

import { useState, useEffect } from 'react'
import {
  parseBudgetBuffer,
  ParsedWorkbook,
  ParsedConflict,
  SheetClassification,
  SheetType,
  Confidence,
  ScoredField,
} from '../utils/budgetParser'
import { useBudgetStore, DEPARTMENTS, DeptCode } from '../store/budgetStore'

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
  btnPrimary: { padding: '11px 28px', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' } as React.CSSProperties,
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

export default function BudgetUploadScreen({ onDone, onCancel }: Props) {
  const store = useBudgetStore()
  const [stage, setStage] = useState<'parsing' | 'error' | 'confirm'>('parsing')
  const [parseError, setParseError] = useState('')
  const [pw, setPw] = useState<ParsedWorkbook | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [conflicts, setConflicts] = useState<ParsedConflict[]>([])
  const [section, setSection] = useState<Section>('summary')

  useEffect(() => { handleUpload() }, [])

  async function handleUpload() {
    if (!window.electronAPI) { setParseError('Electron API not available.'); setStage('error'); return }
    const res = await window.electronAPI.openXlsxBudget()
    if (!res.success || !res.buffer) { onCancel(); return }

    try {
      const arrayBuf = new Uint8Array(res.buffer).buffer
      const result = await parseBudgetBuffer(arrayBuf)
      setPw(result)
      setEdit(toEditState(result))
      setConflicts(result.conflicts.map(c => ({ ...c, chosenSource: null })))

      // Jump straight to conflicts tab if there are any
      if (result.conflicts.length > 0) setSection('conflicts')
      else setSection('summary')

      setStage('confirm')
    } catch (err) {
      setParseError(String(err))
      setStage('error')
    }
  }

  function upEdit(key: keyof EditState, value: string) {
    setEdit(prev => prev ? { ...prev, [key]: value } : prev)
  }
  function upDeptPct(code: DeptCode, value: string) {
    setEdit(prev => prev ? { ...prev, deptPct: { ...prev.deptPct, [code]: value } } : prev)
  }
  function resolveConflict(field: string, sheet: string) {
    setConflicts(prev => prev.map(c => c.field === field ? { ...c, chosenSource: sheet } : c))
  }

  function handleCommit() {
    if (!edit || !pw) return
    const n = (s: string) => { const v = parseFloat(s); return isNaN(v) ? 0 : v }
    const ns = (s: string) => { const v = parseFloat(s); return isNaN(v) ? undefined : v }

    // ── Project ────────────────────────────────────────────────────────────────
    store.setProject({
      title: edit.title || undefined,
      company: edit.company || undefined,
      totalBudget: ns(edit.totalBudget),
      currency: edit.currency || undefined,
      shootDays: ns(edit.shootDays),
      startDate: edit.startDate || undefined,
      productionFeePercent: ns(edit.productionFeePercent),
    })

    // ── Timeline ───────────────────────────────────────────────────────────────
    store.setTimeline({
      developmentMonths: ns(edit.developmentMonths),
      preProdMonths: ns(edit.preProdMonths),
      shootMonths: ns(edit.shootMonths),
      postMonths: ns(edit.postMonths),
    })

    // ── Dept allocations ───────────────────────────────────────────────────────
    // Contingency % → dept II
    if (edit.contingencyPercent) store.setDeptAllocation('II', n(edit.contingencyPercent))

    for (const dept of DEPARTMENTS) {
      const pctStr = edit.deptPct[dept.code]
      if (!pctStr) continue
      const pct = n(pctStr)
      if (pct > 0) store.setDeptAllocation(dept.code, pct)
    }

    // Where conflicts resolved, apply winning source value to dept allocations
    for (const conflict of conflicts) {
      if (!conflict.chosenSource || !conflict.field.startsWith('dept_')) continue
      const code = conflict.field.replace('dept_', '') as DeptCode
      const chosen = conflict.sources.find(s => s.sheet === conflict.chosenSource)
      if (chosen && typeof chosen.value === 'number') {
        const totalBudget = n(edit.totalBudget)
        if (totalBudget > 0) store.setDeptAllocation(code, (chosen.value / totalBudget) * 100)
      }
    }

    // ── Line items ─────────────────────────────────────────────────────────────
    for (const [code, items] of Object.entries(pw.lineItems)) {
      if (items && items.length > 0) store.setLineItems(code as DeptCode, items)
    }

    // ── Salary roles ───────────────────────────────────────────────────────────
    if (pw.salaryRoles.length > 0) store.setSalaryRoles(pw.salaryRoles)

    // ── Forecast overrides (dept × month) ─────────────────────────────────────
    for (const row of pw.forecastRows) {
      if (!row.deptCode) continue
      for (const [month, value] of Object.entries(row.monthlyValues)) {
        if (value > 0) store.setForecastOverride(`${row.deptCode}_${month}`, value)
      }
    }

    // ── Payment schedules (drafts) ─────────────────────────────────────────────
    const vat = n(edit.vatRate)
    const wht = n(edit.whtRate)
    for (const ps of pw.paymentSchedules) {
      if (!ps.rows || ps.rows.length === 0) continue
      store.addPaymentSchedule({
        id: ps.id ?? String(Date.now()),
        scheduleNumber: ps.scheduleNumber ?? 'PS-001',
        globalVatRate: ps.globalVatRate || vat,
        globalWhtRate: ps.globalWhtRate || wht,
        rows: ps.rows,
        preparedBy: ps.preparedBy ?? '',
        reviewedBy: ps.reviewedBy ?? '',
        approvedBy: ps.approvedBy ?? '',
        createdAt: ps.createdAt ?? new Date().toISOString(),
        status: 'draft',
      })
    }

    onDone()
  }

  // ─── Stage: parsing ──────────────────────────────────────────────────────────

  if (stage === 'parsing') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Analysing workbook…</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Select your Excel budget in the file dialog</div>
        </div>
      </div>
    )
  }

  // ─── Stage: error ────────────────────────────────────────────────────────────

  if (stage === 'error') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Could not read this file</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>{parseError || 'Ensure the file is a valid .xlsx workbook.'}</div>
          <button onClick={onCancel} style={S.btnPrimary}>Back to Home</button>
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

          {/* Warnings strip */}
          {pw.warnings.length > 0 && (
            <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              {pw.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text3)', marginBottom: i < pw.warnings.length - 1 ? 4 : 0 }}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>

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
          <button onClick={handleCommit} style={S.btnPrimary}>
            Load into Project →
          </button>
        </div>

      </div>
    </div>
  )
}

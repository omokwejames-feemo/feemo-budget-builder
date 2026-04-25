// Budget Questionnaire Wizard — Fix Batch 9 / Batch 14 S6.5
// 6-stage guided flow for sparse or incomplete budget uploads.
// Receives the partially-populated EditState from the parser and collects
// whatever is still missing. Emits a merged EditState + WizardExtras on submit.

import { useState, useEffect, useRef } from 'react'
import type { ParsedWorkbook } from '../utils/budgetParser'
import { DEPARTMENTS } from '../store/budgetStore'
import type { DeptCode } from '../store/budgetStore'
import DatePicker from './DatePicker'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditState {
  title: string; company: string; totalBudget: string; currency: string
  shootDays: string; startDate: string; productionFeePercent: string
  contingencyPercent: string; vatRate: string; whtRate: string
  developmentMonths: string; preProdMonths: string; shootMonths: string; postMonths: string
  deptPct: Partial<Record<DeptCode, string>>
}


export interface WizardExtras {
  format: string
  episodes: number
  episodeDuration: number
  location: string
  shootDays: number
  shootDaysPerWeek: number
  installments: Array<{ pct: number; month: number }>
}

interface Props {
  initialEdit: EditState
  parsedWorkbook: ParsedWorkbook
  onComplete: (edit: EditState, extras: WizardExtras) => void
  onCancel: () => void
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  overflow: 'auto',
}
const card: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 16, padding: '36px 44px',
  width: '92%', maxWidth: 680,
  margin: '32px auto',
  boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{children}</div>
}

function Input({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? ''}
        style={{ width: '100%', padding: '10px 13px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
      />
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '10px 13px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>{children}</div>
}

function StageDot({ stage, active, done }: { stage: number; active: boolean; done: boolean }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, flexShrink: 0,
      background: done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--bg-surface)',
      color: done || active ? '#fff' : 'var(--text-muted)',
      border: `2px solid ${done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--border-default)'}`,
    }}>
      {done ? '✓' : stage}
    </div>
  )
}

const STAGE_LABELS = ['Project', 'Shoot', 'Timeline', 'Departments', 'Funding']
const TOTAL_STAGES = 5

// ─── Main component ───────────────────────────────────────────────────────────

export default function BudgetWizard({ initialEdit, parsedWorkbook, onComplete, onCancel }: Props) {
  const mountedRef = useRef(true)

  // Cleanup on unmount — prevents stale state updates if the wizard is torn
  // down mid-session (e.g. when the user opens a project file while wizard is open).
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const [stage, setStage] = useState(1)
  const [edit, setEdit] = useState<EditState>({ ...initialEdit })
  const [extras, setExtras] = useState<WizardExtras>({
    format: 'Feature Film', episodes: 0, episodeDuration: 45,
    location: '', shootDays: 0, shootDaysPerWeek: 5,
    installments: [{ pct: 50, month: 1 }, { pct: 50, month: 3 }],
  })
  const [showSummary, setShowSummary] = useState(false)
  const [shootDurationUnit, setShootDurationUnit] = useState<'days' | 'weeks'>('days')

  const upEdit = (k: keyof EditState, v: string) => setEdit(prev => ({ ...prev, [k]: v }))
  const upExtras = <K extends keyof WizardExtras>(k: K, v: WizardExtras[K]) =>
    setExtras(prev => ({ ...prev, [k]: v }))
  const upDeptPct = (code: DeptCode, v: string) =>
    setEdit(prev => ({ ...prev, deptPct: { ...prev.deptPct, [code]: v } }))

  const isEpisodic = extras.format === 'TV Series' || extras.format === 'Web Series' || extras.format === 'Mini-Series'

  // Which fields are already populated from the parse?
  const pw = parsedWorkbook
  const alreadyHas = {
    title:    !!pw.title,
    company:  !!pw.company,
    total:    !!pw.totalBudget,
    currency: !!pw.currency,
    shootDays:!!pw.shootDays,
    startDate:!!pw.startDate,
    devMonths:!!pw.developmentMonths,
    preProd:  !!pw.preProdMonths,
    shoot:    !!pw.shootMonths,
    post:     !!pw.postMonths,
  }

  // Total from dept allocations (for balance check in stage 4)
  const deptTotal = DEPARTMENTS.reduce((sum, d) => {
    const pct = parseFloat(edit.deptPct[d.code] ?? '0') || 0
    return sum + pct
  }, 0)
  const totalBudget = parseFloat(edit.totalBudget) || 0
  const deptTotalAmount = totalBudget > 0 ? (deptTotal / 100) * totalBudget : 0

  function addInstallment() {
    setExtras(prev => ({
      ...prev,
      installments: [...prev.installments, { pct: 0, month: prev.installments.length + 1 }],
    }))
  }
  function removeInstallment(i: number) {
    setExtras(prev => ({ ...prev, installments: prev.installments.filter((_, idx) => idx !== i) }))
  }
  function updateInstallment(i: number, field: 'pct' | 'month', val: number) {
    setExtras(prev => ({
      ...prev,
      installments: prev.installments.map((inst, idx) => idx === i ? { ...inst, [field]: val } : inst),
    }))
  }

  function handleFinish() {
    // Merge wizard shoot days into edit if not already parsed
    if (!alreadyHas.shootDays && extras.shootDays > 0) {
      setEdit(prev => ({ ...prev, shootDays: String(extras.shootDays) }))
    }
    setShowSummary(true)
  }

  // ── Summary screen ───────────────────────────────────────────────────────────

  if (showSummary) {
    const instTotal = extras.installments.reduce((s, i) => s + i.pct, 0)
    return (
      <div style={shell}>
        <div style={{ ...card, maxWidth: 700 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Wizard Complete</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Review all collected data before applying to your budget.</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {[
              ['Title',           edit.title || '—'],
              ['Company',         edit.company || '—'],
              ['Total Budget',    edit.totalBudget ? Number(edit.totalBudget).toLocaleString() : '—'],
              ['Currency',        edit.currency || '—'],
              ['Shoot Days',      edit.shootDays || extras.shootDays || '—'],
              ['Start Date',      edit.startDate || '—'],
              ['Format',          extras.format],
              ['Location',        extras.location || '—'],
              ['Dev Months',      edit.developmentMonths || '—'],
              ['Pre-Prod Months', edit.preProdMonths || '—'],
              ['Shoot Months',    edit.shootMonths || '—'],
              ['Post Months',     edit.postMonths || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-ghost)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{String(val)}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Dept coverage: {deptTotal.toFixed(1)}%
            {totalBudget > 0 && ` · Total dept amount: ${deptTotalAmount.toLocaleString()}`}
          </div>
          {instTotal !== 100 && extras.installments.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--accent-amber)', marginBottom: 8 }}>
              ⚠ Installment percentages sum to {instTotal}% (should be 100%)
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16 }}>
            <button onClick={() => setShowSummary(false)} style={{ padding: '11px 20px', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14, border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer' }}>
              Back to Wizard
            </button>
            <button onClick={() => onComplete(edit, extras)} style={{ padding: '11px 28px', background: 'var(--accent-blue)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Apply to Budget →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────

  const progress = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {STAGE_LABELS.map((label, idx) => {
        const s = idx + 1
        const done = s < stage
        const active = s === stage
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: idx < STAGE_LABELS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <StageDot stage={s} active={active} done={done} />
              <span style={{ fontSize: 9, color: active ? 'var(--accent-blue)' : done ? 'var(--accent-green)' : 'var(--text-ghost)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {idx < STAGE_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--accent-green)' : 'var(--border-subtle)', margin: '0 6px', marginBottom: 18 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  const navRow = (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
      {stage > 1 && (
        <button onClick={() => setStage(s => s - 1)} style={{ padding: '10px 20px', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer' }}>
          ← Back
        </button>
      )}
      <button onClick={onCancel} style={{ padding: '10px 20px', background: 'transparent', color: 'var(--text-ghost)', fontWeight: 600, fontSize: 13, border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer' }}>
        Skip Wizard
      </button>
      {stage < TOTAL_STAGES ? (
        <button onClick={() => setStage(s => s + 1)} style={{ padding: '10px 24px', background: 'var(--accent-blue)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Next →
        </button>
      ) : (
        <button onClick={handleFinish} style={{ padding: '10px 24px', background: 'var(--accent-blue)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Review & Apply →
        </button>
      )}
    </div>
  )

  // ── Stage 1: Project Basics ──────────────────────────────────────────────────

  const stage1 = (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Stage 1 — Project Basics</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
        Fields already detected from your file are pre-filled. Confirm or correct them.
      </div>
      <Grid>
        <Input label={`Production Title${alreadyHas.title ? ' ✓' : ''}`}   value={edit.title}   onChange={v => upEdit('title', v)}   placeholder="e.g. The Long Road" />
        <Input label={`Company${alreadyHas.company ? ' ✓' : ''}`}          value={edit.company} onChange={v => upEdit('company', v)} placeholder="e.g. Feemovision Ltd" />
        <Input label={`Total Budget${alreadyHas.total ? ' ✓' : ''}`}       value={edit.totalBudget} onChange={v => upEdit('totalBudget', v)} type="number" placeholder="e.g. 150000000" />
        <Input label={`Currency${alreadyHas.currency ? ' ✓' : ''}`}        value={edit.currency} onChange={v => upEdit('currency', v)} placeholder="NGN / USD / GBP" />
      </Grid>
      <Select
        label="Production Type"
        value={extras.format}
        onChange={v => upExtras('format', v)}
        options={[
          { value: 'Feature Film', label: 'Feature Film' },
          { value: 'TV Series', label: 'TV Series' },
          { value: 'Mini-Series', label: 'Mini-Series' },
          { value: 'Web Series', label: 'Web Series' },
          { value: 'Documentary', label: 'Documentary' },
          { value: 'Telenovela', label: 'Telenovela' },
        ]}
      />
      {isEpisodic && (
        <Grid>
          <Input label="Number of Episodes" value={String(extras.episodes)} onChange={v => upExtras('episodes', parseInt(v) || 0)} type="number" placeholder="e.g. 13" />
          <Input label="Runtime per Episode (mins)" value={String(extras.episodeDuration)} onChange={v => upExtras('episodeDuration', parseInt(v) || 0)} type="number" placeholder="e.g. 45" />
        </Grid>
      )}
      {!isEpisodic && (
        <Input label="Runtime (minutes)" value={String(extras.episodeDuration)} onChange={v => upExtras('episodeDuration', parseInt(v) || 0)} type="number" placeholder="e.g. 90" />
      )}
    </>
  )

  // ── Stage 2: Shoot Parameters ────────────────────────────────────────────────

  const shootDaysDisplay = shootDurationUnit === 'weeks'
    ? String(alreadyHas.shootDays ? Math.ceil((parseFloat(edit.shootDays) || 0) / (extras.shootDaysPerWeek || 5)) : Math.ceil((extras.shootDays || 0) / (extras.shootDaysPerWeek || 5)) || '')
    : alreadyHas.shootDays ? edit.shootDays : String(extras.shootDays || '')

  function handleShootDurationChange(v: string) {
    const n = parseInt(v) || 0
    const days = shootDurationUnit === 'weeks' ? n * (extras.shootDaysPerWeek || 5) : n
    if (alreadyHas.shootDays) upEdit('shootDays', String(days))
    else upExtras('shootDays', days)
  }

  const stage2 = (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Stage 2 — Shoot Parameters</div>
      <Grid>
        <div style={{ marginBottom: 14 }}>
          <Label>{`Shoot Duration${alreadyHas.shootDays ? ' ✓' : ''}`}</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={shootDaysDisplay}
              onChange={e => handleShootDurationChange(e.target.value)}
              placeholder={shootDurationUnit === 'weeks' ? 'e.g. 5' : 'e.g. 25'}
              style={{ flex: 1, padding: '10px 13px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
            />
            <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
              {(['days', 'weeks'] as const).map(unit => (
                <button
                  key={unit}
                  onClick={() => setShootDurationUnit(unit)}
                  style={{ padding: '10px 14px', background: shootDurationUnit === unit ? 'var(--accent-blue)' : 'var(--bg-surface)', color: shootDurationUnit === unit ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize' }}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
          {shootDurationUnit === 'weeks' && (extras.shootDays > 0 || (alreadyHas.shootDays && parseFloat(edit.shootDays) > 0)) && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              = {alreadyHas.shootDays ? edit.shootDays : extras.shootDays} shoot days
            </div>
          )}
        </div>
        <Input label="Shooting Days per Week" value={String(extras.shootDaysPerWeek)} onChange={v => upExtras('shootDaysPerWeek', parseInt(v) || 5)} type="number" placeholder="e.g. 5" />
        <Input label="Base City / Primary Location" value={extras.location} onChange={v => upExtras('location', v)} placeholder="e.g. Lagos" />
        {/* blank cell in the 2-col grid to keep alignment */}
        <div />
      </Grid>
      <DatePicker
        label={`Production Start Date${alreadyHas.startDate ? ' ✓' : ''}`}
        value={edit.startDate}
        onChange={v => upEdit('startDate', v)}
        hint="Select the month production begins (pre-production start). Year can extend into any future year."
      />
      <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        Distant locations and studio days can be set in the Production Budget screen after importing.
      </div>
    </>
  )

  // ── Stage 3: Timeline ────────────────────────────────────────────────────────

  const stage3 = (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Stage 3 — Production Timeline</div>
      <Grid>
        <Input label={`Development (months)${alreadyHas.devMonths ? ' ✓' : ''}`}   value={edit.developmentMonths} onChange={v => upEdit('developmentMonths', v)} type="number" placeholder="e.g. 1" />
        <Input label={`Pre-Production (months)${alreadyHas.preProd ? ' ✓' : ''}`}  value={edit.preProdMonths}    onChange={v => upEdit('preProdMonths', v)}    type="number" placeholder="e.g. 2" />
        <Input label={`Principal Photography (months)${alreadyHas.shoot ? ' ✓' : ''}`} value={edit.shootMonths}  onChange={v => upEdit('shootMonths', v)}      type="number" placeholder="e.g. 1" />
        <Input label={`Post-Production (months)${alreadyHas.post ? ' ✓' : ''}`}    value={edit.postMonths}       onChange={v => upEdit('postMonths', v)}       type="number" placeholder="e.g. 3" />
      </Grid>
      <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        Total: {(
          (parseFloat(edit.developmentMonths) || 0) +
          (parseFloat(edit.preProdMonths) || 0) +
          (parseFloat(edit.shootMonths) || 0) +
          (parseFloat(edit.postMonths) || 0)
        ).toFixed(1)} months
      </div>
    </>
  )

  // ── Stage 4: Department Allocations ──────────────────────────────────────────

  const cur4 = edit.currency || '₦'
  const fmtAmt = (n: number) =>
    `${cur4} ${n.toLocaleString('en', { maximumFractionDigits: 0 })}`

  const stage4 = (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Stage 4 — Department Allocations</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Enter percentage allocations for each department. The currency figure updates live — compare directly against your Excel sheet.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
        {DEPARTMENTS.map(dept => {
          const pct = parseFloat(edit.deptPct[dept.code] ?? '0') || 0
          const amt = totalBudget > 0 && pct > 0 ? (pct / 100) * totalBudget : null
          return (
            <div key={dept.code} style={{ marginBottom: 2 }}>
              <div style={{ fontSize: 10, color: 'var(--text-ghost)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                {dept.code} — {dept.name}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  type="number"
                  value={edit.deptPct[dept.code] ?? ''}
                  onChange={e => upDeptPct(dept.code, e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="%"
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                {totalBudget > 0 && (
                  <input
                    type="number"
                    value={amt !== null ? Math.round(amt) : ''}
                    onChange={e => {
                      const enteredAmt = parseFloat(e.target.value) || 0
                      const derivedPct = totalBudget > 0 ? (enteredAmt / totalBudget) * 100 : 0
                      upDeptPct(dept.code, derivedPct > 0 ? derivedPct.toFixed(2) : '')
                    }}
                    onFocus={e => e.target.select()}
                    placeholder={cur4}
                    style={{ flex: 1.4, minWidth: 0, padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Running total bar */}
      <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: deptTotal > 102 ? 'var(--accent-red)' : deptTotal > 98 ? 'var(--accent-green)' : 'var(--accent-amber)', fontWeight: 600 }}>
            Total: {deptTotal.toFixed(1)}%
          </span>
          {totalBudget > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              = {fmtAmt(deptTotalAmount)}
            </span>
          )}
          {totalBudget > 0 && (
            <span style={{ color: 'var(--text-ghost)', marginLeft: 'auto' }}>
              Budget: {fmtAmt(totalBudget)}
            </span>
          )}
        </div>
        {Math.abs(deptTotal - 100) > 2 && (
          <div style={{ color: 'var(--accent-amber)', marginTop: 6, fontSize: 11 }}>
            ⚠ Should total 100% — {deptTotal < 100
              ? `${(100 - deptTotal).toFixed(1)}% unallocated`
              : `${(deptTotal - 100).toFixed(1)}% over`}
          </div>
        )}
        {totalBudget > 0 && deptTotalAmount > 0 && Math.abs(deptTotalAmount - totalBudget) > totalBudget * 0.01 && (
          <div style={{ color: 'var(--accent-amber)', marginTop: 4, fontSize: 11 }}>
            ⚠ Dept total {fmtAmt(deptTotalAmount)} ≠ budget {fmtAmt(totalBudget)}
          </div>
        )}
      </div>
    </>
  )

  // ── Stage 5: Funding Installments ───────────────────────────────────────────

  const instTotal = extras.installments.reduce((s, i) => s + i.pct, 0)

  const stage5funding = (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Stage 5 — Funding Installments</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Enter the funding installment structure — when each tranche arrives and as what percentage of the total budget.</div>

      {extras.installments.map((inst, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <Label>Installment {i + 1} — Percentage</Label>
            <input
              type="number" value={inst.pct || ''}
              onChange={e => updateInstallment(i, 'pct', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()}
              placeholder="e.g. 40"
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Month of Receipt</Label>
            <input
              type="number" value={inst.month > 0 ? inst.month : ''}
              onChange={e => updateInstallment(i, 'month', Math.max(1, parseInt(e.target.value) || 0))}
              onBlur={e => { if (!e.target.value) updateInstallment(i, 'month', 1) }}
              onFocus={e => e.target.select()}
              placeholder="e.g. 1"
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <button
            onClick={() => removeInstallment(i)}
            style={{ marginTop: 18, padding: '9px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--accent-red)', cursor: 'pointer', fontSize: 13 }}
          >×</button>
        </div>
      ))}

      <button
        onClick={addInstallment}
        style={{ marginTop: 4, padding: '9px 20px', background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, width: '100%' }}
      >
        + Add Installment
      </button>

      {extras.installments.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 12 }}>
          <span style={{ color: Math.abs(instTotal - 100) < 1 ? 'var(--accent-green)' : 'var(--accent-amber)', fontWeight: 600 }}>
            Total: {instTotal.toFixed(1)}%
          </span>
          {Math.abs(instTotal - 100) >= 1 && (
            <span style={{ color: 'var(--accent-amber)', marginLeft: 10 }}>⚠ Should equal 100%</span>
          )}
        </div>
      )}
    </>
  )

  const stageContent = [stage1, stage2, stage3, stage4, stage5funding][stage - 1]

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Budget Questionnaire Wizard</div>
          <div style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Stage {stage} of {TOTAL_STAGES}</div>
        </div>
        {progress}
        {stageContent}
        {navRow}
      </div>
    </div>
  )
}

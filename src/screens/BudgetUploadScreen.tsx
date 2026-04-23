// Budget Upload flow:
// 1. Parse xlsx buffer → detected values
// 2. Confirmation screen — user reviews / corrects before commit
// 3. Missing data dialog — fill gaps inline, each with a Skip option
// 4. Commit detected + gap-filled values into the store

import { useState } from 'react'
import ExcelJS from 'exceljs'
import { parseBudgetBuffer, ParsedBudget } from '../utils/budgetParser'
import { useBudgetStore, DEPARTMENTS, DeptCode } from '../store/budgetStore'

interface BudgetUploadScreenProps {
  onDone: () => void
  onCancel: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{children}</div>
}

function FieldRow({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        style={{
          width: '100%', padding: '9px 12px',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 6, color: 'var(--text)', fontSize: 13,
          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

function Row({ label, value, detected }: { label: string; value: string; detected: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text3)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: detected ? 'var(--text)' : 'var(--text3)', maxWidth: 260, textAlign: 'right' }}>
        {value || <span style={{ color: 'var(--text3)', fontStyle: 'italic', fontWeight: 400 }}>Not detected</span>}
      </div>
      {detected && <div style={{ marginLeft: 10, fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'rgba(80,200,80,0.12)', padding: '2px 7px', borderRadius: 4 }}>✓</div>}
    </div>
  )
}

type Stage = 'parsing' | 'error' | 'confirm' | 'missing' | 'done'

// ─── Editable confirmation state ──────────────────────────────────────────────

interface EditableDetected {
  title: string
  company: string
  totalBudget: string
  currency: string
  shootDays: string
  productionFeePercent: string
  contingencyPercent: string
  vatRate: string
  whtRate: string
  developmentMonths: string
  preProdMonths: string
  shootMonths: string
  postMonths: string
  deptAllocations: Partial<Record<DeptCode, string>>
}

function toEditable(p: ParsedBudget): EditableDetected {
  return {
    title: p.title ?? '',
    company: p.company ?? '',
    totalBudget: p.totalBudget != null ? String(p.totalBudget) : '',
    currency: p.currency ?? '',
    shootDays: p.shootDays != null ? String(p.shootDays) : '',
    productionFeePercent: p.productionFeePercent != null ? String(p.productionFeePercent) : '',
    contingencyPercent: p.contingencyPercent != null ? String(p.contingencyPercent) : '',
    vatRate: p.vatRate != null ? String(p.vatRate) : '',
    whtRate: p.whtRate != null ? String(p.whtRate) : '',
    developmentMonths: p.developmentMonths != null ? String(p.developmentMonths) : '',
    preProdMonths: p.preProdMonths != null ? String(p.preProdMonths) : '',
    shootMonths: p.shootMonths != null ? String(p.shootMonths) : '',
    postMonths: p.postMonths != null ? String(p.postMonths) : '',
    deptAllocations: Object.fromEntries(
      Object.entries(p.deptAllocations).map(([k, v]) => [k, v != null ? String(v) : ''])
    ) as Partial<Record<DeptCode, string>>,
  }
}

// Fields that could not be detected go into the missing-data pass
interface MissingField { key: keyof EditableDetected | string; label: string; value: string; skipped: boolean }

function getMissingFields(ed: EditableDetected): MissingField[] {
  const fields: Array<[keyof EditableDetected, string]> = [
    ['title', 'Production Title'],
    ['company', 'Production Company'],
    ['totalBudget', 'Total Budget'],
    ['currency', 'Currency'],
    ['shootDays', 'Shoot Days'],
    ['productionFeePercent', 'Production Fee %'],
    ['contingencyPercent', 'Contingency %'],
    ['vatRate', 'VAT Rate %'],
    ['whtRate', 'WHT Rate %'],
    ['developmentMonths', 'Development (months)'],
    ['preProdMonths', 'Pre-Production (months)'],
    ['shootMonths', 'Shoot Period (months)'],
    ['postMonths', 'Post-Production (months)'],
  ]
  return fields
    .filter(([key]) => !ed[key])
    .map(([key, label]) => ({ key, label, value: '', skipped: false }))
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BudgetUploadScreen({ onDone, onCancel }: BudgetUploadScreenProps) {
  const [stage, setStage] = useState<Stage>('parsing')
  const [parseError, setParseError] = useState('')
  const [parsed, setParsed] = useState<ParsedBudget | null>(null)
  const [editable, setEditable] = useState<EditableDetected | null>(null)
  const [missing, setMissing] = useState<MissingField[]>([])
  const store = useBudgetStore()

  // Trigger parsing as soon as the component mounts
  useState(() => {
    handleUpload()
  })

  async function handleUpload() {
    if (!window.electronAPI) { setParseError('Electron API not available.'); setStage('error'); return }
    const res = await window.electronAPI.openXlsxBudget()
    if (!res.success || !res.buffer) { onCancel(); return }

    try {
      const wb = new ExcelJS.Workbook()
      const arrayBuf = new Uint8Array(res.buffer).buffer
      const result = await parseBudgetBuffer(arrayBuf)
      setParsed(result)
      setEditable(toEditable(result))
      setStage('confirm')
    } catch (err) {
      setParseError(String(err))
      setStage('error')
    }
  }

  function handleConfirm() {
    if (!editable) return
    const gaps = getMissingFields(editable)
    if (gaps.length > 0) {
      setMissing(gaps)
      setStage('missing')
    } else {
      commitToStore(editable, [])
    }
  }

  function handleMissingDone() {
    if (!editable) return
    commitToStore(editable, missing)
  }

  function commitToStore(ed: EditableDetected, missingFields: MissingField[]) {
    // Merge gap-fill answers back into editable
    const merged = { ...ed }
    for (const mf of missingFields) {
      if (!mf.skipped && mf.value.trim()) {
        if (mf.key !== 'deptAllocations') {
        (merged as unknown as Record<string, string>)[mf.key as string] = mf.value.trim()
      }
      }
    }

    const n = (s: string) => { const v = parseFloat(s); return isNaN(v) ? 0 : v }

    store.setProject({
      title: merged.title || undefined,
      company: merged.company || undefined,
      totalBudget: merged.totalBudget ? n(merged.totalBudget) : undefined,
      currency: merged.currency || undefined,
      shootDays: merged.shootDays ? n(merged.shootDays) : undefined,
      productionFeePercent: merged.productionFeePercent ? n(merged.productionFeePercent) : undefined,
    })

    store.setTimeline({
      developmentMonths: merged.developmentMonths ? n(merged.developmentMonths) : undefined,
      preProdMonths: merged.preProdMonths ? n(merged.preProdMonths) : undefined,
      shootMonths: merged.shootMonths ? n(merged.shootMonths) : undefined,
      postMonths: merged.postMonths ? n(merged.postMonths) : undefined,
    })

    // Department allocations
    for (const [code, val] of Object.entries(merged.deptAllocations)) {
      if (val && n(val) > 0) store.setDeptAllocation(code as DeptCode, n(val))
    }

    // Line items from parsed (not editable in confirm screen — too complex)
    if (parsed) {
      for (const [code, items] of Object.entries(parsed.lineItems)) {
        if (items && items.length > 0) store.setLineItems(code as DeptCode, items)
      }
    }

    onDone()
  }

  function updateEditable(key: keyof EditableDetected, value: string) {
    setEditable(prev => prev ? { ...prev, [key]: value } : prev)
  }

  // ─── Stage: parsing ──────────────────────────────────────────────────────

  if (stage === 'parsing') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Reading budget file…</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Please select your Excel budget in the dialog</div>
        </div>
      </div>
    )
  }

  // ─── Stage: error ────────────────────────────────────────────────────────

  if (stage === 'error') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Could not read this file</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>{parseError || 'The selected file could not be parsed. Please ensure it is a valid Excel workbook.'}</div>
          <button onClick={onCancel} style={{ padding: '10px 24px', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Back to Home</button>
        </div>
      </div>
    )
  }

  // ─── Stage: confirm ──────────────────────────────────────────────────────

  if (stage === 'confirm' && editable) {
    const detectedCount = [
      editable.title, editable.company, editable.totalBudget, editable.currency,
      editable.shootDays, editable.productionFeePercent, editable.contingencyPercent,
      editable.vatRate, editable.whtRate,
      editable.developmentMonths, editable.preProdMonths, editable.shootMonths, editable.postMonths,
    ].filter(Boolean).length

    return (
      <div style={{ height: '100vh', overflow: 'auto', background: 'var(--bg)', padding: '40px 0' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 32px' }}>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Review Detected Data</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
              The following information was detected from your uploaded budget. Review and correct any values before confirming — changes made here will be committed to the project.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
              {detectedCount} field{detectedCount !== 1 ? 's' : ''} detected
            </div>
          </div>

          {/* Project Details */}
          <section style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Project Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <FieldRow label="Production Title" value={editable.title} onChange={v => updateEditable('title', v)} />
              <FieldRow label="Production Company" value={editable.company} onChange={v => updateEditable('company', v)} />
              <FieldRow label="Total Budget" value={editable.totalBudget} onChange={v => updateEditable('totalBudget', v)} type="number" />
              <FieldRow label="Currency" value={editable.currency} onChange={v => updateEditable('currency', v)} placeholder="e.g. NGN" />
              <FieldRow label="Shoot Days" value={editable.shootDays} onChange={v => updateEditable('shootDays', v)} type="number" />
            </div>
          </section>

          {/* Assumptions */}
          <section style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Assumptions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <FieldRow label="Production Fee %" value={editable.productionFeePercent} onChange={v => updateEditable('productionFeePercent', v)} type="number" placeholder="e.g. 10" />
              <FieldRow label="Contingency %" value={editable.contingencyPercent} onChange={v => updateEditable('contingencyPercent', v)} type="number" placeholder="e.g. 5" />
              <FieldRow label="VAT Rate %" value={editable.vatRate} onChange={v => updateEditable('vatRate', v)} type="number" placeholder="e.g. 7.5" />
              <FieldRow label="WHT Rate %" value={editable.whtRate} onChange={v => updateEditable('whtRate', v)} type="number" placeholder="e.g. 5" />
            </div>
          </section>

          {/* Timeline */}
          <section style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Production Timeline (months)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <FieldRow label="Development" value={editable.developmentMonths} onChange={v => updateEditable('developmentMonths', v)} type="number" placeholder="e.g. 1" />
              <FieldRow label="Pre-Production" value={editable.preProdMonths} onChange={v => updateEditable('preProdMonths', v)} type="number" placeholder="e.g. 2" />
              <FieldRow label="Shoot Period" value={editable.shootMonths} onChange={v => updateEditable('shootMonths', v)} type="number" placeholder="e.g. 1" />
              <FieldRow label="Post-Production" value={editable.postMonths} onChange={v => updateEditable('postMonths', v)} type="number" placeholder="e.g. 3" />
            </div>
          </section>

          {/* Dept allocations */}
          {Object.keys(editable.deptAllocations).length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Department Allocations Detected</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                {(Object.entries(editable.deptAllocations) as [DeptCode, string][]).map(([code, val]) => {
                  const dept = DEPARTMENTS.find(d => d.code === code)
                  return (
                    <FieldRow
                      key={code}
                      label={`${code} — ${dept?.name ?? code}`}
                      value={val}
                      onChange={v => setEditable(prev => prev ? { ...prev, deptAllocations: { ...prev.deptAllocations, [code]: v } } : prev)}
                      type="number"
                    />
                  )
                })}
              </div>
            </section>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button onClick={onCancel} style={{ padding: '11px 24px', background: 'transparent', color: 'var(--text3)', fontWeight: 600, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleConfirm} style={{ padding: '11px 28px', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Confirm & Continue →</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Stage: missing data ─────────────────────────────────────────────────

  if (stage === 'missing') {
    const activeMissing = missing.filter(f => !f.skipped)
    return (
      <div style={{ height: '100vh', overflow: 'auto', background: 'var(--bg)', padding: '40px 0' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 32px' }}>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Fill Missing Information</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
              The following information could not be detected from your uploaded budget. Would you like to fill these in now? Each field has a Skip option — skipped fields remain blank and can be filled later from within the app.
            </div>
          </div>

          {missing.map((mf, idx) => (
            <div key={mf.key} style={{ marginBottom: 14, opacity: mf.skipped ? 0.4 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Label>{mf.label}</Label>
                <button
                  onClick={() => setMissing(prev => prev.map((f, i) => i === idx ? { ...f, skipped: !f.skipped } : f))}
                  style={{ fontSize: 11, fontWeight: 600, color: mf.skipped ? 'var(--accent)' : 'var(--text3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                >
                  {mf.skipped ? 'Undo skip' : 'Skip'}
                </button>
              </div>
              {!mf.skipped && (
                <input
                  type="text"
                  value={mf.value}
                  onChange={e => setMissing(prev => prev.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))}
                  placeholder="—"
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text)', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              )}
            </div>
          ))}

          {activeMissing.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20, fontStyle: 'italic' }}>All remaining fields have been skipped. You can fill them in from within the app.</div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16 }}>
            <button onClick={() => setStage('confirm')} style={{ padding: '11px 20px', background: 'transparent', color: 'var(--text3)', fontWeight: 600, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>← Back</button>
            <button onClick={handleMissingDone} style={{ padding: '11px 28px', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Load into Project →</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

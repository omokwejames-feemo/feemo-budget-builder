import { useState, useRef, useCallback } from 'react'
import {
  useBudgetStore, DEPARTMENTS, DeptCode,
  isSeriesFormat, isTelenovela, isEpisodic,
  calcSeriesShootDays, calcSeriesShootMonths,
  calcTeleShootDays, calcTeleShootMonths,
  isAutofillReady, TEMPLATE_JURIYA, TEMPLATE_BC,
} from '../store/budgetStore'
import { JURIYA_FULL, BC_FULL } from '../export/templateData'
import { applyFullTemplate, applyParsedBudget } from '../export/applyTemplate'
import { parseUploadedBudget } from '../export/parseUploadedBudget'
import { Issue } from '../hooks/useIssueDetector'

const CURRENCIES = [
  { value: '₦', label: '₦  NGN — Nigerian Naira', foreign: false },
  { value: '$', label: '$  USD — US Dollar',       foreign: true  },
  { value: '£', label: '£  GBP — British Pound',  foreign: true  },
]

function fmt(n: number, currency = '₦') {
  if (!n) return '—'
  const sym = currency || '₦'
  return `${sym}${n.toLocaleString()}`
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, marginBottom: 8,
      background: issue.severity === 'error' ? 'rgba(231,76,60,0.08)' : 'rgba(245,166,35,0.08)',
      border: `1px solid ${issue.severity === 'error' ? 'rgba(231,76,60,0.3)' : 'rgba(245,166,35,0.3)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
          {issue.severity === 'error' ? '✕' : '⚠'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: issue.severity === 'error' ? 'var(--red)' : 'var(--accent)',
            marginBottom: 3,
          }}>{issue.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{issue.description}</div>
          {issue.fixLabel && issue.onFix && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8, fontSize: 11, padding: '3px 10px' }}
              onClick={issue.onFix}
            >{issue.fixLabel}</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AssumptionsDashboard({ issues = [] }: { issues?: Issue[] }) {
  const {
    project, setProject,
    timeline, setTimeline,
    installments, setInstallments,
    deptAllocations, setDeptAllocation,
    resetStore, resetTimeline, resetInstallments, resetDeptAllocations,
    companyProfile, setCompanyProfile,
  } = useBudgetStore()

  const [autofillConfirm, setAutofillConfirm] = useState<'juriya' | 'bc' | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setCompanyProfile({ logoDataUrl: dataUrl })
    }
    reader.readAsDataURL(file)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }, [setCompanyProfile])

  const isSeries = isSeriesFormat(project.format)
  const isTele = isTelenovela(project.format)
  const isEp = isEpisodic(project.format)
  const totalPct = Object.values(deptAllocations).reduce((s, v) => s + v, 0)
  const pctClass = Math.abs(totalPct - 100) < 0.01 ? 'ok' : totalPct > 100 ? 'over' : 'under'
  const totalMonths = timeline.developmentMonths + timeline.preProdMonths + timeline.shootMonths + timeline.postMonths
  const autofillReady = isAutofillReady(project, timeline, installments)

  // Section completion checks (for autofill gate)
  const detailsComplete = !!project.title && project.totalBudget > 0 && !!project.startDate && !!project.location
  const timelineComplete = timeline.developmentMonths > 0 && timeline.preProdMonths > 0 && timeline.postMonths > 0
  const instTotal = installments.reduce((s, i) => s + i.percentage, 0)
  const instComplete = installments.length > 0 && Math.abs(instTotal - 100) < 0.1

  function recalcShoot(format: string, episodes: number, weeksPerEpisode: number, daysPerEpisode: number) {
    if (isSeriesFormat(format)) {
      const shootDays = calcSeriesShootDays(episodes, weeksPerEpisode)
      const shootMonths = calcSeriesShootMonths(episodes, weeksPerEpisode)
      setProject({ shootDays })
      setTimeline({ shootMonths })
    } else if (isTelenovela(format)) {
      const shootDays = calcTeleShootDays(episodes, daysPerEpisode)
      const shootMonths = calcTeleShootMonths(episodes, daysPerEpisode)
      setProject({ shootDays })
      setTimeline({ shootMonths })
    }
  }

  function handleFormatChange(format: string) {
    setProject({ format })
    recalcShoot(format, project.episodes, project.weeksPerEpisode, project.daysPerEpisode)
  }

  function handleEpisodeChange(episodes: number) {
    setProject({ episodes })
    recalcShoot(project.format, episodes, project.weeksPerEpisode, project.daysPerEpisode)
  }

  function handleWeeksPerEpisodeChange(weeks: number) {
    setProject({ weeksPerEpisode: weeks })
    recalcShoot(project.format, project.episodes, weeks, project.daysPerEpisode)
  }

  function handleDaysPerEpisodeChange(days: number) {
    setProject({ daysPerEpisode: days })
    recalcShoot(project.format, project.episodes, project.weeksPerEpisode, days)
  }

  const store = useBudgetStore()

  function applyTemplate(templateId: 'juriya' | 'bc') {
    const tpl = templateId === 'juriya' ? JURIYA_FULL : BC_FULL
    const pcts = templateId === 'juriya' ? TEMPLATE_JURIYA : TEMPLATE_BC
    applyFullTemplate(tpl, store, pcts as Partial<Record<DeptCode, number>>)
    setAutofillConfirm(null)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus('parsing')
    setUploadMsg(`Parsing ${file.name}…`)
    try {
      const parsed = await parseUploadedBudget(file)
      applyParsedBudget(parsed, store)
      const warnings = parsed.warnings.length ? ` (${parsed.warnings.join('; ')})` : ''
      setUploadStatus('done')
      setUploadMsg(`Imported ${file.name}${warnings}`)
    } catch (err) {
      setUploadStatus('error')
      setUploadMsg(`Failed to parse: ${String(err)}`)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateInstallment(id: string, key: string, value: string | number) {
    setInstallments(installments.map(i => i.id === id ? { ...i, [key]: value } : i))
  }

  function addInstallment() {
    setInstallments([...installments, {
      id: String(Date.now()),
      label: `Installment ${installments.length + 1}`,
      percentage: 0, trigger: '', month: 1,
    }])
  }

  function removeInstallment(id: string) {
    setInstallments(installments.filter(i => i.id !== id))
  }

  const sectionMark = (done: boolean) => (
    <span style={{ fontSize: 13, color: done ? 'var(--green)' : 'var(--text3)' }}>{done ? '✓' : '○'}</span>
  )

  return (
    <div className="screen">
      <div className="screen-header">
        <div className="screen-title">Assumptions Dashboard</div>
        <div className="screen-sub">All other sheets auto-calculate from inputs here.</div>
      </div>

      {/* ── Company Profile ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Company Profile</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Optional — appears on all exported documents</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Logo upload */}
            <div style={{ flexShrink: 0 }}>
              <div
                onClick={() => logoInputRef.current?.click()}
                style={{
                  width: 88, height: 88, borderRadius: 10,
                  border: '2px dashed var(--border)',
                  background: 'var(--bg3)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                  transition: 'border-color 0.15s',
                  position: 'relative',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                {companyProfile.logoDataUrl ? (
                  <>
                    <img
                      src={companyProfile.logoDataUrl}
                      alt="Company logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                      fontSize: 11, color: '#fff', fontWeight: 600,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                    >
                      Change
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 22, marginBottom: 4 }}>🖼</span>
                    <span style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.3 }}>Upload Logo</span>
                  </>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />
              {companyProfile.logoDataUrl && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', marginTop: 4, fontSize: 10 }}
                  onClick={() => setCompanyProfile({ logoDataUrl: '' })}
                >
                  Remove
                </button>
              )}
            </div>

            {/* Fields */}
            <div style={{ flex: 1 }}>
              <div className="form-grid form-grid-2" style={{ marginBottom: 10 }}>
                <div className="field">
                  <label>Company Name</label>
                  <input
                    value={companyProfile.name}
                    onChange={e => setCompanyProfile({ name: e.target.value })}
                    placeholder="e.g. Feemovision"
                  />
                </div>
                <div className="field">
                  <label>Contact Email</label>
                  <input
                    type="email"
                    value={companyProfile.email}
                    onChange={e => setCompanyProfile({ email: e.target.value })}
                    placeholder="e.g. info@feemovision.com"
                  />
                </div>
              </div>
              <div className="form-grid form-grid-2">
                <div className="field">
                  <label>Company Address</label>
                  <input
                    value={companyProfile.address}
                    onChange={e => setCompanyProfile({ address: e.target.value })}
                    placeholder="e.g. 12 Film House, Lagos"
                  />
                </div>
                <div className="field">
                  <label>Contact Phone</label>
                  <input
                    value={companyProfile.phone}
                    onChange={e => setCompanyProfile({ phone: e.target.value })}
                    placeholder="e.g. +234 800 000 0000"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Project Details ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Project Details</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--text3)' }}
              onClick={() => {
                if (confirm('Reset all project fields to blank?')) resetStore()
              }}
            >
              Reset
            </button>
            {sectionMark(detailsComplete)}
          </div>
        </div>
        <div className="card-body">
          <div className="form-grid form-grid-2" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Production Title *</label>
              <input value={project.title} onChange={e => setProject({ title: e.target.value })} placeholder="e.g. Ajoche" />
            </div>
            <div className="field">
              <label>Production Company</label>
              <input value={project.company} onChange={e => setProject({ company: e.target.value })} placeholder="e.g. Feemovision" />
            </div>
          </div>
          <div className="form-grid form-grid-4" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Total Budget *</label>
              <input type="number" value={project.totalBudget || ''} onChange={e => setProject({ totalBudget: Number(e.target.value) })} placeholder="250000000" />
            </div>
            <div className="field">
              <label>Production Fee %</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={project.productionFeePercent ?? 5}
                  onChange={e => {
                    const newFee = parseFloat(e.target.value) || 0
                    setProject({ productionFeePercent: newFee })
                    setDeptAllocation('II', newFee)
                    // Rescale all other dept allocations so total stays 100%
                    const nonIISum = DEPARTMENTS
                      .filter(d => d.code !== 'II')
                      .reduce((sum, d) => sum + (deptAllocations[d.code as DeptCode] || 0), 0)
                    if (nonIISum > 0) {
                      const targetSum = 100 - newFee
                      const scale = targetSum / nonIISum
                      DEPARTMENTS.filter(d => d.code !== 'II').forEach(d => {
                        const scaled = Math.round((deptAllocations[d.code as DeptCode] || 0) * scale * 100) / 100
                        setDeptAllocation(d.code as DeptCode, scaled)
                      })
                    }
                  }}
                  style={{ flex: 1 }}
                />
                {project.totalBudget > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    = {fmt(project.totalBudget * (project.productionFeePercent ?? 5) / 100, project.currency)}
                  </span>
                )}
              </div>
            </div>
            <div className="field">
              <label>Currency</label>
              <select
                value={project.currency || '₦'}
                onChange={e => {
                  const cur = e.target.value
                  const isForeign = CURRENCIES.find(c => c.value === cur)?.foreign ?? false
                  setProject({ currency: cur, exchangeRate: isForeign ? (project.exchangeRate || 1) : 1 })
                }}
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Format</label>
              <select value={project.format} onChange={e => handleFormatChange(e.target.value)}>
                <option>Feature Film</option>
                <option>TV Series</option>
                <option>Web Series</option>
                <option>Telenovela</option>
                <option>Short Film</option>
                <option>Documentary</option>
              </select>
            </div>
            {/* Runtime for film; episodes for series/telenovela */}
            {isEp ? (
              <div className="field">
                <label>Episodes</label>
                <input
                  type="number"
                  min={1}
                  value={project.episodes || ''}
                  onChange={e => handleEpisodeChange(Number(e.target.value))}
                />
              </div>
            ) : (
              <div className="field">
                <label>Runtime (mins)</label>
                <input type="number" value={project.duration || ''} onChange={e => setProject({ duration: Number(e.target.value) })} />
              </div>
            )}
          </div>

          {/* Exchange rate panel — shown when foreign currency is selected */}
          {CURRENCIES.find(c => c.value === (project.currency || '₦'))?.foreign && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '10px 14px', marginBottom: 14,
              background: 'rgba(52,152,219,0.06)',
              border: '1px solid rgba(52,152,219,0.2)',
              borderRadius: 6,
            }}>
              <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>Exchange Rate</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>1 {project.currency} =</span>
              <input
                type="number"
                min={1}
                step={1}
                value={project.exchangeRate || ''}
                onChange={e => setProject({ exchangeRate: Number(e.target.value) || 1 })}
                placeholder="e.g. 1600"
                style={{ width: 110 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>₦</span>
              {project.totalBudget > 0 && project.exchangeRate > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
                  Budget ≈ {project.currency}{(project.totalBudget / project.exchangeRate).toLocaleString('en', { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
          )}

          {/* Episodic panel — series uses weeks, telenovela uses days */}
          {isEp && (
            <div
              className="form-grid"
              style={{
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                marginBottom: 14,
                padding: '12px 14px',
                background: isTele ? 'rgba(155,89,182,0.05)' : 'rgba(245,166,35,0.05)',
                border: `1px solid ${isTele ? 'rgba(155,89,182,0.2)' : 'rgba(245,166,35,0.15)'}`,
                borderRadius: 6,
              }}
            >
              <div className="field">
                <label>Episode Duration (mins)</label>
                <input
                  type="number"
                  min={1}
                  value={project.episodeDuration || ''}
                  onChange={e => setProject({ episodeDuration: Number(e.target.value) })}
                />
              </div>

              {isTele ? (
                <div className="field">
                  <label>Shoot Days / Episode</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={project.daysPerEpisode || ''}
                    onChange={e => handleDaysPerEpisodeChange(Number(e.target.value))}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                    e.g. 1 day per episode (fast daily shoot)
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>Shoot Weeks / Episode</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={project.weeksPerEpisode || ''}
                    onChange={e => handleWeeksPerEpisodeChange(Number(e.target.value))}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                    Default: 1 week per 45-min episode
                  </div>
                </div>
              )}

              <div className="field">
                <label>Total Shoot Days (auto)</label>
                <div style={{
                  padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 5, fontSize: 13, fontWeight: 700,
                  color: isTele ? '#9b59b6' : 'var(--accent)',
                }}>
                  {project.shootDays} days
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                  {isTele
                    ? `${project.episodes} eps × ${project.daysPerEpisode} day(s)`
                    : `${project.episodes} eps × ${project.weeksPerEpisode}w × 5 days`}
                </div>
              </div>

              <div className="field">
                <label>Total Duration (mins)</label>
                <div style={{
                  padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 5, fontSize: 13, fontWeight: 700, color: 'var(--text)',
                }}>
                  {project.episodes * project.episodeDuration} mins
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                  {project.episodes} eps × {project.episodeDuration} mins
                </div>
              </div>
            </div>
          )}

          <div className="form-grid form-grid-3">
            {!isEp && (
              <div className="field">
                <label>Shoot Days</label>
                <input type="number" value={project.shootDays || ''} onChange={e => setProject({ shootDays: Number(e.target.value) })} />
              </div>
            )}
            <div className="field">
              <label>Shoot Location *</label>
              <input value={project.location} onChange={e => setProject({ location: e.target.value })} placeholder="e.g. Lagos" />
            </div>
            <div className="field">
              <label>Production Start Date *</label>
              <input type="month" value={project.startDate} onChange={e => setProject({ startDate: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Production Timeline ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Production Timeline</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Total: <strong style={{ color: 'var(--accent)' }}>{totalMonths} months</strong></span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--text3)' }}
              onClick={() => { if (confirm('Reset Production Timeline to empty?')) resetTimeline() }}
            >Reset</button>
            {sectionMark(timelineComplete)}
          </div>
        </div>
        <div className="card-body">
          {issues.filter(i => i.screen === 'timeline').map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
          <div className="form-grid form-grid-4">
            {[
              { key: 'developmentMonths', label: 'Development (months)', phase: 'dev' },
              { key: 'preProdMonths', label: 'Pre-Production (months)', phase: 'pre' },
              { key: 'shootMonths', label: 'Shoot (months)', phase: 'shoot', auto: isSeries },
              { key: 'postMonths', label: 'Post-Production (months)', phase: 'post' },
            ].map(({ key, label, phase, auto }) => (
              <div className="field" key={key}>
                <label>
                  {label}
                  {auto && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>AUTO</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  value={timeline[key as keyof typeof timeline] || ''}
                  onChange={e => setTimeline({ [key]: Number(e.target.value) })}
                  style={auto ? { borderColor: 'rgba(245,166,35,0.4)', color: 'var(--accent)' } : undefined}
                />
                <div style={{ marginTop: 4 }}>
                  <span className={`badge badge-${phase}`}>
                    {phase === 'dev' ? 'DEV' : phase === 'pre' ? 'PRE-PROD' : phase === 'shoot' ? 'SHOOT' : 'POST'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {isEp && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', padding: '8px 10px', background: isTele ? 'rgba(155,89,182,0.05)' : 'rgba(245,166,35,0.05)', borderRadius: 5 }}>
              {isTele
                ? <>Shoot months auto-calculated from {project.episodes} episodes × {project.daysPerEpisode} day(s)/episode ÷ 20 shoot days/month = <strong style={{ color: '#9b59b6' }}>{timeline.shootMonths} months</strong>. Adjust manually if needed.</>
                : <>Shoot months auto-calculated from {project.episodes} episodes × {project.weeksPerEpisode} week(s)/episode ÷ 4 weeks/month = <strong style={{ color: 'var(--accent)' }}>{timeline.shootMonths} months</strong>. Adjust manually if needed.</>
              }
            </div>
          )}
        </div>
      </div>

      {/* ── Funding Installments ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Funding Installments</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={addInstallment}>+ Add</button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--text3)' }}
              onClick={() => { if (installments.length === 0 || confirm('Remove all installments?')) resetInstallments() }}
            >Reset</button>
            {sectionMark(instComplete)}
          </div>
        </div>
        <div className="card-body">
          {issues.filter(i => i.screen === 'installments').map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 2fr 60px 80px auto', gap: '8px', marginBottom: 8 }}>
            {['Label', '%', 'Trigger / Milestone', 'Month', 'Amount', ''].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 4 }}>{h}</div>
            ))}
          </div>
          {installments.map(inst => (
            <div key={inst.id} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 2fr 60px 80px auto', gap: '8px', alignItems: 'center', marginBottom: 8 }}>
              <input className="td-input" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px' }} value={inst.label} onChange={e => updateInstallment(inst.id, 'label', e.target.value)} />
              <input className="td-input" type="number" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', textAlign: 'right' }} value={inst.percentage || ''} onChange={e => updateInstallment(inst.id, 'percentage', Number(e.target.value))} />
              <input className="td-input" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px' }} value={inst.trigger} onChange={e => updateInstallment(inst.id, 'trigger', e.target.value)} placeholder="Milestone..." />
              <input className="td-input" type="number" min={1} max={totalMonths} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }} value={inst.month || ''} onChange={e => updateInstallment(inst.id, 'month', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt((inst.percentage / 100) * project.totalBudget, project.currency)}
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => removeInstallment(inst.id)}>✕</button>
            </div>
          ))}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text2)' }}>Total:</span>
            <span style={{ fontWeight: 700, color: Math.abs(instTotal - 100) < 0.1 ? 'var(--green)' : 'var(--red)' }}>
              {instTotal}%
            </span>
            {Math.abs(instTotal - 100) > 0.1 && (
              <span style={{ color: 'var(--red)', fontSize: 11 }}>⚠ Must equal 100%</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Department % Allocations ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Department % Allocations</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>Sets budget target for every department</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--text3)' }}
              onClick={() => { if (confirm('Reset all department allocations to 0%?')) resetDeptAllocations() }}
            >Reset</button>
          </div>
        </div>
        <div className="card-body">
          <div className="allocation-grid">
            {DEPARTMENTS.map(dept => {
              const pct = deptAllocations[dept.code as DeptCode] || 0
              const amt = (pct / 100) * project.totalBudget
              return (
                <div className="alloc-row" key={dept.code}>
                  <span className="alloc-code">{dept.code}</span>
                  <span className="alloc-name" title={dept.name}>{dept.name}</span>
                  <div className="alloc-pct">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={pct > 0 ? parseFloat(pct.toFixed(2)) : ''}
                      onChange={e => setDeptAllocation(dept.code as DeptCode, Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <span className="alloc-n">{pct > 0 ? fmt(amt, project.currency) : '—'}</span>
                </div>
              )
            })}
          </div>
          <div className="total-bar">
            <span className="total-bar-label">Total allocated:</span>
            <span className={`total-bar-pct ${pctClass}`}>{totalPct.toFixed(1)}%</span>
            {pctClass === 'over' && <span style={{ color: 'var(--red)', fontSize: 12 }}>⚠ Over 100%</span>}
            {pctClass === 'under' && totalPct > 0 && <span style={{ color: 'var(--accent)', fontSize: 12 }}>{(100 - totalPct).toFixed(1)}% unallocated</span>}
            {pctClass === 'ok' && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ Fully allocated</span>}
            <span style={{ marginLeft: 'auto', color: 'var(--text2)', fontSize: 12 }}>
              Allocated: <strong style={{ color: 'var(--text)' }}>{fmt((totalPct / 100) * project.totalBudget, project.currency)}</strong>
              {' '}of {fmt(project.totalBudget, project.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Generate from Template ── */}
      <div className="card" style={{ border: autofillReady ? '1px solid rgba(245,166,35,0.3)' : '1px solid var(--border)' }}>
        <div className="card-header">
          <span className="card-title">Generate from Template</span>
          {!autofillReady && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Complete Project Details, Timeline & Installments first
            </span>
          )}
        </div>
        <div className="card-body">
          {!autofillReady ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                Generates dept % allocations, production budget line items, and salary roles from a reference budget. Available once:
              </div>
              {[
                { label: 'Project title, budget, location & start date entered', done: detailsComplete },
                { label: 'Production timeline set (all phases > 0 months)', done: timelineComplete },
                { label: 'Funding installments total exactly 100%', done: instComplete },
              ].map(c => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: c.done ? 'var(--green)' : 'var(--text3)' }}>{c.done ? '✓' : '○'}</span>
                  <span style={{ color: c.done ? 'var(--text)' : 'var(--text2)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
                Choose a preloaded reference template, or upload your own .xlsx budget. All sheets will be pre-populated and remain fully editable.
              </div>

              {/* Template cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                {([
                  {
                    id: 'juriya' as const,
                    title: 'Ajoche — Feature Film',
                    desc: 'N250M · 9 months · 3 installments (10/80/10)',
                    tags: 'Camera 8.9% · Set 8.9% · Accommodation 16% · Post 9.8%',
                    items: `${Object.values(JURIYA_FULL.lineItems).flat().length} line items · ${JURIYA_FULL.salaryRoles.length} salary roles`,
                  },
                  {
                    id: 'bc' as const,
                    title: 'British Council — TV Series',
                    desc: 'N548M · 8 months · 6 payment tranches',
                    tags: 'Camera 15.5% · Accommodation 17.9% · Set 8.8% · Post 6.1%',
                    items: `${Object.values(BC_FULL.lineItems).flat().length} line items · ${BC_FULL.salaryRoles.length} salary roles`,
                  },
                ] as const).map(tpl => (
                  <div key={tpl.id} style={{
                    border: autofillConfirm === tpl.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 8, padding: 16, background: 'var(--bg3)',
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{tpl.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.5 }}>{tpl.desc}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 10 }}>{tpl.tags}</div>
                    <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 12, fontWeight: 600 }}>{tpl.items}</div>
                    {autofillConfirm === tpl.id ? (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8, padding: '6px 8px', background: 'rgba(245,166,35,0.08)', borderRadius: 4 }}>
                          ⚠ Overwrites all current dept allocations, line items & salary roles.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => applyTemplate(tpl.id)}>Confirm Apply</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAutofillConfirm(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setAutofillConfirm(tpl.id)}>
                        Use this template →
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Upload own template */}
              <div style={{
                border: '1px dashed var(--border)',
                borderRadius: 8,
                padding: '14px 16px',
                background: 'var(--bg3)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Upload Your Own Budget (.xlsx)</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                      Import from an existing budget file. The app reads <strong style={{ color: 'var(--text)' }}>ASSUMPTIONS</strong>, <strong style={{ color: 'var(--text)' }}>PRODUCTION BUDGET</strong>, and <strong style={{ color: 'var(--text)' }}>SALARY FORECAST</strong> sheets automatically.
                    </div>
                    {uploadStatus !== 'idle' && (
                      <div style={{
                        marginTop: 8, fontSize: 11,
                        color: uploadStatus === 'done' ? 'var(--green)' : uploadStatus === 'error' ? 'var(--red)' : 'var(--text2)',
                      }}>
                        {uploadStatus === 'parsing' && '⏳ '}
                        {uploadStatus === 'done' && '✓ '}
                        {uploadStatus === 'error' && '✕ '}
                        {uploadMsg}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 16 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadStatus === 'parsing'}
                    >
                      {uploadStatus === 'parsing' ? 'Parsing…' : 'Choose .xlsx file'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

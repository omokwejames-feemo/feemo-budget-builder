import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DEPARTMENTS = [
  { code: 'A', name: 'Research & Development' },
  { code: 'B', name: 'Script' },
  { code: 'C', name: 'Producer' },
  { code: 'D', name: 'Director' },
  { code: 'E', name: 'Talent / Cast' },
  { code: 'F', name: 'Production Staff' },
  { code: 'G', name: 'Camera Department' },
  { code: 'H', name: 'Sound Department' },
  { code: 'I', name: 'Lighting Department' },
  { code: 'J', name: 'Art Department' },
  { code: 'K', name: 'Set Department' },
  { code: 'L', name: 'Props Department' },
  { code: 'M', name: 'Wardrobe' },
  { code: 'N', name: 'Make-up / SFX / Hair' },
  { code: 'O', name: 'Picture Vehicles' },
  { code: 'P', name: 'Studio / OB Facilities' },
  { code: 'Q', name: 'Locations' },
  { code: 'R', name: 'Vehicles' },
  { code: 'S', name: 'Travel' },
  { code: 'T', name: 'Accommodation & Meals' },
  { code: 'AA', name: 'Stock' },
  { code: 'DD', name: 'Graphics' },
  { code: 'EE', name: 'Music' },
  { code: 'FF', name: 'Post Production' },
  { code: 'GG', name: 'Overheads' },
  { code: 'HH', name: 'Insurance' },
  { code: 'II', name: 'Contingency / Production Fee' },
] as const

export type DeptCode = typeof DEPARTMENTS[number]['code']

export interface Installment {
  id: string
  label: string
  percentage: number
  trigger: string
  month: number
}

export interface CompanyProfile {
  logoDataUrl: string   // base64 data URL of company logo
  name: string
  address: string
  email: string
  phone: string
}

export interface PaymentScheduleRow {
  id: string
  payeeName: string
  description: string
  budgetCode: string    // must match a DeptCode
  department: string    // auto-resolved from budgetCode
  bankName: string
  accountNumber: string
  paymentValue: number
  vatRate: number       // % — may differ from global
  whtRate: number       // % — may differ from global
  // amountPayable = paymentValue + (paymentValue * vatRate/100) - (paymentValue * whtRate/100)
}

export interface PaymentSchedule {
  id: string
  scheduleNumber: string  // e.g. PS-001
  globalVatRate: number
  globalWhtRate: number
  rows: PaymentScheduleRow[]
  preparedBy: string
  reviewedBy: string
  approvedBy: string
  createdAt: string
  status: 'draft' | 'exported' | 'approved'
  signedPdfPath?: string
}

export interface ExpenditureDeduction {
  scheduleId: string
  scheduleNumber: string
  budgetCode: string
  department: string
  amount: number
  approvedAt: string
}

export interface ProjectDetails {
  title: string
  company: string
  totalBudget: number
  format: string
  duration: number        // runtime for film/other
  episodes: number        // only for series / telenovela
  episodeDuration: number // mins per episode
  weeksPerEpisode: number // shoot weeks per episode (series/web series)
  daysPerEpisode: number  // shoot days per episode (telenovela)
  shootDays: number
  location: string
  currency: string
  exchangeRate: number    // units of NGN per 1 foreign currency unit (1 for NGN)
  startDate: string
  productionFeePercent: number // % of total budget charged as production fee
}

export interface Timeline {
  developmentMonths: number
  preProdMonths: number
  shootMonths: number
  postMonths: number
}

export interface LineItem {
  id: string
  schedNo: string
  detail: string
  no: number   // count of people/items (e.g. 2 Production Managers)
  qty: number  // duration/multiplier (e.g. 3 months)
  rate: number
  unit: string
  ie: 'I' | 'E'
}

export interface SalaryRole {
  id: string
  schedNo: string
  role: string
  deptCode: DeptCode
  phase: 'dev' | 'pre' | 'shoot' | 'post' | 'all'
  monthlyAmounts: Record<number, number>
}

// ─── App notices (persisted with project) ────────────────────────────────────

export interface AppNotice {
  id: string
  message: string
  timestamp: string
  type: 'rounding' | 'conflict' | 'confidence' | 'wizard' | 'info'
  targetScreen?: string   // nav screen to jump to via "Go to" button
  dismissed: boolean
}

// ─── Upload audit (session-only, not persisted) ───────────────────────────────

export interface UploadAuditField {
  field: string
  value: string
  populated: boolean
}

export interface UploadAudit {
  fileName: string
  uploadedAt: string         // ISO timestamp
  documentType: string
  totalBudgetDetected: string
  fieldsPopulated: UploadAuditField[]
  lineItemCount: number
  salaryRoleCount: number
  paymentScheduleCount: number
  crossCheckMessage: string | null  // null = within 1% tolerance
}

export interface BudgetState {
  project: ProjectDetails
  timeline: Timeline
  installments: Installment[]
  deptAllocations: Record<DeptCode, number>
  lineItems: Record<DeptCode, LineItem[]>
  salaryRoles: SalaryRole[]
  forecastOverrides: Record<string, number> // key: `${deptCode}_${month}`
  companyProfile: CompanyProfile
  paymentSchedules: PaymentSchedule[]
  expenditureDeductions: ExpenditureDeduction[]
  lastDriveSave: string | null // ISO timestamp
  notices: AppNotice[]          // persisted with project file

  forecastLocked: boolean  // true after user accepts a deficit-suggested schedule

  // ── Session-only (not persisted) ──────────────────────────────────────────
  isPopulatingFromUpload: boolean   // suppresses validation during bulk import
  lastUploadAudit: UploadAudit | null
  budgetIntegrityStatus: 'ok' | 'mismatch' | 'unchecked'
  lastIntegrityCheck: string | null
  integrityDiscrepancy: number      // raw NGN diff; positive = Forecast over Budget
  integritySourceDepartment: string | null

  setProject: (p: Partial<ProjectDetails>) => void
  setTimeline: (t: Partial<Timeline>) => void
  setInstallments: (inst: Installment[]) => void
  setDeptAllocation: (code: DeptCode, pct: number) => void
  setLineItems: (code: DeptCode, items: LineItem[]) => void
  addLineItem: (code: DeptCode, item: LineItem) => void
  updateLineItem: (code: DeptCode, id: string, updates: Partial<LineItem>) => void
  removeLineItem: (code: DeptCode, id: string) => void
  setSalaryRoles: (roles: SalaryRole[]) => void
  addSalaryRole: (role: SalaryRole) => void
  updateSalaryRole: (id: string, updates: Partial<SalaryRole>) => void
  removeSalaryRole: (id: string) => void
  setForecastOverride: (key: string, value: number) => void
  clearForecastOverrides: () => void
  setCompanyProfile: (p: Partial<CompanyProfile>) => void
  addPaymentSchedule: (s: PaymentSchedule) => void
  updatePaymentSchedule: (id: string, updates: Partial<PaymentSchedule>) => void
  removePaymentSchedule: (id: string) => void
  addExpenditureDeduction: (d: ExpenditureDeduction) => void
  removeExpenditureDeductions: (scheduleId: string) => void
  setLastDriveSave: (ts: string) => void
  setForecastLocked: (locked: boolean) => void
  setIsPopulatingFromUpload: (v: boolean) => void
  setLastUploadAudit: (audit: UploadAudit | null) => void
  setBudgetIntegrity: (status: 'ok' | 'mismatch' | 'unchecked', discrepancy: number, sourceDept: string | null) => void
  addNotice: (notice: Omit<AppNotice, 'id' | 'timestamp' | 'dismissed'>) => void
  dismissNotice: (id: string) => void
  clearAllNotices: () => void
  resetStore: () => void
  resetTimeline: () => void
  resetInstallments: () => void
  resetDeptAllocations: () => void
  loadState: (state: Partial<Pick<BudgetState, 'project' | 'timeline' | 'installments' | 'deptAllocations' | 'lineItems' | 'salaryRoles' | 'forecastOverrides' | 'companyProfile' | 'paymentSchedules' | 'expenditureDeductions' | 'notices'>>) => void
}

const defaultProject: ProjectDetails = {
  title: '',
  company: '',
  totalBudget: 0,
  format: 'Feature Film',
  duration: 90,
  episodes: 6,
  episodeDuration: 45,
  weeksPerEpisode: 1,
  daysPerEpisode: 1,
  shootDays: 0,
  location: '',
  currency: '',
  exchangeRate: 1,
  startDate: '',
  productionFeePercent: 0,
}

const defaultTimeline: Timeline = {
  developmentMonths: 0,
  preProdMonths: 0,
  shootMonths: 0,
  postMonths: 0,
}

const defaultAllocations = Object.fromEntries(
  DEPARTMENTS.map(d => [d.code, 0])
) as Record<DeptCode, number>

const defaultInstallments: Installment[] = []

const defaultCompanyProfile: CompanyProfile = {
  logoDataUrl: '',
  name: '',
  address: '',
  email: '',
  phone: '',
}

const initialState = {
  project: defaultProject,
  timeline: defaultTimeline,
  installments: defaultInstallments,
  deptAllocations: defaultAllocations,
  lineItems: Object.fromEntries(DEPARTMENTS.map(d => [d.code, []])) as unknown as Record<DeptCode, LineItem[]>,
  salaryRoles: [] as SalaryRole[],
  forecastOverrides: {} as Record<string, number>,
  companyProfile: defaultCompanyProfile,
  paymentSchedules: [] as PaymentSchedule[],
  expenditureDeductions: [] as ExpenditureDeduction[],
  lastDriveSave: null as string | null,
  notices: [] as AppNotice[],
  forecastLocked: false,
  // Session-only (always reset on app start / resetStore)
  isPopulatingFromUpload: false,
  lastUploadAudit: null as UploadAudit | null,
  budgetIntegrityStatus: 'unchecked' as 'ok' | 'mismatch' | 'unchecked',
  lastIntegrityCheck: null as string | null,
  integrityDiscrepancy: 0,
  integritySourceDepartment: null as string | null,
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      ...initialState,

      setProject: (p) => set(s => ({ project: { ...s.project, ...p } })),
      setTimeline: (t) => set(s => ({ timeline: { ...s.timeline, ...t } })),
      setInstallments: (inst) => set({ installments: inst }),
      setDeptAllocation: (code, pct) =>
        set(s => ({ deptAllocations: { ...s.deptAllocations, [code]: Math.round(pct * 100) / 100 } })),
      setLineItems: (code, items) =>
        set(s => ({ lineItems: { ...s.lineItems, [code]: items } })),
      addLineItem: (code, item) =>
        set(s => ({ lineItems: { ...s.lineItems, [code]: [...(s.lineItems[code] || []), item] } })),
      updateLineItem: (code, id, updates) =>
        set(s => ({
          lineItems: {
            ...s.lineItems,
            [code]: s.lineItems[code].map(i => i.id === id ? { ...i, ...updates } : i),
          },
        })),
      removeLineItem: (code, id) =>
        set(s => ({
          lineItems: {
            ...s.lineItems,
            [code]: s.lineItems[code].filter(i => i.id !== id),
          },
        })),
      setSalaryRoles: (roles) => set({ salaryRoles: roles }),
      addSalaryRole: (role) => set(s => ({ salaryRoles: [...s.salaryRoles, role] })),
      updateSalaryRole: (id, updates) =>
        set(s => ({ salaryRoles: s.salaryRoles.map(r => r.id === id ? { ...r, ...updates } : r) })),
      removeSalaryRole: (id) =>
        set(s => ({ salaryRoles: s.salaryRoles.filter(r => r.id !== id) })),
      setForecastOverride: (key, value) =>
        set(s => ({ forecastOverrides: { ...s.forecastOverrides, [key]: value } })),
      clearForecastOverrides: () => set({ forecastOverrides: {} }),
      setCompanyProfile: (p) => set(s => ({ companyProfile: { ...s.companyProfile, ...p } })),
      addPaymentSchedule: (s2) => set(s => ({ paymentSchedules: [...s.paymentSchedules, s2] })),
      updatePaymentSchedule: (id, updates) =>
        set(s => ({ paymentSchedules: s.paymentSchedules.map(ps => ps.id === id ? { ...ps, ...updates } : ps) })),
      removePaymentSchedule: (id) =>
        set(s => ({ paymentSchedules: s.paymentSchedules.filter(ps => ps.id !== id) })),
      addExpenditureDeduction: (d) =>
        set(s => ({ expenditureDeductions: [...s.expenditureDeductions, d] })),
      removeExpenditureDeductions: (scheduleId) =>
        set(s => ({ expenditureDeductions: s.expenditureDeductions.filter(d => d.scheduleId !== scheduleId) })),
      setLastDriveSave: (ts) => set({ lastDriveSave: ts }),
      setForecastLocked: (locked) => set({ forecastLocked: locked }),
      setIsPopulatingFromUpload: (v) => set({ isPopulatingFromUpload: v }),
      setLastUploadAudit: (audit) => set({ lastUploadAudit: audit }),
      setBudgetIntegrity: (status, discrepancy, sourceDept) => set({
        budgetIntegrityStatus: status,
        lastIntegrityCheck: new Date().toISOString(),
        integrityDiscrepancy: discrepancy,
        integritySourceDepartment: sourceDept,
      }),
      addNotice: (notice) => set(s => ({
        notices: [...s.notices, {
          ...notice,
          id: `notice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          dismissed: false,
        }],
      })),
      dismissNotice: (id) => set(s => ({
        notices: s.notices.map(n => n.id === id ? { ...n, dismissed: true } : n),
      })),
      clearAllNotices: () => set({ notices: [] }),
      resetStore: () => set(initialState),
      resetTimeline: () => set({ timeline: defaultTimeline }),
      resetInstallments: () => set({ installments: [] }),
      resetDeptAllocations: () => set({ deptAllocations: defaultAllocations }),
      loadState: (state) => set({ ...initialState, ...state }),
    }),
    {
      name: 'feemo-budget-v1',
      partialize: (s) => ({
        project: s.project,
        timeline: s.timeline,
        installments: s.installments,
        deptAllocations: s.deptAllocations,
        lineItems: s.lineItems,
        salaryRoles: s.salaryRoles,
        forecastOverrides: s.forecastOverrides,
        forecastLocked: s.forecastLocked,
        companyProfile: s.companyProfile,
        paymentSchedules: s.paymentSchedules,
        expenditureDeductions: s.expenditureDeductions,
        lastDriveSave: s.lastDriveSave,
        notices: s.notices,
        // isPopulatingFromUpload and lastUploadAudit are intentionally excluded
      }),
    }
  )
)

export function getTotalMonths(timeline: Timeline) {
  const sum = (timeline.developmentMonths || 0) + (timeline.preProdMonths || 0) +
    (timeline.shootMonths || 0) + (timeline.postMonths || 0)
  return isFinite(sum) && sum >= 0 ? Math.floor(sum) : 0
}

export function getMonthLabel(monthIndex: number, timeline: Timeline, startDate: string): string {
  if (!startDate) return `Month ${monthIndex}`
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + monthIndex - 1)
  return d.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export function getMonthPhase(monthIndex: number, timeline: Timeline): string {
  const { developmentMonths, preProdMonths, shootMonths } = timeline
  if (monthIndex <= developmentMonths) return 'DEV'
  if (monthIndex <= developmentMonths + preProdMonths) return 'PRE-PROD'
  if (monthIndex <= developmentMonths + preProdMonths + shootMonths) return 'SHOOT'
  return 'POST'
}

export function getDeptTarget(code: DeptCode, store: Pick<BudgetState, 'project' | 'deptAllocations'>): number {
  return (store.deptAllocations[code] / 100) * store.project.totalBudget
}

export function getDeptActual(code: DeptCode, store: Pick<BudgetState, 'lineItems'>): number {
  return (store.lineItems[code] || []).reduce((sum, item) => sum + (item.no ?? 1) * item.qty * item.rate, 0)
}

// Preferred target for forecasts: line items total when entered, allocation% as fallback
export function getDeptBudget(code: DeptCode, store: Pick<BudgetState, 'project' | 'deptAllocations' | 'lineItems'>): number {
  const lineTotal = getDeptActual(code, store)
  return lineTotal > 0 ? lineTotal : getDeptTarget(code, store)
}

export function isSeriesFormat(format: string) {
  return format === 'TV Series' || format === 'Web Series'
}

export function isTelenovela(format: string) {
  return format === 'Telenovela'
}

export function isEpisodic(format: string) {
  return isSeriesFormat(format) || isTelenovela(format)
}

export function calcSeriesShootDays(episodes: number, weeksPerEpisode: number): number {
  return episodes * weeksPerEpisode * 5
}

export function calcSeriesShootMonths(episodes: number, weeksPerEpisode: number): number {
  return Math.ceil((episodes * weeksPerEpisode) / 4)
}

export function calcTeleShootDays(episodes: number, daysPerEpisode: number): number {
  return episodes * daysPerEpisode
}

export function calcTeleShootMonths(episodes: number, daysPerEpisode: number): number {
  return Math.ceil((episodes * daysPerEpisode) / 20) // ~20 shoot days/month
}

export function isAutofillReady(
  project: ProjectDetails,
  timeline: Timeline,
  installments: Installment[]
): boolean {
  const detailsOk = !!project.title && project.totalBudget > 0 && !!project.startDate && !!project.location
  const timelineOk = timeline.developmentMonths > 0 && timeline.preProdMonths > 0 && timeline.postMonths > 0
  const instOk = installments.length > 0 && Math.abs(installments.reduce((s, i) => s + i.percentage, 0) - 100) < 0.1
  return detailsOk && timelineOk && instOk
}

// Department % allocations derived from reference budget files
export const DEPT_ACTIVE_PHASES: Partial<Record<DeptCode, string[]>> = {
  A:  ['DEV'],
  B:  ['DEV', 'PRE-PROD'],
  C:  ['DEV', 'PRE-PROD', 'SHOOT'],
  D:  ['PRE-PROD', 'SHOOT'],
  E:  ['SHOOT'],
  F:  ['DEV', 'PRE-PROD', 'SHOOT', 'POST'],
  G:  ['PRE-PROD', 'SHOOT'],
  H:  ['SHOOT'],
  I:  ['SHOOT'],
  J:  ['PRE-PROD', 'SHOOT'],
  K:  ['PRE-PROD', 'SHOOT'],
  L:  ['PRE-PROD', 'SHOOT'],
  M:  ['PRE-PROD', 'SHOOT'],
  N:  ['PRE-PROD', 'SHOOT'],
  O:  ['SHOOT'],
  P:  ['SHOOT'],
  Q:  ['PRE-PROD', 'SHOOT'],
  R:  ['PRE-PROD', 'SHOOT', 'POST'],
  S:  ['PRE-PROD', 'SHOOT', 'POST'],
  T:  ['SHOOT'],
  AA: ['SHOOT'],
  DD: ['POST'],
  EE: ['POST'],
  FF: ['POST'],
  GG: ['DEV', 'PRE-PROD', 'SHOOT', 'POST'],
  HH: ['DEV', 'PRE-PROD', 'SHOOT', 'POST'],
  II: ['DEV', 'PRE-PROD', 'SHOOT', 'POST'],
}

export const TEMPLATE_JURIYA: Partial<Record<DeptCode, number>> = {
  A: 0, B: 3, C: 5, D: 2, E: 8, F: 3.5,
  G: 8.9, H: 1.5, I: 2, J: 1.5, K: 8.9,
  L: 1.5, M: 3, N: 2, O: 1, P: 1,
  Q: 1.5, R: 3.5, S: 5, T: 16,
  AA: 0.5, DD: 0.5, EE: 1, FF: 9.8, GG: 3, HH: 1.5, II: 0,
}

export const TEMPLATE_BC: Partial<Record<DeptCode, number>> = {
  A: 0, B: 3.4, C: 7.8, D: 1.7, E: 8.6, F: 2.9,
  G: 15.5, H: 1.1, I: 2.7, J: 1.4, K: 8.8,
  L: 2.2, M: 4.4, N: 1.9, O: 0, P: 2.8,
  Q: 1.3, R: 3.5, S: 1.8, T: 17.9,
  AA: 0, DD: 0.4, EE: 0.5, FF: 6.1, GG: 2.5, HH: 1.0, II: 0,
}

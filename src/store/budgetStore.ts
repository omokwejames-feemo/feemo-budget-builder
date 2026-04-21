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
  qty: number
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

export interface BudgetState {
  project: ProjectDetails
  timeline: Timeline
  installments: Installment[]
  deptAllocations: Record<DeptCode, number>
  lineItems: Record<DeptCode, LineItem[]>
  salaryRoles: SalaryRole[]
  forecastOverrides: Record<string, number> // key: `${deptCode}_${month}`

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
  resetStore: () => void
  resetTimeline: () => void
  resetInstallments: () => void
  resetDeptAllocations: () => void
  loadState: (state: Partial<Pick<BudgetState, 'project' | 'timeline' | 'installments' | 'deptAllocations' | 'lineItems' | 'salaryRoles' | 'forecastOverrides'>>) => void
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
  shootDays: 20,
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

const initialState = {
  project: defaultProject,
  timeline: defaultTimeline,
  installments: defaultInstallments,
  deptAllocations: defaultAllocations,
  lineItems: Object.fromEntries(DEPARTMENTS.map(d => [d.code, []])) as unknown as Record<DeptCode, LineItem[]>,
  salaryRoles: [] as SalaryRole[],
  forecastOverrides: {} as Record<string, number>,
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      ...initialState,

      setProject: (p) => set(s => ({ project: { ...s.project, ...p } })),
      setTimeline: (t) => set(s => ({ timeline: { ...s.timeline, ...t } })),
      setInstallments: (inst) => set({ installments: inst }),
      setDeptAllocation: (code, pct) =>
        set(s => ({ deptAllocations: { ...s.deptAllocations, [code]: pct } })),
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
      }),
    }
  )
)

export function getTotalMonths(timeline: Timeline) {
  return timeline.developmentMonths + timeline.preProdMonths + timeline.shootMonths + timeline.postMonths
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
  return (store.lineItems[code] || []).reduce((sum, item) => sum + item.qty * item.rate, 0)
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

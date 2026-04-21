import type { DeptCode, SalaryRole } from '../store/budgetStore'

export interface TplLineItem {
  schedNo: string
  detail: string
  qty: number
  unit: string
  ie: 'I' | 'E'
  ratio: number // fraction of dept target this line item represents (all ratios per dept must sum to 1)
  isSalary: boolean // true = also appears in salary forecast
}

export interface TplSalaryRole {
  schedNo: string
  role: string
  deptCode: DeptCode
  phase: SalaryRole['phase']
  lineItemScheduleNo: string // cross-ref to TplLineItem.schedNo
  ratioOfDeptTarget: number  // fraction of dept target for this role's total salary
}

export interface BudgetTemplate {
  id: 'juriya' | 'bc'
  name: string
  description: string
  lineItems: Partial<Record<DeptCode, TplLineItem[]>>
  salaryRoles: TplSalaryRole[]
}

// ─── JURIYA — FEATURE FILM ─────────────────────────────────────────────────
export const JURIYA_FULL: BudgetTemplate = {
  id: 'juriya',
  name: 'Ajoche — Feature Film',
  description: 'N250M · 9 months · single film · 20 shoot days · Reference template',
  lineItems: {
    B: [
      { schedNo: 'B1', detail: 'Screenplay Rights / Writer\'s Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.45, isSalary: true },
      { schedNo: 'B2', detail: 'Script Development & Revisions', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'B3', detail: 'Script Editor', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'B4', detail: 'Script Printing & Distribution', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    C: [
      { schedNo: 'C1', detail: 'Executive Producer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: true },
      { schedNo: 'C2', detail: 'Line Producer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'C3', detail: 'Associate Producer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'C4', detail: 'Production Office & Administration', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    D: [
      { schedNo: 'D1', detail: 'Director\'s Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.80, isSalary: true },
      { schedNo: 'D2', detail: 'Director\'s Travel & Per Diem', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    E: [
      { schedNo: 'E1', detail: 'Lead Cast (×3)', qty: 3, unit: 'Flat', ie: 'E', ratio: 0.45, isSalary: true },
      { schedNo: 'E2', detail: 'Supporting Cast (×8)', qty: 8, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'E3', detail: 'Day Players & Extras', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'E4', detail: 'Casting Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
    ],
    F: [
      { schedNo: 'F1', detail: 'Production Manager', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'F2', detail: '1st Assistant Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'F3', detail: '2nd Assistant Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
      { schedNo: 'F4', detail: 'Production Coordinator', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
      { schedNo: 'F5', detail: 'Production Assistants (×4)', qty: 4, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'F6', detail: 'Script Supervisor', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'F7', detail: 'Set PAs (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
    ],
    G: [
      { schedNo: 'G1', detail: 'Director of Photography (DOP)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.18, isSalary: true },
      { schedNo: 'G2', detail: 'Camera Operator', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.12, isSalary: true },
      { schedNo: 'G3', detail: '1st AC / Focus Puller', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.09, isSalary: true },
      { schedNo: 'G4', detail: '2nd AC / Clapper Loader', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.07, isSalary: true },
      { schedNo: 'G5', detail: 'Camera Package Hire', qty: 20, unit: 'Day', ie: 'E', ratio: 0.27, isSalary: false },
      { schedNo: 'G6', detail: 'Prime Lenses & Accessories', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'G7', detail: 'DIT / Data Management', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.08, isSalary: true },
      { schedNo: 'G8', detail: 'Miscellaneous Camera Costs', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.04, isSalary: false },
    ],
    H: [
      { schedNo: 'H1', detail: 'Sound Recordist', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'H2', detail: 'Boom Operator', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'H3', detail: 'Sound Package Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'H4', detail: 'Playback & Comms', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
    ],
    I: [
      { schedNo: 'I1', detail: 'Gaffer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'I2', detail: 'Best Boy / Sparks', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'I3', detail: 'Lighting Package Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.45, isSalary: false },
      { schedNo: 'I4', detail: 'Generator Hire', qty: 20, unit: 'Day', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'I5', detail: 'Practical Lamps & Consumables', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.05, isSalary: false },
    ],
    J: [
      { schedNo: 'J1', detail: 'Production Designer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'J2', detail: 'Art Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'J3', detail: 'Set Dresser', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'J4', detail: 'Props Buyer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'J5', detail: 'Standby Props', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
    ],
    K: [
      { schedNo: 'K1', detail: 'Set Construction', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: false },
      { schedNo: 'K2', detail: 'Set Dressing & Rentals', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'K3', detail: 'Scenic Painting', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'K4', detail: 'Materials & Supplies', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
    ],
    L: [
      { schedNo: 'L1', detail: 'Props Purchases', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'L2', detail: 'Props Rentals', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'L3', detail: 'Props Transport & Storage', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    M: [
      { schedNo: 'M1', detail: 'Costume Designer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'M2', detail: 'Costume Purchases', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: false },
      { schedNo: 'M3', detail: 'Costume Rentals', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'M4', detail: 'Laundry & Maintenance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'M5', detail: 'Standby Wardrobe', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.05, isSalary: false },
    ],
    N: [
      { schedNo: 'N1', detail: 'Make-up Artist (HoD)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: true },
      { schedNo: 'N2', detail: 'Make-up Artists (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: true },
      { schedNo: 'N3', detail: 'Hair Stylist', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'N4', detail: 'Make-up & Hair Supplies', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'N5', detail: 'SFX Make-up', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    O: [
      { schedNo: 'O1', detail: 'Picture Car Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.60, isSalary: false },
      { schedNo: 'O2', detail: 'Picture Vehicle Transport', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: false },
    ],
    P: [
      { schedNo: 'P1', detail: 'Studio / Location Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.70, isSalary: false },
      { schedNo: 'P2', detail: 'Facilities & Equipment', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
    ],
    Q: [
      { schedNo: 'Q1', detail: 'Location Fees', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'Q2', detail: 'Location Manager', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: true },
      { schedNo: 'Q3', detail: 'Location Scout', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'Q4', detail: 'Permits & Security', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    R: [
      { schedNo: 'R1', detail: 'Unit Vehicles (×4 daily)', qty: 20, unit: 'Day', ie: 'E', ratio: 0.40, isSalary: false },
      { schedNo: 'R2', detail: 'Fuel', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'R3', detail: 'Drivers (×4)', qty: 4, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'R4', detail: 'Camera / Equipment Truck', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
    ],
    S: [
      { schedNo: 'S1', detail: 'Air Travel (Cast & Crew)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'S2', detail: 'Ground Transport', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'S3', detail: 'Freight & Shipping', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    T: [
      { schedNo: 'T1', detail: 'Hotel — HoDs & Cast', qty: 30, unit: 'Day', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'T2', detail: 'Hotel — Crew', qty: 30, unit: 'Day', ie: 'E', ratio: 0.45, isSalary: false },
      { schedNo: 'T3', detail: 'On-set Catering (Daily)', qty: 20, unit: 'Day', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'T4', detail: 'Per Diems (Cast & Crew)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    AA: [
      { schedNo: 'AA1', detail: 'Hard Drives & Data Media', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.60, isSalary: false },
      { schedNo: 'AA2', detail: 'Tapes & Consumables', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: false },
    ],
    DD: [
      { schedNo: 'DD1', detail: 'Title Sequence Design', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'DD2', detail: 'End Credits Design', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'DD3', detail: 'Lower Thirds & Graphics', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    EE: [
      { schedNo: 'EE1', detail: 'Original Score (Composer Fee)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: true },
      { schedNo: 'EE2', detail: 'Music Licensing / Sync Rights', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'EE3', detail: 'Music Recording & Session', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    FF: [
      { schedNo: 'FF1', detail: 'Editor Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'FF2', detail: 'Edit Suite / Post Facility Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'FF3', detail: 'DI Grade & Online Conform', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'FF4', detail: 'VFX & Motion Graphics', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'FF5', detail: 'Sound Design & Final Mix', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'FF6', detail: 'ADR & Foley', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.08, isSalary: false },
      { schedNo: 'FF7', detail: 'Mastering & Deliverables', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.07, isSalary: false },
    ],
    GG: [
      { schedNo: 'GG1', detail: 'Production Insurance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'GG2', detail: 'Legal & Clearances', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'GG3', detail: 'Accounting & Audit', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'GG4', detail: 'Production Office Rent', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'GG5', detail: 'Communications & IT', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'GG6', detail: 'Petty Cash & Miscellaneous', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
    ],
    HH: [
      { schedNo: 'HH1', detail: 'E&O Insurance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'HH2', detail: 'Equipment Insurance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'HH3', detail: 'Public Liability Insurance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
  },
  salaryRoles: [
    { schedNo: 'B1', role: 'Screenplay Writer', deptCode: 'B', phase: 'dev', lineItemScheduleNo: 'B1', ratioOfDeptTarget: 0.45 },
    { schedNo: 'B3', role: 'Script Editor', deptCode: 'B', phase: 'dev', lineItemScheduleNo: 'B3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'C1', role: 'Executive Producer', deptCode: 'C', phase: 'all', lineItemScheduleNo: 'C1', ratioOfDeptTarget: 0.40 },
    { schedNo: 'C2', role: 'Line Producer', deptCode: 'C', phase: 'pre', lineItemScheduleNo: 'C2', ratioOfDeptTarget: 0.30 },
    { schedNo: 'C3', role: 'Associate Producer', deptCode: 'C', phase: 'pre', lineItemScheduleNo: 'C3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'D1', role: 'Director', deptCode: 'D', phase: 'pre', lineItemScheduleNo: 'D1', ratioOfDeptTarget: 0.80 },
    { schedNo: 'E1', role: 'Lead Cast (×3)', deptCode: 'E', phase: 'shoot', lineItemScheduleNo: 'E1', ratioOfDeptTarget: 0.45 },
    { schedNo: 'E2', role: 'Supporting Cast (×8)', deptCode: 'E', phase: 'shoot', lineItemScheduleNo: 'E2', ratioOfDeptTarget: 0.30 },
    { schedNo: 'E3', role: 'Day Players & Extras', deptCode: 'E', phase: 'shoot', lineItemScheduleNo: 'E3', ratioOfDeptTarget: 0.15 },
    { schedNo: 'E4', role: 'Casting Director', deptCode: 'E', phase: 'pre', lineItemScheduleNo: 'E4', ratioOfDeptTarget: 0.10 },
    { schedNo: 'F1', role: 'Production Manager', deptCode: 'F', phase: 'pre', lineItemScheduleNo: 'F1', ratioOfDeptTarget: 0.20 },
    { schedNo: 'F2', role: '1st Assistant Director', deptCode: 'F', phase: 'pre', lineItemScheduleNo: 'F2', ratioOfDeptTarget: 0.15 },
    { schedNo: 'F3', role: '2nd Assistant Director', deptCode: 'F', phase: 'shoot', lineItemScheduleNo: 'F3', ratioOfDeptTarget: 0.10 },
    { schedNo: 'F6', role: 'Script Supervisor', deptCode: 'F', phase: 'shoot', lineItemScheduleNo: 'F6', ratioOfDeptTarget: 0.15 },
    { schedNo: 'G1', role: 'Director of Photography', deptCode: 'G', phase: 'pre', lineItemScheduleNo: 'G1', ratioOfDeptTarget: 0.18 },
    { schedNo: 'G2', role: 'Camera Operator', deptCode: 'G', phase: 'shoot', lineItemScheduleNo: 'G2', ratioOfDeptTarget: 0.12 },
    { schedNo: 'G3', role: '1st AC / Focus Puller', deptCode: 'G', phase: 'shoot', lineItemScheduleNo: 'G3', ratioOfDeptTarget: 0.09 },
    { schedNo: 'G7', role: 'DIT / Data Manager', deptCode: 'G', phase: 'shoot', lineItemScheduleNo: 'G7', ratioOfDeptTarget: 0.08 },
    { schedNo: 'H1', role: 'Sound Recordist', deptCode: 'H', phase: 'shoot', lineItemScheduleNo: 'H1', ratioOfDeptTarget: 0.30 },
    { schedNo: 'H2', role: 'Boom Operator', deptCode: 'H', phase: 'shoot', lineItemScheduleNo: 'H2', ratioOfDeptTarget: 0.20 },
    { schedNo: 'I1', role: 'Gaffer', deptCode: 'I', phase: 'shoot', lineItemScheduleNo: 'I1', ratioOfDeptTarget: 0.20 },
    { schedNo: 'I2', role: 'Best Boy / Sparks', deptCode: 'I', phase: 'shoot', lineItemScheduleNo: 'I2', ratioOfDeptTarget: 0.15 },
    { schedNo: 'J1', role: 'Production Designer', deptCode: 'J', phase: 'pre', lineItemScheduleNo: 'J1', ratioOfDeptTarget: 0.30 },
    { schedNo: 'J2', role: 'Art Director', deptCode: 'J', phase: 'pre', lineItemScheduleNo: 'J2', ratioOfDeptTarget: 0.20 },
    { schedNo: 'J3', role: 'Set Dresser', deptCode: 'J', phase: 'shoot', lineItemScheduleNo: 'J3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'M1', role: 'Costume Designer', deptCode: 'M', phase: 'pre', lineItemScheduleNo: 'M1', ratioOfDeptTarget: 0.20 },
    { schedNo: 'N1', role: 'Make-up Artist (HoD)', deptCode: 'N', phase: 'shoot', lineItemScheduleNo: 'N1', ratioOfDeptTarget: 0.25 },
    { schedNo: 'N3', role: 'Hair Stylist', deptCode: 'N', phase: 'shoot', lineItemScheduleNo: 'N3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'Q2', role: 'Location Manager', deptCode: 'Q', phase: 'pre', lineItemScheduleNo: 'Q2', ratioOfDeptTarget: 0.25 },
    { schedNo: 'EE1', role: 'Composer', deptCode: 'EE', phase: 'post', lineItemScheduleNo: 'EE1', ratioOfDeptTarget: 0.50 },
    { schedNo: 'FF1', role: 'Editor', deptCode: 'FF', phase: 'post', lineItemScheduleNo: 'FF1', ratioOfDeptTarget: 0.15 },
  ],
}

// ─── BRITISH COUNCIL — TV SERIES ───────────────────────────────────────────
export const BC_FULL: BudgetTemplate = {
  id: 'bc',
  name: 'British Council — TV Series',
  description: 'N548M · 8 months · 6 eps × 45 mins · episodic shoot schedule',
  lineItems: {
    B: [
      { schedNo: 'B1', detail: 'Head Writer / Showrunner Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: true },
      { schedNo: 'B2', detail: 'Episode Writers (×6)', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'B3', detail: 'Script Editor & Development', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'B4', detail: 'Story Consultant', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
      { schedNo: 'B5', detail: 'Script Printing & Distribution', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.05, isSalary: false },
    ],
    C: [
      { schedNo: 'C1', detail: 'Executive Producer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: true },
      { schedNo: 'C2', detail: 'Series Producer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'C3', detail: 'Line Producer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'C4', detail: 'Associate Producer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
      { schedNo: 'C5', detail: 'Production Office & Admin', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.05, isSalary: false },
    ],
    D: [
      { schedNo: 'D1', detail: 'Series Director Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.60, isSalary: true },
      { schedNo: 'D2', detail: 'Episode Directors (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'D3', detail: 'Director\'s Travel & Per Diem', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    E: [
      { schedNo: 'E1', detail: 'Series Leads (×5)', qty: 5, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: true },
      { schedNo: 'E2', detail: 'Recurring Supporting Cast (×12)', qty: 12, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'E3', detail: 'Guest Cast (per episode)', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'E4', detail: 'Extras / Background Artists', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
      { schedNo: 'E5', detail: 'Casting Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.05, isSalary: true },
    ],
    F: [
      { schedNo: 'F1', detail: 'Production Manager', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.18, isSalary: true },
      { schedNo: 'F2', detail: '1st Assistant Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'F3', detail: '2nd Assistant Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.12, isSalary: true },
      { schedNo: 'F4', detail: 'Production Coordinator', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: true },
      { schedNo: 'F5', detail: 'Script Supervisor', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.12, isSalary: true },
      { schedNo: 'F6', detail: 'Production Assistants (×6)', qty: 6, unit: 'Flat', ie: 'E', ratio: 0.18, isSalary: true },
      { schedNo: 'F7', detail: 'Set PAs (×3)', qty: 3, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
    ],
    G: [
      { schedNo: 'G1', detail: 'Director of Photography (DOP)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.08, isSalary: true },
      { schedNo: 'G2', detail: 'Camera Operator (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.06, isSalary: true },
      { schedNo: 'G3', detail: '1st AC (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.04, isSalary: true },
      { schedNo: 'G4', detail: '2nd AC', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.03, isSalary: true },
      { schedNo: 'G5', detail: 'Camera Package Hire (2 cameras)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.12, isSalary: false },
      { schedNo: 'G6', detail: 'Camera Equipment Rental', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.52, isSalary: false },
      { schedNo: 'G7', detail: 'DIT / Data Management', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.08, isSalary: true },
      { schedNo: 'G8', detail: 'Miscellaneous Camera Costs', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.07, isSalary: false },
    ],
    H: [
      { schedNo: 'H1', detail: 'Sound Recordist', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'H2', detail: 'Boom Operators (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: true },
      { schedNo: 'H3', detail: 'Sound Package Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'H4', detail: 'Walkies / Comms', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    I: [
      { schedNo: 'I1', detail: 'Gaffer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.18, isSalary: true },
      { schedNo: 'I2', detail: 'Best Boy / Sparks (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'I3', detail: 'Lighting Package Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.45, isSalary: false },
      { schedNo: 'I4', detail: 'Generator Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.17, isSalary: false },
      { schedNo: 'I5', detail: 'Practical Lamps & Consumables', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.05, isSalary: false },
    ],
    J: [
      { schedNo: 'J1', detail: 'Production Designer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'J2', detail: 'Art Director', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'J3', detail: 'Graphic Artist', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'J4', detail: 'Set Dresser', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'J5', detail: 'Standby Art Dept', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
    ],
    K: [
      { schedNo: 'K1', detail: 'Set Construction', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'K2', detail: 'Set Dressing & Rentals', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'K3', detail: 'Set Dressing Purchases', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'K4', detail: 'Scenic Painting', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.12, isSalary: false },
      { schedNo: 'K5', detail: 'Materials & Supplies', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.08, isSalary: false },
    ],
    L: [
      { schedNo: 'L1', detail: 'Props Purchases', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.45, isSalary: false },
      { schedNo: 'L2', detail: 'Props Rentals', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'L3', detail: 'Props Transport & Storage', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    M: [
      { schedNo: 'M1', detail: 'Costume Designer', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.18, isSalary: true },
      { schedNo: 'M2', detail: 'Costume Purchases', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: false },
      { schedNo: 'M3', detail: 'Costume Rentals', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'M4', detail: 'Wardrobe Maintenance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'M5', detail: 'Standby Wardrobe', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.07, isSalary: false },
    ],
    N: [
      { schedNo: 'N1', detail: 'Make-up Artist (HoD)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: true },
      { schedNo: 'N2', detail: 'Make-up Artists (×3)', qty: 3, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: true },
      { schedNo: 'N3', detail: 'Hair Stylist (×2)', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'N4', detail: 'Make-up & Hair Supplies', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'N5', detail: 'SFX Make-up', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    P: [
      { schedNo: 'P1', detail: 'Studio / OB Facility Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.70, isSalary: false },
      { schedNo: 'P2', detail: 'Studio Facilities & Equipment', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
    ],
    Q: [
      { schedNo: 'Q1', detail: 'Location Fees', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'Q2', detail: 'Location Manager', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: true },
      { schedNo: 'Q3', detail: 'Location Scout', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'Q4', detail: 'Permits & Security', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    R: [
      { schedNo: 'R1', detail: 'Unit Vehicles (×6 daily)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.45, isSalary: false },
      { schedNo: 'R2', detail: 'Fuel', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
      { schedNo: 'R3', detail: 'Drivers (×6)', qty: 6, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: true },
      { schedNo: 'R4', detail: 'Camera / Equipment Trucks', qty: 2, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    S: [
      { schedNo: 'S1', detail: 'Air Travel (Cast & Key Crew)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.55, isSalary: false },
      { schedNo: 'S2', detail: 'Ground Transport', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'S3', detail: 'Freight & Shipping', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    T: [
      { schedNo: 'T1', detail: 'Hotel — Cast & HoDs', qty: 25, unit: 'Day', ie: 'E', ratio: 0.28, isSalary: false },
      { schedNo: 'T2', detail: 'Hotel — Full Crew', qty: 25, unit: 'Day', ie: 'E', ratio: 0.42, isSalary: false },
      { schedNo: 'T3', detail: 'On-set Catering (Daily)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'T4', detail: 'Per Diems (Cast & Crew)', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
    ],
    DD: [
      { schedNo: 'DD1', detail: 'Series Title Design', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.40, isSalary: false },
      { schedNo: 'DD2', detail: 'Episode Graphics & Lower Thirds', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.40, isSalary: false },
      { schedNo: 'DD3', detail: 'End Credits', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    EE: [
      { schedNo: 'EE1', detail: 'Series Composer Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: true },
      { schedNo: 'EE2', detail: 'Music Licensing / Sync Rights', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.30, isSalary: false },
      { schedNo: 'EE3', detail: 'Music Recording Sessions', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
    ],
    FF: [
      { schedNo: 'FF1', detail: 'Post Team & Facility Hire', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'FF2', detail: 'Editor Fee', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: true },
      { schedNo: 'FF3', detail: 'DI Grade & Online (per episode)', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'FF4', detail: 'VFX & Motion Graphics', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'FF5', detail: 'Sound Design & Final Mix', qty: 6, unit: 'Per Episode', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'FF6', detail: 'Mastering & Deliverables', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.05, isSalary: false },
    ],
    GG: [
      { schedNo: 'GG1', detail: 'Production Accountant', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.18, isSalary: true },
      { schedNo: 'GG2', detail: 'Legal & Rights Clearances', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
      { schedNo: 'GG3', detail: 'Audit & Accounting', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.12, isSalary: false },
      { schedNo: 'GG4', detail: 'Production Office Rent', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.20, isSalary: false },
      { schedNo: 'GG5', detail: 'Communications & IT', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.10, isSalary: false },
      { schedNo: 'GG6', detail: 'Petty Cash & Miscellaneous', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.25, isSalary: false },
    ],
    HH: [
      { schedNo: 'HH1', detail: 'E&O Insurance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.50, isSalary: false },
      { schedNo: 'HH2', detail: 'Equipment & Production Insurance', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.35, isSalary: false },
      { schedNo: 'HH3', detail: 'Public Liability', qty: 1, unit: 'Flat', ie: 'E', ratio: 0.15, isSalary: false },
    ],
  },
  salaryRoles: [
    { schedNo: 'B1', role: 'Head Writer / Showrunner', deptCode: 'B', phase: 'dev', lineItemScheduleNo: 'B1', ratioOfDeptTarget: 0.35 },
    { schedNo: 'B3', role: 'Script Editor', deptCode: 'B', phase: 'dev', lineItemScheduleNo: 'B3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'C1', role: 'Executive Producer', deptCode: 'C', phase: 'all', lineItemScheduleNo: 'C1', ratioOfDeptTarget: 0.35 },
    { schedNo: 'C2', role: 'Series Producer', deptCode: 'C', phase: 'pre', lineItemScheduleNo: 'C2', ratioOfDeptTarget: 0.30 },
    { schedNo: 'C3', role: 'Line Producer', deptCode: 'C', phase: 'pre', lineItemScheduleNo: 'C3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'D1', role: 'Series Director', deptCode: 'D', phase: 'pre', lineItemScheduleNo: 'D1', ratioOfDeptTarget: 0.60 },
    { schedNo: 'E1', role: 'Series Leads (×5)', deptCode: 'E', phase: 'shoot', lineItemScheduleNo: 'E1', ratioOfDeptTarget: 0.35 },
    { schedNo: 'E2', role: 'Recurring Supporting Cast', deptCode: 'E', phase: 'shoot', lineItemScheduleNo: 'E2', ratioOfDeptTarget: 0.30 },
    { schedNo: 'E4', role: 'Extras / Background Artists', deptCode: 'E', phase: 'shoot', lineItemScheduleNo: 'E4', ratioOfDeptTarget: 0.10 },
    { schedNo: 'F1', role: 'Production Manager', deptCode: 'F', phase: 'pre', lineItemScheduleNo: 'F1', ratioOfDeptTarget: 0.18 },
    { schedNo: 'F2', role: '1st Assistant Director', deptCode: 'F', phase: 'pre', lineItemScheduleNo: 'F2', ratioOfDeptTarget: 0.15 },
    { schedNo: 'F3', role: '2nd Assistant Director', deptCode: 'F', phase: 'shoot', lineItemScheduleNo: 'F3', ratioOfDeptTarget: 0.12 },
    { schedNo: 'F5', role: 'Script Supervisor', deptCode: 'F', phase: 'shoot', lineItemScheduleNo: 'F5', ratioOfDeptTarget: 0.12 },
    { schedNo: 'G1', role: 'Director of Photography', deptCode: 'G', phase: 'pre', lineItemScheduleNo: 'G1', ratioOfDeptTarget: 0.08 },
    { schedNo: 'G2', role: 'Camera Operators (×2)', deptCode: 'G', phase: 'shoot', lineItemScheduleNo: 'G2', ratioOfDeptTarget: 0.06 },
    { schedNo: 'G7', role: 'DIT / Data Manager', deptCode: 'G', phase: 'shoot', lineItemScheduleNo: 'G7', ratioOfDeptTarget: 0.08 },
    { schedNo: 'H1', role: 'Sound Recordist', deptCode: 'H', phase: 'shoot', lineItemScheduleNo: 'H1', ratioOfDeptTarget: 0.30 },
    { schedNo: 'H2', role: 'Boom Operators (×2)', deptCode: 'H', phase: 'shoot', lineItemScheduleNo: 'H2', ratioOfDeptTarget: 0.25 },
    { schedNo: 'I1', role: 'Gaffer', deptCode: 'I', phase: 'shoot', lineItemScheduleNo: 'I1', ratioOfDeptTarget: 0.18 },
    { schedNo: 'J1', role: 'Production Designer', deptCode: 'J', phase: 'pre', lineItemScheduleNo: 'J1', ratioOfDeptTarget: 0.30 },
    { schedNo: 'J2', role: 'Art Director', deptCode: 'J', phase: 'pre', lineItemScheduleNo: 'J2', ratioOfDeptTarget: 0.20 },
    { schedNo: 'M1', role: 'Costume Designer', deptCode: 'M', phase: 'pre', lineItemScheduleNo: 'M1', ratioOfDeptTarget: 0.18 },
    { schedNo: 'N1', role: 'Make-up Artist (HoD)', deptCode: 'N', phase: 'shoot', lineItemScheduleNo: 'N1', ratioOfDeptTarget: 0.25 },
    { schedNo: 'N3', role: 'Hair Stylists (×2)', deptCode: 'N', phase: 'shoot', lineItemScheduleNo: 'N3', ratioOfDeptTarget: 0.20 },
    { schedNo: 'GG1', role: 'Production Accountant', deptCode: 'GG', phase: 'all', lineItemScheduleNo: 'GG1', ratioOfDeptTarget: 0.18 },
    { schedNo: 'EE1', role: 'Series Composer', deptCode: 'EE', phase: 'post', lineItemScheduleNo: 'EE1', ratioOfDeptTarget: 0.50 },
    { schedNo: 'FF2', role: 'Editor', deptCode: 'FF', phase: 'post', lineItemScheduleNo: 'FF2', ratioOfDeptTarget: 0.15 },
  ],
}

export const ALL_TEMPLATES: BudgetTemplate[] = [JURIYA_FULL, BC_FULL]

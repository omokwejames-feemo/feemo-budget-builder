# Changelog

## v2.2.2 — Dept Allocation Detection on Upload (2026-04-26)

- **Dept allocation confirmation dialog**: After uploading an Excel budget, if department figures are detected the app now shows a dedicated dialog before the review screen. It lists each detected department with its calculated percentage and a grand total. If the total ≠ 100% an amber warning appears with a **Scale to 100%** option that proportionally adjusts all percentages. The user can **Apply Detected Allocations** to accept the values or **Enter Manually** to jump straight to the Departments tab and type them in.

## v2.2.1 — Forecast Override Reset (2026-04-26)

- **Reset to Calculated Values button**: A button now appears on the Production Forecast screen whenever manual cell overrides are active. Clicking it clears all `forecastOverrides`, allowing the v2.2.0 line-items ÷ active-phase-months formula to take full effect. Fixes cases where stale overrides from earlier sessions were preventing the new forecast logic from running.

## v2.2.0 — Production Forecast: Line Items Drive Cashflow (2026-04-26)

- **Production Forecast now derived purely from line items**: Each department's monthly spend is calculated as `lineItems total ÷ number of active phase months`. Spread evenly, with the last month absorbing rounding. Salary roles have no influence on the forecast whatsoever.
- **Instant updates**: Changing a line item on the Budget screen updates the forecast immediately — no sync step required.
- **Salary Forecast unchanged**: Remains the place for per-person monthly detail; it no longer feeds into the cashflow view.

## v2.1.0 — Batch 14b + 15: Percentage Formatting, Installment Advisor, Budget Integrity, Production Dashboard Overhaul (2026-04-25)

- **Percentage formatting standardised (F2)**: New `formatPercent(value, decimals=1)` utility replaces all inline `.toFixed()` calls. Every percentage display across Assumptions, Budget Wizard, Expenditure Tracker, Salary Forecast, and Production Dashboard now renders to exactly 1 decimal place.
- **Three-part date picker (F1)**: The `<input type="month">` in Assumptions is replaced with a composable `<DatePicker>` component (Month dropdown + optional Day input + Year dropdown). Internally stores ISO `YYYY-MM-DD`; works with or without a day value.
- **Budget integrity check + Mismatch Banner (F4a)**: A debounced (800 ms) integrity check runs whenever `lineItems`, `forecastOverrides`, or `salaryRoles` change. It compares the main budget total against the Production Forecast total and flags a `mismatch` state with the source department. An amber `MismatchBanner` component surfaces on the Budget, Salary, Forecast, and Production screens.
- **Sync Dialog (F4b)**: The "Resolve Mismatch" button opens a modal with three resolution paths — Option A: proportionally scale the forecast to match the budget; Option B: adjust the largest department's line items to absorb the gap; Option C: close and fix manually. Option A shows a preview table before applying.
- **Salary over-allocation warning (F4b)**: The Salary Forecast page now compares the total salary entered against the crew/cast department budget (depts C, D, E, F). When the salary total exceeds allocation a red warning banner appears with the exact overage, and the Grand Total turns red.
- **Installment Advisor (F3a+b)**: New collapsible panel on the Payment Schedules page. Reads `forecastOverrides` to build a monthly cashflow, runs a deficit-elimination algorithm to compute optimal installment timing and percentages (1–5 tranches), and renders an SVG cashflow chart (blue = cumulative spend, green = cumulative income, dashed verticals = installment receipts, red shading = deficit months). Apply writes directly to the installments store and locks the forecast.
- **Production Dashboard refactor (Batch 15)**: All logic extracted into three utility modules (`deriveProductionStats`, `derivePhaseLabel`, `deriveNextMilestone`) and six sub-components (`IdentityStrip`, `KpiRow`, `DeficitAlertBar`, `DeptBarChart`, `ShootProgressBlock`, `DeptStatusTable`) under `src/components/production/`. The dashboard screen is now a thin composition layer. Dedicated CSS classes added to App.css for all production panel layouts.
- **Topbar live spend pill**: A new "Spent" pill appears in the topbar once any expenditure is recorded. It shows the real-time % of budget spent derived from `deriveProductionStats`, coloured green / amber / red by threshold. The existing Health pill now uses `formatPercent`.
- **Next milestone tracking**: `deriveNextMilestone` computes the upcoming phase transition or installment date from the project timeline and start date. Displayed in the Shoot Progress block on the Production Dashboard.

## v2.0.0 — Batch 14: Production Dashboard, Crash Recovery, Smart Upload, Wizard Overhaul (2026-04-25)

- **Production Dashboard (new page)**: Dedicated command-centre page showing budget health KPI row (Total Budget, Total Spent, Remaining, % Used with colour-coded progress bar), department spend-vs-budget bar chart, shoot progress block, full department status table (ON TRACK / AT RISK / OVER BUDGET thresholds), recent transactions panel, and live alerts for unsigned schedules and at-risk departments. All values derive from live project state — no manual entry required.
- **React Error Boundaries**: Every screen and region is now wrapped in an error boundary. Crashes are caught gracefully with a user-friendly error card, a "Reload Section" button, and an automatic error log written to disk. The Electron main process also traps `uncaughtException` and `unhandledRejection` with restart dialogs.
- **Crash recovery**: Budget state is auto-saved to a timestamped `.feemo` recovery file on unload if there are unsaved changes. On next launch the app detects these files and offers to restore them.
- **Universal currency formatting**: All monetary values across every screen now use the shared `formatCurrency()` utility backed by `Intl.NumberFormat`. Accepts both ISO codes (NGN, USD, GBP, EUR) and legacy currency symbols (₦, $, £, €).
- **Smart Upload redesign — 5-stage flow**: File selection → Page Declaration checklist (declare what sheet types your file contains) → Parsing with animated progress bar → Error recovery → Confirmation. Large files (>500 KB) are deferred off the renderer tick to prevent freezes.
- **Shoot days default to 0**: New projects start with 0 shoot days. The topbar pill always shows the current count (including zero) rather than hiding the field.
- **Date picker — three-part selector**: The single `<input type="month">` is replaced with a Month dropdown, Day numeric input, and Year dropdown. Stores ISO YYYY-MM-DD; day field is optional.
- **Wizard weeks/days toggle**: The shoot duration field in Stage 2 of the Budget Questionnaire Wizard now has a days/weeks segmented toggle. Switching units auto-converts the current value; the store always receives days.
- **Bidirectional dept allocation**: Stage 4 of the wizard shows both a percentage field and a currency amount field per department. Editing either one derives and updates the other in real time.
- **Key cast rates removed from wizard**: Stage 5 (Crew & Salary) has been removed from the wizard entirely. Salary data is collected via the dedicated Salary Forecast page after import.
- **File menu Open Project**: "Open Project" (Cmd+O) is now in the native File menu above "New Project", matching user expectation for a macOS/Windows app.
- **Unsaved changes dialog**: Starting a new project when unsaved changes exist shows a modal — Save and Start New / Discard Changes / Go Back.

## v1.7.1 — Fix Batch 10: Atomic Upload, Salary Merge, Pre-Pop Summary, Audit Log (2026-04-24)

- **Atomic budget population**: Uploading a workbook no longer triggers the "Budget Exceeded" dialog mid-import. A suppression flag (`isPopulatingFromUpload`) is raised before writing any data and cleared after all fields are committed. `totalBudget` is written first so every subsequent line-item comparison has the correct target.
- **Salary forecast merge**: Parsed salary roles are now matched against existing grid rows by fuzzy name + department code. Matched rows have their monthly amounts updated; unmatched rows are appended. Re-uploading into a project with existing salary data no longer creates duplicates.
- **Pre-population summary panel**: Before clicking "Load into Project" the confirmation screen now shows a compact preview card — detected document type, total budget, line item / salary / dept allocation / payment schedule counts, green-badged fields that will be set, and grey-badged fields not detected in the workbook.
- **Overwrite warning modal**: If the project already contains data (existing line items, salary roles, or assumption fields), a destructive-action dialog appears listing what would be lost before the import proceeds. The user must explicitly confirm before data is replaced. Salary roles are always merged, never replaced outright.
- **Upload audit log**: After every successful upload the Production Budget screen shows a collapsible "Upload Summary" panel — file name, upload timestamp, document type, cross-check note, stats row, and a full field-by-field populated/missing breakdown. Dismissing the panel clears it from state.
- **Soft cross-check**: If the sum of imported line items differs from the stated total budget by more than 1%, an informational amber note appears (not a blocking error) explaining the delta and suggesting where to correct it.

## v1.7.0 — Fix Batch 9: Smart Budget Reading, Population Engine, Budget Wizard, File Management (2026-04-24)

- **Budget type auto-detection**: Workbooks are now classified into one of five types — Full Production Budget, Production Forecast, Salary Forecast, Departmental Summary, or Mixed — before any population attempt. A banner at the top of the confirmation screen shows the detected type and lets you override it.
- **Column-position-independent parsing**: The budget summary parser now scans each sheet for column headers (Detail, Qty, Rate, Unit, Total) instead of assuming fixed column positions. Nigerian templates with non-standard layouts are now parsed correctly.
- **Correct population routing per type**: Forecast sheets no longer contaminate the main budget grid. Each document type is routed to the appropriate store fields only (forecast → Production Forecast tab, salary → Salary Forecast tab, dept summary → allocations only).
- **Budget Questionnaire Wizard**: A 6-stage guided wizard launches automatically for sparse or summary-only documents (fewer than 60% of departments populated). Covers: Project Basics, Shoot Parameters, Timeline, Department Allocations (with running total and balance warning), Crew & Salary, and Funding Installments. Shows a full summary screen before applying data.
- **Keyword dictionaries extracted**: All SHEET_KEYWORDS and DEPT_ALIASES moved to `src/utils/keywords.ts` as the single source of truth — updating labels no longer requires touching parser logic.
- **File > New Project (Fresh Start)**: New menu item in the native File menu (also Cmd+Shift+N / Ctrl+Shift+N). Shows a confirmation dialog with Save / Don't Save / Cancel options, then fully resets all project state and lands on the Assumptions screen — accessible from anywhere inside the app without relaunching.

## v1.3.0

- **Auto-update notifications**: App now silently checks for updates on launch and shows a dialog with version info and a full changelog when a new release is available. Download and install directly from the dialog.
- **Keyboard shortcut**: Press Cmd+S (Mac) or Ctrl+S (Windows) from any screen to save your project instantly.
- **Issue detection**: Live validation on the Assumptions and Production Forecast screens highlights problems — missing timeline, unbalanced installments, cash flow gaps — with one-click fix buttons.
- **Recent projects**: The Open Project dialog now shows your recently opened files for quick access. Recent projects also appear on the Home screen.
- **Clean start**: New projects now open with all fields blank (no sample title or company pre-filled).

## v1.2.0

- **In-app updates**: Check for updates and download the new installer directly from the About screen — no browser required.
- **Save vs Save As**: "Save" writes instantly to app storage; "Save As" exports a `.feemo` file via the OS dialog.
- **Reset buttons**: Individual reset buttons for Timeline, Installments, and Department Allocations.
- **Production Fee auto-calculation**: Department II (Contingency / Production Fee) is now read-only and calculated automatically from the percentage you enter in Project Details.
- **Installment timing fix**: The "Suggest Installment Timing" algorithm now places each tranche at the exact month cash runs out, preventing cash flow gaps.
- **Clean defaults**: New projects start with an empty timeline, no installments, and zero allocations.

## v1.1.0

- Currency selector with NGN, USD, and GBP support plus live exchange rate panel.
- Home / Landing screen with New Project and Open Project entry points.
- File management tab with `.feemo` project save and open.
- Unsaved changes tracking with indicator dot on the File nav item.

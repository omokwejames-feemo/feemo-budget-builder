# Changelog

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

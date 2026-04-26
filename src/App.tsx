import { useState, useEffect, useRef, useCallback } from 'react'
import { useBudgetStore, BudgetState } from './store/budgetStore'
import { AppErrorBoundary, PageErrorBoundary } from './components/ErrorBoundary'
import HomeScreen from './screens/HomeScreen'
import NoticesDrawer from './components/NoticesDrawer'
import AssumptionsDashboard from './screens/AssumptionsDashboard'
import ProductionBudget from './screens/ProductionBudget'
import SalaryForecast from './screens/SalaryForecast'
import ProductionForecast from './screens/ProductionForecast'
import ExportScreen from './screens/ExportScreen'
import FileScreen from './screens/FileScreen'
import AboutScreen from './screens/AboutScreen'
import PaymentScheduleCreator from './screens/PaymentScheduleCreator'
import ExpenditureTracker from './screens/ExpenditureTracker'
import RebuildFromFiles from './screens/RebuildFromFiles'
import BudgetUploadScreen from './screens/BudgetUploadScreen'
import ProductionDashboard from './screens/ProductionDashboard'
import MismatchBanner from './components/MismatchBanner'
import UpdateDialog from './components/UpdateDialog'
import { runIntegrityCheck } from './utils/budgetIntegrity'
import { deriveProductionStats } from './utils/deriveProductionStats'
import { formatPercent } from './utils/formatPercent'
import OpenProjectDialog from './components/OpenProjectDialog'
import BetaGate from './components/BetaGate'
import { useRecentProjects } from './hooks/useRecentProjects'
import { useIssueDetector } from './hooks/useIssueDetector'
import './App.css'

type Screen = 'assumptions' | 'production' | 'budget' | 'salary' | 'forecast' | 'payments' | 'expenditure' | 'export' | 'file' | 'about'

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'assumptions',  label: 'Assumptions',         icon: '⚙'  },
  { id: 'production',   label: 'Production',          icon: '🎬' },
  { id: 'budget',       label: 'Production Budget',   icon: '₦'  },
  { id: 'salary',       label: 'Salary Forecast',     icon: '👥' },
  { id: 'forecast',     label: 'Production Forecast', icon: '📈' },
  { id: 'payments',     label: 'Payment Schedules',   icon: '📋' },
  { id: 'expenditure',  label: 'Expenditure Tracker', icon: '📊' },
  { id: 'export',       label: 'Export',              icon: '↓'  },
  { id: 'file',         label: 'File',                icon: '🗂' },
  { id: 'about',        label: 'About',               icon: 'ℹ'  },
]

interface PendingUpdate {
  version: string
  current: string
  body: string
}

// ─── Undo/redo state snapshot (budget data only, no session flags) ─────────────
type UndoSnapshot = Pick<BudgetState,
  'project' | 'timeline' | 'installments' | 'deptAllocations' | 'lineItems' |
  'salaryRoles' | 'forecastOverrides' | 'companyProfile' | 'paymentSchedules' | 'expenditureDeductions'
>

function extractSnapshot(s: BudgetState): UndoSnapshot {
  return {
    project:                JSON.parse(JSON.stringify(s.project)),
    timeline:               JSON.parse(JSON.stringify(s.timeline)),
    installments:           JSON.parse(JSON.stringify(s.installments)),
    deptAllocations:        JSON.parse(JSON.stringify(s.deptAllocations)),
    lineItems:              JSON.parse(JSON.stringify(s.lineItems)),
    salaryRoles:            JSON.parse(JSON.stringify(s.salaryRoles)),
    forecastOverrides:      JSON.parse(JSON.stringify(s.forecastOverrides)),
    companyProfile:         JSON.parse(JSON.stringify(s.companyProfile)),
    paymentSchedules:       JSON.parse(JSON.stringify(s.paymentSchedules)),
    expenditureDeductions:  JSON.parse(JSON.stringify(s.expenditureDeductions)),
  }
}

// Returns true if any budget-data reference changed (ignores session-only fields)
function budgetDataChanged(a: BudgetState, b: BudgetState): boolean {
  return (
    a.project !== b.project ||
    a.timeline !== b.timeline ||
    a.installments !== b.installments ||
    a.deptAllocations !== b.deptAllocations ||
    a.lineItems !== b.lineItems ||
    a.salaryRoles !== b.salaryRoles ||
    a.forecastOverrides !== b.forecastOverrides ||
    a.companyProfile !== b.companyProfile ||
    a.paymentSchedules !== b.paymentSchedules ||
    a.expenditureDeductions !== b.expenditureDeductions
  )
}

function App() {
  const [accessGranted, setAccessGranted] = useState(false)
  const [accessExpiresAt, setAccessExpiresAt] = useState<number | null>(null)
  const [showExpiryNotice, setShowExpiryNotice] = useState(false)
  const [appView, setAppView] = useState<'home' | 'app' | 'rebuild' | 'upload'>('home')
  const [screen, setScreen] = useState<Screen>('assumptions')
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const [saveToast, setSaveToast] = useState(false)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [showFreshStartConfirm, setShowFreshStartConfirm] = useState(false)
  const [showNotices, setShowNotices] = useState(false)
  const [crashRecoveryFiles, setCrashRecoveryFiles] = useState<string[]>([])
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('feemo-theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('feemo-theme', theme)
  }, [theme])

  // ── Undo / redo ──────────────────────────────────────────────────────────────
  const undoStackRef   = useRef<UndoSnapshot[]>([])
  const redoStackRef   = useRef<UndoSnapshot[]>([])
  const isUndoRedoing  = useRef(false)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  const store = useBudgetStore()
  const isFirstMount = useRef(true)
  const { recents, addRecent, removeRecent } = useRecentProjects()
  const issues = useIssueDetector()

  // Handle double-click file open from the OS (fires after renderer is ready)
  useEffect(() => {
    window.electronAPI?.onOpenFile(async (filePath) => {
      if (!window.electronAPI) return
      const result = await window.electronAPI.readFileByPath(filePath)
      if (!result.success || !result.data) return
      try {
        const parsed = JSON.parse(result.data)
        isFirstMount.current = true  // suppress unsaved-changes flag on initial load
        store.loadState(parsed)
        setCurrentFilePath(filePath)
        addRecent(filePath)
        setHasUnsavedChanges(false)
        setScreen('assumptions')
        setAccessGranted(true)
        setAppView('app')
      } catch {
        // malformed file — ignore
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent background check on launch
  useEffect(() => {
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
    window.electronAPI?.checkForUpdates()
      .then(r => {
        if (r.success && r.hasUpdate) {
          setPendingUpdate({ version: r.latest, current: r.current, body: r.body ?? '' })
        }
      })
      .catch(() => {})

    // Also listen for updates pushed from main process mid-session
    window.electronAPI?.onUpdateAvailable(info => {
      setPendingUpdate({ version: info.version, current: '', body: info.body })
    })
  }, [])

  // Track unsaved changes whenever store state mutates
  useEffect(() => {
    if (appView !== 'app') return
    const unsub = useBudgetStore.subscribe(() => {
      if (isFirstMount.current) { isFirstMount.current = false; return }
      setHasUnsavedChanges(true)
    })
    return unsub
  }, [appView])

  // ── Budget integrity check (debounced, 800 ms) ───────────────────────────────
  const integrityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (appView !== 'app' || store.isPopulatingFromUpload) return
    if (integrityTimerRef.current) clearTimeout(integrityTimerRef.current)
    integrityTimerRef.current = setTimeout(() => {
      const result = runIntegrityCheck(store)
      store.setBudgetIntegrity(result.status, result.discrepancy, result.sourceDepartment)
    }, 800)
    return () => { if (integrityTimerRef.current) clearTimeout(integrityTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.lineItems, store.forecastOverrides, store.salaryRoles])

  // ── Undo / redo subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (appView !== 'app') return
    let wasPopulating = false

    const unsub = useBudgetStore.subscribe((state, prev) => {
      if (isUndoRedoing.current) return

      const isPopulating = state.isPopulatingFromUpload

      // Upload just started — capture the single pre-upload snapshot
      if (!wasPopulating && isPopulating) {
        if (budgetDataChanged(state, prev)) {
          // push whatever was there before the upload flag flipped
          undoStackRef.current = [...undoStackRef.current.slice(-99), extractSnapshot(prev)]
          redoStackRef.current = []
          setUndoCount(undoStackRef.current.length)
          setRedoCount(0)
        }
        wasPopulating = true
        return
      }

      // During bulk import — suppress individual entries
      if (isPopulating) return

      wasPopulating = false

      // Regular change — only record if budget data actually changed
      if (!budgetDataChanged(state, prev)) return

      undoStackRef.current = [...undoStackRef.current.slice(-99), extractSnapshot(prev)]
      redoStackRef.current = []
      setUndoCount(undoStackRef.current.length)
      setRedoCount(0)
    })

    return unsub
  }, [appView])

  // Undo handler (stable ref so keydown doesn't need to re-register)
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1]
    const current  = extractSnapshot(useBudgetStore.getState())
    isUndoRedoing.current = true
    store.loadState(snapshot)
    isUndoRedoing.current = false
    redoStackRef.current  = [...redoStackRef.current.slice(-99), current]
    undoStackRef.current  = undoStackRef.current.slice(0, -1)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    const snapshot = redoStackRef.current[redoStackRef.current.length - 1]
    const current  = extractSnapshot(useBudgetStore.getState())
    isUndoRedoing.current = true
    store.loadState(snapshot)
    isUndoRedoing.current = false
    undoStackRef.current  = [...undoStackRef.current.slice(-99), current]
    redoStackRef.current  = redoStackRef.current.slice(0, -1)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cmd+S / Ctrl+S / Ctrl+Z / Ctrl+Shift+Z global shortcuts
  useEffect(() => {
    if (appView !== 'app') return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        setShowFreshStartConfirm(true)
      }
      // Undo: Ctrl+Z (but NOT Ctrl+Shift+Z)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
          ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appView, handleUndo, handleRedo])

  // Listen for "New Project" from the native File menu
  useEffect(() => {
    window.electronAPI?.onNewProjectFresh(() => setShowFreshStartConfirm(true))
  }, [])

  // Listen for "Open Project" from the native File menu
  useEffect(() => {
    window.electronAPI?.onMenuOpenProject(() => setShowOpenDialog(true))
  }, [])

  // Check for crash recovery files on launch
  useEffect(() => {
    window.electronAPI?.listCrashRecoveries?.().then(r => {
      if (r.files.length > 0) setCrashRecoveryFiles(r.files)
    }).catch(() => {})
  }, [])

  // Auto-save project state to a crash-recovery file when the window closes unexpectedly
  useEffect(() => {
    const handler = () => {
      if (!hasUnsavedChanges) return
      const data = getSerializableState()
      window.electronAPI?.saveCrashRecovery?.(data).catch(() => {})
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges])

  function getSerializableState() {
    const s = useBudgetStore.getState()
    return JSON.stringify({
      project: s.project,
      timeline: s.timeline,
      installments: s.installments,
      deptAllocations: s.deptAllocations,
      lineItems: s.lineItems,
      salaryRoles: s.salaryRoles,
      forecastOverrides: s.forecastOverrides,
      companyProfile: s.companyProfile,
      paymentSchedules: s.paymentSchedules,
      expenditureDeductions: s.expenditureDeductions,
      notices: s.notices,
    }, null, 2)
  }

  function handleNewProject() {
    isFirstMount.current = true
    undoStackRef.current = []; redoStackRef.current = []
    setUndoCount(0); setRedoCount(0)
    store.resetStore()
    setCurrentFilePath(null)
    setHasUnsavedChanges(false)
    setScreen('assumptions')
    setAppView('app')
  }

  function doFreshStart() {
    isFirstMount.current = true  // must come BEFORE resetStore so the sub doesn't flag unsaved changes
    undoStackRef.current = []; redoStackRef.current = []
    setUndoCount(0); setRedoCount(0)
    store.resetStore()
    setCurrentFilePath(null)
    setHasUnsavedChanges(false)
    setScreen('assumptions')
    setAppView('app')
    setShowFreshStartConfirm(false)
  }

  function handleOpenProject() {
    setShowOpenDialog(true)
  }

  async function doBrowseAndOpen() {
    setShowOpenDialog(false)
    if (!window.electronAPI) return
    const result = await window.electronAPI.openProject()
    if (!result.success || !result.data || !result.filePath) return
    try {
      const parsed = JSON.parse(result.data)
      isFirstMount.current = true  // suppress unsaved-changes flag on initial load
      undoStackRef.current = []; redoStackRef.current = []
      setUndoCount(0); setRedoCount(0)
      store.loadState(parsed)
      setCurrentFilePath(result.filePath)
      addRecent(result.filePath)
      setHasUnsavedChanges(false)
      setScreen('assumptions')
      setAppView('app')
    } catch {
      // malformed file
    }
  }

  async function doOpenRecent(filePath: string) {
    setShowOpenDialog(false)
    if (!window.electronAPI) return
    const result = await window.electronAPI.readFileByPath(filePath)
    if (!result.success || !result.data) {
      await doBrowseAndOpen()
      return
    }
    try {
      const parsed = JSON.parse(result.data)
      isFirstMount.current = true  // suppress unsaved-changes flag on initial load
      undoStackRef.current = []; redoStackRef.current = []
      setUndoCount(0); setRedoCount(0)
      store.loadState(parsed)
      setCurrentFilePath(filePath)
      addRecent(filePath)
      setHasUnsavedChanges(false)
      setScreen('assumptions')
      setAppView('app')
    } catch {
      // malformed file
    }
  }

  async function handleSave() {
    if (window.electronAPI && currentFilePath) {
      // Write back to the file that is currently open
      const data = getSerializableState()
      await window.electronAPI.saveProject(data, currentFilePath)
    }
    // Zustand persist also keeps state in localStorage as a backup
    setHasUnsavedChanges(false)
    setSaveToast(true)
    setTimeout(() => setSaveToast(false), 2000)
  }

  async function handleSaveAs() {
    if (!window.electronAPI) return
    const data = getSerializableState()
    const title = store.project.title || 'untitled'
    const result = await window.electronAPI.saveProjectTo(data, `${title}.feemo`)
    if (result.success && result.filePath) {
      setCurrentFilePath(result.filePath)
      addRecent(result.filePath)
      setHasUnsavedChanges(false)
    }
  }

  function handleClose() {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Close anyway?')) return
    }
    setAppView('home')
    setCurrentFilePath(null)
    setHasUnsavedChanges(false)
  }

  const assumptionIssues = issues.filter(i => i.screen === 'timeline' || i.screen === 'installments')
  const forecastIssues = issues.filter(i => i.screen === 'forecast')
  const hasAssumptionErrors = assumptionIssues.some(i => i.severity === 'error')
  const hasForecastWarnings = forecastIssues.length > 0
  const updateAvailable = pendingUpdate !== null

  if (!accessGranted) {
    return (
      <BetaGate onGranted={(expiresAt) => {
        setAccessGranted(true)
        if (expiresAt !== null) {
          setAccessExpiresAt(expiresAt)
          setShowExpiryNotice(true)
        }
      }} />
    )
  }

  // ── Access expiry notice (shown once per launch after gate passes) ──────────
  if (showExpiryNotice && accessExpiresAt !== null) {
    const msLeft = accessExpiresAt - Date.now()
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
    const expiryDate = new Date(accessExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const urgent = daysLeft <= 1
    const warning = daysLeft <= 2

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-surface)', border: `1px solid ${urgent ? 'var(--accent-red)' : warning ? 'var(--accent-amber)' : 'var(--border-default)'}`, borderRadius: 16, padding: '44px 48px', maxWidth: 440, width: '90%', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
          <div style={{ fontSize: 36, marginBottom: 18 }}>{urgent ? '⚠' : '🔑'}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Beta Access</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 24 }}>Feemo Budget Manager</div>

          {daysLeft === 0 ? (
            <p style={{ fontSize: 15, color: 'var(--accent-red)', fontWeight: 700, lineHeight: 1.6, marginBottom: 8 }}>
              Your beta access expires <strong>today</strong>.
            </p>
          ) : (
            <p style={{ fontSize: 15, color: urgent ? 'var(--accent-red)' : warning ? 'var(--accent-amber)' : 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.6, marginBottom: 8 }}>
              You have <strong style={{ fontSize: 28, display: 'block', margin: '8px 0', color: urgent ? 'var(--accent-red)' : warning ? 'var(--accent-amber)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
              </strong> remaining on your beta access key.
            </p>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 28 }}>
            Access expires on <strong style={{ color: 'var(--text-secondary)' }}>{expiryDate}</strong>.
            {(urgent || warning) && <><br />Contact <a href="mailto:james@feemovision.com" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>james@feemovision.com</a> to extend your access.</>}
          </p>

          <button
            onClick={() => setShowExpiryNotice(false)}
            style={{ width: '100%', padding: '13px 0', background: 'var(--accent-blue)', color: '#fff', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-ui)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            OK, got it
          </button>
        </div>
      </div>
    )
  }

  // Crash recovery dialog
  const crashRecoveryDialog = crashRecoveryFiles.length > 0 ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '36px 40px', maxWidth: 460, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 14 }}>♻</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Unsaved Work Found</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 28 }}>
          We found unsaved work from a previous session. Would you like to restore it?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={async () => {
              const r = await window.electronAPI?.loadCrashRecovery?.(crashRecoveryFiles[0])
              if (r?.success && r.data) {
                try {
                  const parsed = JSON.parse(r.data)
                  store.loadState(parsed)
                  setScreen('assumptions')
                  setAppView('app')
                  isFirstMount.current = true
                } catch {}
              }
              setCrashRecoveryFiles([])
            }}
            style={{ width: '100%', padding: '12px 0', background: 'var(--accent-blue)', color: '#fff', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-ui)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Restore Previous Session
          </button>
          <button
            onClick={async () => {
              for (const f of crashRecoveryFiles) {
                await window.electronAPI?.dismissCrashRecovery?.(f).catch(() => {})
              }
              setCrashRecoveryFiles([])
            }}
            style={{ width: '100%', padding: '12px 0', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-ui)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer' }}
          >
            Discard &amp; Start Fresh
          </button>
        </div>
      </div>
    </div>
  ) : null

  // Fresh-start dialog rendered as a floating overlay regardless of current view
  const freshStartDialog = showFreshStartConfirm ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: '36px 40px', maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 14 }}>◻</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Start a New Project?</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 28 }}>
          {hasUnsavedChanges
            ? `You have unsaved changes to ${store.project.title || 'this project'}. What would you like to do?`
            : 'This will close the current project. Any unsaved changes will be lost.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasUnsavedChanges && (
            <button
              onClick={async () => { await handleSave(); doFreshStart() }}
              style={{ width: '100%', padding: '12px 0', background: 'var(--accent-blue)', color: '#fff', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-ui)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Save and Start New
            </button>
          )}
          <button
            onClick={doFreshStart}
            style={{ width: '100%', padding: '12px 0', background: hasUnsavedChanges ? 'rgba(240,90,90,0.08)' : 'var(--accent-blue)', color: hasUnsavedChanges ? 'var(--accent-red)' : '#fff', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-ui)', border: hasUnsavedChanges ? '1px solid rgba(240,90,90,0.25)' : 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            {hasUnsavedChanges ? 'Discard Changes and Start New' : 'Start New Project'}
          </button>
          <button
            onClick={() => setShowFreshStartConfirm(false)}
            style={{ width: '100%', padding: '12px 0', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-ui)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer' }}
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (appView === 'rebuild') {
    return (
      <>
        <RebuildFromFiles onRebuilt={() => {
          setScreen('assumptions')
          setAppView('app')
          isFirstMount.current = true
        }} />
        {freshStartDialog}
      </>
    )
  }

  if (appView === 'upload') {
    return (
      <>
        <BudgetUploadScreen
          onDone={() => {
            setScreen('assumptions')
            setAppView('app')
            isFirstMount.current = true
          }}
          onCancel={() => setAppView('home')}
        />
        {freshStartDialog}
      </>
    )
  }

  if (appView === 'home') {
    return (
      <>
        <HomeScreen onNewProject={handleNewProject} onOpenProject={handleOpenProject} onUploadBudget={() => setAppView('upload')} recents={recents} onOpenRecent={doOpenRecent} onRebuild={() => setAppView('rebuild')} />
        {showOpenDialog && (
          <OpenProjectDialog
            recents={recents}
            onOpenRecent={doOpenRecent}
            onBrowse={doBrowseAndOpen}
            onRemoveRecent={removeRecent}
            onDismiss={() => setShowOpenDialog(false)}
          />
        )}
        {pendingUpdate && (
          <UpdateDialog update={pendingUpdate} onDismiss={() => setPendingUpdate(null)} />
        )}
        {freshStartDialog}
      </>
    )
  }

  const fileName = currentFilePath ? currentFilePath.split('/').pop() : null

  // Topbar: budget health derived from total allocated %
  const totalAllocPct = Object.values(store.deptAllocations).reduce((s, v) => s + v, 0)
  const healthPct = Math.min(100, Math.round(totalAllocPct))
  const healthClass = healthPct >= 90 ? 'pill-green' : healthPct >= 55 ? 'pill-amber' : store.project.totalBudget > 0 ? 'pill-red' : ''

  // Topbar: live production stats
  const prodStats = deriveProductionStats(store)
  const spentPillClass = prodStats.usedPct > 90 ? 'pill-red' : prodStats.usedPct > 70 ? 'pill-amber' : prodStats.totalSpent > 0 ? 'pill-green' : ''

  const NAV_SECTIONS = [
    {
      label: 'Overview',
      items: [
        { id: 'production'  as Screen, label: 'Dashboard',           icon: '🎬' },
        { id: 'assumptions' as Screen, label: 'Assumptions',         icon: '⊞' },
      ],
    },
    {
      label: 'Finance',
      items: [
        { id: 'budget'      as Screen, label: 'Budget',              icon: '◫' },
        { id: 'salary'      as Screen, label: 'Salary',              icon: '◐' },
        { id: 'forecast'    as Screen, label: 'Forecast',            icon: '◇' },
      ],
    },
    {
      label: 'Payments',
      items: [
        { id: 'payments'    as Screen, label: 'Payment Schedules',   icon: '◈' },
        { id: 'expenditure' as Screen, label: 'Expenditure',         icon: '▣' },
      ],
    },
    {
      label: 'Project',
      items: [
        { id: 'export'      as Screen, label: 'Export',              icon: '↗' },
        { id: 'file'        as Screen, label: 'File',                icon: '◻' },
        { id: 'about'       as Screen, label: 'About',               icon: 'ℹ' },
      ],
    },
  ]

  const unreadNotices = store.notices.filter(n => !n.dismissed).length

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Traffic-light spacer: titleBarStyle=hiddenInset puts macOS buttons here */}
        <div className="sidebar-trafficlight-spacer" />
        <div className="sidebar-brand">
          <div style={{ width: 32, height: 32, flexShrink: 0 }}>
            <img
              src="./feemo-logo.png"
              alt="Feemo"
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }}
              onError={e => {
                const el = e.currentTarget as HTMLImageElement
                el.style.display = 'none'
                const fb = el.nextElementSibling as HTMLElement | null
                if (fb) fb.style.display = 'flex'
              }}
            />
            <span className="brand-logo" style={{ display: 'none' }}>F</span>
          </div>
          <div>
            <div className="brand-name">Feemo</div>
            <div className="brand-sub">Budget Manager</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${screen === item.id ? 'active' : ''}`}
                  onClick={() => setScreen(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.id === 'file' && hasUnsavedChanges && (
                    <span className="nav-dot amber" />
                  )}
                  {item.id === 'assumptions' && hasAssumptionErrors && (
                    <span className="nav-badge red">!</span>
                  )}
                  {item.id === 'forecast' && hasForecastWarnings && (
                    <span className="nav-dot amber" />
                  )}
                  {item.id === 'about' && updateAvailable && (
                    <span className="nav-badge green">↑</span>
                  )}
                </button>
              ))}
            </div>
          ))}

          {/* Notices button */}
          <div className="nav-section-label" style={{ marginTop: 6 }}>System</div>
          <button
            className={`nav-item ${showNotices ? 'active' : ''}`}
            onClick={() => setShowNotices(true)}
          >
            <span className="nav-icon">🔔</span>
            <span>Notices</span>
            {unreadNotices > 0 && (
              <span className="nav-badge">{unreadNotices}</span>
            )}
          </button>
          <button
            className="nav-item"
            onClick={() => window.open('./manual.html', '_blank')}
          >
            <span className="nav-icon">📖</span>
            <span>Download Manual</span>
          </button>
        </nav>

        {/* Undo/redo */}
        {(undoCount > 0 || redoCount > 0) && (
          <div style={{ padding: '6px 14px', fontSize: 10, color: 'var(--text-ghost)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
            <span
              style={{ cursor: undoCount > 0 ? 'pointer' : 'default', color: undoCount > 0 ? 'var(--text-muted)' : 'var(--text-ghost)' }}
              onClick={handleUndo} title="Undo (Ctrl+Z)"
            >↩ {undoCount}</span>
            <span
              style={{ cursor: redoCount > 0 ? 'pointer' : 'default', color: redoCount > 0 ? 'var(--text-muted)' : 'var(--text-ghost)' }}
              onClick={handleRedo} title="Redo (Ctrl+Shift+Z)"
            >↪ {redoCount}</span>
          </div>
        )}

        <div className="sidebar-footer">
          {store.project.title ? (
            <div className="sidebar-project-chip">
              <div className="sidebar-project-chip-label">Active Project</div>
              <div className="sidebar-project-chip-name">{store.project.title}</div>
              {store.project.totalBudget > 0 && (
                <div className="sidebar-project-chip-val">
                  {store.project.currency || '₦'}{(store.project.totalBudget / 1_000_000).toFixed(1)}M
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 4px' }}>
              {appVersion ? `v${appVersion}` : ''} · Feemovision
            </div>
          )}
        </div>
      </aside>

      {/* ── Right panel: topbar + content ── */}
      <div className="content-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-pill topbar-project">
              <span className="pill-label">◻</span>
              <span className="pill-label">Project</span>
              <span className="pill-value">{store.project.title || 'Untitled'}</span>
            </div>
            {fileName && (
              <div className="topbar-pill" style={{ fontSize: 10 }}>
                <span className="pill-label">📄</span>
                <span style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{fileName}</span>
                {hasUnsavedChanges && <span style={{ color: 'var(--accent-amber)', fontSize: 9, fontWeight: 700 }}>●</span>}
              </div>
            )}
          </div>
          <div className="topbar-right">
            {store.project.totalBudget > 0 && (
              <div className={`topbar-pill ${healthClass}`}>
                <span className="pill-label">Health</span>
                <span className="pill-value">{formatPercent(healthPct)}</span>
              </div>
            )}
            {prodStats.totalSpent > 0 && (
              <div className={`topbar-pill ${spentPillClass}`}>
                <span className="pill-label">Spent</span>
                <span className="pill-value">{formatPercent(prodStats.usedPct)}</span>
              </div>
            )}
            <div className="topbar-pill">
              <span className="pill-label">Shoot</span>
              <span className="pill-value">{store.project.shootDays ?? 0}d</span>
            </div>
            {hasForecastWarnings ? (
              <div className="topbar-pill pill-red">
                <span className="pill-label">▾</span>
                <span className="pill-value">Deficit</span>
              </div>
            ) : store.project.totalBudget > 0 ? (
              <div className="topbar-pill pill-green">
                <span className="pill-label">▴</span>
                <span className="pill-value">On Track</span>
              </div>
            ) : null}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAppView('upload')}
              style={{ fontSize: 11 }}
            >
              ↑ Upload Budget
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title="Toggle light / dark mode"
              style={{ fontSize: 14, padding: '5px 10px' }}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <main className="content">
          <MismatchBanner screens={['budget', 'salary', 'forecast', 'production']} currentScreen={screen} />
          {screen === 'assumptions' && <PageErrorBoundary region="Assumptions"><AssumptionsDashboard issues={assumptionIssues} /></PageErrorBoundary>}
          {screen === 'production'  && <PageErrorBoundary region="Production Dashboard"><ProductionDashboard /></PageErrorBoundary>}
          {screen === 'budget'      && <PageErrorBoundary region="Production Budget"><ProductionBudget /></PageErrorBoundary>}
          {screen === 'salary'      && <PageErrorBoundary region="Salary Forecast"><SalaryForecast /></PageErrorBoundary>}
          {screen === 'forecast'    && <PageErrorBoundary region="Production Forecast"><ProductionForecast issues={forecastIssues} /></PageErrorBoundary>}
          {screen === 'payments'    && <PageErrorBoundary region="Payment Schedules"><PaymentScheduleCreator /></PageErrorBoundary>}
          {screen === 'expenditure' && <PageErrorBoundary region="Expenditure Tracker"><ExpenditureTracker /></PageErrorBoundary>}
          {screen === 'export'      && <PageErrorBoundary region="Export"><ExportScreen /></PageErrorBoundary>}
          {screen === 'about'       && <PageErrorBoundary region="About"><AboutScreen /></PageErrorBoundary>}
          {screen === 'file' && (
            <PageErrorBoundary region="File">
              <FileScreen
                currentFilePath={currentFilePath}
                hasUnsavedChanges={hasUnsavedChanges}
                onSave={handleSave}
                onSaveAs={handleSaveAs}
                onOpen={handleOpenProject}
                onClose={handleClose}
                getSerializableState={getSerializableState}
              />
            </PageErrorBoundary>
          )}
        </main>
      </div>

      {/* Modals */}
      {showOpenDialog && (
        <OpenProjectDialog
          recents={recents}
          onOpenRecent={doOpenRecent}
          onBrowse={doBrowseAndOpen}
          onRemoveRecent={removeRecent}
          onDismiss={() => setShowOpenDialog(false)}
        />
      )}
      {pendingUpdate && (
        <UpdateDialog update={pendingUpdate} onDismiss={() => setPendingUpdate(null)} />
      )}
      {freshStartDialog}
      {crashRecoveryDialog}
      {showNotices && (
        <NoticesDrawer
          onClose={() => setShowNotices(false)}
          onNavigate={(targetScreen) => { setScreen(targetScreen as Screen); setShowNotices(false) }}
        />
      )}

      {saveToast && (
        <div className="save-toast">✓ Saved</div>
      )}
    </div>
  )
}

// Root export wraps the entire app in AppErrorBoundary
export default function AppWithBoundary() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  )
}

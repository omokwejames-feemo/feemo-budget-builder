import { useState, useEffect, useRef } from 'react'
import { useBudgetStore } from './store/budgetStore'
import HomeScreen from './screens/HomeScreen'
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
import UpdateDialog from './components/UpdateDialog'
import OpenProjectDialog from './components/OpenProjectDialog'
import BetaGate from './components/BetaGate'
import { useRecentProjects } from './hooks/useRecentProjects'
import { useIssueDetector } from './hooks/useIssueDetector'
import './App.css'

type Screen = 'assumptions' | 'budget' | 'salary' | 'forecast' | 'payments' | 'expenditure' | 'export' | 'file' | 'about'

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'assumptions',  label: 'Assumptions',         icon: '⚙'  },
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

export default function App() {
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
        store.loadState(parsed)
        setCurrentFilePath(filePath)
        addRecent(filePath)
        setHasUnsavedChanges(false)
        isFirstMount.current = true
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

  // Cmd+S / Ctrl+S global save shortcut
  useEffect(() => {
    if (appView !== 'app') return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appView])

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
    }, null, 2)
  }

  function handleNewProject() {
    store.resetStore()
    setCurrentFilePath(null)
    setHasUnsavedChanges(false)
    isFirstMount.current = true
    setScreen('assumptions')
    setAppView('app')
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
      store.loadState(parsed)
      setCurrentFilePath(result.filePath)
      addRecent(result.filePath)
      setHasUnsavedChanges(false)
      isFirstMount.current = true
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
      // File may have been moved — fall back to native dialog
      await doBrowseAndOpen()
      return
    }
    try {
      const parsed = JSON.parse(result.data)
      store.loadState(parsed)
      setCurrentFilePath(filePath)
      addRecent(filePath)
      setHasUnsavedChanges(false)
      isFirstMount.current = true
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
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#141414', border: `1px solid ${urgent ? '#cc2233' : warning ? '#f5a623' : '#2a2a2a'}`, borderRadius: 16, padding: '44px 48px', maxWidth: 440, width: '90%', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>{urgent ? '⚠️' : '🔑'}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Beta Access</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>Feemo Budget Manager</div>

          {daysLeft === 0 ? (
            <p style={{ fontSize: 15, color: '#cc2233', fontWeight: 700, lineHeight: 1.6, marginBottom: 8 }}>
              Your beta access expires <strong>today</strong>.
            </p>
          ) : (
            <p style={{ fontSize: 15, color: urgent ? '#cc2233' : warning ? '#f5a623' : '#ccc', fontWeight: 600, lineHeight: 1.6, marginBottom: 8 }}>
              You have <strong style={{ fontSize: 28, display: 'block', margin: '8px 0', color: urgent ? '#cc2233' : warning ? '#f5a623' : '#fff' }}>
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
              </strong> remaining on your beta access key.
            </p>
          )}

          <p style={{ fontSize: 12, color: '#555', marginBottom: 28 }}>
            Access expires on <strong style={{ color: '#777' }}>{expiryDate}</strong>.
            {(urgent || warning) && <><br />Contact <a href="mailto:james@feemovision.com" style={{ color: '#f5a623', textDecoration: 'none' }}>james@feemovision.com</a> to extend your access.</>}
          </p>

          <button
            onClick={() => setShowExpiryNotice(false)}
            style={{ width: '100%', padding: '13px 0', background: '#f5a623', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            OK, got it
          </button>
        </div>
      </div>
    )
  }

  if (appView === 'rebuild') {
    return (
      <RebuildFromFiles onRebuilt={() => {
        setScreen('assumptions')
        setAppView('app')
        isFirstMount.current = true
      }} />
    )
  }

  if (appView === 'upload') {
    return (
      <BudgetUploadScreen
        onDone={() => {
          setScreen('assumptions')
          setAppView('app')
          isFirstMount.current = true
        }}
        onCancel={() => setAppView('home')}
      />
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
      </>
    )
  }

  const fileName = currentFilePath ? currentFilePath.split('/').pop() : null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ width: 32, height: 32, flexShrink: 0 }}>
            <img
              src="./feemo-logo.png"
              alt="F"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={e => {
                const el = e.currentTarget
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

        {/* File status chip */}
        {(fileName || hasUnsavedChanges) && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>
              {fileName ?? 'Unsaved project'}
            </div>
            {hasUnsavedChanges && (
              <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>● Unsaved changes</div>
            )}
          </div>
        )}

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-item ${screen === item.id ? 'active' : ''}`}
              onClick={() => setScreen(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'file' && hasUnsavedChanges && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              )}
              {item.id === 'assumptions' && hasAssumptionErrors && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
              )}
              {item.id === 'forecast' && hasForecastWarnings && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              )}
              {item.id === 'about' && updateAvailable && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {appVersion ? `v${appVersion}` : 'v1.0.0'} · Feemovision
        </div>
      </aside>

      <main className="content">
        {screen === 'assumptions' && <AssumptionsDashboard issues={assumptionIssues} />}
        {screen === 'budget'      && <ProductionBudget />}
        {screen === 'salary'      && <SalaryForecast />}
        {screen === 'forecast'    && <ProductionForecast issues={forecastIssues} />}
        {screen === 'payments'    && <PaymentScheduleCreator />}
        {screen === 'expenditure' && <ExpenditureTracker />}
        {screen === 'export'      && <ExportScreen />}
        {screen === 'about'       && <AboutScreen />}
        {screen === 'file' && (
          <FileScreen
            currentFilePath={currentFilePath}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onOpen={handleOpenProject}
            onClose={handleClose}
            getSerializableState={getSerializableState}
          />
        )}
      </main>

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

      {/* Quick-save toast */}
      {saveToast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg2)', border: '1px solid var(--green)',
          color: 'var(--green)', fontWeight: 600, fontSize: 13,
          padding: '10px 22px', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 9999, pointerEvents: 'none',
        }}>
          ✓ Saved to app storage
        </div>
      )}
    </div>
  )
}

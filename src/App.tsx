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
import './App.css'

type Screen = 'assumptions' | 'budget' | 'salary' | 'forecast' | 'export' | 'file' | 'about'

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'assumptions', label: 'Assumptions',        icon: '⚙'  },
  { id: 'budget',      label: 'Production Budget',  icon: '₦'  },
  { id: 'salary',      label: 'Salary Forecast',    icon: '👥' },
  { id: 'forecast',    label: 'Production Forecast',icon: '📈' },
  { id: 'export',      label: 'Export',             icon: '↓'  },
  { id: 'file',        label: 'File',               icon: '🗂' },
  { id: 'about',       label: 'About',              icon: 'ℹ'  },
]

export default function App() {
  const [appView, setAppView] = useState<'home' | 'app'>('home')
  const [screen, setScreen] = useState<Screen>('assumptions')
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [saveToast, setSaveToast] = useState(false)

  const store = useBudgetStore()
  const isFirstMount = useRef(true)

  // Fetch version and silently check for updates on first load
  useEffect(() => {
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
    window.electronAPI?.checkForUpdates()
      .then(r => { if (r.success && r.hasUpdate) setUpdateAvailable(true) })
      .catch(() => {})
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

  async function handleOpenProject() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openProject()
    if (!result.success || !result.data || !result.filePath) return
    try {
      const parsed = JSON.parse(result.data)
      store.loadState(parsed)
      setCurrentFilePath(result.filePath)
      setHasUnsavedChanges(false)
      isFirstMount.current = true
      setScreen('assumptions')
      setAppView('app')
    } catch {
      // malformed file — ignore
    }
  }

  // Save: writes to app-internal localStorage (Zustand persist already does this automatically).
  // Shows a brief "Saved" toast to confirm. No dialog, no file path needed.
  function handleSave() {
    setHasUnsavedChanges(false)
    setSaveToast(true)
    setTimeout(() => setSaveToast(false), 2000)
  }

  // Save As: exports the project to a user-chosen .feemo file via OS dialog.
  async function handleSaveAs() {
    if (!window.electronAPI) return
    const data = getSerializableState()
    const title = store.project.title || 'untitled'
    const result = await window.electronAPI.saveProjectTo(data, `${title}.feemo`)
    if (result.success && result.filePath) {
      setCurrentFilePath(result.filePath)
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

  if (appView === 'home') {
    return <HomeScreen onNewProject={handleNewProject} onOpenProject={handleOpenProject} />
  }

  const fileName = currentFilePath ? currentFilePath.split('/').pop() : null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-logo">F</span>
          <div>
            <div className="brand-name">Feemo</div>
            <div className="brand-sub">Budget Builder</div>
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
        {screen === 'assumptions' && <AssumptionsDashboard />}
        {screen === 'budget'      && <ProductionBudget />}
        {screen === 'salary'      && <SalaryForecast />}
        {screen === 'forecast'    && <ProductionForecast />}
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
          />
        )}
      </main>

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

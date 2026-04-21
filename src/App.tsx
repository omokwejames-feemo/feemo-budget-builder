import { useState } from 'react'
import AssumptionsDashboard from './screens/AssumptionsDashboard'
import ProductionBudget from './screens/ProductionBudget'
import SalaryForecast from './screens/SalaryForecast'
import ProductionForecast from './screens/ProductionForecast'
import ExportScreen from './screens/ExportScreen'
import './App.css'

type Screen = 'assumptions' | 'budget' | 'salary' | 'forecast' | 'export'

const NAV = [
  { id: 'assumptions' as Screen, label: 'Assumptions', icon: '⚙' },
  { id: 'budget' as Screen, label: 'Production Budget', icon: '₦' },
  { id: 'salary' as Screen, label: 'Salary Forecast', icon: '👥' },
  { id: 'forecast' as Screen, label: 'Production Forecast', icon: '📈' },
  { id: 'export' as Screen, label: 'Export', icon: '↓' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('assumptions')

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
        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-item ${screen === item.id ? 'active' : ''}`}
              onClick={() => setScreen(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">v1.0 · Feemovision</div>
      </aside>
      <main className="content">
        {screen === 'assumptions' && <AssumptionsDashboard />}
        {screen === 'budget' && <ProductionBudget />}
        {screen === 'salary' && <SalaryForecast />}
        {screen === 'forecast' && <ProductionForecast />}
        {screen === 'export' && <ExportScreen />}
      </main>
    </div>
  )
}

// React Error Boundary — Batch 14 / S7
// Class component required by React's error boundary API.
// Wraps UI regions to catch render-time exceptions and show a recovery UI
// instead of propagating a blank screen.

import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Which region this boundary protects — shown in the fallback title */
  region?: string
  /** If true, shows a full-screen overlay instead of an inline card */
  fullScreen?: boolean
  /** Called when user clicks "Reload Section" — omit to hide the button */
  onReset?: () => void
}

interface State {
  hasError: boolean
  errorMessage: string
  errorDetail: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '', errorDetail: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: humanise(error),
      errorDetail: error.stack ?? '',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const log = [
      `[Feemo Error] ${new Date().toISOString()}`,
      `Region: ${this.props.region ?? 'unknown'}`,
      `Message: ${error.message}`,
      `Stack: ${error.stack ?? '(none)'}`,
      `Component stack: ${info.componentStack}`,
      '---',
    ].join('\n')
    // Best-effort: write to the main process error log
    window.electronAPI?.logError?.(log)
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '', errorDetail: '' })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { region, fullScreen } = this.props
    const { errorMessage } = this.state

    const fallback = (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: fullScreen ? 0 : 32, minHeight: fullScreen ? '100vh' : 240,
        background: fullScreen ? 'var(--bg-base)' : 'transparent',
      }}>
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 14, padding: '32px 40px', maxWidth: 480, width: '90%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            Something went wrong here
          </div>
          {region && (
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              {region}
            </div>
          )}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
            {errorMessage}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {this.props.onReset && (
              <button
                onClick={this.handleReload}
                style={{ padding: '11px 0', background: 'var(--accent-blue)', color: '#fff', fontWeight: 600, fontSize: 13, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
              >
                Reload Section
              </button>
            )}
            {fullScreen && (
              <button
                onClick={() => window.electronAPI?.restartApp?.()}
                style={{ padding: '11px 0', background: 'transparent', color: 'var(--accent-red)', fontWeight: 600, fontSize: 13, border: '1px solid rgba(240,90,90,0.3)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
              >
                Restart App
              </button>
            )}
          </div>
        </div>
      </div>
    )

    if (fullScreen) {
      // Use hard-coded colours so the card is visible even if CSS variables
      // aren't loaded yet (e.g. the crash happened before the theme was applied).
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99998, background: '#0b0e17', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            background: '#1e2540', border: '1px solid #a78bfa',
            borderRadius: 14, padding: '36px 44px', maxWidth: 480, width: '90%',
            boxShadow: '0 0 60px rgba(167,139,250,0.15)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
              Something went wrong
            </div>
            {region && (
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
                {region}
              </div>
            )}
            <p style={{ fontSize: 13, color: '#8892b8', lineHeight: 1.7, marginBottom: 24 }}>
              {errorMessage}
            </p>
            <button
              onClick={() => window.electronAPI?.restartApp?.()}
              style={{ width: '100%', padding: '12px 0', background: '#a78bfa', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Restart App
            </button>
          </div>
        </div>
      )
    }

    return fallback
  }
}

// App-level boundary (full screen, restart button)
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary region="Application" fullScreen>
      {children}
    </ErrorBoundary>
  )
}

// Page-level boundary (inline card, sidebar stays visible)
export function PageErrorBoundary({ children, region }: { children: ReactNode; region: string }) {
  return (
    <ErrorBoundary region={region} onReset={() => {}}>
      {children}
    </ErrorBoundary>
  )
}

// Modal / Wizard boundary
export function WizardErrorBoundary({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <ErrorBoundary region="Budget Wizard" onReset={onClose}>
      {children}
    </ErrorBoundary>
  )
}

// Chart boundary — shows empty placeholder, no crash
export function ChartErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary region="Chart">
      {children}
    </ErrorBoundary>
  )
}

// Upload flow boundary
export function UploadErrorBoundary({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <ErrorBoundary region="Upload" onReset={onReset}>
      {children}
    </ErrorBoundary>
  )
}

// Grid boundary
export function GridErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary region="Budget Grid" onReset={() => {}}>
      {children}
    </ErrorBoundary>
  )
}

function humanise(error: Error): string {
  const msg = error.message || String(error)
  if (msg.includes('Cannot read propert')) return 'A required value was missing — the section failed to load. Try reloading it.'
  if (msg.includes('is not a function')) return 'An internal function call failed unexpectedly. Try reloading this section.'
  if (msg.includes('Maximum update depth')) return 'A render loop was detected and stopped to protect the app.'
  if (msg.includes('ResizeObserver')) return 'A layout measurement failed. Try resizing the window.'
  return `An unexpected error occurred: ${msg.slice(0, 120)}`
}

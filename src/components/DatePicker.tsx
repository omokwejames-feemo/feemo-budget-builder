import { useState, useEffect } from 'react'

interface Props {
  label: string
  value: string                 // YYYY-MM-DD or YYYY-MM accepted
  onChange: (v: string) => void
  hint?: string
  requireDay?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 7,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
  display: 'block',
}

export default function DatePicker({ label, value, onChange, hint }: Props) {
  // Local state — each field is independent so partial entry doesn't clear the other
  const [year, setYear]   = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay]     = useState('')

  // Initialise / sync when an external value is loaded (e.g. file open)
  useEffect(() => {
    if (!value) return  // don't wipe local fields while user is still typing
    const parts = value.split('-')
    if (parts[0]) setYear(parts[0])
    if (parts[1]) setMonth(parts[1])
    if (parts[2]) setDay(parts[2])
  }, [value])

  // Emit only when we have a fully-typed 4-digit year AND a month
  function tryEmit(y: string, m: string, d: string) {
    if (y.length !== 4 || !m) return
    const yn = parseInt(y)
    const mn = parseInt(m)
    if (isNaN(yn) || isNaN(mn)) return
    const yStr = y.padStart(4, '0')
    const mStr = m.padStart(2, '0')
    if (d) {
      const maxD = daysInMonth(yn, mn)
      const clamped = Math.min(parseInt(d) || 1, maxD)
      onChange(`${yStr}-${mStr}-${String(clamped).padStart(2, '0')}`)
    } else {
      onChange(`${yStr}-${mStr}`)
    }
  }

  function handleMonth(m: string) {
    setMonth(m)
    tryEmit(year, m, day)
  }

  function handleDay(d: string) {
    const maxD = daysInMonth(parseInt(year) || new Date().getFullYear(), parseInt(month) || 1)
    const n = parseInt(d)
    if (d !== '' && (isNaN(n) || n < 1 || n > maxD)) return
    setDay(d)
    tryEmit(year, month, d)
  }

  function handleYear(y: string) {
    // Allow typing digits freely; only block non-numeric
    if (y !== '' && !/^\d{0,4}$/.test(y)) return
    setYear(y)
    tryEmit(y, month, day)
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Month dropdown */}
        <select
          value={month}
          onChange={e => handleMonth(e.target.value)}
          style={{ ...inputStyle, flex: 2 }}
        >
          <option value="">Month</option>
          {MONTHS.map((name, idx) => (
            <option key={idx + 1} value={String(idx + 1).padStart(2, '0')}>{name}</option>
          ))}
        </select>

        {/* Day input — optional */}
        <input
          type="number"
          min={1}
          max={31}
          value={day}
          onChange={e => handleDay(e.target.value)}
          placeholder="Day"
          style={{ ...inputStyle, flex: 1, textAlign: 'center' }}
        />

        {/* Year — free text, 4 digits */}
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={e => handleYear(e.target.value)}
          placeholder="YYYY"
          style={{ ...inputStyle, flex: 1, textAlign: 'center' }}
        />
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

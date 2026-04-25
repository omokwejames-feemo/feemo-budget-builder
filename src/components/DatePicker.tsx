// Three-part date picker — Batch 14 / S6.2
// Replaces the single <input type="month"> with three separate selectors:
// [Month dropdown] [Day numeric input] [Year numeric input]
// Stores and emits an ISO YYYY-MM-DD string (or YYYY-MM when day is omitted).

import { useMemo } from 'react'

interface Props {
  label: string
  value: string                 // YYYY-MM-DD or YYYY-MM accepted
  onChange: (v: string) => void
  hint?: string
  requireDay?: boolean          // default false — day input shown but optional
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
  // Parse existing value (supports YYYY-MM-DD and YYYY-MM)
  const parsed = useMemo(() => {
    if (!value) return { year: '', month: '', day: '' }
    const parts = value.split('-')
    return {
      year:  parts[0] ?? '',
      month: parts[1] ?? '',
      day:   parts[2] ?? '',
    }
  }, [value])

  const yearNum  = parseInt(parsed.year)  || new Date().getFullYear()
  const monthNum = parseInt(parsed.month) || 1
  const maxDay   = daysInMonth(yearNum, monthNum)

  function emit(year: string, month: string, day: string) {
    if (!year || !month) { onChange(''); return }
    const y = year.padStart(4, '0')
    const m = month.padStart(2, '0')
    if (day) {
      const clampedDay = Math.min(parseInt(day) || 1, daysInMonth(parseInt(y), parseInt(m)))
      onChange(`${y}-${m}-${String(clampedDay).padStart(2, '0')}`)
    } else {
      onChange(`${y}-${m}`)
    }
  }

  function onMonthChange(m: string) { emit(parsed.year, m, parsed.day) }
  function onDayChange(d: string)   {
    const n = parseInt(d)
    if (d !== '' && (isNaN(n) || n < 1 || n > maxDay)) return
    emit(parsed.year, parsed.month, d)
  }
  function onYearChange(y: string) {
    const n = parseInt(y)
    if (y !== '' && (isNaN(n) || y.length > 4)) return
    emit(y, parsed.month, parsed.day)
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 1 + i)

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Month dropdown */}
        <select
          value={parsed.month}
          onChange={e => onMonthChange(e.target.value)}
          style={{ ...inputStyle, flex: 2, minWidth: 0 }}
        >
          <option value="">Month</option>
          {MONTHS.map((name, idx) => (
            <option key={idx + 1} value={String(idx + 1).padStart(2, '0')}>{name}</option>
          ))}
        </select>

        {/* Day input */}
        <input
          type="number"
          min={1}
          max={maxDay}
          value={parsed.day}
          onChange={e => onDayChange(e.target.value)}
          placeholder="Day"
          style={{ ...inputStyle, flex: 1, minWidth: 0, textAlign: 'center' }}
        />

        {/* Year dropdown */}
        <select
          value={parsed.year}
          onChange={e => onYearChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        >
          <option value="">Year</option>
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

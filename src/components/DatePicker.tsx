// Shared DatePicker component — Fix Batch 11
// Reusable month-and-year picker matching the Assumptions tab input style.
// value / onChange use YYYY-MM format (same as the store's startDate field).

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 13px',
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 7,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  colorScheme: 'dark',
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
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="month"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
        min="2000-01"
        max="2040-12"
      />
      {hint && (
        <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

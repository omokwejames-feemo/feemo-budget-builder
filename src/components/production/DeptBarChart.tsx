interface DeptData {
  name: string
  budgeted: number
  spent: number
}

function spentColor(budgeted: number, spent: number): string {
  if (budgeted <= 0) return 'var(--text-ghost)'
  const pct = (budgeted - spent) / budgeted
  if (spent > budgeted) return 'var(--accent-red)'
  if (pct <= 0.15) return 'var(--accent-amber)'
  return 'var(--accent-green)'
}

interface Props {
  depts: DeptData[]
}

export default function DeptBarChart({ depts }: Props) {
  const maxVal = Math.max(...depts.flatMap(d => [d.budgeted, d.spent]), 1)
  const barH = 14
  const gap = 4
  const rowH = barH * 2 + gap + 20
  const labelW = 140
  const chartW = 340

  return (
    <svg
      width={labelW + chartW + 40}
      height={depts.length * rowH + 10}
      style={{ fontFamily: 'var(--font-ui)', overflow: 'visible' }}
    >
      {depts.map((d, i) => {
        const y = i * rowH
        const bW = (d.budgeted / maxVal) * chartW
        const sW = (d.spent / maxVal) * chartW
        const sColor = spentColor(d.budgeted, d.spent)
        return (
          <g key={d.name}>
            <text x={labelW - 6} y={y + barH} textAnchor="end" fontSize={9} fill="var(--text-muted)" dominantBaseline="middle">{d.name}</text>
            <rect x={labelW} y={y} width={Math.max(bW, 2)} height={barH} rx={2} fill="var(--border-default)" />
            <rect x={labelW} y={y + barH + gap} width={Math.max(sW, 2)} height={barH} rx={2} fill={sColor} opacity={0.8} />
          </g>
        )
      })}
      <rect x={labelW} y={depts.length * rowH - 4} width={12} height={8} rx={1} fill="var(--border-default)" />
      <text x={labelW + 16} y={depts.length * rowH} fontSize={9} fill="var(--text-ghost)" dominantBaseline="middle">Budgeted</text>
      <rect x={labelW + 72} y={depts.length * rowH - 4} width={12} height={8} rx={1} fill="var(--accent-green)" opacity={0.8} />
      <text x={labelW + 88} y={depts.length * rowH} fontSize={9} fill="var(--text-ghost)" dominantBaseline="middle">Spent</text>
    </svg>
  )
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value as number)) return '0.0%'
  const clamped = Math.max(0, Number(value))
  return clamped.toFixed(decimals) + '%'
}

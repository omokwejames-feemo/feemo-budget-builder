// Universal currency formatter — Batch 14 / S4.2
// Single source of truth for all currency rendering in Feemo Budget Manager.
// Every screen that shows a money value MUST call this function.
// No inline .toFixed(), no raw number rendering, no ad-hoc toLocaleString().

// Maps ISO codes OR legacy symbol values to { locale, isoCode }
const CURRENCY_MAP: Record<string, { locale: string; code: string }> = {
  // ISO codes (preferred)
  NGN: { locale: 'en-NG', code: 'NGN' },
  USD: { locale: 'en-US', code: 'USD' },
  GBP: { locale: 'en-GB', code: 'GBP' },
  EUR: { locale: 'de-DE', code: 'EUR' },
  // Legacy symbols stored in older project files
  '₦': { locale: 'en-NG', code: 'NGN' },
  N:   { locale: 'en-NG', code: 'NGN' },
  '$': { locale: 'en-US', code: 'USD' },
  '£': { locale: 'en-GB', code: 'GBP' },
  '€': { locale: 'de-DE', code: 'EUR' },
}

function resolve(currency: string) {
  return CURRENCY_MAP[currency] ?? { locale: 'en-NG', code: 'NGN' }
}

/**
 * Format a numeric value as a currency string with 2 decimal places and
 * thousand-separator commas.
 *
 * @param value   - Raw numeric amount (in the project's base unit)
 * @param currency - ISO 4217 currency code (default: 'NGN')
 * @returns Formatted string, e.g. "₦10,000.00" or "$1,234,567.89"
 */
export function formatCurrency(value: number | null | undefined, currency = 'NGN'): string {
  if (value === null || value === undefined || isNaN(value as number)) return '—'
  const { locale, code } = resolve(currency || 'NGN')
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value as number)
  } catch {
    return new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value as number)
  }
}

/**
 * Format a plain number with thousand-separator commas and 2 decimal places
 * (no currency symbol). Use for totals displayed alongside a currency label.
 */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value as number)) return '—'
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value as number)
}

/**
 * Format a currency value without decimals — for compact display in chart
 * labels or small pills where space is tight.
 */
export function formatCurrencyCompact(value: number | null | undefined, currency = 'NGN'): string {
  if (value === null || value === undefined || isNaN(value as number)) return '—'
  const { locale, code } = resolve(currency || 'NGN')
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value as number)
  } catch {
    return new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value as number)
  }
}

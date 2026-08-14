/** Amounts live in minor units as integers; only the presentation edge divides by 100. */
export function formatMoney(amountPence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountPence / 100);
}

/** People filter in pounds; everything below the presentation edge speaks minor units. */
export function penceFromPounds(pounds: number): number {
  return Math.round(pounds * 100);
}

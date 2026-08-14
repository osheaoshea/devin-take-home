/** Amounts live in minor units as integers; only the presentation edge divides by 100. */
export function formatMoney(amountPence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountPence / 100);
}

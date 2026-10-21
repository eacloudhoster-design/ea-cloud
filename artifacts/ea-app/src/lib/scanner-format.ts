export function formatScannerPrice(value: number | null, locale?: string): string {
  if (value === null) return "—";
  // Do not round valid tiny levels to zero. This is display only, never an order price.
  if (value < 0.000001) return value.toExponential();
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 20 });
}

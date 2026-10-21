// Preparation limits only; actual broker limits must be checked by a future MT5 adapter.
export const LOT_MIN_UNITS = 1;
export const LOT_MAX_UNITS = 5000;
export interface ScannerTradeSettings { lotUnits: number; positions: number }
export const formatLots = (units: number) => (units / 100).toFixed(2);
export function parseLotUnits(value: string): number | null {
  const match = /^(\d{0,2})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const units = Number(match[1] || 0) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return units >= LOT_MIN_UNITS && units <= LOT_MAX_UNITS ? units : null;
}
export function parsePositions(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const count = Number(value);
  return count >= 1 && count <= 20 ? count : null;
}
export function adjustLotUnits(units: number, direction: 1 | -1) {
  return Math.max(LOT_MIN_UNITS, Math.min(LOT_MAX_UNITS, units + direction));
}

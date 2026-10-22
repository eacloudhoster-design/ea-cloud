import type { ShapeStyle } from "@/context/AppContext";
export const shapeOptions: readonly ShapeStyle[] = ["orbit", "neural", "none"];
export const isShapeStyle = (value: unknown): value is ShapeStyle => shapeOptions.includes(value as ShapeStyle);
export function shapePreferenceKey(token: string | null): string | null {
  if (!token) return null;
  try { const [id, role] = atob(token).split(":"); return role === "client" && /^[1-9]\d*$/.test(id) ? `ea-cloud:client:${id}:robot-shape` : null; } catch { return null; }
}
export function readShapePreference(storage: Pick<Storage,"getItem">, key: string | null): ShapeStyle {
  if (!key) return "orbit";
  try { const value = storage.getItem(key); return isShapeStyle(value) ? value : "orbit"; } catch { return "orbit"; }
}
export function saveShapePreference(storage: Pick<Storage,"setItem">, key: string | null, value: ShapeStyle): boolean {
  if (!key || !isShapeStyle(value)) return false;
  try { storage.setItem(key, value); return true; } catch { return false; }
}

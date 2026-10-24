import type { ShapeStyle } from "@/context/AppContext";
export const shapeOptions: readonly ShapeStyle[] = ["orbit", "neural", "none"];
export const isShapeStyle = (value: unknown): value is ShapeStyle =>
  shapeOptions.includes(value as ShapeStyle);
export function shapePreferenceKey(token: string | null): string | null {
  if (!token) return null;
  try {
    const [id, role] = atob(token).split(":");
    return role === "client" && /^[1-9]\d*$/.test(id)
      ? `ea-cloud:client:${id}:robot-shape`
      : null;
  } catch {
    return null;
  }
}
export function readShapePreference(
  storage: Pick<Storage, "getItem">,
  key: string | null,
): ShapeStyle {
  if (!key) return "orbit";
  try {
    const value = storage.getItem(key);
    return isShapeStyle(value) ? value : "orbit";
  } catch {
    return "orbit";
  }
}
export function saveShapePreference(
  storage: Pick<Storage, "setItem">,
  key: string | null,
  value: ShapeStyle,
): boolean {
  if (!key || !isShapeStyle(value)) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export type PortraitPreference = {
  shape: ShapeStyle;
  previous: Exclude<ShapeStyle, "none">;
};
export type PortraitScope = { bot: string; interfaceStyle: string };
export function portraitPreferenceKey(
  token: string | null,
  scope: PortraitScope,
) {
  const account = shapePreferenceKey(token);
  return account
    ? `${account}:bot:${encodeURIComponent(scope.bot)}:interface:${scope.interfaceStyle}`
    : null;
}
export function readPortraitPreference(
  storage: Pick<Storage, "getItem">,
  key: string | null,
  legacyKey: string | null,
  mentorDefault?: ShapeStyle,
): PortraitPreference {
  let initial: ShapeStyle =
    mentorDefault && isShapeStyle(mentorDefault) ? mentorDefault : "orbit";
  try {
    const legacy = legacyKey && storage.getItem(legacyKey);
    if (!mentorDefault && isShapeStyle(legacy)) initial = legacy;
  } catch {}
  const fallback: PortraitPreference = {
    shape: initial,
    previous: initial === "neural" ? "neural" : "orbit",
  };
  if (!key) return fallback;
  try {
    const data = JSON.parse(storage.getItem(key) || "null");
    return data &&
      isShapeStyle(data.shape) &&
      ["orbit", "neural"].includes(data.previous)
      ? { shape: data.shape, previous: data.previous }
      : fallback;
  } catch {
    return fallback;
  }
}
export function nextPortraitPreference(
  current: PortraitPreference,
  shape: ShapeStyle,
): PortraitPreference {
  return {
    shape,
    previous:
      shape === "none"
        ? current.shape === "none"
          ? current.previous
          : current.shape
        : shape,
  };
}

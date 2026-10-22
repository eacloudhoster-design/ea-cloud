import type { InterfaceStyle } from "@/context/AppContext";

export const interfaceOrder: readonly InterfaceStyle[] = [
  "regular",
  "matrix",
  "s2tone",
];
export const backgroundAnimations = [
  "none",
  "pulse",
  "glow",
  "matrix",
  "particles",
] as const;
export type BackgroundAnimation = (typeof backgroundAnimations)[number];
export const isBackgroundAnimation = (
  value: unknown,
): value is BackgroundAnimation =>
  backgroundAnimations.includes(value as BackgroundAnimation);

export type HomePreferences = {
  backgroundAnimation: BackgroundAnimation;
  interfaceStyle: InterfaceStyle;
  showBg: boolean;
};
export const defaultHomePreferences: HomePreferences = {
  interfaceStyle: "matrix",
  showBg: true,
  backgroundAnimation: "none",
};
export const isInterfaceStyle = (value: unknown): value is InterfaceStyle =>
  interfaceOrder.includes(value as InterfaceStyle);

export function homePreferenceKey(token: string | null): string | null {
  if (!token) return null;
  try {
    const [id, role] = atob(token).split(":");
    return role === "client" && /^[1-9]\d*$/.test(id)
      ? `ea-cloud:client:${id}:home-appearance`
      : null;
  } catch {
    return null;
  }
}

export function readHomePreferences(
  storage: Pick<Storage, "getItem">,
  key: string | null,
): HomePreferences {
  if (key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      return {
        interfaceStyle: isInterfaceStyle(value?.interfaceStyle)
          ? value.interfaceStyle
          : "matrix",
        backgroundAnimation: isBackgroundAnimation(value?.backgroundAnimation)
          ? value.backgroundAnimation
          : "none",
        showBg: typeof value?.showBg === "boolean" ? value.showBg : true,
      };
    } catch {
      /* Invalid or unavailable storage keeps the existing defaults. */
    }
  }
  return { ...defaultHomePreferences };
}

export function saveHomePreferences(
  storage: Pick<Storage, "setItem">,
  key: string | null,
  value: HomePreferences,
): boolean {
  if (
    !key ||
    !isInterfaceStyle(value.interfaceStyle) ||
    typeof value.showBg !== "boolean" ||
    !isBackgroundAnimation(value.backgroundAnimation)
  )
    return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function adjacentInterface(
  current: InterfaceStyle,
  direction: "next" | "previous",
): InterfaceStyle {
  const index = interfaceOrder.indexOf(current);
  return interfaceOrder[
    (index + (direction === "next" ? 1 : -1) + interfaceOrder.length) %
      interfaceOrder.length
  ];
}

export function horizontalSwipe(
  dx: number,
  dy: number,
  elapsed: number,
): "next" | "previous" | null {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    elapsed > 1200
  )
    return null;
  return Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5
    ? dx < 0
      ? "next"
      : "previous"
    : null;
}

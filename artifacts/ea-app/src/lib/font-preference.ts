export const botFonts = [
  "Inter",
  "Roboto",
  "Orbitron",
  "Flipside BRK",
  "Rubik Glitch",
  "Oxanium",
  "Audiowide",
  "Chakra Petch",
  "Rajdhani",
  "Rubik Iso",
  "Michroma",
] as const;
export type BotFont = (typeof botFonts)[number];
export const isBotFont = (value: unknown): value is BotFont =>
  botFonts.includes(value as BotFont);
const nativeFontWeights: Partial<Record<BotFont, number>> = {
  "Flipside BRK": 400,
  "Rubik Glitch": 400,
  Oxanium: 700,
  Audiowide: 400,
  "Chakra Petch": 700,
  Rajdhani: 700,
  "Rubik Iso": 400,
  Michroma: 400,
};

export const botFontStyle = (font: BotFont = "Inter", preview = false) => ({
  fontFamily: `"EA Bot ${font}", sans-serif`,
  fontWeight:
    preview && font === "Rajdhani"
      ? 600
      : (nativeFontWeights[font] ?? (preview ? 600 : 900)),
  fontSynthesis: "none" as const,
});
export function fontPreferenceKey(token: string | null): string | null {
  if (!token) return null;
  try {
    const [id, role] = atob(token).split(":");
    return role === "client" && /^[1-9]\d*$/.test(id)
      ? `ea-cloud:client:${id}:bot-font`
      : null;
  } catch {
    return null;
  }
}
export function readFontPreference(
  storage: Pick<Storage, "getItem">,
  key: string | null,
): BotFont {
  if (!key) return "Inter";
  try {
    const value = storage.getItem(key);
    return isBotFont(value) ? value : "Inter";
  } catch {
    return "Inter";
  }
}
export function saveFontPreference(
  storage: Pick<Storage, "setItem">,
  key: string | null,
  font: BotFont,
): boolean {
  if (!key || !isBotFont(font)) return false;
  try {
    storage.setItem(key, font);
    return true;
  } catch {
    return false;
  }
}

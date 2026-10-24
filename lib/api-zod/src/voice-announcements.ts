/** Public, fixed phrases only. Never add account facts or mentor/private text here. */
export const commonNaturalAnnouncements = [
  "Normal mode activated.",
  "Beast mode activated.",
  "Aggressive mode activated.",
  "Ultimate mode activated.",
  "Symbol configured.",
  "No trades currently open.",
  "Chart analysis started.",
  "Fundamental analysis started.",
  "Fundamental analysis completed.",
  "Chart analysis failed. Check the scanner message.",
  "Bot activation failed.",
  "Bot deactivation failed.",
] as const;
export const isCommonNaturalAnnouncement = (text: string) =>
  commonNaturalAnnouncements.includes(
    text as (typeof commonNaturalAnnouncements)[number],
  );

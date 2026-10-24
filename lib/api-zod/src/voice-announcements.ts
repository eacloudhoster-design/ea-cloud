import phrases from "./common-voice-phrases.json";
/** Public fixed recordings; never add private account information. */
export const commonNaturalAnnouncements: readonly string[] = phrases;
export const isCommonNaturalAnnouncement = (text: string) => commonNaturalAnnouncements.includes(text);

export const botFonts = ["Inter","Roboto","Orbitron","Rajdhani","Exo 2"] as const;
export type BotFont = typeof botFonts[number];
export const isBotFont = (value: unknown): value is BotFont => botFonts.includes(value as BotFont);
export const botFontStyle = (font: BotFont = "Inter") => ({fontFamily:`"EA Bot ${font}", sans-serif`,fontWeight:font==="Rajdhani"?700:900,fontSynthesis:"none" as const});
export function fontPreferenceKey(token:string|null):string|null{
 if(!token)return null;
 try{const[id,role]=atob(token).split(":");return role==="client"&&/^[1-9]\d*$/.test(id)?`ea-cloud:client:${id}:bot-font`:null;}catch{return null;}
}
export function readFontPreference(storage:Pick<Storage,"getItem">,key:string|null):BotFont{
 if(!key)return "Inter";try{const value=storage.getItem(key);return isBotFont(value)?value:"Inter";}catch{return "Inter";}
}
export function saveFontPreference(storage:Pick<Storage,"setItem">,key:string|null,font:BotFont):boolean{
 if(!key||!isBotFont(font))return false;try{storage.setItem(key,font);return true;}catch{return false;}
}

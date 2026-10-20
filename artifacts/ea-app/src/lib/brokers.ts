/** Display hints only: a server name never proves a broker's identity.
 * Assets come from broker-owned websites or the attributed Commons originals.
 * See docs/mt5-connection-preview.md for provenance and availability limitations.
 */
export interface Broker {
  id: string;
  name: string;
  aliases: string[];
  logo: string;
  source: string;
}

const commons = (file: string) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
export const brokers: Broker[] = [
  { id: "oanda", name: "OANDA", aliases: ["oanda"], logo: "https://www.oanda.com/favicon.ico", source: "https://www.oanda.com/" },
  { id: "avatrade", name: "AvaTrade", aliases: ["avatrade", "ava"], logo: "https://www.avatrade.com/favicon.ico", source: "https://www.avatrade.com/" },
  { id: "exness", name: "Exness", aliases: ["exness"], logo: "https://www.exness.com/static/apple-icon.png", source: "https://www.exness.com/" },
  { id: "deriv", name: "Deriv", aliases: ["deriv", "binary"], logo: "https://deriv.com/favicon.ico", source: "https://deriv.com/" },
  { id: "ic-markets", name: "IC Markets", aliases: ["icmarkets", "internationalcapitalmarkets"], logo: commons("IC Markets logo main.gif"), source: "https://commons.wikimedia.org/wiki/File:IC_Markets_logo_main.gif" },
  { id: "pepperstone", name: "Pepperstone", aliases: ["pepperstone"], logo: commons("Pepperstone.svg"), source: "https://commons.wikimedia.org/wiki/File:Pepperstone.svg" },
  { id: "xm", name: "XM", aliases: ["xmglobal", "xmtrading", "tradingpoint", "xm"], logo: commons("XM-logo-2024.jpg"), source: "https://commons.wikimedia.org/wiki/File:XM-logo-2024.jpg" },
  { id: "hfm", name: "HFM", aliases: ["hfmarkets", "hotforex", "hfm"], logo: "https://static.grouphfm.com/assets/hfappnew/websites/affiliates/images/brand-guidelines/hfm-aff-logo-black-version.svg", source: "https://affiliates.grouphfm.com/en/brand-guidelines" },
  { id: "fbs", name: "FBS", aliases: ["fbs"], logo: "https://fbs.com/favicon.ico", source: "https://fbs.com/" },
  { id: "tickmill", name: "Tickmill", aliases: ["tickmill"], logo: "https://www.tickmill.com/favicon.ico", source: "https://www.tickmill.com/" },
  { id: "fxtm", name: "FXTM", aliases: ["forextimefxtm", "forextime", "fxtm"], logo: commons("FXTM logo.svg"), source: "https://commons.wikimedia.org/wiki/File:FXTM_logo.svg" },
];

// Require a broker prefix and a recognised server suffix, rather than arbitrary
// substring matches (e.g. "my-exness-copy" or "notxm" must remain unknown).
const suffix = /^(?:(?:mt[45]|real|live|demo|trial|server|standard|pro|raw|ecn|sc|eu|uk|au|ke|za|mu|bvi|sv|svg|svd|ltd|limited|global|intl|international|llc|cy|cyprus|com|us|belize|hedge|netting|cent|zero|prime|[0-9])+)?$/;
export function detectBroker(server: string): Broker | null {
  const value = server.toLowerCase().replace(/[\s._-]/g, "");
  if (!value || !/^[a-z0-9]+$/.test(value)) return null;
  return brokers.find(broker => broker.aliases.some(alias => value.startsWith(alias) && suffix.test(value.slice(alias.length)))) ?? null;
}

export function validateMt5Preview(login: string, password: string, server: string): string | null {
  if (!login.trim() || !password || !server.trim()) return "Enter your account number, password and broker server.";
  if (!/^\d+$/.test(login.trim()) || !/[1-9]/.test(login)) return "Enter a valid MT5 account number using digits only.";
  if (server.trim().length > 128) return "Enter a broker server name of 128 characters or fewer.";
  return null;
}

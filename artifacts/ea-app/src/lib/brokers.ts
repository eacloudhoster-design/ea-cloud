/** Display hints only: a server name never proves a broker's identity.
 * Authentic logo files are bundled with the app; no remote logo requests.
 * See assets/brokers/README.md for pinned sources and asset checksums.
 */
export interface Broker {
  id: string;
  name: string;
  aliases: string[];
  logo: string;
  source: string;
  logoBackground?: string;
}

export const brokers: Broker[] = [
  { id: "oanda", name: "OANDA", aliases: ["oanda"], logo: new URL("../assets/brokers/oanda.png", import.meta.url).href, source: "https://www.oanda.com/" },
  { id: "avatrade", name: "AvaTrade", aliases: ["avatrade", "ava"], logo: new URL("../assets/brokers/avatrade.png", import.meta.url).href, source: "https://www.avatrade.com/" },
  { id: "exness", name: "Exness", aliases: ["exness"], logo: new URL("../assets/brokers/exness.png", import.meta.url).href, source: "https://www.exness.com/" },
  { id: "deriv", name: "Deriv", aliases: ["deriv", "binary"], logo: new URL("../assets/brokers/deriv.svg", import.meta.url).href, source: "https://deriv.com/" },
  { id: "ic-markets", name: "IC Markets", aliases: ["icmarkets", "internationalcapitalmarkets"], logo: new URL("../assets/brokers/ic-markets.png", import.meta.url).href, logoBackground: "#08131f", source: "https://www.icmarkets.com/" },
  { id: "pepperstone", name: "Pepperstone", aliases: ["pepperstone"], logo: new URL("../assets/brokers/pepperstone.png", import.meta.url).href, source: "https://pepperstone.com/" },
  { id: "xm", name: "XM", aliases: ["xmglobal", "xmtrading", "tradingpoint", "xm"], logo: new URL("../assets/brokers/xm.png", import.meta.url).href, logoBackground: "#08131f", source: "https://www.xm.com/" },
  { id: "hfm", name: "HFM", aliases: ["hfmarkets", "hotforex", "hfm"], logo: new URL("../assets/brokers/hfm.svg", import.meta.url).href, logoBackground: "#08131f", source: "https://affiliates.grouphfm.com/en/brand-guidelines" },
  { id: "fbs", name: "FBS", aliases: ["fbs"], logo: new URL("../assets/brokers/fbs.png", import.meta.url).href, source: "https://fbs.com/" },
  { id: "tickmill", name: "Tickmill", aliases: ["tickmill"], logo: new URL("../assets/brokers/tickmill.png", import.meta.url).href, source: "https://www.tickmill.com/" },
  { id: "fxtm", name: "FXTM", aliases: ["forextimefxtm", "forextime", "fxtm"], logo: new URL("../assets/brokers/fxtm.svg", import.meta.url).href, source: "https://www.fxtm.com/" },
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

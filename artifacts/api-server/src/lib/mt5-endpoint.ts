// Private transport configuration; no public plaintext credential transport.
export const MT5_VPS_BASE = (process.env.MT5_VPS_URL || "http://127.0.0.1:8005").replace(/\/+$/, "");
const endpoint = new URL(MT5_VPS_BASE);
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
    (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))) {
  throw new Error("MT5_VPS_URL requires HTTPS or loopback HTTP and no embedded credentials");
}
export function mt5Headers(): Record<string, string> {
  const token = process.env.MT5_VPS_TOKEN;
  if (!token || !/^[\x21-\x7e]{32,2048}$/.test(token)) throw new Error("MT5 VPS service credential is not configured");
  const id=process.env.MT5_ACCESS_CLIENT_ID,secret=process.env.MT5_ACCESS_CLIENT_SECRET;
  const required=process.env.MT5_ACCESS_REQUIRED;
  if(required!==undefined&&!['0','1'].includes(required))throw new Error("Invalid MT5 edge authentication configuration");
  if((id!==undefined)!==(secret!==undefined)||(required==='1'&&(id===undefined||secret===undefined)))throw new Error("Complete MT5 edge authentication required");
  const headers:Record<string,string>={ "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  if(id!==undefined&&secret!==undefined){
    if(endpoint.protocol!=='https:'||! /^[\x21-\x7e]{1,1024}$/.test(id)||! /^[\x21-\x7e]{1,1024}$/.test(secret))throw new Error("Invalid MT5 edge authentication configuration");
    headers['CF-Access-Client-Id']=id;headers['CF-Access-Client-Secret']=secret;
  }
  return headers;
}

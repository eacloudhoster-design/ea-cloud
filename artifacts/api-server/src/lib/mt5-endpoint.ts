// Private transport configuration; no public plaintext credential transport.
export const MT5_VPS_BASE = (process.env.MT5_VPS_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
let endpoint:URL;
try{endpoint=new URL(MT5_VPS_BASE);}catch{throw new Error("MT5_VPS_URL must be a valid origin");}
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
    (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))) {
  throw new Error("MT5_VPS_URL requires HTTPS or loopback HTTP and no embedded credentials");
}
function gatewayHeaders(token:string|undefined,origin:string): Record<string, string> {
  if (!token || token.length < 32) throw new Error("MT5 VPS service credential is not configured");
  const id=process.env.MT5_ACCESS_CLIENT_ID,secret=process.env.MT5_ACCESS_CLIENT_SECRET;
  const required=process.env.MT5_ACCESS_REQUIRED;
  if(required!==undefined&&!['0','1'].includes(required))throw new Error("Invalid MT5 edge authentication configuration");
  if((id!==undefined)!==(secret!==undefined)||(required==='1'&&(id===undefined||secret===undefined)))throw new Error("Complete MT5 edge authentication required");
  const headers:Record<string,string>={ "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  if(id!==undefined&&secret!==undefined){
    // Edge secrets are approved for the configured account gateway only.
    if(origin!==endpoint.origin || endpoint.protocol!=='https:'||! /^[\x21-\x7e]{1,1024}$/.test(id)||! /^[\x21-\x7e]{1,1024}$/.test(secret))throw new Error("Invalid MT5 edge authentication configuration");
    headers['CF-Access-Client-Id']=id;headers['CF-Access-Client-Secret']=secret;
  }
  return headers;
}

export function mt5Headers():Record<string,string>{
  return gatewayHeaders(process.env.MT5_VPS_TOKEN,endpoint.origin);
}
/** Reuse the approved edge boundary without leaking its secret to another origin. */
export function executionGatewayHeaders(origin:string,token:string):Record<string,string>{
  return gatewayHeaders(token,origin);
}

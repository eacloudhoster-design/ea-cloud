// Production service entry. Secrets are supplied by systemd credentials, never argv.
import {readFileSync} from "node:fs";
import {join} from "node:path";
const directory=process.env.CREDENTIALS_DIRECTORY;
if(!directory||process.env.NODE_TLS_REJECT_UNAUTHORIZED==="0")throw Error("Secure management runtime configuration required");
const binding=JSON.parse(readFileSync(join(directory,"backend.json"),"utf8"));
if(typeof binding.SESSION_SECRET!=="string"||binding.SESSION_SECRET.length<16||typeof binding.DATABASE_URL!=="string")throw Error("Original backend credentials unavailable");
const database=new URL(binding.DATABASE_URL);
if(!["postgres:","postgresql:"].includes(database.protocol))throw Error("Invalid database binding");
database.searchParams.set("sslmode","verify-full");
process.env.DATABASE_URL=database.href;
process.env.SESSION_SECRET=binding.SESSION_SECRET;
for(const [name,file] of [["MT5_VPS_TOKEN","relay-token"],["EA_API_ORIGIN_TOKEN","origin-token"]]){
 const value=readFileSync(join(directory,file),"utf8").trim();
 if(!(name==="EA_API_ORIGIN_TOKEN"?/^[A-Za-z0-9_-]{43,128}$/:/^[\x21-\x7e]{32,2048}$/).test(value))throw Error("Private service credential unavailable");
 process.env[name]=value;
}
process.env.EA_MT5_MANAGEMENT_ONLY="1";
process.env.MT5_SELF_SERVICE_PROVISIONING??="0";
process.env.MT5_PROVISIONING_CONSUMER??="0";
await import("../../artifacts/api-server/management-start.mjs");

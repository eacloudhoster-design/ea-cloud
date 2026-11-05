import {pool} from "@workspace/db";
import {createReadOnlyEngineApp} from "./engine-readonly-app";
const port=Number(process.env.PORT);
if(process.env.EA_ENGINE_READ_ONLY!=="1" || !Number.isInteger(port) || port<1024 || port>65535 || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<16)throw Error("Explicit read-only mode, valid port and original encryption binding required");
// A separately authorized read-only database binding must enforce this server-side.
const result=await pool.query("SHOW default_transaction_read_only");
if(result.rows[0]?.default_transaction_read_only!=="on"){await pool.end();throw Error("Read-only database binding required");}
const server=createReadOnlyEngineApp().listen(port,"127.0.0.1");
for(const signal of ["SIGTERM","SIGINT"])process.once(signal,()=>{server.close(()=>{void pool.end().then(()=>process.exit(0));});});

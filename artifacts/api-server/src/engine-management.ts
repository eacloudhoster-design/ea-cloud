import {pool} from '@workspace/db';
import {createMt5ManagementApp} from './engine-management-app';
import {verifyManagementGateway,verifyManagementDatabase} from './lib/management-preflight';
async function main(){
 const port=Number(process.env.PORT);
 if(process.env.EA_MT5_MANAGEMENT_ONLY!=='1'||process.env.EA_ENGINE_READ_ONLY==='1'||!Number.isInteger(port)||port<1024||port>65535||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<16)throw Error('Explicit management mode and original bindings required');
 await verifyManagementDatabase(pool);await verifyManagementGateway();
 const server=createMt5ManagementApp(async()=>{await pool.query('SELECT 1');return true;}).listen(port,'127.0.0.1');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>{void pool.end().then(()=>process.exit(0));});});
}
void main().catch(async()=>{process.stderr.write('MT5 management startup refused; private bindings or safety preflight failed.\n');await pool.end().catch(()=>{});process.exitCode=1;});

import {pool} from '@workspace/db';
import {verifyManagementDatabase,verifyManagementGateway} from './lib/management-preflight';
import {createNonTradingApp} from './nontrading-app';
let phase='configuration';
async function main(){
 const port=Number(process.env.PORT);
 if(process.env.EA_RELEASE_MODE!=='nontrading'||process.env.EA_MT5_MANAGEMENT_ONLY!=='1'||process.env.EA_ENGINE_READ_ONLY==='1'||!Number.isInteger(port)||port<1024||port>65535)throw Error('Explicit non-trading release profile required');
 if(process.env.NODE_ENV!=='production'||process.env.MT5_ACCESS_REQUIRED!=='1'||!process.env.MT5_VPS_URL||new URL(process.env.MT5_VPS_URL).protocol!=='https:'||!process.env.PUBLIC_WEBSITE_ORIGIN||new URL(process.env.PUBLIC_WEBSITE_ORIGIN).protocol!=='https:')throw Error('Explicit HTTPS edge and public origin configuration required');
 // No migrations, maintenance, reconciliation, worker, push scheduler or WS startup.
 phase='database_preflight';await verifyManagementDatabase(pool,true);phase='gateway_preflight';await verifyManagementGateway();
 phase='application_load';
 const {default:application}=await import('./app');
 phase='origin_binding';
 const app=createNonTradingApp(application,async()=>{await pool.query('SELECT 1');});
 phase='listen';
 const server=app.listen(port,'0.0.0.0');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  const timer=setTimeout(()=>process.exit(1),15000);timer.unref();
  server.close(()=>{void pool.end().then(()=>{clearTimeout(timer);process.exit(0);});});
 });
}
void main().catch(async()=>{process.stderr.write(JSON.stringify({code:'NONTRADING_STARTUP_REFUSED',phase})+'\n');await pool.end().catch(()=>{});process.exitCode=1;});

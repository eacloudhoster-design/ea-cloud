import express from 'express';
import helmet from 'helmet';
import {browserSessionMiddleware} from './lib/browser-session';
import engine from './routes/engine';
import clients from './routes/client-settings';
import mentors from './routes/mt5-connect';
/** Authenticated owner mutations only; no signal worker, ingestion, reconciliation or startup jobs. */
export function createMt5ManagementApp(health:()=>Promise<boolean>=async()=>false){
 if(process.env.EA_MT5_MANAGEMENT_ONLY!=='1'||process.env.EA_ENGINE_READ_ONLY==='1')throw Error('Explicit isolated management mode required');
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);app.use(helmet());
 app.use((req:any,res,next)=>{
  req.log={info(){},warn(){},error(){}};res.setHeader('Cache-Control','no-store');
  const path=req.path,method=req.method;
  const read=(method==='GET'||method==='HEAD')&&/^\/api\/(?:healthz|app\/(?:engine\/status|trading-controls)|admin\/engine\/clients(?:\/[1-9]\d*(?:\/policy)?)?|admin\/mt5\/(?:status|connections))\/?$/.test(path);
  const connection=method==='POST'&&/^\/api\/(?:app\/mt5-(?:connect|disconnect)|admin\/mt5\/(?:connect|disconnect))\/?$/.test(path);
  const allocation=method==='PATCH'&&/^\/api\/(?:app\/trading-controls|admin\/engine\/clients\/[1-9]\d*\/policy)\/?$/.test(path);
  if(!read&&!connection&&!allocation){res.status(404).json({code:'MT5_MANAGEMENT_ROUTE_UNAVAILABLE'});return;}next();
 });
 app.get('/api/healthz',async(req,res)=>{let ready=false;try{ready=await health();}catch{}res.status(ready?200:503).json({status:ready?'ok':'unavailable',mode:'mt5_management',databaseReady:ready,financialExecution:false,brokerConnectivityChecked:false});});
 app.use(express.json({limit:'16kb'}));app.use('/api',browserSessionMiddleware,engine,clients,mentors);
 app.use((err:unknown,req:any,res:any,next:any)=>{res.status(400).json({code:'INVALID_MANAGEMENT_REQUEST'});});
 return app;
}

import express, {type Express} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {nonTradingRelease} from './lib/release-mode';
/** Wraps the existing auth/application router on the EXISTING Render service. */
export function createNonTradingApp(application:Express,ready:()=>Promise<void>){
 if(!nonTradingRelease() || process.env.EA_MT5_MANAGEMENT_ONLY!=='1')throw Error('Explicit non-trading release and management preferences required');
 const token=process.env.EA_APPLICATION_ORIGIN_TOKEN;
 if(!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token))throw Error('Private application origin token required');
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 app.get('/api/healthz',(_req,res)=>res.json({status:'ok',mode:'nontrading',financialExecution:false}));
 app.use((req,res,next)=>{
  const supplied=req.headers['x-ea-cloud-origin-token'];
  if(typeof supplied!=='string'||! /^[A-Za-z0-9_-]{43,128}$/.test(supplied)||supplied.length!==token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){res.status(401).json({code:'APPLICATION_ORIGIN_UNAUTHORIZED'});return;}
  next();
 });
 app.get('/api/readyz',async(_req,res)=>{try{await ready();res.json({status:'ok',mode:'nontrading',financialExecution:false});}catch{res.status(503).json({code:'APPLICATION_NOT_READY'});}});
 app.use((req,res,next)=>{
  // Deny ingestion/activation before parsing or writing queue rows. Dispatch is also blocked below HTTP.
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(/^\/api\/(?:signals|robots)(?:\/|$)/.test(req.path)||/\/enable-copy\/?$/.test(req.path))){
   res.status(403).json({code:'FINANCIAL_EXECUTION_DISABLED'});return;
  }
  next();
 });
 app.use(application);
 return app;
}

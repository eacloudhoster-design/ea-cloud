import express from "express";
import helmet from "helmet";
import engineRouter from "./routes/engine";
import healthRouter from "./routes/health";
import {verifyBrowserSession,identityHint} from "./lib/browser-session";
/** Canary entry: no login, capture, mutation, queue, startup/backfill or push jobs. */
export function createReadOnlyEngineApp(){
 const app=express();app.disable("x-powered-by");app.use(helmet());
 app.use((req:any,res,next)=>{req.log={warn(){},error(){}};res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET" && req.method!=="HEAD"){res.status(405).json({code:"READ_ONLY_RELEASE",error:"Read-only release: mutations disabled"});return;}
  if(!/^\/api\/(?:healthz|readyz|app\/engine\/status|admin\/engine\/clients(?:\/[1-9]\d*)?)\/?$/.test(req.path)){res.status(404).json({code:"READ_ONLY_ROUTE_UNAVAILABLE"});return;}
  next();
 });
 app.use("/api",healthRouter);
 app.use("/api",async(req:any,res,next)=>{
  delete req.headers.authorization;
  try {
   const kind=req.path.startsWith("/app/")?"client":"portal";
   const principal=await verifyBrowserSession(req,kind,true);
   if(!principal){res.status(401).json({code:"SESSION_REQUIRED"});return;}
   if(principal.status!=="approved"){res.status(403).json({code:"ACCOUNT_NOT_APPROVED"});return;}
   req.browserPrincipal=principal;req.headers.authorization=`Bearer ${identityHint(principal.id,principal.role)}`;next();
  }catch {res.status(503).json({code:"SESSION_CHECK_UNAVAILABLE"});}
 });
 app.use("/api",engineRouter);
 return app;
}

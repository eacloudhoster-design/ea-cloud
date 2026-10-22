import rateLimit from 'express-rate-limit';
import {Router} from 'express';
import {z} from 'zod';
import {eq,desc,and} from 'drizzle-orm';
import {db,appAccessTable,clientSettingsTable,clientSymbolConfigsTable,symbolPairsTable,tradingActivityTable,tradeExecutionsTable,scannerReportsTable} from '@workspace/db';
import {scannerMt5Read} from '../lib/scanner-mt5';
import {recordTradingActivity,executionActivity} from '../lib/trading-activity';
import {signalWorkerHealthy} from '../lib/signal-worker';
import {chartReportSchema} from '../../../../lib/api-zod/src/scanner';
import type {ActivitySnapshot} from '../../../../lib/api-zod/src/trading-activity';
const router=Router();
router.use('/app/activity',async(req:any,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 try{const auth=req.headers.authorization;if(!auth?.startsWith('Bearer ')){res.status(401).json({error:'Sign in to view activity.'});return;}
 const [id,role]=Buffer.from(auth.slice(7),'base64').toString().split(':');if(role!=='client'||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1||Number(id)>2147483647){res.status(401).json({error:'Invalid session.'});return;}
 const [client]=await db.select({id:appAccessTable.id,status:appAccessTable.status,mentorId:appAccessTable.mentorId}).from(appAccessTable).where(eq(appAccessTable.id,Number(id))).limit(1);
 if(!client||client.status!=='approved'){res.status(403).json({error:'Account access is unavailable.'});return;}req.activityClientId=client.id;req.activityMentorId=client.mentorId;next();
 }catch{res.status(503).json({error:'Activity access could not be checked.'});}
});
const limit=rateLimit({windowMs:60000,limit:90,keyGenerator:(req:any)=>String(req.activityClientId),message:{error:'Activity refresh limit reached.'}});
router.use('/app/activity',limit);
router.get('/app/activity',async(req:any,res)=>{
 try{const clientId=req.activityClientId;
 const rows=await db.select({id:tradingActivityTable.id,source:tradingActivityTable.source,level:tradingActivityTable.level,message:tradingActivityTable.message,details:tradingActivityTable.details,createdAt:tradingActivityTable.createdAt}).from(tradingActivityTable).where(eq(tradingActivityTable.clientId,clientId)).orderBy(desc(tradingActivityTable.createdAt),desc(tradingActivityTable.id)).limit(100);
 // Existing own-client execution records survive older deployments and restarts.
 const prior=await db.select().from(tradeExecutionsTable).where(eq(tradeExecutionsTable.clientId,clientId)).orderBy(desc(tradeExecutionsTable.updatedAt)).limit(50);
 const known=new Set(rows.map(r=>(r.details as {executionId?:number}).executionId));
 const archived=prior.filter(r=>!known.has(r.id)).map(r=>({id:`execution-${r.id}`,source:'mentor',...executionActivity(r),details:{symbol:r.symbol,action:r.action,ticket:r.ticket,signalKind:r.signalKind},createdAt:r.updatedAt}));
 res.json({events:[...rows,...archived].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()).slice(-100)});
 }catch{res.status(503).json({error:'Activity history unavailable. Check the activity migration.'});}
});
const accountSchema=z.object({connected:z.boolean(),tradeAllowed:z.boolean(),account:z.object({balance:z.number().finite(),equity:z.number().finite(),profit:z.number().finite(),currency:z.string().min(1).max(12)}),symbols:z.array(z.object({symbol:z.string().min(1).max(40),available:z.boolean()})).max(20)});
const fingerprints=new Map<number,string>();
async function observed(id:number,snapshot:ActivitySnapshot){
 const fingerprint=JSON.stringify([snapshot.connected,snapshot.engine,snapshot.robotEnabled,snapshot.tradeAllowed,snapshot.symbols,snapshot.unavailable]);
 if(fingerprints.get(id)!==fingerprint){const saved=await recordTradingActivity(id,'system',snapshot.connected?'info':'warning',snapshot.unavailable|| (snapshot.connected?'MT5 connection confirmed; engine status refreshed':'MT5 disconnected'),{symbols:snapshot.symbols,engine:snapshot.engine,robotEnabled:snapshot.robotEnabled});if(saved)fingerprints.set(id,fingerprint);if(fingerprints.size>1000)fingerprints.delete(fingerprints.keys().next().value!);}
 return snapshot;
}
const cache=new Map<number,{at:number;promise:Promise<ActivitySnapshot>}>();
router.get('/app/activity/snapshot',async(req:any,res)=>{
 const id=req.activityClientId,now=Date.now();let entry=cache.get(id);
 if(!entry||now-entry.at>15_000){
 const promise=(async():Promise<ActivitySnapshot>=>{
  const [settings]=await db.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId,id)).limit(1);
  const base={observedAt:Date.now(),engine:signalWorkerHealthy(),robotEnabled:settings?.copyingEnabled===true,connected:false,tradeAllowed:false,account:null,symbols:[]};
  if(!settings?.mt5Connected)return observed(id,{...base,unavailable:'Connect your MT5 account to view live account values.'});
  const configs=await db.select().from(clientSymbolConfigsTable).where(eq(clientSymbolConfigsTable.clientId,id)).limit(20);
  const pairs=req.activityMentorId?await db.select().from(symbolPairsTable).where(and(eq(symbolPairsTable.mentorId,req.activityMentorId),eq(symbolPairsTable.isActive,true))).limit(20):[];
  const configured=pairs.length?pairs.map(p=>configs.find(c=>c.pairName===p.pairName)?.selectedSymbol||p.pairName):configs.map(c=>c.selectedSymbol||c.pairName);
  const symbols=[...new Set(configured)].slice(0,20);
  const [latest]=await db.select().from(scannerReportsTable).where(eq(scannerReportsTable.clientId,id)).orderBy(desc(scannerReportsTable.createdAt)).limit(1);
  const report=chartReportSchema.safeParse(latest?.report);if(report.success&&report.data.symbol&&!symbols.includes(report.data.symbol)&&symbols.length<20)symbols.push(report.data.symbol);
  try{
   const live=accountSchema.parse(await scannerMt5Read(id,'activity-snapshot',{symbols}));
   const snapshot={...base,...live,account:live.connected?live.account:null,observedAt:Date.now()};
   return observed(id,snapshot);
  }catch{return observed(id,{...base,unavailable:'Live MT5 account verification unavailable.'});}
 })();entry={at:now,promise};cache.set(id,entry);if(cache.size>1000)cache.delete(cache.keys().next().value!);
 }
 try{res.json(await entry.promise);}catch{cache.delete(id);res.status(503).json({error:'Account status is unavailable.'});}
});
router.post('/app/activity/scanner-review',async(req:any,res)=>{
 const body=z.object({scanId:z.string().uuid()}).strict().safeParse(req.body);if(!body.success){res.status(400).json({error:'Valid scan required.'});return;}
 try{const [row]=await db.select().from(scannerReportsTable).where(and(eq(scannerReportsTable.id,body.data.scanId),eq(scannerReportsTable.clientId,req.activityClientId))).limit(1);
 const report=chartReportSchema.safeParse(row?.report);if(!report.success){res.status(404).json({error:'Report not found.'});return;}
 const p=report.data;const saved=await recordTradingActivity(req.activityClientId,'scanner','info','Scanner trade review opened',{scanId:body.data.scanId,symbol:p.symbol,direction:p.signal,entry:p.entry,stopLoss:p.stopLoss,takeProfit:p.takeProfit});
 res.status(saved?201:503).json({saved});}catch{res.status(503).json({error:'Activity could not be saved.'});}
});
export default router;

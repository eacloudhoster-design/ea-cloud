import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { and,eq } from "drizzle-orm";
import { db,scannerReportsTable,clientSettingsTable } from "@workspace/db";
import { chartReportSchema } from "../../../../lib/api-zod/src/scanner";
import { scannerQuoteSchema, type ScannerTradePlan } from "../../../../lib/api-zod/src/scanner-trading";
import { scannerMt5Read } from "../lib/scanner-mt5";
import { planScannerOrder } from "../lib/scanner-order-policy";
interface ClientRequest extends Request {scannerClientId?:number}
const router=Router();
const input=z.object({scanId:z.string().uuid(),lotSize:z.number().positive().max(50),positions:z.number().int().min(1).max(20)}).strict();
router.post('/preflight',rateLimit({windowMs:60_000,limit:12,keyGenerator:req=>String((req as ClientRequest).scannerClientId)}),async(req:ClientRequest,res)=>{
 const parsed=input.safeParse(req.body);if(!parsed.success){res.status(400).json({error:'Valid scan ID, lot size and positions required.'});return;}
 const {scanId,lotSize,positions}=parsed.data;
 try{
  const [row]=await db.select().from(scannerReportsTable).where(and(eq(scannerReportsTable.id,scanId),eq(scannerReportsTable.clientId,req.scannerClientId!))).limit(1);
  if(!row||row.kind!=='chart'){res.status(404).json({error:'Chart report not found.'});return;}
  const report=chartReportSchema.safeParse(row.report);
  if(!report.success||report.data.signal==='NO TRADE'){res.status(409).json({error:'This archived report cannot be used for a directional order.'});return;}
  const p=report.data,setup={...p,generatedAtMs:new Date(row.createdAt).getTime(),signal:p.signal as "BUY"|"SELL",chartClarity:'chartClarity' in p?p.chartClarity:undefined,confidence:'confidence' in p?p.confidence:null,limitOrderAppropriate:'limitOrderAppropriate' in p?p.limitOrderAppropriate:false,limitOrderReason:'limitOrderReason' in p?p.limitOrderReason:null};
  let plan:ScannerTradePlan=planScannerOrder(setup,null,lotSize,positions),brokerChecked=false;
  try{
   if(!p.symbol||p.entry===null||p.stopLoss===null||p.takeProfit===null)throw new Error('No price basis');
   const first=await scannerMt5Read(req.scannerClientId!,'quote',{symbol:p.symbol}) as {quote?:unknown};
   plan=planScannerOrder(setup,first?.quote,lotSize,positions);
   if(plan.type&&plan.entry&&plan.stopLoss&&plan.takeProfit){
    const checked=await scannerMt5Read(req.scannerClientId!,'check-order',{symbol:p.symbol,direction:p.signal,orderType:plan.type,entry:plan.entry,stopLoss:plan.stopLoss,takeProfit:plan.takeProfit,volume:lotSize}) as {quote?:unknown;brokerChecked?:boolean};
    const refreshed=planScannerOrder(setup,checked?.quote,lotSize,positions);
    // A changed order/entry needs another broker check, never reuse the old result.
    brokerChecked=checked?.brokerChecked===true&&scannerQuoteSchema.safeParse(checked?.quote).success&&refreshed.type===plan.type&&refreshed.entry===plan.entry;
    plan=refreshed;
   }
  }catch{/* Safe unavailable state; never expose bridge credentials or upstream bodies. */}
  if(!brokerChecked){plan.eligible=false;plan.reasons.push('Broker-side order validation has not passed.');}
  // No order sender is installed. Fresh policy checks are not execution permission.
  res.json({plan,brokerChecked,submissionEnabled:false});
 }catch{res.status(503).json({error:'Scanner order preflight is unavailable. No order was submitted.'});}
});
// Confirmation is interactive but never implies that a scanner sender exists.
const submission = input.extend({requestId:z.string().uuid(),confirmed:z.literal(true)}).strict().refine(v=>Math.abs(v.lotSize*100-Math.round(v.lotSize*100))<1e-8,{message:'Use lot increments of 0.01.'});
router.post('/execute',rateLimit({windowMs:60_000,limit:12,keyGenerator:req=>String((req as ClientRequest).scannerClientId),message:{error:'Please wait before confirming another trade.',code:'SCANNER_ORDER_RATE_LIMITED'}}),async(req:ClientRequest,res)=>{
 const parsed=submission.safeParse(req.body);
 if(!parsed.success){res.status(400).json({error:'Confirm a valid trade size and number of trades. No order was submitted.',code:'SCANNER_ORDER_INVALID'});return;}
 try{
  const {scanId,lotSize,positions}=parsed.data;
  const [row]=await db.select().from(scannerReportsTable).where(and(eq(scannerReportsTable.id,scanId),eq(scannerReportsTable.clientId,req.scannerClientId!))).limit(1);
  if(!row||row.kind!=='chart'){res.status(404).json({error:'Trading signal not found.',code:'SCANNER_ORDER_NOT_FOUND'});return;}
  const report=chartReportSchema.safeParse(row.report);
  if(!report.success||report.data.signal==='NO TRADE'||!report.data.symbol||report.data.entry===null||report.data.stopLoss===null||report.data.takeProfit===null){res.status(409).json({error:'Analyse a readable chart before executing a trade.',code:'SCANNER_SETUP_INVALID'});return;}
  const p=report.data,createdAt=new Date(row.createdAt).getTime(),ordered=p.signal==='BUY'?p.stopLoss!<p.entry!&&p.entry!<p.takeProfit!:p.takeProfit!<p.entry!&&p.entry!<p.stopLoss!,ratio=Math.abs(p.takeProfit!-p.entry!)/Math.abs(p.entry!-p.stopLoss!);
  if(!ordered||!Number.isFinite(ratio)||ratio<2||!Number.isFinite(createdAt)||createdAt>Date.now()+1000||Date.now()-createdAt>15*60_000){res.status(409).json({error:'Scan a current chart with a valid trading setup.',code:'SCANNER_SETUP_INVALID'});return;}
  const [account]=await db.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId,req.scannerClientId!)).limit(1);
  if(!account?.mt5Connected||!account.mt5Login||!account.mt5Server||!account.encryptedMt5Password){res.status(503).json({error:'Connect your MT5 account to execute this trade.',code:'MT5_ACCOUNT_REQUIRED'});return;}
  const setup={...p,generatedAtMs:new Date(row.createdAt).getTime(),signal:p.signal as 'BUY'|'SELL',chartClarity:'chartClarity' in p?p.chartClarity:undefined,confidence:'confidence' in p?p.confidence:null};
  try{
   const quote=await scannerMt5Read(req.scannerClientId!,'quote',{symbol:p.symbol}) as {quote?:unknown};
   const parsedQuote=scannerQuoteSchema.safeParse(quote?.quote);
   if(parsedQuote.success&&!parsedQuote.data.connected){res.status(503).json({error:'Connect your MT5 account to execute this trade.',code:'MT5_ACCOUNT_REQUIRED'});return;}
   const plan=planScannerOrder(setup,quote?.quote,lotSize,positions);
   if(!plan.eligible){res.status(409).json({error:'This setup cannot be submitted at the current price.',code:'SCANNER_ORDER_BLOCKED'});return;}
   // Broker validation must be performed again by a future durable sender after
   // confirmation. Neither this route nor preflight ever calls order_send.
  }catch{res.status(503).json({error:'Trade execution is not available yet.',code:'MT5_EXECUTION_UNAVAILABLE'});return;}
  res.status(503).json({error:'Trade execution is not available yet.',code:'MT5_EXECUTION_UNAVAILABLE'});
 }catch{res.status(503).json({error:'Trade execution is not available yet.',code:'MT5_EXECUTION_UNAVAILABLE'});}
});
export default router;

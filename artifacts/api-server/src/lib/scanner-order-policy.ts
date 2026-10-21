import { scannerQuoteSchema, type ScannerQuote, type ScannerTradePlan } from "../../../../lib/api-zod/src/scanner-trading";
export interface SignalSetup {generatedAtMs?:number;signal:"BUY"|"SELL";symbol:string|null;entry:number|null;stopLoss:number|null;takeProfit:number|null;chartClarity?:string;confidence?:number|null;limitOrderAppropriate?:boolean|null;limitOrderReason?:string|null}
const aligned=(value:number,step:number)=>Math.abs(value/step-Math.round(value/step))<=1e-7;
export function planScannerOrder(setup:SignalSetup, rawQuote:unknown, lotSize:number, positions:number, now=Date.now()):ScannerTradePlan {
 const plan:ScannerTradePlan={type:null,entry:setup.entry,stopLoss:setup.stopLoss,takeProfit:setup.takeProfit,riskRewardRatio:null,eligible:false,reasons:[],quoteTimeMs:null};
 const fail=(reason:string)=>{plan.reasons.push(reason);return plan;};
 if(![setup.entry,setup.stopLoss,setup.takeProfit].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))return fail("Reliable entry, stop loss and take profit are required.");
 const entry=setup.entry!,sl=setup.stopLoss!,tp=setup.takeProfit!,buy=setup.signal==='BUY';
 if(buy?!(sl<entry&&entry<tp):!(tp<entry&&entry<sl))return fail("Trade levels have invalid directional ordering.");
 if(setup.generatedAtMs!==undefined&&(!Number.isFinite(setup.generatedAtMs)||setup.generatedAtMs>now+1000||now-setup.generatedAtMs>15*60_000))return fail("The chart analysis has expired; scan a current chart.");
 const quote=scannerQuoteSchema.safeParse(rawQuote);if(!quote.success)return fail("Verified live MT5 quotes and broker constraints are unavailable.");
 const q:ScannerQuote=quote.data;plan.quoteTimeMs=q.timeMs;
 if(!q.connected)return fail("MT5 account connection is not verified.");
 if(q.symbol!==setup.symbol)return fail("Quote symbol does not match the scanned instrument. Configure the exact broker symbol.");
 if(q.ask<q.bid||q.timeMs>now+1000||now-q.timeMs>5000)return fail("Quote is invalid or stale; refresh before confirmation.");
 const spread=q.ask-q.bid,risk=Math.abs(entry-sl),distance=Math.max(q.stopsLevel*q.point,q.tickSize);
 if(!aligned(q.point,10**(-q.digits))||![entry,sl,tp,q.bid,q.ask].every(v=>aligned(v,q.tickSize)&&aligned(v,10**(-q.digits))))return fail("Prices do not match broker precision/tick size.");
 if(spread>risk*.1)return fail("Spread exceeds the scanner limit of 10% of proposed risk distance.");
 if(!Number.isFinite(lotSize)||!Number.isInteger(positions)||positions<1||positions>20||lotSize<q.minLot||lotSize>q.maxLot||!aligned(lotSize,q.lotStep)||(q.volumeLimit>0&&q.openVolume+lotSize*positions>q.volumeLimit))return fail("Volume/position settings exceed broker constraints.");
 if(!q.tradeAllowed||q.tradeMode==='disabled'||q.tradeMode==='close_only'||(buy&&q.tradeMode==='short_only')||(!buy&&q.tradeMode==='long_only'))return fail("Account or symbol does not permit this direction.");
 const current=buy?q.ask:q.bid;
 // Broker ticks / 5% of chart risk, whichever is larger, is the explicit
 // proximity policy. It never widens risk or modifies chart stops/targets.
 const tolerance=Math.max(2*q.tickSize,risk*.05);
 if(Math.abs(current-entry)<=tolerance&&q.marketOrders){plan.type='MARKET';plan.entry=current;}
 else if(setup.limitOrderAppropriate===true&&(setup.limitOrderReason?.trim().length??0)>=20&&q.limitOrders&&(buy?entry<q.ask:entry>q.bid)&&Math.abs(current-entry)>=distance){plan.type=buy?'BUY LIMIT':'SELL LIMIT';}
 else return fail("Entry is distant and no supported limit-order setup is justified. Stop orders are not inferred.");
 const actual=plan.entry!;
 if(buy?!(sl<actual&&actual<tp):!(tp<actual&&actual<sl))return fail("Current price has invalidated the proposed setup.");
 plan.riskRewardRatio=Math.abs(tp-actual)/Math.abs(actual-sl);
 if(plan.riskRewardRatio<2-1e-10)return fail("Minimum target risk-to-reward is 1:2 at the proposed execution price.");
 if(Math.min(Math.abs(actual-sl),Math.abs(tp-actual))<distance-1e-10)return fail("Broker minimum stop distance is not met.");
 // Market stops are evaluated against the liquidation side as well.
 if(plan.type==='MARKET'&&(buy?(q.bid-sl<distance||tp-q.bid<distance):(sl-q.ask<distance||q.ask-tp<distance)))return fail("Stops violate broker distance on the bid/ask side.");
 if(setup.chartClarity!=='clear')plan.reasons.push("Chart structure has not been established clearly.");
 if(setup.confidence==null||setup.confidence<60)plan.reasons.push("Estimated directional confidence is insufficient or uncalibrated.");
 if(q.marketOpen!==true)plan.reasons.push(q.marketOpen===false?"Broker session is closed.":"Current market session has not been verified.");
 plan.eligible=plan.reasons.length===0;return plan;
}

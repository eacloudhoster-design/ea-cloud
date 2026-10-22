import { useEffect, useRef, useState } from "react";
import type { ChartReport, ScannerRecord } from "@/lib/scanner";
import { scannerRequest } from "@/lib/scanner";
import type { ScannerPreflight } from "../../../../lib/api-zod/src/scanner-trading";
import type { ScannerTradeSettings as Settings } from "@/lib/scanner-trade-settings";
import ScannerTradeSettings from "./ScannerTradeSettings";
export default function ScannerTradeAction({record,settings,clientToken,onSettingsSaved,historical=false}:{historical?:boolean;record:ScannerRecord;settings:Settings;clientToken?:string|null;onSettingsSaved?:(s:Settings)=>void}) {
 const [open,setOpen]=useState(false),[preflight,setPreflight]=useState<ScannerPreflight|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now());
 const [checkedSettings,setCheckedSettings]=useState<Settings|null>(null);
 const pending=useRef(false),request=useRef<AbortController|null>(null),generation=useRef(0);
 useEffect(()=>{generation.current++;request.current?.abort();pending.current=false;setChecking(false);setOpen(false);setPreflight(null);setError('');return()=>{generation.current++;request.current?.abort();};},[record.id,clientToken]);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const fresh=preflight?.plan.quoteTimeMs!=null&&clock>=preflight.plan.quoteTimeMs-1000&&clock-preflight.plan.quoteTimeMs<=5000;
 const canReview=!historical&&Boolean(preflight?.plan.eligible&&preflight.brokerChecked&&fresh&&checkedSettings?.lotUnits===settings.lotUnits&&checkedSettings?.positions===settings.positions);
 const label=preflight?.plan.type==='BUY LIMIT'||preflight?.plan.type==='SELL LIMIT'?'Place Limit Order':'Execute Trade';
 const check=async(value:Settings)=>{
  if(!clientToken||pending.current)return;pending.current=true;setChecking(true);setError('');setPreflight(null);onSettingsSaved?.(value);
  const controller=new AbortController();request.current=controller;const run=++generation.current;
  try{const data=await scannerRequest<ScannerPreflight>('preflight',clientToken,controller.signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scanId:record.id,lotSize:value.lotUnits/100,positions:value.positions})});if(run===generation.current&&!controller.signal.aborted){setPreflight(data);setCheckedSettings(value);}}
  catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
  finally{if(run===generation.current){pending.current=false;setChecking(false);}}
 };
 return <>
  <button className="scanner-result-execute" type="button" disabled={!canReview||checking} onClick={()=>setOpen(true)} aria-describedby="scanner-result-execution-note">{label}</button>
  <p id="scanner-result-execution-note" className="scanner-result-execution-note">{historical ? "Historical chart references. Rescan a current chart before considering a trade." : "MT5 live submission unavailable. Review the setup without placing an order."}</p>
  <button className="scanner-result-parameters" type="button" disabled={!clientToken||checking} onClick={()=>setOpen(true)}>Review trade &amp; check live setup</button>
  {checking&&<p role="status" className="scanner-result-execution-note">Checking account, quotes and broker constraints…</p>}
  {error&&<p role="alert" className="scanner-result-execution-note">{error}</p>}
  {preflight&&<div className="scanner-eligibility"><strong>{preflight.plan.type??'UNVERIFIED SIGNAL TYPE'}</strong><span>{canReview?'Broker preflight passed; submission unavailable':'NOT EXECUTABLE'}</span><span>Live proposed entry: {preflight.plan.entry??'—'} · SL: {preflight.plan.stopLoss??'—'} · TP: {preflight.plan.takeProfit??'—'}</span><span>Execution R:R {preflight.plan.riskRewardRatio==null?'—':`1:${preflight.plan.riskRewardRatio.toPrecision(3)}`}</span>{preflight.plan.reasons.map(reason=><span key={reason}>{reason}</span>)}{!fresh&&<span>Refresh stale quotes before confirmation.</span>}</div>}
  {open&&<ScannerTradeSettings initial={settings} mode="confirmation" report={record.report as ChartReport} historical={historical} preflight={preflight} checking={checking} onPreflight={check} onClose={()=>{request.current?.abort();generation.current++;pending.current=false;setChecking(false);setOpen(false);}} onConfirm={()=>{}} />}
 </>;
}

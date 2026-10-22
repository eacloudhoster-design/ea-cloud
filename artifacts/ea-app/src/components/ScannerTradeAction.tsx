import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ChartReport, ScannerRecord } from "@/lib/scanner";
import { createScannerSubmission } from "@/lib/scanner-execution";
import type { ScannerTradeSettings as Settings } from "@/lib/scanner-trade-settings";
import ScannerTradeSettings from "./ScannerTradeSettings";

export default function ScannerTradeAction({record,settings,clientToken,onSettingsSaved}:{historical?:boolean;record:ScannerRecord;settings:Settings;clientToken?:string|null;onSettingsSaved?:(s:Settings)=>void}) {
 const [open,setOpen]=useState(false),[submitting,setSubmitting]=useState(false),[message,setMessage]=useState('');
 const pending=useRef(false),attempt=useRef<AbortController|null>(null),generation=useRef(0),submission=useRef(createScannerSubmission());
 const report=record.report as ChartReport;
 const valid=(report.signal==='BUY'||report.signal==='SELL')&&[report.entry,report.stopLoss,report.takeProfit].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&
   (report.signal==='BUY'?report.stopLoss!<report.entry!&&report.entry!<report.takeProfit!:report.takeProfit!<report.entry!&&report.entry!<report.stopLoss!);
 useEffect(()=>{generation.current++;attempt.current?.abort();pending.current=false;setSubmitting(false);setOpen(false);setMessage('');submission.current=createScannerSubmission();return()=>{generation.current++;attempt.current?.abort();};},[record.id,clientToken]);
 const confirm=async(value:Settings)=>{
  if(pending.current)return;
  if(!clientToken){setMessage('Sign in to execute this trade.');return;}
  if(!valid){setMessage('Analyse a readable chart before executing a trade.');return;}
  pending.current=true;setSubmitting(true);setMessage('');onSettingsSaved?.(value);
  const controller=new AbortController();attempt.current=controller;const run=++generation.current;
  try {
   const outcome = await submission.current.submit(record.id, clientToken, value, controller.signal);
   if(run===generation.current && outcome) setMessage(outcome);
  }catch(e){if(run===generation.current&&!controller.signal.aborted)setMessage((e as Error).message);}
  finally{if(run===generation.current){pending.current=false;setSubmitting(false);}}
 };
 return <>
  <button className="scanner-result-execute" type="button" disabled={!valid||submitting} onClick={()=>{setMessage('');setOpen(true);}}><ArrowUpRight size={21} /> EXECUTE TRADE</button>
  {open&&<ScannerTradeSettings initial={settings} mode="confirmation" report={report} checking={submitting} message={message} onClose={()=>{if(!pending.current)setOpen(false);}} onConfirm={value=>void confirm(value)} />}
 </>;
}

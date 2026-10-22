// Only scanner user actions dispatch this event. Mentor/connection updates never do.
export function openActivityMonitor(scanId:string,token:string|null|undefined,review=true){
 window.dispatchEvent(new CustomEvent('ea:open-trading-activity'));
 if(token&&review)void fetch('/api/app/activity/scanner-review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({scanId}),signal:AbortSignal.timeout(10000)}).catch(()=>{});
}

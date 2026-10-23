import { useDraggablePanel } from "@/hooks/use-draggable-panel";
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {X,Activity,RefreshCw} from 'lucide-react';
import {useApp} from '@/context/AppContext';
import {robotBg} from '@/lib/branding';
import type {ActivitySnapshot,TradingActivity} from '../../../../lib/api-zod/src/trading-activity';
import './TradingActivityMonitor.css';
import {useFloatingRobot} from '@/hooks/useFloatingRobot';

export default function TradingActivityMonitor(){
 const {clientToken,eaName,bgImageUrl,accentColor,botRunning,botStatusConfirmed}=useApp();const [open,setOpen]=useState(false),[events,setEvents]=useState<TradingActivity[]>([]),[snapshot,setSnapshot]=useState<ActivitySnapshot|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[clock,setClock]=useState(Date.now());
 const container=useRef<HTMLDivElement>(null);
 const panel=useRef<HTMLDivElement>(null),terminal=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),autoscroll=useRef(true);
 const panelDrag=useDraggablePanel(container,panel,open);
 const floating=useFloatingRobot(container,trigger,Boolean(clientToken));
 const [failedImage,setFailedImage]=useState<string|null>(null);const image=bgImageUrl&&failedImage!==bgImageUrl?bgImageUrl:robotBg;
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('ea:open-trading-activity',show);return()=>window.removeEventListener('ea:open-trading-activity',show);},[]);
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>('.activity-close')?.focus());return()=>cancelAnimationFrame(frame);},[open]);
 const close=useCallback(()=>{setOpen(false);trigger.current?.focus();},[]);
 useEffect(()=>{setOpen(false);setEvents([]);setSnapshot(null);setError('');},[clientToken]);
 useEffect(()=>{if(!clientToken)return;
 let disposed=false,busy=false,dirty=false,ws:WebSocket|null=null,reconnect:ReturnType<typeof setTimeout>|undefined,lastSnapshot=0;const abort=new AbortController();
 const read=async(path:string)=>{const res=await fetch('/api/app/activity'+path,{headers:{Authorization:`Bearer ${clientToken}`},cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(!res.ok)throw Error('Trading activity is unavailable. Retry in a moment.');return res.json();};
 const poll=async()=>{if(disposed||document.hidden)return;if(busy){dirty=true;return;}busy=true;dirty=false;try{
  const data=await read('');if(!disposed){setEvents(data.events);setError('');}
  if(Date.now()-lastSnapshot>20000){const live=await read('/snapshot');if(!disposed){setSnapshot(live);lastSnapshot=Date.now();}}
 }catch(e){if(!disposed)setError((e as Error).message);}finally{busy=false;if(dirty&&!disposed)void poll();}};
 const connect=()=>{if(disposed)return;try{ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/ws?token=${encodeURIComponent(clientToken)}`);ws.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='TRADING_ACTIVITY'||data.type==='TRADE_EXECUTION')void poll();}catch{}};ws.onclose=()=>{if(!disposed)reconnect=setTimeout(connect,10000);};ws.onerror=()=>ws?.close();}catch{reconnect=setTimeout(connect,10000);}};
 // WebSocket is an invalidation hint only: all displayed data is reauthorized REST.
 connect();void poll();const timer=setInterval(()=>{setClock(Date.now());void poll();},5000);const visible=()=>{if(!document.hidden)void poll();};document.addEventListener('visibilitychange',visible);
 return()=>{disposed=true;abort.abort();clearInterval(timer);clearTimeout(reconnect);ws?.close();document.removeEventListener('visibilitychange',visible);};
 },[clientToken,refresh]);
 useEffect(()=>{if(open&&autoscroll.current)terminal.current?.scrollTo({top:terminal.current.scrollHeight,behavior:'smooth'});},[events,open]);
 const fresh=Boolean(snapshot&&clock>=snapshot.observedAt-5000&&clock-snapshot.observedAt<35000),connected=fresh&&snapshot?.connected===true;
 const active=connected&&snapshot?.engine===true&&snapshot.robotEnabled&&snapshot.tradeAllowed;
 const status=botStatusConfirmed?(botRunning?'active':'paused'):'unknown';
 const amount=(value:number|null|undefined)=>value==null||!snapshot?.account?'—':`${snapshot.account.currency} ${value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 if(!clientToken)return null;
 return <div ref={container} className="trading-activity-root">
 <button ref={trigger} type="button" className="trading-activity-trigger" aria-label="Open live trading activity" aria-expanded={open} style={{...floating.style,"--floating-robot-accent":accentColor} as CSSProperties} onPointerDown={floating.onPointerDown} onPointerMove={floating.onPointerMove} onPointerUp={floating.onPointerUp} onPointerCancel={floating.onPointerCancel} onLostPointerCapture={floating.onLostPointerCapture} onClick={event=>{if(floating.allowClick(event))setOpen(true);}}><img draggable={false} src={image} alt="" onError={()=>setFailedImage(bgImageUrl)}/><span className={`activity-dot ${status}`} role="img" aria-label={status==='active'?'Bot active':status==='paused'?'Bot paused':'Bot status unconfirmed'}/></button>
 {open&&<div ref={panel} style={panelDrag.style} data-window-sized={panelDrag.ready || undefined} className="trading-activity-panel" role="dialog" aria-label="Live trading activity monitor" onClickCapture={panelDrag.onClickCapture} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
 <div className="activity-panel-content" style={panelDrag.contentStyle}>
 <header className="trading-activity-header" style={{backgroundImage:`linear-gradient(0deg,#150204 3%,#15020455 75%),url("${image.replace(/["\\\n\r]/g,'')}")`}}><button type="button" className="activity-panel-drag-handle" aria-label="Move robot panel" title="Drag to move; use arrow keys when focused" {...panelDrag.handle} /><button className="activity-close" type="button" aria-label="Close trading activity" onClick={close}><X size={23}/></button><div><h2>{eaName}</h2><div className="activity-badges"><span className={active?'on':'off'}><Activity size={12}/>{active?'TRADING ACTIVE':!fresh?'AWAITING STATUS':connected?(snapshot?.robotEnabled?'ENGINE UNCONFIRMED':'TRADING STOPPED'):'DISCONNECTED'}</span><span>{active?'ROBOT ACTIVATED':snapshot?.robotEnabled?'ROBOT WAITING':'ROBOT STOPPED'}</span></div></div></header>
 <div className="trading-account-grid">{[['BALANCE',snapshot?.account?.balance],['EQUITY',snapshot?.account?.equity],['P&L',snapshot?.account?.profit]].map(([label,value])=><section key={String(label)}><h3>{label}</h3><strong className={label==='P&L'&&typeof value==='number'?(value<0?'loss':'gain'):''}>{fresh?`${label==='P&L'&&typeof value==='number'&&value>0?'+':''}${amount(value as number|undefined)}`:'—'}</strong></section>)}</div>
 <div className="trading-activity-terminal" ref={terminal} role="log" aria-live="polite" aria-relevant="additions" onScroll={event=>{const el=event.currentTarget;autoscroll.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;}}>
 {error&&<p className="event-error">{error}</p>}{snapshot?.unavailable&&<p className="event-warning">{snapshot.unavailable}</p>}
 {snapshot?.symbols.map(item=><p className={item.available?'event-success':'event-warning'} key={item.symbol}>{item.available?'Symbol verified':'Symbol not found'}: {item.symbol}{!item.available&&'. Check the broker’s exact symbol name.'}</p>)}
 {!events.length&&!error&&<p>No recorded trading events yet.</p>}
 {events.map(event=><article key={event.id} className={`event-${event.level}`}><small>{new Date(event.createdAt).toLocaleTimeString()} · {event.source.toUpperCase()}</small><p>&gt;&gt; {event.message}</p>{['mentor','symbol','direction','signalKind','entry','stopLoss','takeProfit','positions','lotSize','volume','ticket'].filter(key=>event.details[key]!=null).map(key=><span key={key}>{key}: {String(event.details[key])}</span>)}</article>)}
 </div><footer><button type="button" aria-label="Refresh activity" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={15}/></button><span>Powered by EA Cloud</span></footer>
 </div>
 {panelDrag.edges.map(({edge,handle})=><button key={edge} type="button" className={`activity-panel-resize activity-panel-resize--${edge}`} aria-label={`Resize robot panel ${ {n:'top',s:'bottom',e:'right',w:'left',ne:'top right',nw:'top left',se:'bottom right',sw:'bottom left'}[edge]}`} title="Drag to resize; use arrow keys when focused" {...handle} />)}
 </div>}
 </div>;
}

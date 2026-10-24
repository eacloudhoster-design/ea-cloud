import {useLayoutEffect,useRef,useState,type RefObject,type PointerEvent as ReactPointerEvent,type MouseEvent as ReactMouseEvent} from 'react';

export const FLOATING_ROBOT_POSITION_KEY='ea-cloud:floating-robot-position';
const THRESHOLD=6;
type Position={x:number;y:number};
type Gesture={id:number;clientX:number;clientY:number;origin:Position;dragged:boolean};

/** Position the existing shared trigger within the visible application, not its scrolling content. */
export function useFloatingRobot(container:RefObject<HTMLDivElement|null>,button:RefObject<HTMLButtonElement|null>,enabled:boolean,onTap?:()=>void){
 const [position,setPosition]=useState<Position|null>(null);
 const current=useRef<Position|null>(null),gesture=useRef<Gesture|null>(null),suppressClick=useRef(false),frame=useRef<number|null>(null);
 const constrain=(point:Position):Position=>{
  const root=container.current,trigger=button.current;if(!root||!trigger)return point;
  const rect=root.getBoundingClientRect(),size=trigger.getBoundingClientRect(),viewport=window.visualViewport,css=getComputedStyle(root);
  const safe=(edge:string)=>Math.max(4,parseFloat(css.getPropertyValue(`--robot-safe-${edge}`))||0);
  const left=Math.max(0,(viewport?.offsetLeft||0)-rect.left)+safe('left');
  const top=Math.max(0,(viewport?.offsetTop||0)-rect.top)+safe('top');
  const right=Math.min(rect.width,(viewport?.offsetLeft||0)+(viewport?.width||innerWidth)-rect.left)-size.width-safe('right');
  const bottom=Math.min(rect.height,(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-rect.top)-size.height-safe('bottom');
  return {x:Math.max(left,Math.min(point.x,Math.max(left,right))),y:Math.max(top,Math.min(point.y,Math.max(top,bottom)))};
 };
 const save=(point:Position)=>{try{localStorage.setItem(FLOATING_ROBOT_POSITION_KEY,JSON.stringify(point));}catch{/* Dragging still works when storage is unavailable. */}};
 const paint=(point:Position)=>{
  current.current=point;
  if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setPosition(current.current);});
 };
 useLayoutEffect(()=>{
  if(!enabled||!container.current||!button.current)return;
  const root=container.current.getBoundingClientRect(),trigger=button.current.getBoundingClientRect();
  let point:Position={x:trigger.left-root.left,y:trigger.top-root.top};
  try{const stored=JSON.parse(localStorage.getItem(FLOATING_ROBOT_POSITION_KEY)||'null');if(stored&&Number.isFinite(stored.x)&&Number.isFinite(stored.y))point={x:stored.x,y:stored.y};}catch{}
  const initial=constrain(point);current.current=initial;setPosition(initial);
  const resize=()=>{if(!current.current)return;const next=constrain(current.current);current.current=next;setPosition(next);save(next);};
  // Touch activation uses pointerup. Cancel native compatibility clicks locally
  // so a drag cannot swallow the next tap or click through a newly opened panel.
  const triggerNode=button.current;
  const preventCompatibilityClick=(event:TouchEvent)=>{if(event.touches.length===1)event.preventDefault();};
  if(onTap)triggerNode.addEventListener('touchstart',preventCompatibilityClick,{passive:false});
  const observer=new ResizeObserver(resize);observer.observe(container.current);observer.observe(button.current);
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  return()=>{triggerNode.removeEventListener('touchstart',preventCompatibilityClick);observer.disconnect();window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;gesture.current=null;};
 },[enabled,onTap]);
 const onPointerDown=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  if(!event.isPrimary||event.button!==0||!current.current||gesture.current)return;
  suppressClick.current=false;
  gesture.current={id:event.pointerId,clientX:event.clientX,clientY:event.clientY,origin:current.current,dragged:false};
  event.currentTarget.setPointerCapture(event.pointerId);
 };
 const onPointerMove=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  const drag=gesture.current;if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.clientX,dy=event.clientY-drag.clientY;
  if(!drag.dragged&&Math.hypot(dx,dy)<THRESHOLD)return;
  drag.dragged=true;suppressClick.current=true;event.preventDefault();
  paint(constrain({x:drag.origin.x+dx,y:drag.origin.y+dy}));
 };
 const finish=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  const drag=gesture.current;if(!drag||drag.id!==event.pointerId)return;
  gesture.current=null;
  if(drag.dragged&&current.current){suppressClick.current=true;save(current.current);if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;setPosition(current.current);}
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(!drag.dragged&&event.type==='pointerup'&&event.pointerType==='touch'&&onTap){suppressClick.current=true;onTap();}
 };
 const allowClick=(event:ReactMouseEvent<HTMLButtonElement>)=>{
  if(suppressClick.current&&event.detail!==0){suppressClick.current=false;event.preventDefault();event.stopPropagation();return false;}
  suppressClick.current=false;return true;
 };
 return {style:position?{left:0,top:0,right:'auto',bottom:'auto',transform:`translate3d(${position.x}px, ${position.y}px, 0)`}:undefined,onPointerDown,onPointerMove,onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:finish,allowClick};
}

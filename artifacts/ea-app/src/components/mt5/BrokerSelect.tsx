import {useEffect,useId,useRef,useState} from "react";
import {Building2,ChevronDown,Check} from "lucide-react";
import {brokers} from "@/lib/brokers";
import FloatingField from "./FloatingField";
import "./BrokerSelect.css";
const options=[...brokers.map(({id,name})=>({id,name})),{id:"custom",name:"Other broker / manual entry"}];
export default function BrokerSelect({value,onChange,disabled=false}:{value:string;onChange:(id:string)=>void;disabled?:boolean}){
 const id=useId(),root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null),search=useRef({text:"",at:0});
 const [open,setOpen]=useState(false),[active,setActive]=useState(0);
 const selected=options.find(o=>o.id===value);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);
 },[open]);
 useEffect(()=>{if(open)list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:"nearest"});},[active,open]);
 const choose=(index:number)=>{onChange(options[index].id);setOpen(false);button.current?.focus({preventScroll:true});};
 return <div ref={root} className={`mt5-broker-picker${open?" is-open":""}`} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
  <FloatingField id={id} label="Broker" icon={Building2}>
   <button ref={button} id={id} type="button" className={`mt5-broker-trigger${selected?"":" is-placeholder"}`} role="combobox" aria-label="Broker" aria-required="true" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} aria-activedescendant={open?`${id}-option-${active}`:undefined} disabled={disabled}
    onClick={()=>{setActive(Math.max(0,options.findIndex(o=>o.id===value)));setOpen(v=>!v);}}
    onKeyDown={event=>{
     if(event.key==="Escape"){event.preventDefault();setOpen(false);return;}
     if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
      event.preventDefault();setOpen(true);
      setActive(index=>event.key==="Home"?0:event.key==="End"?options.length-1:!open?Math.max(0,options.findIndex(o=>o.id===value)):(index+(event.key==="ArrowDown"?1:-1)+options.length)%options.length);return;
     }
     if(event.key==="Enter"||event.key===" "){event.preventDefault();if(open)choose(active);else{setActive(Math.max(0,options.findIndex(o=>o.id===value)));setOpen(true);}return;}
     if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      const now=Date.now();search.current={text:(now-search.current.at<700?search.current.text:"")+event.key.toLowerCase(),at:now};
      const index=options.findIndex(o=>o.name.toLowerCase().startsWith(search.current.text));if(index>=0){setActive(index);setOpen(true);}
     }
    }}><span>{selected?.name??"Select broker"}</span><ChevronDown size={19} aria-hidden="true" /></button>
  </FloatingField>
  {open&&<div ref={list} id={`${id}-list`} role="listbox" aria-label="Brokers" className="mt5-broker-menu">{options.map((option,index)=><div id={`${id}-option-${index}`} key={option.id} role="option" aria-selected={value===option.id} data-index={index} data-active={active===index||undefined} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(index)}>{option.name}{value===option.id&&<Check size={16} aria-hidden="true"/>}</div>)}</div>}
 </div>;
}

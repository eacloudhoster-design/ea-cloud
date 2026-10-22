import {Children,cloneElement,isValidElement,useId,type CSSProperties,type ReactNode} from "react";
import type {ShapeStyle} from "@/context/AppContext";
import {frameGeometry} from "@/lib/robot-frame-shape";
import "./RobotImageFrame.css";
interface Props{shape:ShapeStyle;accent:string;size:number;borderWidth:number;className?:string;style:CSSProperties;children:ReactNode}
export default function RobotImageFrame({shape,accent,size,borderWidth,className="",style,children}:Props){
 const id=`robot-frame-${useId().replace(/:/g,"")}`;const geometry=frameGeometry(shape,size,borderWidth);
 // None renders the image itself, not a transparent decorative frame.
 if(shape==="none"){
  const image=Children.toArray(children).find(child=>isValidElement(child)&&child.type==="img");
  if(!isValidElement<{className?:string;style?:CSSProperties}>(image))return null;
  return cloneElement(image,{
   ...{"data-robot-shape":"none"},
   className:`${className} robot-image-unframed`,
   style:{...style,position:"relative",inset:"auto",width:"auto",height:"auto",maxWidth:size,maxHeight:size,display:"block",flexShrink:0,alignSelf:"center",marginLeft:"auto",marginRight:"auto",border:0,borderRadius:0,boxShadow:"none",background:"none",filter:"none",clipPath:"none",objectFit:"contain",objectPosition:"center",overflow:"visible"}
  });
 }
 // Orbit retains each layout's original border, glow, background and content box.
 if(shape==="orbit")return <div key={shape} className={`${className} robot-image-frame`} data-robot-shape={shape} style={style}>{children}</div>;
 const outline=<rect x={geometry.inset} y={geometry.inset} width={geometry.extent} height={geometry.extent} rx={geometry.radius}/>;
 const shadow=String(style.boxShadow||"").split(", ").map(part=>`drop-shadow(${part})`).join(" ");
 return <div key={shape} className={`${className} robot-image-frame`} data-robot-shape={shape} style={{...style,border:0,borderRadius:0,boxShadow:"none",background:"transparent",overflow:"visible"}}>
  <svg className="robot-frame-definitions" width="0" height="0" aria-hidden="true"><defs><clipPath id={id} clipPathUnits="objectBoundingBox">{outline}</clipPath></defs></svg>
  <div className="robot-frame-content" style={{clipPath:`url(#${id})`,background:style.background}}>{children}</div>
  <svg className="robot-frame-outline" viewBox="0 0 1 1" aria-hidden="true" style={{filter:shadow||`drop-shadow(0 0 20px ${accent}66)`}}>
   <rect x={geometry.inset} y={geometry.inset} width={geometry.extent} height={geometry.extent} rx={geometry.radius} fill="none" stroke={accent} strokeWidth={borderWidth} vectorEffect="non-scaling-stroke"/>
  </svg>
 </div>;
}

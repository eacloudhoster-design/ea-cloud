import {useId,type CSSProperties,type ReactNode} from "react";
import type {ShapeStyle} from "@/context/AppContext";
import {frameGeometry} from "@/lib/robot-frame-shape";
import "./RobotImageFrame.css";
interface Props{shape:ShapeStyle;accent:string;size:number;borderWidth:number;className?:string;style:CSSProperties;children:ReactNode}
export default function RobotImageFrame({shape,accent,size,borderWidth,className="",style,children}:Props){
 const id=`robot-frame-${useId().replace(/:/g,"")}`;const geometry=frameGeometry(shape,size,borderWidth);
 // Orbit retains each layout's original border, glow, background and content box.
 if(shape==="orbit")return <div key={shape} className={`${className} robot-image-frame`} data-robot-shape={shape} style={style}>{children}</div>;
 const outline=shape==="fortress"?<polygon points={geometry.points}/>:<rect x={geometry.inset} y={geometry.inset} width={geometry.extent} height={geometry.extent} rx={geometry.radius}/>;
 const shadow=String(style.boxShadow||"").split(", ").map(part=>`drop-shadow(${part})`).join(" ");
 return <div key={shape} className={`${className} robot-image-frame`} data-robot-shape={shape} style={{...style,border:0,borderRadius:0,boxShadow:"none",background:"transparent",overflow:"visible"}}>
  <svg className="robot-frame-definitions" width="0" height="0" aria-hidden="true"><defs><clipPath id={id} clipPathUnits="objectBoundingBox">{outline}</clipPath></defs></svg>
  <div className="robot-frame-content" style={{clipPath:`url(#${id})`,background:style.background}}>{children}</div>
  <svg className="robot-frame-outline" viewBox="0 0 1 1" aria-hidden="true" style={{filter:shadow||`drop-shadow(0 0 20px ${accent}66)`}}>
   {shape==="fortress"?<polygon points={geometry.points} fill="none" stroke={accent} strokeWidth={borderWidth} vectorEffect="non-scaling-stroke"/>:<rect x={geometry.inset} y={geometry.inset} width={geometry.extent} height={geometry.extent} rx={geometry.radius} fill="none" stroke={accent} strokeWidth={borderWidth} vectorEffect="non-scaling-stroke"/>}
  </svg>
 </div>;
}

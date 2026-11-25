import type {CSSProperties} from "react";
import "./OrbitArcs.css";
export default function OrbitArcs({color}:{color:string}){
 return <svg className="ea-orbit-arcs" viewBox="0 0 300 300" aria-hidden="true" style={{color} as CSSProperties}>
  <g className="ea-orbit-spin">
   <path d="M 198.57 16.58 A 142 142 0 0 1 288.9 120.48"/>
   <path d="M 198.57 16.58 A 142 142 0 0 1 288.9 120.48" transform="rotate(180 150 150)"/>
  </g>
 </svg>;
}

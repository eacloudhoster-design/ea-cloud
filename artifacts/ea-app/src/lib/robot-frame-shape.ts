import type {ShapeStyle} from "@/context/AppContext";
export function frameGeometry(shape:ShapeStyle,size:number,border:number){
 const inset=border/size/2;
 return {inset,extent:1-2*inset,radius:shape === "orbit" ? 0.5 : shape === "neural" ? 0.2 : 0};
}

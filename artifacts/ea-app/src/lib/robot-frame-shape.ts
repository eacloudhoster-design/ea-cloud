import type {ShapeStyle} from "@/context/AppContext";
export function frameGeometry(shape:ShapeStyle,size:number,border:number){
 const inset=border/size/2;
 // A regular upright pentagon, centred by its visible bounding box. Uniform
 // radius and angular steps preserve regular geometry at every interface size.
 const radius=(.5-inset)/Math.cos(Math.PI/10),angles=Array.from({length:5},(_,i)=>(-90+i*72)*Math.PI/180);
 const raw=angles.map(a=>({x:.5+radius*Math.cos(a),y:radius*Math.sin(a)}));
 const centreY=(Math.min(...raw.map(p=>p.y))+Math.max(...raw.map(p=>p.y)))/2;
 const points=raw.map(p=>`${p.x},${p.y-centreY+.5}`).join(" ");
 return {inset,extent:1-2*inset,radius:shape === "orbit" ? 0.5 : shape === "neural" ? 0.2 : 0,points};
}

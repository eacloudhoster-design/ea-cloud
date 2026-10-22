import {useEffect,useState} from "react";
import type {ShapeStyle} from "@/context/AppContext";
import {isShapeStyle,readShapePreference,saveShapePreference,shapePreferenceKey} from "@/lib/shape-preference";
export function useShapePreference(token:string|null):[ShapeStyle,(value:ShapeStyle)=>void] {
 const key=shapePreferenceKey(token);
 const [state,setState]=useState<{key:string|null;value:ShapeStyle}>({key:null,value:"orbit"});
 useEffect(()=>{let value:ShapeStyle="orbit";try{value=readShapePreference(localStorage,key);}catch{}setState({key,value});},[key]);
 return [state.key===key?state.value:"orbit",value=>{if(!isShapeStyle(value))return;setState({key,value});try{saveShapePreference(localStorage,key,value);}catch{}}];
}

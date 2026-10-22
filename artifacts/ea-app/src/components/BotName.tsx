import type {CSSProperties,ReactNode} from "react";
import {useApp} from "@/context/AppContext";
import {botFontStyle} from "@/lib/font-preference";
import "../assets/bot-fonts/fonts.css";
import "./BotName.css";
export default function BotName({as:Tag="h1",primary=false,className="",style,children}:{as?:"h1"|"p";primary?:boolean;className?:string;style?:CSSProperties;children:ReactNode}){
 const {botFont="Inter"}=useApp();
 return <Tag className={`${className} ea-bot-name ${primary?"ea-bot-name-primary":""}`} data-bot-name={primary?"primary":"secondary"} style={{...style,...botFontStyle(botFont)}}>{children}</Tag>;
}

import {useEffect,useState} from "react";
import {fontPreferenceKey,isBotFont,readFontPreference,saveFontPreference,type BotFont} from "@/lib/font-preference";
export function useFontPreference(token:string|null):[BotFont,(font:BotFont)=>void]{
 const key=fontPreferenceKey(token);
 const[state,setState]=useState<{key:string|null;font:BotFont}>({key:null,font:"Inter"});
 useEffect(()=>{let font:BotFont="Inter";try{font=readFontPreference(localStorage,key);}catch{}setState({key,font});},[key]);
 return[state.key===key?state.font:"Inter",font=>{if(!isBotFont(font))return;setState({key,font});try{saveFontPreference(localStorage,key,font);}catch{}}];
}

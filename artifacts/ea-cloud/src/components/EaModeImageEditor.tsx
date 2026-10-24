import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
const names = ["NORMAL", "BEAST", "AGGRESSIVE", "ULTIMATE"];
export default function EaModeImageEditor({eaId, name, onClose}:{eaId:number;name:string;onClose:()=>void}) {
  const [images,setImages]=useState<(string|null)[]>([null,null,null,null]);
  const [fallback,setFallback]=useState<string|null>(null);
  const [preview,setPreview]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const [error,setError]=useState(""),[message,setMessage]=useState("");
  const alive=useRef(true), urls=useRef<string[]>([]), pending=useRef(false);
  const api=async(url:string,init:RequestInit={})=>{
    const token=localStorage.getItem("token");
    const response=await fetch(url,{...init,cache:"no-store",signal:AbortSignal.timeout(30000),headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...init.headers}});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Image request failed. Please retry.");}
    return response;
  };
  const load=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError("");
    try{
      const data=await(await api(`/api/eas/${eaId}/mode-images`)).json();
      if(alive.current){setImages(data.savedImages);setFallback(data.normalFallback);setLoaded(true);}
    }catch(err){if(alive.current)setError((err as Error).message);}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  };
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;urls.current.forEach(URL.revokeObjectURL);};},[eaId]);
  const upload=async(index:number,file:File)=>{
    if(pending.current)return;
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)||file.size<1||file.size>5*1024*1024){setError("Select a JPEG, PNG, WebP or GIF image up to 5MB.");return;}
    pending.current=true;setBusy(true);setError("");setMessage("");
    const local=URL.createObjectURL(file);urls.current.push(local);setPreview(old=>({...old,[index]:local}));
    try{
      const data=await(await api("/api/storage/uploads/request-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,size:file.size,contentType:file.type})})).json();
      const target=new URL(data.uploadURL,location.href);
      if(target.origin===location.origin)await api(target.href,{method:"PUT",headers:{"Content-Type":file.type},body:file});
      else{
        if(target.protocol!=="https:")throw new Error("Invalid upload endpoint.");
        const response=await fetch(target.href,{method:"PUT",body:file,headers:{"Content-Type":file.type},signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error("Image upload failed. Please retry.");
      }
      if(alive.current){setImages(old=>old.map((value,i)=>i===index?`/api/storage${data.objectPath}`:value));setMessage("Image uploaded. Save artwork to publish it to clients.");}
    }catch(err){if(alive.current){setError((err as Error).message);setPreview(old=>{const copy={...old};delete copy[index];return copy;});}}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  };
  const save=async()=>{
    if(pending.current||!loaded)return;pending.current=true;setBusy(true);setError("");setMessage("");
    try{
      const data=await(await api(`/api/eas/${eaId}/mode-images`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({images})})).json();
      if(alive.current){setImages(data.savedImages);setFallback(data.normalFallback);setPreview({});setMessage("Artwork saved. Linked clients refresh automatically.");}
    }catch(err){if(alive.current)setError((err as Error).message);}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  };
  return <Dialog open onOpenChange={value=>{if(!value&&!busy)onClose();}}>
    <DialogContent aria-label={`${name} mode artwork`} className="bg-[#101217] border border-white/10 rounded-2xl p-5 w-[calc(100%-32px)] max-w-2xl max-h-[90dvh] overflow-auto text-white" onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>
      <div className="flex justify-between gap-4"><DialogTitle className="font-bold">{name} · Mode artwork</DialogTitle></div>
      <DialogDescription className="text-xs text-white/60 mb-4">Cosmetic images only. Normal uses your existing profile image until you upload a replacement for this EA. Trading settings are unaffected.</DialogDescription>
      {!loaded&&<Button disabled={busy} onClick={()=>void load()}>{busy?"Loading…":"Retry loading"}</Button>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {names.map((mode,index)=>{
          const src=preview[index]||images[index]||(index===0?fallback:null);
          return <div key={mode}>
            <p className="text-[10px] font-bold mb-2 min-h-[30px]">UPLOAD IMAGE {index+1} — {mode}</p>
            <div className="aspect-[3/5] rounded-xl border border-cyan-500/30 overflow-hidden bg-black/40 flex items-center justify-center">
              {src?<img className="w-full h-full object-cover" src={src} alt={`${mode} artwork preview`} />:<span className="text-xs text-white/40">No image saved</span>}
            </div>
            <label className="block mt-2 text-xs">Choose or replace image
              <input aria-label={`Upload ${mode} image`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy||!loaded} className="block w-full text-xs mt-1" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void upload(index,file);}} />
            </label>
            {images[index]&&<button type="button" disabled={busy} className="text-xs text-white/50 mt-2 underline" onClick={()=>{setImages(old=>old.map((v,i)=>i===index?null:v));setPreview(old=>{const next={...old};delete next[index];return next;});setMessage("Save artwork to apply this change.");}}>Clear {mode}</button>}
          </div>;
        })}
      </div>
      {error&&<p role="alert" className="text-red-400 text-sm mt-4">{error}</p>}
      {message&&<p role="status" className="text-cyan-300 text-sm mt-4">{message}</p>}
      <Button disabled={busy||!loaded} onClick={()=>void save()} className="mt-5">{busy?"Please wait…":"Save artwork"}</Button>
    </DialogContent>
  </Dialog>;
}

import { useState } from "react";
import { useGetEas } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import EaModeImageEditor from "./EaModeImageEditor";
export default function MentorModeArtwork() {
  const {data:eas,isLoading,isError,refetch}=useGetEas();
  const [selected,setSelected]=useState(0),[open,setOpen]=useState(false);
  const ea=eas?.find(item=>item.id===selected)||eas?.[0];
  return <div className="border-t border-white/10 pt-4">
    <h4 className="text-sm font-semibold text-white mb-2">EA Manipulation · Mode images</h4>
    <p className="text-xs text-white/50 mb-3">Choose an EA to upload Normal, Beast, Aggressive and Ultimate artwork. Your existing background image remains unchanged.</p>
    {isLoading&&<p className="text-xs text-white/50">Loading EAs…</p>}
    {isError&&<button type="button" className="text-xs text-red-300" onClick={()=>void refetch()}>Unable to load EAs. Retry</button>}
    {ea&&<>
      <select aria-label="EA for mode artwork" value={ea.id} onChange={event=>{setSelected(Number(event.target.value));setOpen(false);}} className="w-full bg-black/50 border border-white/10 rounded-lg text-white text-sm p-2 mb-2">
        {eas?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <Button type="button" variant="outline" size="sm" onClick={()=>setOpen(true)}>Manage four mode images</Button>
      {open&&<EaModeImageEditor key={ea.id} eaId={ea.id} name={ea.name} onClose={()=>setOpen(false)} />}
    </>}
    {!isLoading&&!isError&&!ea&&<p className="text-xs text-white/50">Create an EA in EA Manager before adding mode images.</p>}
  </div>;
}

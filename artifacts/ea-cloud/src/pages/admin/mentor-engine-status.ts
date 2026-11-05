/** One account-scoped read; cancelled or misbound results never reach the portal. */
export async function loadMentorClientStatus(id:string,signal:AbortSignal){
 if(!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))throw Error("Invalid client identity");
 if(signal.aborted)throw new DOMException("Cancelled","AbortError");
 const response=await fetch(`/api/admin/engine/clients/${id}`,{credentials:"same-origin",signal,cache:"no-store"});
 if(!response.ok)throw Error("Client engine status unavailable");
 const data=await response.json();
 if(signal.aborted)throw new DOMException("Cancelled","AbortError");
 if(data?.clientId!==Number(id) || !data.connection || !data.copier || !Array.isArray(data.mappings) || !Array.isArray(data.recentExecutions))throw Error("Client status identity not verified");
 return data;
}

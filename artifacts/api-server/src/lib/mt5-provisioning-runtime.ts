import {processNextProvisioning,expireQueuedProvisioning} from "./mt5-provisioning-consumer";
import {createDedicatedWorkerPort} from "./mt5-provisioning-port";
/** Explicit, serial, disabled-by-default startup hook. No retries of claimed jobs. */
export function startProvisioningConsumer(log:{warn:(value:unknown,message:string)=>void}){
 if(process.env.MT5_SELF_SERVICE_PROVISIONING!=="1"||process.env.MT5_PROVISIONING_CONSUMER!=="1")return ()=>{};
 const port=createDedicatedWorkerPort();let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 async function tick(){
  try{await expireQueuedProvisioning();if(!stopped)await processNextProvisioning(port);}
  catch{log.warn({code:"PROVISIONING_CONSUMER_UNAVAILABLE"},"Provisioning consumer held; inspect queue without replaying claimed requests");}
  finally{if(!stopped)timer=setTimeout(()=>void tick(),5000);}
 }
 timer=setTimeout(()=>void tick(),1000);
 return ()=>{stopped=true;clearTimeout(timer);};
}

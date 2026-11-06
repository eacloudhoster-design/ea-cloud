/** Configuration only; this module never grants worker execution authorization. */
export function validateCopyPolicy(value:any){
 const keys=['enabled','lotMode','fixedLotSize','allocationPercent','maxLotSize','maxExposureLots','maxOpenTrades','maxDailyDrawdown'];
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k)) || keys.some(k=>!(k in value)))throw Error('Provide the complete supported policy');
 if(typeof value.enabled!=='boolean' || !['fixed','proportional'].includes(value.lotMode))throw Error('Unsupported copying preference or sizing method');
 const ranges:any={fixedLotSize:[0.0001,100],allocationPercent:[0.01,100],maxLotSize:[0.0001,100],maxExposureLots:[0.0001,1000],maxOpenTrades:[1,100],maxDailyDrawdown:[0.01,25]};
 for(const [k,[min,max]] of Object.entries(ranges) as any){if(typeof value[k]!=='number'||!Number.isFinite(value[k])||value[k]<min||value[k]>max)throw Error('Policy limit outside supported bounds');}
 for(const key of Object.keys(ranges)){const places=key==='maxOpenTrades'?0:['allocationPercent','maxDailyDrawdown'].includes(key)?2:4;const scaled=value[key]*10**places;if(Math.abs(scaled-Math.round(scaled))>1e-6)throw Error('Limit precision exceeds persistent schema');}
 if(!Number.isInteger(value.maxOpenTrades)||value.fixedLotSize>value.maxLotSize||value.maxLotSize>value.maxExposureLots)throw Error('Inconsistent position or exposure limits');
 return {enabled:value.enabled,lotMode:value.lotMode,fixedLotSize:String(value.fixedLotSize),allocationPercent:String(value.allocationPercent),maxLotSize:String(value.maxLotSize),maxExposureLots:String(value.maxExposureLots),maxOpenTrades:value.maxOpenTrades,maxDailyDrawdown:String(value.maxDailyDrawdown)};
}
export function effectiveCopySettings(settings:any,policy:any){
 if(!policy)return null;
 try{validateCopyPolicy({enabled:policy.enabled,lotMode:policy.lotMode,...Object.fromEntries(['fixedLotSize','allocationPercent','maxLotSize','maxExposureLots','maxOpenTrades','maxDailyDrawdown'].map(k=>[k,Number(policy[k])]))});}catch{return null;}
 const number=(v:any)=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
 const cap=number(settings.maxLotSize),mentorCap=number(policy.maxLotSize),daily=number(settings.maxDailyDrawdown),mentorDaily=number(policy.maxDailyDrawdown),count=number(settings.maxOpenTrades),mentorCount=number(policy.maxOpenTrades);
 if(!cap||!mentorCap||!daily||!mentorDaily||!count||!mentorCount)return null;
 return {...settings,copyingEnabled:settings.copyingEnabled===true&&policy.enabled===true,maxLotSize:String(Math.min(cap,mentorCap)),maxDailyDrawdown:String(Math.min(daily,mentorDaily)),maxOpenTrades:Math.min(count,mentorCount),mentorPolicy:policy};
}
export function policyVolume(clientVolume:number,sourceVolume:number,policy:any){
 const desired=policy.lotMode==='fixed'?Number(policy.fixedLotSize):sourceVolume*Number(policy.allocationPercent)/100;
 return Math.max(0,Math.min(clientVolume,desired,Number(policy.maxLotSize)));
}

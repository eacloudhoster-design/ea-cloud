import {Router} from "express";
import {requireAppSession} from "../middlewares/app-session";
import {requireAuth} from "../middlewares/auth";
import {trustedBrowserOrigin} from "../lib/browser-session";
import {queueProvisioning,provisioningStatus,cancelProvisioning,type Owner} from "../lib/mt5-provisioning";
const router=Router();
for(const [path,auth,kind] of [["/app/mt5-provisioning/requests",requireAppSession,"client"],["/admin/mt5-provisioning/requests",requireAuth,"mentor"]] as const){
 const gate=(req:any,res:any,next:any)=>{
  res.setHeader("Cache-Control","no-store");
  if(kind==="mentor" && req.userRole!=="mentor"){res.status(403).json({code:"ACCOUNT_ROLE_NOT_AUTHORIZED"});return;}
  if(!["GET","HEAD"].includes(req.method)&&!trustedBrowserOrigin(req)){res.status(403).json({code:"SESSION_ORIGIN_DENIED"});return;}
  if(process.env.MT5_SELF_SERVICE_PROVISIONING!=="1"){res.status(503).json({code:"PROVISIONING_NOT_CONFIGURED",executionEnabled:false});return;}
  next();
 };
 const owner=(req:any):Owner=>({kind,id:kind==="client"?req.clientId:req.userId});
 const failure=(res:any,e:unknown)=>{
  const code=e instanceof Error?e.message:"";
  if(["INVALID_PROVISIONING_REQUEST","ACCOUNT_ROLE_NOT_AUTHORIZED","OWNERSHIP_CONFIRMATION_REQUIRED"].includes(code)){res.status(422).json({code});return;}
  if(["PROVISIONING_REQUEST_CONFLICT","PROVISIONING_ALREADY_PENDING"].includes(code)){res.status(409).json({code});return;}
  res.status(503).json({code:"PROVISIONING_STORAGE_UNAVAILABLE",executionEnabled:false});
 };
 router.post(path,auth,gate,async(req:any,res)=>{try{res.status(202).json(await queueProvisioning(req.body,owner(req)));}catch(e){failure(res,e);}});
 router.get(path,auth,gate,async(req:any,res)=>{try{res.json({requests:await provisioningStatus(owner(req)),executionEnabled:false});}catch(e){failure(res,e);}});
 router.post(path+"/:id/cancel",auth,gate,async(req:any,res)=>{try{if(!await cancelProvisioning(owner(req),req.params.id)){res.status(409).json({code:"PROVISIONING_CANNOT_CANCEL"});return;}res.json({state:"cancelled",executionEnabled:false});}catch(e){failure(res,e);}});
}
export default router;

import {Router} from "express";
import {requireAppSession} from "../middlewares/app-session";
import {requireAuth} from "../middlewares/auth";
import {trustedBrowserOrigin} from "../lib/browser-session";
import {listOwnedAccounts,linkOwnedAccount,ownedAccountStatus,selectOwnedAccount,disconnectOwnedAccount} from "../lib/mt5-account-inventory";
const router=Router();
router.get("/admin/mt5-account-capabilities",requireAuth,(req:any,res)=>{res.setHeader("Cache-Control","no-store");if(req.userRole!=="mentor"){res.status(403).json({code:"ACCOUNT_ROLE_NOT_AUTHORIZED"});return;}res.json({accountModes:process.env.MT5_LIVE_READONLY_ACCOUNTS==="1"?["demo","live"]:["demo"],executionEnabled:false,multiAccountManagement:process.env.MT5_ACCOUNT_INVENTORY==="1"});});
const conflicts=new Set(["ACCOUNT_ALREADY_BOUND","ACCOUNT_MODE_CHANGED","ACCOUNT_ROLE_MISMATCH","ACCOUNT_CAPACITY_REACHED","ACCOUNT_REBIND_REQUIRES_RECONCILIATION","ACCOUNT_CHANGED_RETRY","ACCOUNT_DISCONNECTED","SOURCE_LOGIN_SCHEMA_LIMIT"]);
for(const [base,auth,kind] of [["/app/mt5-accounts",requireAppSession,"client"],["/admin/mt5-accounts",requireAuth,"mentor"]] as const){
 const gate=(req:any,res:any,next:any)=>{res.setHeader("Cache-Control","no-store");if(kind==="mentor"&&req.userRole!=="mentor"){res.status(403).json({code:"ACCOUNT_ROLE_NOT_AUTHORIZED"});return;}if(req.method!=="GET"&&req.method!=="HEAD"&&!trustedBrowserOrigin(req)){res.status(403).json({code:"SESSION_ORIGIN_DENIED"});return;}if(process.env.MT5_ACCOUNT_INVENTORY!=="1"){res.status(503).json({code:"ACCOUNT_MANAGEMENT_UNAVAILABLE"});return;}next();};
 const action=(fn:(owner:any,req:any)=>Promise<any>)=>async(req:any,res:any)=>{try{res.json(await fn({kind,id:kind==="client"?req.clientId:req.userId},req));}catch(e){const code=e instanceof Error?e.message:"";res.status(code==="ACCOUNT_NOT_FOUND"?404:code==="INVALID_ACCOUNT_REQUEST"?422:conflicts.has(code)?409:503).json({code:code==="ACCOUNT_NOT_FOUND"||code==="INVALID_ACCOUNT_REQUEST"||conflicts.has(code)?code:"ACCOUNT_MANAGEMENT_UNAVAILABLE"});}};
 router.get(base,auth,gate,action(async owner=>({accounts:await listOwnedAccounts(owner),executionEnabled:false})));
 router.post(base,auth,gate,action((owner,req)=>linkOwnedAccount(owner,req.body)));
 router.get(base+"/:id/status",auth,gate,action((owner,req)=>ownedAccountStatus(owner,req.params.id)));
 router.post(base+"/:id/select",auth,gate,action((owner,req)=>selectOwnedAccount(owner,req.params.id)));
 router.post(base+"/:id/disconnect",auth,gate,action((owner,req)=>disconnectOwnedAccount(owner,req.params.id)));
}
export default router;

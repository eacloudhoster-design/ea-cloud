import {clientEngineStatus} from "./engine-status";
import {provisioningStatus} from "./mt5-provisioning";
const reasons={
 DEPLOYMENT_EXECUTION_DISABLED:["Trading is disabled in this deployment. Connecting an MT5 account does not authorize execution.","Execution requires a separately approved deployment; do not remove safety controls."],
 ACCOUNT_NOT_CONNECTED:["No verified MT5 account is linked to this profile.","Connect your own MT5 account first."],
 WORKER_ASSIGNMENT_REQUIRED:["This account has no authoritative worker assignment.","Request account provisioning through the existing MT5 account screen."],
 ACCOUNT_DISCONNECTED:["Your MT5 account is disconnected.","Reconnect and verify it on the MT5 screen."],
 PROVISIONING_PENDING:["Your MT5 worker assignment is pending or requires review.","Check the existing provisioning request; do not submit a duplicate."],
 ACCOUNT_VERIFICATION_UNAVAILABLE:["The MT5 account could not be verified now.","Refresh account status on the MT5 screen."],
 GATEWAY_UNAVAILABLE:["The private MT5 gateway is unavailable.","Check gateway status; re-entering broker credentials will not repair transport."],
 GATEWAY_NOT_CONFIGURED:["EA Cloud's private gateway routing or service authentication is not configured.","The application operator must correct the existing gateway configuration."],
 GATEWAY_AUTHORIZATION_FAILED:["The gateway rejected EA Cloud's service authentication.","The application operator must review service credentials; do not reset your broker password."],
 MENTOR_AUTHORIZATION_REQUIRED:["Your mentor has not approved an effective account allocation.","Ask your mentor to review the existing copy policy."],
 READ_ONLY_ACCOUNT:["This account connection is read-only. Order execution is not authorized.","Read-only verification cannot activate trading."],
 EMERGENCY_STOP_ACTIVE:["An emergency stop is active.","Execution remains blocked pending authorized safety review."],
 RECOVERY_HOLD:["The worker has unresolved or unknown recovery holds.","Execution requires reconciliation review; do not retry uncertain orders."],
 WORKER_EXECUTION_DISABLED:["The assigned worker has not authorized execution.","Execution requires worker approval and current account verification."],
 STATUS_UNAVAILABLE:["Bot status could not be verified.","Refresh status before submitting another command."],
} as const;
export type BotBlockReason=keyof typeof reasons;
export function botBlock(reason:BotBlockReason){return {reason,error:reasons[reason][0],action:reasons[reason][1]};}
export function engineActivationBlock(engine:Awaited<ReturnType<typeof clientEngineStatus>>){
 if(!engine.connection.verified){
  const code=engine.connection.code;
  if(code==="MT5_GATEWAY_NOT_CONFIGURED")return botBlock("GATEWAY_NOT_CONFIGURED");
  if(code==="MT5_GATEWAY_AUTH_REJECTED")return botBlock("GATEWAY_AUTHORIZATION_FAILED");
  if(["MT5_GATEWAY_TIMEOUT","MT5_GATEWAY_UNAVAILABLE"].includes(code))return botBlock("GATEWAY_UNAVAILABLE");
  if(code==="ACCOUNT_NOT_CONFIGURED")return botBlock("ACCOUNT_NOT_CONNECTED");
  if(code==="ACCOUNT_NOT_ASSIGNED")return botBlock("WORKER_ASSIGNMENT_REQUIRED");
  if(code==="ACCOUNT_DISCONNECTED")return botBlock("ACCOUNT_DISCONNECTED");
  return botBlock("ACCOUNT_VERIFICATION_UNAVAILABLE");
 }
 if(engine.connection.readOnly||engine.copier.state==="read_only")return botBlock("READ_ONLY_ACCOUNT");
 if(engine.copier.emergencyStopActive!==false)return botBlock("EMERGENCY_STOP_ACTIVE");
 if(engine.copier.unresolvedJournalHolds!==0)return botBlock("RECOVERY_HOLD");
 if(!engine.copier.mentorAllocationApproved)return botBlock("MENTOR_AUTHORIZATION_REQUIRED");
 if(!engine.copier.workerExecutionPermitted)return botBlock("WORKER_EXECUTION_DISABLED");
 return null;
}
/** Status/proof only. Never changes execution gates or calls a financial route. */
export async function botActivationBlock(clientId:number,settings:{mt5Login?:string|null;mt5Server?:string|null;mt5Connected?:boolean|null;encryptedMt5Password?:string|null}|undefined,probe=true){
 if(process.env.EA_MT5_MANAGEMENT_ONLY==="1")return botBlock("DEPLOYMENT_EXECUTION_DISABLED");
 if(!settings?.mt5Login||!settings.mt5Server||!settings.encryptedMt5Password){
  if(process.env.MT5_SELF_SERVICE_PROVISIONING==="1"){
   try{if((await provisioningStatus({kind:"client",id:clientId})).some(row=>["queued","provisioning","awaiting_verification","review_required"].includes(row.state)))return botBlock("PROVISIONING_PENDING");}
   catch{return botBlock("STATUS_UNAVAILABLE");}
  }
  return botBlock("ACCOUNT_NOT_CONNECTED");
 }
 if(settings.mt5Connected!==true)return botBlock("ACCOUNT_DISCONNECTED");
 if(!probe)return null;
 try{return engineActivationBlock(await clientEngineStatus(clientId,true));}catch{return botBlock("STATUS_UNAVAILABLE");}
}

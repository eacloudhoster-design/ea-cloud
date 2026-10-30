import { mqlString } from "./contracts";
/** HTTPS runs in a native MT5 Service, never the strategy's event loop. */
export function relaySource(opts: {
  id: string;
  token: string;
  origin: string;
}) {
  return (
    `#property service\n#property strict\nstring EAC_ID=${mqlString(opts.id)};\nstring EAC_TOKEN=${mqlString(opts.token)};\nstring EAC_ORIGIN=${mqlString(opts.origin)};\n` +
    String.raw`
string ReadShared(string file){
 int f=FileOpen(file,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ|FILE_SHARE_WRITE,0,CP_UTF8);
 if(f==INVALID_HANDLE)return "";string body=FileReadString(f);FileClose(f);return body;
}
void Status(string file,int code,string eventId){
 string temp=file+".tmp";int f=FileOpen(temp,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,'|',CP_UTF8);
 if(f==INVALID_HANDLE)return;FileWrite(f,(string)TimeLocal(),(string)code,eventId);FileFlush(f);FileClose(f);
 FileMove(temp,FILE_COMMON,file,FILE_COMMON|FILE_REWRITE);
}
void OnStart(){
 string file="EACloud_"+EAC_ID+"_"+(string)AccountInfoInteger(ACCOUNT_LOGIN)+".jsonl";
 string lockName="EACRelay_"+StringSubstr(EAC_ID,0,16)+"_"+(string)AccountInfoInteger(ACCOUNT_LOGIN);
 // Held for the service lifetime: two local relay instances cannot consume one outbox.
 int lock=FileOpen(lockName+".lock",FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);
 if(lock==INVALID_HANDLE){Print("EA Cloud relay already running or storage unavailable");return;}
 datetime next=0,heartbeatAt=0;int failures=0;
 while(!IsStopped()){
  if(TimeLocal()<next){Sleep(100);continue;}
  bool heartbeat=TimeLocal()>=heartbeatAt;
  string body=ReadShared(heartbeat?file+".heartbeat":file);
  if(body==""){Sleep(100);continue;}
  char data[],response[];string headers;
  StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(data,ArraySize(data)-1);
  int code=WebRequest("POST",EAC_ORIGIN+(heartbeat?"/api/robots/heartbeat":"/api/robots/events"),"Content-Type: application/json\r\nX-EA-Robot-Token: "+EAC_TOKEN+"\r\n",2000,data,response,headers);
  string answer=CharArrayToString(response,0,WHOLE_ARRAY,CP_UTF8),eventId="";
  if(!heartbeat){int begin=StringFind(body,"\"eventId\":\"")+11,end=StringFind(body,"\"",begin);if(begin>=11&&end>begin)eventId=StringSubstr(body,begin,end-begin);}
  bool acknowledged=code>=200&&code<300&&StringFind(answer,"\"received\":true")>=0;
  if(!heartbeat)acknowledged=acknowledged&&eventId!=""&&StringFind(answer,"\"eventId\":\""+eventId+"\"")>=0;
  Status(file+".relay",acknowledged?200:code,acknowledged?eventId:"");
  if(acknowledged){failures=0;next=TimeLocal()+1;if(heartbeat)heartbeatAt=TimeLocal()+20;}
  else{failures++;next=TimeLocal()+(int)MathMin(30,MathPow(2,MathMin(5,failures)));}
 }
 FileClose(lock);
}
`
  );
}
export const localDelivery = String.raw`
// Local acknowledgement only. No sockets/WebRequest/HTTP in the trading EA.
void EAC_LocalDelivery(){
 string temp=EAC_file+".heartbeat.tmp";
 int f=FileOpen(temp,FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8);
 if(f!=INVALID_HANDLE){FileWriteString(f,EAC_Heartbeat());FileFlush(f);FileClose(f);FileMove(temp,FILE_COMMON,EAC_file+".heartbeat",FILE_COMMON|FILE_REWRITE);}
 f=FileOpen(EAC_file+".relay",FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ|FILE_SHARE_WRITE,'|',CP_UTF8);
 if(f==INVALID_HANDLE){EAC_status="Waiting for background relay";EAC_Panel();return;}
 datetime at=(datetime)StringToInteger(FileReadString(f));int code=(int)StringToInteger(FileReadString(f));string ack=FileReadString(f);FileClose(f);
 EAC_status=TimeLocal()-at>30?"Relay disconnected":code==200?"EA Cloud acknowledged; see portal delivery":"Connection failed (HTTP "+(string)code+")";
 if(TimeLocal()-at<=30&&code==200&&ack!=""&&ArraySize(EAC_queue)>0&&StringFind(EAC_queue[0],"\"eventId\":\""+ack+"\"")>=0){
  string first=EAC_queue[0];ArrayRemove(EAC_queue,0,1);
  if(!EAC_Persist()){int n=ArraySize(EAC_queue);ArrayResize(EAC_queue,n+1);for(int i=n;i>0;i--)EAC_queue[i]=EAC_queue[i-1];EAC_queue[0]=first;}
 }
 EAC_Panel();
}
`;

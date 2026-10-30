import { mqlString } from "./contracts";
/** Independently usable observation include. It cannot place or copy trades. */
export function broadcastInclude(opts: {
  id: string;
  token: string;
  origin: string;
  name: string;
  manager: string;
}) {
  return (
    `// EA Cloud capture-only integration toolkit. NOT the SMC trading strategy.\n// Source is readable: keep this restricted token private; revoke in Setup Methods.\n#property strict\nstring EAC_ID=${mqlString(opts.id)};\nstring EAC_TOKEN=${mqlString(opts.token)};\nstring EAC_ORIGIN=${mqlString(opts.origin)};\nstring EAC_NAME=${mqlString(opts.name)};\nstring EAC_MANAGER=${mqlString(opts.manager)};\n` +
    String.raw`
string EAC_queue[];
string EAC_file="";
string EAC_status="Not acknowledged";
int EAC_attempt=0;
datetime EAC_next=0;
ulong EAC_sequence=0;
string EAC_lastSignal="NONE";
string EAC_Json(string value) {
 StringReplace(value,"\\","\\\\");StringReplace(value,"\"","\\\"");
 StringReplace(value,"\r","\\r");StringReplace(value,"\n","\\n");StringReplace(value,"\t","\\t");
 return "\""+value+"\"";
}
bool EAC_Persist() {
 string temp=EAC_file+".tmp";
 int f=FileOpen(temp,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
 if(f==INVALID_HANDLE){EAC_status="Outbox write failed";return false;}
 for(int i=0;i<ArraySize(EAC_queue);i++)FileWriteString(f,EAC_queue[i]+"\r\n");
 FileFlush(f);FileClose(f);
 if(!FileMove(temp,0,EAC_file,FILE_REWRITE)){EAC_status="Outbox replace failed";return false;}
 return true;
}
void EAC_Label(string suffix,int y,string value) {
 string key="EAC_"+EAC_ID+suffix;
 if(ObjectFind(0,key)<0)ObjectCreate(0,key,OBJ_LABEL,0,0,0);
 ObjectSetInteger(0,key,OBJPROP_CORNER,CORNER_LEFT_UPPER);
 ObjectSetInteger(0,key,OBJPROP_XDISTANCE,16);ObjectSetInteger(0,key,OBJPROP_YDISTANCE,y);
 ObjectSetInteger(0,key,OBJPROP_COLOR,clrCyan);ObjectSetInteger(0,key,OBJPROP_FONTSIZE,10);
 ObjectSetInteger(0,key,OBJPROP_SELECTABLE,false);ObjectSetInteger(0,key,OBJPROP_ZORDER,10);
 ObjectSetString(0,key,OBJPROP_TEXT,value);
}
void EAC_Panel() {
 string bg="EAC_"+EAC_ID+"panel";
 if(ObjectFind(0,bg)<0)ObjectCreate(0,bg,OBJ_RECTANGLE_LABEL,0,0,0);
 ObjectSetInteger(0,bg,OBJPROP_XDISTANCE,8);ObjectSetInteger(0,bg,OBJPROP_YDISTANCE,8);
 ObjectSetInteger(0,bg,OBJPROP_XSIZE,360);ObjectSetInteger(0,bg,OBJPROP_YSIZE,132);
 ObjectSetInteger(0,bg,OBJPROP_BGCOLOR,C'8,12,28');ObjectSetInteger(0,bg,OBJPROP_BORDER_COLOR,clrCyan);
 ObjectSetInteger(0,bg,OBJPROP_SELECTABLE,false);ObjectSetInteger(0,bg,OBJPROP_ZORDER,5);

 EAC_Label("title",16,EAC_NAME);EAC_Label("manager",34,"EA Manager: "+EAC_MANAGER);
 EAC_Label("mode",52,"CAPTURE ONLY - NO CLIENT EXECUTION");
 EAC_Label("status",70,EAC_status);EAC_Label("queue",88,"Pending events: "+(string)ArraySize(EAC_queue));
 EAC_Label("last",106,"Last observed: "+EAC_lastSignal);
}
void EAC_Init() {
 EAC_file="EACloud_"+EAC_ID+"_"+(string)AccountInfoInteger(ACCOUNT_LOGIN)+".jsonl";
 int f=FileOpen(EAC_file,FILE_READ|FILE_TXT|FILE_ANSI,0,CP_UTF8);
 if(f!=INVALID_HANDLE){while(!FileIsEnding(f)&&ArraySize(EAC_queue)<256){string line=FileReadString(f);if(StringFind(line,"{\"eventId\":")==0){int n=ArraySize(EAC_queue);ArrayResize(EAC_queue,n+1);EAC_queue[n]=line;}}FileClose(f);}
 EAC_Panel();
}
bool EAC_Enqueue(string value) {
 int n=ArraySize(EAC_queue);
 if(n>=256){EAC_status="OUTBOX FULL - EVENT NOT CAPTURED";Print("EA Cloud: outbox full; event not queued. Reconcile history before restarting.");EAC_Panel();return false;}
 ArrayResize(EAC_queue,n+1);EAC_queue[n]=value;
 if(!EAC_Persist()){ArrayResize(EAC_queue,n);EAC_Panel();return false;}EAC_Panel();return true;
}
bool EAC_SelectPosition(ulong identifier) {
 for(int i=0;i<PositionsTotal();i++)if(PositionGetTicket(i)>0&&(ulong)PositionGetInteger(POSITION_IDENTIFIER)==identifier)return true;
 return false;
}
// Only confirmed deal fills and explicit position changes are observed.
// An OUT can be partial; INOUT is a reversal. No lifecycle is executed here.
void EAC_Transaction(const MqlTradeTransaction &trans) {
 string kind="",entry="",symbol="",side="",eventId="";
 ulong deal=0,order=0,position=0;double volume=0,price=0,sl=0,tp=0;long timeMs=0;
 if(trans.type==TRADE_TRANSACTION_DEAL_ADD&&trans.deal>0&&HistoryDealSelect(trans.deal)) {
  long type=HistoryDealGetInteger(trans.deal,DEAL_TYPE);
  if(type!=DEAL_TYPE_BUY&&type!=DEAL_TYPE_SELL)return;
  kind="DEAL";deal=trans.deal;order=(ulong)HistoryDealGetInteger(deal,DEAL_ORDER);
  position=(ulong)HistoryDealGetInteger(deal,DEAL_POSITION_ID);long e=HistoryDealGetInteger(deal,DEAL_ENTRY);
  if(e==DEAL_ENTRY_IN)entry="IN";else if(e==DEAL_ENTRY_OUT)entry="OUT";else if(e==DEAL_ENTRY_INOUT)entry="INOUT";else if(e==DEAL_ENTRY_OUT_BY)entry="OUT_BY";else return;
  symbol=HistoryDealGetString(deal,DEAL_SYMBOL);side=type==DEAL_TYPE_BUY?"BUY":"SELL";
  volume=HistoryDealGetDouble(deal,DEAL_VOLUME);price=HistoryDealGetDouble(deal,DEAL_PRICE);
  sl=HistoryDealGetDouble(deal,DEAL_SL);tp=HistoryDealGetDouble(deal,DEAL_TP);timeMs=HistoryDealGetInteger(deal,DEAL_TIME_MSC);
  eventId=(string)AccountInfoInteger(ACCOUNT_LOGIN)+":D:"+(string)deal;
 } else if(trans.type==TRADE_TRANSACTION_POSITION&&PositionSelectByTicket(trans.position)) {
  kind="POSITION";entry="POSITION";position=(ulong)PositionGetInteger(POSITION_IDENTIFIER);
  symbol=PositionGetString(POSITION_SYMBOL);side=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL";
  volume=PositionGetDouble(POSITION_VOLUME);price=PositionGetDouble(POSITION_PRICE_OPEN);
  sl=PositionGetDouble(POSITION_SL);tp=PositionGetDouble(POSITION_TP);timeMs=(long)TimeCurrent()*1000;
  EAC_sequence++;eventId=(string)AccountInfoInteger(ACCOUNT_LOGIN)+":P:"+(string)position+":"+(string)TimeLocal()+":"+(string)GetMicrosecondCount()+":"+(string)EAC_sequence;
 } else return;
 string marginMode=AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING?"HEDGING":AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_EXCHANGE?"EXCHANGE":"NETTING";
 EAC_lastSignal=kind+" "+entry+" "+side;
 string payload="{\"eventId\":"+EAC_Json(eventId)+",\"sourceAccount\":"+EAC_Json((string)AccountInfoInteger(ACCOUNT_LOGIN))+
 ",\"sourceServer\":"+EAC_Json(AccountInfoString(ACCOUNT_SERVER))+",\"accountMode\":"+EAC_Json(marginMode)+",\"kind\":"+EAC_Json(kind)+",\"entry\":"+EAC_Json(entry)+
 ",\"dealId\":"+EAC_Json((string)deal)+",\"orderId\":"+EAC_Json((string)order)+",\"positionId\":"+EAC_Json((string)position)+
 ",\"symbol\":"+EAC_Json(symbol)+",\"side\":"+EAC_Json(side)+",\"volume\":"+DoubleToString(volume,8)+
 ",\"price\":"+DoubleToString(price,10)+",\"stopLoss\":"+DoubleToString(sl,10)+",\"takeProfit\":"+DoubleToString(tp,10)+",\"timestampMs\":"+(string)timeMs+"}";
 EAC_Enqueue(payload);
}
void EAC_Timer() {
 if(TimeLocal()<EAC_next)return;
 string body=ArraySize(EAC_queue)>0?EAC_queue[0]:"{}";
 string path=ArraySize(EAC_queue)>0?"/api/robots/events":"/api/robots/heartbeat";
 char data[],response[];string responseHeaders;
 StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(data,ArraySize(data)-1);
 int code=WebRequest("POST",EAC_ORIGIN+path,"Content-Type: application/json\r\nX-EA-Robot-Token: "+EAC_TOKEN+"\r\n",2000,data,response,responseHeaders);
 string answer=CharArrayToString(response,0,WHOLE_ARRAY,CP_UTF8);
 bool matches=true;
 if(ArraySize(EAC_queue)>0){
  int begin=StringFind(body,"\"eventId\":\"")+11;
  int end=StringFind(body,"\"",begin);
  string eventId=StringSubstr(body,begin,end-begin);
  matches=end>begin&&StringFind(answer,"\"eventId\":\""+eventId+"\"")>=0;
 }
 if(code>=200&&code<300&&matches&&StringFind(answer,"\"received\":true")>=0&&StringFind(answer,"\"execution\":false")>=0) {
  EAC_status="Acknowledged - capture only";EAC_attempt=0;
  if(ArraySize(EAC_queue)>0){ArrayRemove(EAC_queue,0,1);EAC_Persist();}
  EAC_next=TimeLocal()+(ArraySize(EAC_queue)>0?1:20);
 }else{
  EAC_attempt++;int delay=(int)MathMin(30,MathPow(2,MathMin(5,EAC_attempt)));
  EAC_next=TimeLocal()+delay;EAC_status="Not acknowledged (HTTP "+(string)code+")";
  // Never print credentials or raw payloads.
 }
 EAC_Panel();
}
void EAC_Stop() {
 EAC_Persist();ObjectsDeleteAll(0,"EAC_"+EAC_ID);ChartRedraw();
}
`
  );
}
export function backgroundInclude(resource: string) {
  return (
    `#resource ${mqlString("\\Images\\EACloud\\" + resource + "\\MT5_Background.bmp")}\n` +
    String.raw`
void EAC_Background() {
 uint pixels[],sw=0,sh=0;
 if(!ResourceReadImage(` +
    mqlString("::Images\\EACloud\\" + resource + "\\MT5_Background.bmp") +
    String.raw`,pixels,sw,sh)||sw==0||sh==0)return;
 int w=(int)ChartGetInteger(0,CHART_WIDTH_IN_PIXELS),h=(int)ChartGetInteger(0,CHART_HEIGHT_IN_PIXELS);
 if(w<1||h<1||w>3840||h>2160)return;
 uint scaled[];ArrayResize(scaled,w*h);double ratio=MathMax((double)w/sw,(double)h/sh);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  int sx=(int)MathMin(sw-1,(x+(sw*ratio-w)/2)/ratio),sy=(int)MathMin(sh-1,(y+(sh*ratio-h)/2)/ratio);
  scaled[y*w+x]=pixels[sy*sw+sx];
 }
 if(!ResourceCreate("EAC_Background_"+EAC_ID,scaled,w,h,0,0,w,COLOR_FORMAT_XRGB_NOALPHA))return;
 string key="EAC_"+EAC_ID+"background";
 if(ObjectFind(0,key)<0)ObjectCreate(0,key,OBJ_BITMAP_LABEL,0,0,0);
 ObjectSetString(0,key,OBJPROP_BMPFILE,"::EAC_Background_"+EAC_ID);
 ObjectSetInteger(0,key,OBJPROP_BACK,true);ObjectSetInteger(0,key,OBJPROP_SELECTABLE,false);ObjectSetInteger(0,key,OBJPROP_ZORDER,0);ChartRedraw();
}
`
  );
}

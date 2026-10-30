/** Separate-chart, account-level reconciliation. Never submits or modifies orders. */
export function reconciliationInclude(magic: string) {
  return (
    `input long SourceMagic=${magic};\n` +
    String.raw`
struct EAC_Known {ulong id;string symbol;string side;bool closed;};
EAC_Known EAC_known[];
long EAC_cursorMs=0;ulong EAC_cursorDeal=0;
string EAC_state="",EAC_counter="";
int EAC_inventory=0;bool EAC_historyOK=false;
datetime EAC_scanNext=0;
string EAC_Heartbeat(){
 return "{\"sourceAccount\":"+EAC_Json((string)AccountInfoInteger(ACCOUNT_LOGIN))+",\"sourceServer\":"+EAC_Json(AccountInfoString(ACCOUNT_SERVER))+
 ",\"sourceMagic\":"+EAC_Json((string)SourceMagic)+",\"inventoryCount\":"+(string)EAC_inventory+",\"queueDepth\":"+(string)ArraySize(EAC_queue)+
 ",\"lastSequence\":"+DoubleToString(GlobalVariableGet(EAC_counter),0)+",\"historyHealthy\":"+(EAC_historyOK?"true":"false")+"}";
}
bool EAC_SaveState(){
 string temp=EAC_state+".tmp";int f=FileOpen(temp,FILE_WRITE|FILE_CSV|FILE_ANSI,'|',CP_UTF8);
 if(f==INVALID_HANDLE)return false;
 FileWrite(f,(string)EAC_cursorMs,(string)EAC_cursorDeal);
 for(int i=0;i<ArraySize(EAC_known);i++)FileWrite(f,(string)EAC_known[i].id,EAC_known[i].symbol,EAC_known[i].side,EAC_known[i].closed?"1":"0");
 FileFlush(f);FileClose(f);return FileMove(temp,0,EAC_state,FILE_REWRITE);
}
void EAC_ReconcileInit(){
 EAC_state=EAC_file+".state";EAC_counter="EACO_"+StringSubstr(EAC_ID,0,16)+"_"+(string)AccountInfoInteger(ACCOUNT_LOGIN);
 if(!GlobalVariableCheck(EAC_counter))GlobalVariableSet(EAC_counter,(double)TimeLocal()*1000);
 GlobalVariablesFlush();
 int f=FileOpen(EAC_state,FILE_READ|FILE_CSV|FILE_ANSI,'|',CP_UTF8);
 if(f!=INVALID_HANDLE){
  EAC_cursorMs=(long)StringToInteger(FileReadString(f));EAC_cursorDeal=(ulong)StringToInteger(FileReadString(f));
  while(!FileIsEnding(f)&&ArraySize(EAC_known)<10000){
   string id=FileReadString(f);if(id=="")break;
   int n=ArraySize(EAC_known);ArrayResize(EAC_known,n+1);EAC_known[n].id=(ulong)StringToInteger(id);
   EAC_known[n].symbol=FileReadString(f);EAC_known[n].side=FileReadString(f);EAC_known[n].closed=FileReadString(f)=="1";
  }FileClose(f);
 }else{EAC_cursorMs=(long)TimeCurrent()*1000;EAC_SaveState();}
}
// Only opening/addition/reversal deals establish ownership. Manual exits (magic 0)
// of an owned position are still included. Mixed-magic netting is fail-closed.
int EAC_Ownership(ulong position){
 if(!HistorySelectByPosition(position))return -1;
 bool matched=false,other=false;
 for(int i=0;i<HistoryDealsTotal();i++){
  ulong d=HistoryDealGetTicket(i);long type=HistoryDealGetInteger(d,DEAL_TYPE);
  if(type!=DEAL_TYPE_BUY&&type!=DEAL_TYPE_SELL)continue;
  long entry=HistoryDealGetInteger(d,DEAL_ENTRY);
  if(entry==DEAL_ENTRY_IN||entry==DEAL_ENTRY_INOUT){if(HistoryDealGetInteger(d,DEAL_MAGIC)==SourceMagic)matched=true;else other=true;}
 }
 return matched?(other?2:1):0;
}
int EAC_Find(ulong id){for(int i=0;i<ArraySize(EAC_known);i++)if(EAC_known[i].id==id)return i;return -1;}
bool EAC_Remember(ulong id,string symbol,string side){
 int i=EAC_Find(id);if(i>=0)return true;
 if(ArraySize(EAC_known)>=10000){EAC_status="Position inventory full; reconcile manually";return false;}
 i=ArraySize(EAC_known);ArrayResize(EAC_known,i+1);EAC_known[i].id=id;EAC_known[i].symbol=symbol;EAC_known[i].side=side;EAC_known[i].closed=false;
 return EAC_SaveState();
}
bool EAC_Snapshot(int i,bool mixed){
 bool exists=EAC_SelectPosition(EAC_known[i].id);
 double volume=exists?PositionGetDouble(POSITION_VOLUME):0;
 string side=exists?(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL"):EAC_known[i].side;
 string symbol=exists?PositionGetString(POSITION_SYMBOL):EAC_known[i].symbol;
 double price=exists?PositionGetDouble(POSITION_PRICE_OPEN):0,sl=exists?PositionGetDouble(POSITION_SL):0,tp=exists?PositionGetDouble(POSITION_TP):0;
 double previous=GlobalVariableGet(EAC_counter),next=previous+1;
 if(!GlobalVariableSetOnCondition(EAC_counter,next,previous))return false;GlobalVariablesFlush();
 string seq=DoubleToString(next,0),eventId=(string)AccountInfoInteger(ACCOUNT_LOGIN)+":S:"+(string)EAC_known[i].id+":"+seq;
 string mode=AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING?"HEDGING":AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_EXCHANGE?"EXCHANGE":"NETTING";
 string body="{\"eventId\":"+EAC_Json(eventId)+",\"sourceAccount\":"+EAC_Json((string)AccountInfoInteger(ACCOUNT_LOGIN))+",\"sourceServer\":"+EAC_Json(AccountInfoString(ACCOUNT_SERVER))+
 ",\"accountMode\":"+EAC_Json(mode)+",\"kind\":\"SNAPSHOT\",\"entry\":\"SNAPSHOT\",\"sourceMagic\":"+EAC_Json((string)SourceMagic)+",\"sequence\":"+seq+",\"mixed\":"+(mixed?"true":"false")+
 ",\"dealId\":\"0\",\"orderId\":\"0\",\"positionId\":"+EAC_Json((string)EAC_known[i].id)+",\"symbol\":"+EAC_Json(symbol)+",\"side\":"+EAC_Json(side)+
 ",\"volume\":"+DoubleToString(volume,8)+",\"price\":"+DoubleToString(price,10)+",\"stopLoss\":"+DoubleToString(sl,10)+",\"takeProfit\":"+DoubleToString(tp,10)+",\"timestampMs\":"+(string)((long)TimeCurrent()*1000)+"}";
 if(!EAC_Enqueue(body))return false;
 EAC_known[i].side=side;EAC_known[i].closed=!exists;return EAC_SaveState();
}
void EAC_Reconcile(){
 if(TimeLocal()<EAC_scanNext)return;EAC_scanNext=TimeLocal()+2;EAC_historyOK=false;EAC_inventory=0;
 if(!TerminalInfoInteger(TERMINAL_CONNECTED)||SourceMagic<0)return;
 if(!HistorySelect((datetime)MathMax(0,EAC_cursorMs/1000-1),TimeCurrent()))return;
 // Copy tickets before HistorySelectByPosition/HistoryDealSelect change selection.
 ulong deals[];int n=HistoryDealsTotal();ArrayResize(deals,n);
 for(int i=0;i<n;i++)deals[i]=HistoryDealGetTicket(i);
 for(int i=0;i<n;i++){
  ulong d=deals[i];if(!HistoryDealSelect(d))return;
  long ms=HistoryDealGetInteger(d,DEAL_TIME_MSC);if(ms<EAC_cursorMs||(ms==EAC_cursorMs&&d<=EAC_cursorDeal))continue;
  long type=HistoryDealGetInteger(d,DEAL_TYPE);ulong position=(ulong)HistoryDealGetInteger(d,DEAL_POSITION_ID);
  if(type==DEAL_TYPE_BUY||type==DEAL_TYPE_SELL){
   int ownership=EAC_Ownership(position);if(ownership<0)return;
   if(ownership>0){
    if(ArraySize(EAC_queue)>=250)return;
    if(!HistoryDealSelect(d))return;
    string symbol=HistoryDealGetString(d,DEAL_SYMBOL),side=type==DEAL_TYPE_BUY?"BUY":"SELL";
    if(!EAC_Remember(position,symbol,side))return;
    MqlTradeTransaction trans={};trans.type=TRADE_TRANSACTION_DEAL_ADD;trans.deal=d;
    int before=ArraySize(EAC_queue);EAC_Transaction(trans);if(ArraySize(EAC_queue)!=before+1)return;
   }
  }
  EAC_cursorMs=ms;EAC_cursorDeal=d;if(!EAC_SaveState())return;
 }
 // All positions are discovered account-wide, independently of Chart 1 events.
 ulong positions[];int count=PositionsTotal();ArrayResize(positions,count);
 for(int i=0;i<count;i++){ulong ticket=PositionGetTicket(i);positions[i]=(ulong)PositionGetInteger(POSITION_IDENTIFIER);}
 for(int i=0;i<count;i++){
  int ownership=EAC_Ownership(positions[i]);if(ownership<0)return;
  if(ownership>0){EAC_inventory++;if(!EAC_SelectPosition(positions[i]))continue;
   if(!EAC_Remember(positions[i],PositionGetString(POSITION_SYMBOL),PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL"))return;}
 }
 for(int i=0;i<ArraySize(EAC_known);i++){
  bool exists=EAC_SelectPosition(EAC_known[i].id);if(!exists&&EAC_known[i].closed)continue;
  int ownership=EAC_Ownership(EAC_known[i].id);if(ownership<0)return;
  if(!EAC_Snapshot(i,ownership==2))return;
 }
 EAC_historyOK=true;
}
`
  );
}

/** Source-side pending observation only. No source trade operation is submitted. */
export function pendingInclude(){return String.raw`
struct EAC_PendingKnown {ulong id;bool closed;};
EAC_PendingKnown EAC_pending[];
bool EAC_SavePending(){
 string path=EAC_state+".pending",temp=path+".tmp";
 int f=FileOpen(temp,FILE_WRITE|FILE_CSV|FILE_ANSI,'|',CP_UTF8);if(f==INVALID_HANDLE)return false;
 for(int i=0;i<ArraySize(EAC_pending);i++)FileWrite(f,(string)EAC_pending[i].id,EAC_pending[i].closed?"1":"0");
 FileFlush(f);FileClose(f);return FileMove(temp,0,path,FILE_REWRITE);
}
void EAC_LoadPending(){
 int f=FileOpen(EAC_state+".pending",FILE_READ|FILE_CSV|FILE_ANSI,'|',CP_UTF8);
 if(f==INVALID_HANDLE)return;
 while(!FileIsEnding(f)){
  string id=FileReadString(f);if(id=="")break;int n=ArraySize(EAC_pending);
  if(ArrayResize(EAC_pending,n+1)!=n+1){EAC_status="Pending state allocation failed";break;}
  EAC_pending[n].id=(ulong)StringToInteger(id);EAC_pending[n].closed=FileReadString(f)=="1";
 }FileClose(f);
}
ulong EAC_OpeningOrder(ulong position){
 if(!HistorySelectByPosition(position))return 0;
 for(int i=0;i<HistoryDealsTotal();i++){
  ulong d=HistoryDealGetTicket(i);long entry=HistoryDealGetInteger(d,DEAL_ENTRY);
  if(entry==DEAL_ENTRY_IN||entry==DEAL_ENTRY_INOUT)return (ulong)HistoryDealGetInteger(d,DEAL_ORDER);
 }return 0;
}
bool EAC_PendingSnapshot(int index){
 ulong ticket=EAC_pending[index].id;bool exists=OrderSelect(ticket);
 if(!exists&&EAC_pending[index].closed)return true;
 if(!exists&&!HistoryOrderSelect(ticket))return false;
 long kind=exists?OrderGetInteger(ORDER_TYPE):HistoryOrderGetInteger(ticket,ORDER_TYPE);
 long magic=exists?OrderGetInteger(ORDER_MAGIC):HistoryOrderGetInteger(ticket,ORDER_MAGIC);
 if(kind<ORDER_TYPE_BUY_LIMIT||kind>ORDER_TYPE_SELL_STOP_LIMIT||magic!=SourceMagic)return false;
 long state=exists?OrderGetInteger(ORDER_STATE):HistoryOrderGetInteger(ticket,ORDER_STATE);
 string phase=exists?"active":(state==ORDER_STATE_FILLED||state==ORDER_STATE_PARTIAL?"triggered":"cancel");
 if(!exists&&state!=ORDER_STATE_FILLED&&state!=ORDER_STATE_PARTIAL&&state!=ORDER_STATE_CANCELED&&state!=ORDER_STATE_EXPIRED&&state!=ORDER_STATE_REJECTED)return false;
 string symbol=exists?OrderGetString(ORDER_SYMBOL):HistoryOrderGetString(ticket,ORDER_SYMBOL);
 double volume=exists?OrderGetDouble(ORDER_VOLUME_CURRENT):0;
 double price=exists?OrderGetDouble(ORDER_PRICE_OPEN):HistoryOrderGetDouble(ticket,ORDER_PRICE_OPEN);
 double sl=exists?OrderGetDouble(ORDER_SL):HistoryOrderGetDouble(ticket,ORDER_SL),tp=exists?OrderGetDouble(ORDER_TP):HistoryOrderGetDouble(ticket,ORDER_TP);
 double limit=exists?OrderGetDouble(ORDER_PRICE_STOPLIMIT):HistoryOrderGetDouble(ticket,ORDER_PRICE_STOPLIMIT);
 long lifetime=exists?OrderGetInteger(ORDER_TYPE_TIME):HistoryOrderGetInteger(ticket,ORDER_TYPE_TIME),expiration=exists?OrderGetInteger(ORDER_TIME_EXPIRATION):HistoryOrderGetInteger(ticket,ORDER_TIME_EXPIRATION);
 double previous=GlobalVariableGet(EAC_counter),next=previous+1;
 if(!GlobalVariableSetOnCondition(EAC_counter,next,previous))return false;GlobalVariablesFlush();
 string seq=DoubleToString(next,0),side=(kind==ORDER_TYPE_BUY_LIMIT||kind==ORDER_TYPE_BUY_STOP||kind==ORDER_TYPE_BUY_STOP_LIMIT)?"BUY":"SELL";
 string mode=AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING?"HEDGING":AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_EXCHANGE?"EXCHANGE":"NETTING";
 string body="{\"eventId\":"+EAC_Json((string)AccountInfoInteger(ACCOUNT_LOGIN)+":O:"+(string)ticket+":"+seq)+",\"sourceAccount\":"+EAC_Json((string)AccountInfoInteger(ACCOUNT_LOGIN))+",\"sourceServer\":"+EAC_Json(AccountInfoString(ACCOUNT_SERVER))+
 ",\"accountMode\":"+EAC_Json(mode)+",\"kind\":\"PENDING\",\"entry\":\"PENDING\",\"sourceMagic\":"+EAC_Json((string)SourceMagic)+",\"sequence\":"+seq+",\"mixed\":false,\"dealId\":\"0\",\"orderId\":"+EAC_Json((string)ticket)+",\"positionId\":"+EAC_Json((string)ticket)+",\"symbol\":"+EAC_Json(symbol)+",\"side\":"+EAC_Json(side)+
 ",\"volume\":"+DoubleToString(volume,8)+",\"price\":"+DoubleToString(price,10)+",\"stopLoss\":"+DoubleToString(sl,10)+",\"takeProfit\":"+DoubleToString(tp,10)+",\"pendingState\":"+EAC_Json(phase)+",\"pendingType\":"+(string)kind+",\"stopLimit\":"+DoubleToString(limit,10)+",\"typeTime\":"+(string)lifetime+",\"expiration\":"+(string)expiration+",\"timestampMs\":"+(string)((long)TimeCurrent()*1000)+"}";
 if(!EAC_Enqueue(body))return false;EAC_pending[index].closed=!exists;return EAC_SavePending();
}
bool EAC_ReconcilePending(){
 for(int i=0;i<OrdersTotal();i++){
  ulong ticket=OrderGetTicket(i);if(ticket==0||OrderGetInteger(ORDER_MAGIC)!=SourceMagic)continue;
  long kind=OrderGetInteger(ORDER_TYPE);if(kind<ORDER_TYPE_BUY_LIMIT||kind>ORDER_TYPE_SELL_STOP_LIMIT)continue;
  EAC_inventory++;bool found=false;
  for(int j=0;j<ArraySize(EAC_pending);j++)if(EAC_pending[j].id==ticket){found=true;break;}
  if(!found){int n=ArraySize(EAC_pending);if(ArrayResize(EAC_pending,n+1)!=n+1)return false;EAC_pending[n].id=ticket;EAC_pending[n].closed=false;if(!EAC_SavePending())return false;}
 }
 for(int i=0;i<ArraySize(EAC_pending);i++)if(!EAC_PendingSnapshot(i))return false;
 return true;
}
`}

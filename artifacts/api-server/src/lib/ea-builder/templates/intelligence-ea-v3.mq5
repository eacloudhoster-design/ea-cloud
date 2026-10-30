//+------------------------------------------------------------------+
//| Intelligence EA V3+.mq5                                        |
//| Based on SMC BLUEPRINT EA V3                                     |
//| Quasimodo Pattern EA - Copy Trading Removed                      |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, Intelligence EA V3+"
#property version   "5.00"
#property description "Sugar Beck Scalper EA"
#property description "Automatic BUY & SELL"
#property description "Automatic Stop Loss (SL)"
#property description "Automatic Take Profit (TP)"
#property description "Break-even protection"
#property description "Trailing Stop"
#property description "Automatic risk protection"
#property description "Small-account protection"

#include <Trade\Trade.mqh>
CTrade trade;

//--- Timeframe
input ENUM_TIMEFRAMES Timeframe = PERIOD_CURRENT;

//--- Original Trading Inputs
input double LotSize        = 0.01;
input double SLPercent      = 0.50;
input double TPPercent      = 1.00;
input int    MagicNumber    = 12345;
input int    SwingStrength  = 2;
input int    LookbackBars   = 80;
input int    ForceSignal    = 0;       // 1=BUY, -1=SELL, 0=automatic

//--- Break Even
input bool   UseBreakEven        = true;
input double BreakEvenTriggerPts = 100.0;
input double BreakEvenOffsetPts  = 0.0;

//--- Trailing Stop
input bool   UseTrailingStop     = true;
input double TrailingStartPts    = 150.0;
input double TrailingDistancePts = 100.0;
input double TrailingStepPts     = 20.0;

//--- Protection
input double MaxSpreadPoints     = 100.0;
input double MinBalance          = 10.0;
input int    MaxOpenPositions    = 1;

//--- Globals
string   g_comment    = "Intelligence EA V3+";
string   g_eaName     = "Intelligence EA V3+";
datetime g_lastBar    = 0;
int      g_tradeCount = 0;
string   g_lastSignal = "--";
bool     g_fireOnLoad = true;

string PFX = "Intelligence EA V3+_";

//+------------------------------------------------------------------+
//| Get timeframe                                                     |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES GetTF()
{
   if(Timeframe == PERIOD_CURRENT)
      return (ENUM_TIMEFRAMES)_Period;

   return Timeframe;
}

//+------------------------------------------------------------------+
//| Normalize price                                                   |
//+------------------------------------------------------------------+
double NormalizePrice(double price)
{
   return NormalizeDouble(price, _Digits);
}

//+------------------------------------------------------------------+
//| Normalize lot                                                      |
//+------------------------------------------------------------------+
double NormalizeLot(double lots)
{
   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   if(stepLot <= 0.0)
      stepLot = 0.01;

   lots = MathMax(minLot, MathMin(maxLot, lots));

   lots = MathFloor(lots / stepLot) * stepLot;

   return NormalizeDouble(lots, 2);
}

//+------------------------------------------------------------------+
//| Spread check                                                       |
//+------------------------------------------------------------------+
bool SpreadOK()
{
   double ask   = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid   = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   if(point <= 0.0)
      return false;

   double spread = (ask - bid) / point;

   return (spread <= MaxSpreadPoints);
}

//+------------------------------------------------------------------+
//| Count EA positions                                                 |
//+------------------------------------------------------------------+
int CountOurPositions()
{
   int count = 0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);

      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != _Symbol)
         continue;

      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber)
         continue;

      count++;
   }

   return count;
}

//+------------------------------------------------------------------+
//| Check swing high                                                   |
//+------------------------------------------------------------------+
bool IsSwingHigh(int shift)
{
   ENUM_TIMEFRAMES tf = GetTF();

   double center = iHigh(_Symbol, tf, shift);

   if(center == 0.0)
      return false;

   for(int i = 1; i <= SwingStrength; i++)
   {
      if(iHigh(_Symbol, tf, shift + i) >= center)
         return false;

      if(iHigh(_Symbol, tf, shift - i) >= center)
         return false;
   }

   return true;
}

//+------------------------------------------------------------------+
//| Check swing low                                                    |
//+------------------------------------------------------------------+
bool IsSwingLow(int shift)
{
   ENUM_TIMEFRAMES tf = GetTF();

   double center = iLow(_Symbol, tf, shift);

   if(center == 0.0)
      return false;

   for(int i = 1; i <= SwingStrength; i++)
   {
      if(iLow(_Symbol, tf, shift + i) <= center)
         return false;

      if(iLow(_Symbol, tf, shift - i) <= center)
         return false;
   }

   return true;
}

//+------------------------------------------------------------------+
//| Quasimodo signal                                                   |
//+------------------------------------------------------------------+
int DetectQuasimodoSignal()
{
   ENUM_TIMEFRAMES tf = GetTF();

   if(Bars(_Symbol, tf) < LookbackBars)
      return 0;

   int swingShift[5];
   int swingType[5];
   double swingPrice[5];

   int found = 0;

   for(int shift = SwingStrength + 1;
       shift < LookbackBars && found < 5;
       shift++)
   {
      if(IsSwingHigh(shift))
      {
         swingShift[found] = shift;
         swingType[found]  = 1;
         swingPrice[found] = iHigh(_Symbol, tf, shift);
         found++;
      }
      else if(IsSwingLow(shift))
      {
         swingShift[found] = shift;
         swingType[found]  = -1;
         swingPrice[found] = iLow(_Symbol, tf, shift);
         found++;
      }
   }

   if(found < 5)
      return 0;

   //--- Bearish Quasimodo
   // H - L - HH - LL - LH
   if(swingType[4] == 1 &&
      swingType[3] == -1 &&
      swingType[2] == 1 &&
      swingType[1] == -1 &&
      swingType[0] == 1)
   {
      if(swingPrice[2] > swingPrice[4] &&
         swingPrice[1] < swingPrice[3] &&
         swingPrice[0] < swingPrice[2])
      {
         return -1;
      }
   }

   //--- Bullish Quasimodo
   // L - H - LL - HH - HL
   if(swingType[4] == -1 &&
      swingType[3] == 1 &&
      swingType[2] == -1 &&
      swingType[1] == 1 &&
      swingType[0] == -1)
   {
      if(swingPrice[2] < swingPrice[4] &&
         swingPrice[1] > swingPrice[3] &&
         swingPrice[0] > swingPrice[2])
      {
         return 1;
      }
   }

   return 0;
}

//+------------------------------------------------------------------+
//| New bar                                                            |
//+------------------------------------------------------------------+
bool IsNewBar()
{
   ENUM_TIMEFRAMES tf = GetTF();

   datetime currentBar = iTime(_Symbol, tf, 0);

   if(currentBar == 0)
      return false;

   if(currentBar != g_lastBar)
   {
      g_lastBar = currentBar;
      return true;
   }

   return false;
}

//+------------------------------------------------------------------+
//| Calculate original-style stops                                    |
//+------------------------------------------------------------------+
void CalculateStops(int signal, double entry, double &sl, double &tp)
{
   double slDistance = entry * SLPercent / 100.0;
   double tpDistance = entry * TPPercent / 100.0;

   if(signal > 0)
   {
      sl = NormalizePrice(entry - slDistance);
      tp = NormalizePrice(entry + tpDistance);
   }
   else
   {
      sl = NormalizePrice(entry + slDistance);
      tp = NormalizePrice(entry - tpDistance);
   }
}

//+------------------------------------------------------------------+
//| Open BUY                                                           |
//+------------------------------------------------------------------+
bool OpenBuy()
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   if(ask <= 0.0)
      return false;

   double sl, tp;

   CalculateStops(1, ask, sl, tp);

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(20);

   bool result = trade.Buy(
      LotSize,
      _Symbol,
      ask,
      sl,
      tp,
      g_comment
   );

   if(result)
   {
      g_tradeCount++;
      g_lastSignal = "BUY";
   }

   return result;
}

//+------------------------------------------------------------------+
//| Open SELL                                                          |
//+------------------------------------------------------------------+
bool OpenSell()
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   if(bid <= 0.0)
      return false;

   double sl, tp;

   CalculateStops(-1, bid, sl, tp);

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(20);

   bool result = trade.Sell(
      LotSize,
      _Symbol,
      bid,
      sl,
      tp,
      g_comment
   );

   if(result)
   {
      g_tradeCount++;
      g_lastSignal = "SELL";
   }

   return result;
}

//+------------------------------------------------------------------+
//| Trailing stop + break even                                         |
//+------------------------------------------------------------------+
void ManageTrailingStop()
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   if(point <= 0.0)
      return;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);

      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != _Symbol)
         continue;

      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber)
         continue;

      ENUM_POSITION_TYPE type =
         (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);

      double currentPrice;
      double profitPoints;

      if(type == POSITION_TYPE_BUY)
      {
         currentPrice = bid;
         profitPoints = (currentPrice - openPrice) / point;
      }
      else
      {
         currentPrice = ask;
         profitPoints = (openPrice - currentPrice) / point;
      }

      //==============================================================
      // BREAK EVEN
      //==============================================================
      if(UseBreakEven &&
         profitPoints >= BreakEvenTriggerPts)
      {
         double newSL;

         if(type == POSITION_TYPE_BUY)
            newSL = openPrice + BreakEvenOffsetPts * point;
         else
            newSL = openPrice - BreakEvenOffsetPts * point;

         newSL = NormalizePrice(newSL);

         bool moveSL = false;

         if(type == POSITION_TYPE_BUY)
         {
            if(currentSL == 0.0 || newSL > currentSL)
               moveSL = true;
         }
         else
         {
            if(currentSL == 0.0 || newSL < currentSL)
               moveSL = true;
         }

         if(moveSL)
            trade.PositionModify(ticket, newSL, currentTP);
      }

      //==============================================================
      // TRAILING STOP
      //==============================================================
      if(UseTrailingStop &&
         profitPoints >= TrailingStartPts)
      {
         double newSL;

         if(type == POSITION_TYPE_BUY)
         {
            newSL =
               currentPrice -
               TrailingDistancePts * point;

            newSL = NormalizePrice(newSL);

            // Never trail below entry.
            if(newSL <= openPrice)
               continue;

            // Only move SL upward.
            if(currentSL == 0.0 ||
               newSL >= currentSL + TrailingStepPts * point)
            {
               trade.PositionModify(
                  ticket,
                  newSL,
                  currentTP
               );
            }
         }
         else
         {
            newSL =
               currentPrice +
               TrailingDistancePts * point;

            newSL = NormalizePrice(newSL);

            // Never trail above entry.
            if(newSL >= openPrice)
               continue;

            // Only move SL downward.
            if(currentSL == 0.0 ||
               newSL <= currentSL - TrailingStepPts * point)
            {
               trade.PositionModify(
                  ticket,
                  newSL,
                  currentTP
               );
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Create label                                                       |
//+------------------------------------------------------------------+
void CreateLabel(
   string name,
   int xDist,
   int yDist,
   string text,
   color clr,
   int fontSize,
   int anchor = ANCHOR_LEFT_UPPER
)
{
   if(ObjectFind(0, name) >= 0)
      ObjectDelete(0, name);

   ObjectCreate(
      0,
      name,
      OBJ_LABEL,
      0,
      0,
      0
   );

   ObjectSetString(
      0,
      name,
      OBJPROP_TEXT,
      text
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_COLOR,
      clr
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_FONTSIZE,
      fontSize
   );

   ObjectSetString(
      0,
      name,
      OBJPROP_FONT,
      "Arial Bold"
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_CORNER,
      CORNER_RIGHT_UPPER
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_XDISTANCE,
      xDist
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_YDISTANCE,
      yDist
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_ANCHOR,
      anchor
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_SELECTABLE,
      false
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_HIDDEN,
      true
   );

   ObjectSetInteger(
      0,
      name,
      OBJPROP_ZORDER,
      10
   );
}

//+------------------------------------------------------------------+
//| Create panel                                                       |
//+------------------------------------------------------------------+
void CreatePanel()
{
   if(ObjectFind(0, PFX+"BG") >= 0)
      ObjectDelete(0, PFX+"BG");

   ObjectCreate(
      0,
      PFX+"BG",
      OBJ_RECTANGLE_LABEL,
      0,
      0,
      0
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_CORNER,
      CORNER_RIGHT_UPPER
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_XDISTANCE,
      8
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_YDISTANCE,
      12
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_XSIZE,
      255
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_YSIZE,
      162
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_BGCOLOR,
      C'8,12,28'
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_BORDER_COLOR,
      C'0,140,255'
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_BORDER_TYPE,
      BORDER_FLAT
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_SELECTABLE,
      false
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_HIDDEN,
      true
   );

   ObjectSetInteger(
      0,
      PFX+"BG",
      OBJPROP_ZORDER,
      5
   );

   CreateLabel(
      PFX+"Title",
      135,
      22,
      g_eaName,
      clrCyan,
      10,
      ANCHOR_CENTER
   );

   CreateLabel(
      PFX+"Signal",
      255,
      55,
      "Signal: --",
      clrWhite,
      9
   );

   CreateLabel(
      PFX+"Trades",
      255,
      78,
      "Trades: 0",
      clrWhite,
      9
   );

   CreateLabel(
      PFX+"Status",
      255,
      101,
      "Status: READY",
      clrLime,
      9
   );

   CreateLabel(
      PFX+"Trail",
      255,
      124,
      "Trailing: ON",
      clrYellow,
      9
   );

   CreateLabel(
      PFX+"Magic",
      255,
      147,
      "Magic: " + IntegerToString(MagicNumber),
      clrSilver,
      8
   );
}

//+------------------------------------------------------------------+
//| Update panel                                                       |
//+------------------------------------------------------------------+
void UpdatePanel()
{
   int positions = CountOurPositions();

   string signalText =
      "Signal: " + g_lastSignal;

   string tradeText =
      "Trades: " + IntegerToString(g_tradeCount);

   string statusText;

   if(positions > 0)
      statusText = "Status: POSITION OPEN";
   else
      statusText = "Status: READY";

   string trailText;

   if(UseTrailingStop)
      trailText =
         "Trailing: ON / " +
         DoubleToString(TrailingStartPts, 0) +
         " pts";
   else
      trailText = "Trailing: OFF";

   ObjectSetString(
      0,
      PFX+"Signal",
      OBJPROP_TEXT,
      signalText
   );

   ObjectSetString(
      0,
      PFX+"Trades",
      OBJPROP_TEXT,
      tradeText
   );

   ObjectSetString(
      0,
      PFX+"Status",
      OBJPROP_TEXT,
      statusText
   );

   ObjectSetString(
      0,
      PFX+"Trail",
      OBJPROP_TEXT,
      trailText
   );
}

//+------------------------------------------------------------------+
//| Delete panel                                                       |
//+------------------------------------------------------------------+
void DeletePanel()
{
   ObjectDelete(0, PFX+"BG");
   ObjectDelete(0, PFX+"Title");
   ObjectDelete(0, PFX+"Signal");
   ObjectDelete(0, PFX+"Trades");
   ObjectDelete(0, PFX+"Status");
   ObjectDelete(0, PFX+"Trail");
   ObjectDelete(0, PFX+"Magic");
}

//+------------------------------------------------------------------+
//| Expert initialization                                              |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);

   g_lastBar = 0;
   g_tradeCount = 0;
   g_lastSignal = "--";
   g_fireOnLoad = true;

   CreatePanel();

   Print(g_eaName, " initialized.");

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                            |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   DeletePanel();
}

//+------------------------------------------------------------------+
//| Expert tick                                                        |
//+------------------------------------------------------------------+
void OnTick()
{
   //--- Manage existing trades FIRST
   ManageTrailingStop();

   UpdatePanel();

   //--- Account protection
   if(AccountInfoDouble(ACCOUNT_BALANCE) < MinBalance)
      return;

   //--- Maximum open positions
   if(CountOurPositions() >= MaxOpenPositions)
      return;

   //--- Spread protection
   if(!SpreadOK())
      return;

   int signal = 0;

   //==============================================================
   // First trade when EA loads
   //==============================================================
   if(g_fireOnLoad)
   {
      g_fireOnLoad = false;

      if(ForceSignal == 1)
         signal = 1;
      else if(ForceSignal == -1)
         signal = -1;
      else
         signal = DetectQuasimodoSignal();

      if(signal == 1)
         OpenBuy();
      else if(signal == -1)
         OpenSell();

      return;
   }

   //==============================================================
   // Only look for new entries on a new bar
   //==============================================================
   if(!IsNewBar())
      return;

   //--- Forced signal
   if(ForceSignal == 1)
      signal = 1;
   else if(ForceSignal == -1)
      signal = -1;
   else
      signal = DetectQuasimodoSignal();

   //--- Execute
   if(signal == 1)
      OpenBuy();
   else if(signal == -1)
      OpenSell();
}
//+------------------------------------------------------------------+
import { z } from "zod";
export const scannerQuoteSchema = z.object({
 symbol:z.string().min(1).max(40),bid:z.number().positive().finite(),ask:z.number().positive().finite(),timeMs:z.number().int().positive(),
 digits:z.number().int().min(0).max(10),point:z.number().positive().finite(),tickSize:z.number().positive().finite(),stopsLevel:z.number().int().min(0),
 minLot:z.number().positive().finite(),maxLot:z.number().positive().finite(),lotStep:z.number().positive().finite(),volumeLimit:z.number().nonnegative().finite(),openVolume:z.number().nonnegative().finite(),
 connected:z.boolean(),tradeAllowed:z.boolean(),marketOpen:z.boolean().nullable(),marketOrders:z.boolean(),limitOrders:z.boolean(),
 tradeMode:z.enum(["full","long_only","short_only","close_only","disabled"]),
}).strict();
export type ScannerQuote = z.infer<typeof scannerQuoteSchema>;
export type ScannerOrderType = "MARKET"|"BUY LIMIT"|"SELL LIMIT";
export interface ScannerTradePlan { type:ScannerOrderType|null; entry:number|null; stopLoss:number|null; takeProfit:number|null; riskRewardRatio:number|null; eligible:boolean; reasons:string[]; quoteTimeMs:number|null }
export interface ScannerPreflight { plan:ScannerTradePlan; brokerChecked:boolean; submissionEnabled:false; error?:string }

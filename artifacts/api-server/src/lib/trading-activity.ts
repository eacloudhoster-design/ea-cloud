import {queueExecutionPush} from "./web-push";
import {and,eq} from 'drizzle-orm';
import {db,tradingActivityTable,tradeSignalsTable,usersTable} from '@workspace/db';
import {broadcastToClient} from '../ws';
import type {TradingActivity} from '../../../../lib/api-zod/src/trading-activity';
export function safeActivityText(value:string){return value.replace(/(["']?(?:password|token|api[_-]?key|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,'$1[redacted]').replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [redacted]');}
export async function recordTradingActivity(clientId:number,source:TradingActivity['source'],level:TradingActivity['level'],message:string,details:Record<string,unknown>={},createdAt=new Date()) {
 try {const [row]=await db.insert(tradingActivityTable).values({clientId,source,level,message:safeActivityText(message).slice(0,300),details,createdAt}).returning();broadcastToClient(clientId,{type:'TRADING_ACTIVITY',id:row.id});return true;}
 catch{return false;} // Monitoring failure must never alter execution or risk flow.
}
export function executionActivity(row:{status:string;signalKind:string;symbol:string;action?:string|null;ticket?:string|null;retcode?:number|null;errorMessage?:string|null}) {
 const accepted=row.status==='success'&&Boolean(row.ticket)&&[10008,10009,10010].includes(row.retcode??0);
 const level:TradingActivity['level']=accepted?'success':row.status==='failed'?'error':row.status==='skipped'?'warning':'info';
 const reason=row.errorMessage?safeActivityText(row.errorMessage).slice(0,200):null;
 const message=accepted?`Broker accepted ${row.signalKind} ${row.action??''} ${row.symbol} · ticket #${row.ticket}`:row.status==='pending'?`Mentor signal received; ${row.signalKind} ${row.action??''} ${row.symbol}: pending`:row.status==='success'?`Mentor ${row.signalKind} ${row.symbol}: acceptance requires reconciliation`:`Mentor ${row.signalKind} ${row.symbol}: ${row.status}${reason?` — ${reason}`:''}`;
 return {message,level};
}

export async function recordExecutionActivity(clientId:number,row:{id:number;mentorId:number;signalId:number;status:string;signalKind:string;symbol:string;action?:string|null;ticket?:string|null;retcode?:number|null;errorMessage?:string|null;volume?:string|null;updatedAt?:Date;retryable?:number;vpsResponse?:string|null}) {
 const occurredAt=row.updatedAt??new Date();
 void queueExecutionPush(clientId,row);
 try{const [signal]=await db.select().from(tradeSignalsTable).where(and(eq(tradeSignalsTable.id,row.signalId),eq(tradeSignalsTable.mentorId,row.mentorId))).limit(1);
 const [mentor]=await db.select({name:usersTable.mentorName,robotName:usersTable.robotName}).from(usersTable).where(eq(usersTable.id,row.mentorId)).limit(1);
 const event=executionActivity(row);await recordTradingActivity(clientId,'mentor',event.level,event.message,{mentor:mentor?.name||mentor?.robotName||null,executionId:row.id,mentorId:row.mentorId,signalId:row.signalId,symbol:row.symbol,direction:row.action,signalKind:row.signalKind,ticket:row.ticket,retcode:row.retcode,volume:row.volume,entry:signal?.openPrice,stopLoss:signal?.stopLoss,takeProfit:signal?.takeProfit},occurredAt);}catch{}
}

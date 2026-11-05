import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
test('older pending OPEN in backoff blocks later CLOSE while another mentor remains claimable',async()=>{
 const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_MODULE)));
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE trade_signals(id int primary key, mentor_id int, status text, created_at timestamptz, updated_at timestamptz, next_attempt_at timestamptz);
   INSERT INTO trade_signals VALUES
   (1,1,'pending',now()-interval '2 seconds',now(),now()+interval '1 minute'),
   (2,1,'pending',now()-interval '1 second',now(),NULL),
   (3,2,'pending',now(),now(),NULL);`);
  const source=await readFile('artifacts/api-server/src/lib/signal-worker.ts','utf8');
  const sql=source.match(/WITH active AS \([\s\S]*?RETURNING id/)[0].replaceAll('${tradeSignalsTable}','trade_signals').replaceAll('${lease}',"interval '10 minutes'");
  const first=await db.query(sql);assert.deepEqual(first.rows.map(r=>r.id),[3]);
  await db.exec("UPDATE trade_signals SET next_attempt_at=now()-interval '1 second' WHERE id=1");
  const second=await db.query(sql);assert.deepEqual(second.rows.map(r=>r.id),[1]);
  const busy=await db.query(sql);assert.deepEqual(busy.rows,[]);
  await db.exec("UPDATE trade_signals SET status='success' WHERE id=1");
  const third=await db.query(sql);assert.deepEqual(third.rows.map(r=>r.id),[2]);
 }finally{await db.close();}
});

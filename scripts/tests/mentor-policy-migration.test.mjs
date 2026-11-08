import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
test('mentor policy migration is additive, repeatable, disabled by default and enforces risk constraints',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_MODULE)));const db=new PGlite();
 try{
  await db.exec("CREATE TABLE mt5_connections(id integer PRIMARY KEY, retained text); INSERT INTO mt5_connections VALUES(1,'original-ciphertext-marker')");
  const sql=await readFile('migrations/20261106_mentor_copy_policies.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM mt5_connections')).rows,[{id:1,retained:'original-ciphertext-marker',encrypted_mt5_password:null}]);
  const insert="INSERT INTO mentor_copy_policies(client_id,mentor_id,lot_mode,fixed_lot_size,allocation_percent,max_lot_size,max_exposure_lots,max_open_trades,max_daily_drawdown) VALUES(10,1,'fixed',.01,100,.02,.03,2,1)";
  await db.exec(insert);assert.equal((await db.query('SELECT enabled FROM mentor_copy_policies')).rows[0].enabled,false);
  for(const update of ['allocation_percent=101','fixed_lot_size=.04','max_exposure_lots=.001','max_open_trades=0','max_daily_drawdown=26'])await assert.rejects(db.exec('UPDATE mentor_copy_policies SET '+update));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM mentor_copy_policy_audit')).rows[0].n,0);
 }finally{await db.close();}
});

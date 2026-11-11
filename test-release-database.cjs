// Disposable synthetic PostgreSQL only. Never consumes DATABASE_URL.
const {Pool}=require('./lib/db/node_modules/pg'),fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const pool=new Pool({host:'/tmp/ea-release-pg-20261111',port:55471,user:'nobody',database:'postgres',max:3});
(async()=>{try{
 await pool.query("CREATE TABLE release_sentinel(id int primary key,value text);INSERT INTO release_sentinel VALUES(1,'preserve-existing');");
 const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='5s'");await client.query(fs.readFileSync('migrations/20261111_mt5_provisioning_requests.sql','utf8'));await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 const ids=[crypto.randomUUID(),crypto.randomUUID()];
 for(let i=0;i<2;i++)await pool.query("INSERT INTO mt5_provisioning_requests(id,owner_kind,owner_id,request_key,request_hash,broker,login,server,account_role,encrypted_password) VALUES($1,'client',$2,$3,'fixture-hmac','justmarkets',$4,'Fixture','follower','ENCRYPTED_FIXTURE')",[ids[i],i+1,crypto.randomUUID(),String(i+100)]);
 const a=await pool.connect(),b=await pool.connect();
 try{await a.query('BEGIN');await b.query('BEGIN');const one=await a.query("SELECT id FROM mt5_provisioning_requests WHERE state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");const two=await b.query("SELECT id FROM mt5_provisioning_requests WHERE state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");assert.notEqual(one.rows[0].id,two.rows[0].id);await a.query('ROLLBACK');await b.query('ROLLBACK');}finally{a.release();b.release();}
 await assert.rejects(()=>pool.query("UPDATE mt5_provisioning_requests SET account_role='master' WHERE id=$1",[ids[0]]));
 const result=await pool.query("WITH changed AS (UPDATE mt5_provisioning_requests SET state='cancelled',encrypted_password=NULL WHERE id=$1 AND owner_id=1 RETURNING id) INSERT INTO mt5_provisioning_audit(request_id,event) SELECT id,'cancelled' FROM changed RETURNING request_id",[ids[0]]);assert.equal(result.rowCount,1);
 assert.equal((await pool.query('SELECT encrypted_password FROM mt5_provisioning_requests WHERE id=$1',[ids[0]])).rows[0].encrypted_password,null);
 assert.equal((await pool.query('SELECT value FROM release_sentinel')).rows[0].value,'preserve-existing');
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 const evidence={pass:true,mode:'disposable-Unix-socket-only',tables,migration_transaction_pass:true,concurrent_skip_locked_pass:true,role_constraint_pass:true,atomic_cancel_audit_and_ciphertext_erasure_pass:true,sentinel_preserved:true,production_database_used:false};fs.writeFileSync('RELEASE_DATABASE_VERIFICATION.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS disposable PostgreSQL migration, constraints, concurrent claims, atomic audit/credential deletion and existing-data preservation');
 }finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});

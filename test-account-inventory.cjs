// New integration tests: real disposable PostgreSQL, synthetic account proof only.
// No DATABASE_URL, broker credentials, production schema or network provider is used.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const {Pool}=require('./lib/db/node_modules/pg');
const socket=process.env.EA_INVENTORY_TEST_SOCKET||'/tmp/ea-cloud-completion-pg';if(!/^\/tmp\/ea-cloud-completion-pg(?:-[a-z0-9]+)?$/.test(socket))throw Error('Disposable socket only');
const pool=new Pool({host:socket,port:55472,user:'nobody',database:'postgres',max:6});
function load(file,deps,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in deps))throw Error(n);return deps[n]},process:{env:{MT5_ACCOUNT_INVENTORY:'1'}},...extra});return exports;}
let queries=0;const wrapped={connect:()=>pool.connect(),query:async(...args)=>{queries++;return pool.query(...args)}};
const password='SYNTHETIC_PASSWORD_ONLY';let rejectProof=false;
const library=load('artifacts/api-server/src/lib/mt5-account-inventory.ts',{'node:crypto':crypto,'@workspace/db':{pool:wrapped},'./mt5-crypto':{encryptMT5Password:p=>'CIPHERTEXT:'+Buffer.from(p).toString('base64'),decryptMT5Password:c=>Buffer.from(c.slice(11),'base64').toString()},'./mt5-provisioning':{uuidPattern:/^[0-9a-f-]{36}$/},'./mt5-account-status':{readBoundAccount:async(login,server,p)=>{if(rejectProof||p!==password)throw Error('PROOF_FAILED');return {role:'client',broker:'justmarkets',account_mode:'live',read_only:true,execution_enabled:false,balance:12,equity:11,currency:'USD',open_positions:0,pending_orders:0};}}});
const owner={kind:'client',id:71},other={kind:'client',id:72};let checks=0;function check(value){assert(value);checks++;}
async function fails(fn,pattern){await assert.rejects(fn,pattern);checks++;}
(async()=>{try{
 await pool.query(`CREATE TABLE client_settings(id serial PRIMARY KEY,client_id int UNIQUE,mt5_login text,mt5_server text,mt5_broker text,encrypted_mt5_password text,mt5_connected boolean DEFAULT false,copying_enabled boolean DEFAULT true);
 CREATE TABLE mt5_connections(id serial PRIMARY KEY,mentor_id int,mt5_login int,mt5_server text,encrypted_mt5_password text,status text,raw_response text);
 CREATE TABLE observer_allocations(id text PRIMARY KEY,client_id int);
 CREATE TABLE trade_executions(id serial PRIMARY KEY,client_id int,status text,signal_kind text);
 CREATE TABLE release_sentinel(value text);INSERT INTO release_sentinel VALUES('preserved');
 INSERT INTO observer_allocations VALUES('legacy-retained',909);INSERT INTO client_settings(client_id) VALUES(909);`);
 const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query(fs.readFileSync('migrations/20261111_mt5_provisioning_requests.sql','utf8'));await tx.query(fs.readFileSync('migrations/20261111_mt5_account_inventory.sql','utf8'));await tx.query('COMMIT');}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 check((await pool.query('SELECT value FROM release_sentinel')).rows[0].value==='preserved');
 check((await pool.query("SELECT account_login FROM observer_allocations WHERE id='legacy-retained'")).rows[0].account_login===null);check((await pool.query('SELECT copying_enabled FROM client_settings WHERE client_id=909')).rows[0].copying_enabled===true);
 const input={login:'10001',server:'Fixture-Live',password};
 const first=await library.linkOwnedAccount(owner,input),second=await library.linkOwnedAccount(owner,{...input,login:'10002'});check(first.id!==second.id);check(first.accountMode==='live');check(first.executionEnabled===false);check((await library.listOwnedAccounts(owner)).length===2);
 const publicRows=await library.listOwnedAccounts(owner);check(publicRows.every(r=>r.connected===false));check(!JSON.stringify(publicRows).includes('CIPHERTEXT'));check(!JSON.stringify(publicRows).includes(password));
 await fails(()=>library.linkOwnedAccount(other,input),/ACCOUNT_ALREADY_BOUND/);
 await fails(()=>library.ownedAccountStatus(other,first.id),/ACCOUNT_NOT_FOUND/);
 await library.selectOwnedAccount(owner,first.id);let settings=(await pool.query('SELECT * FROM client_settings WHERE client_id=71')).rows[0];check(settings.mt5_login==='10001');check(settings.copying_enabled===false);
 await pool.query("INSERT INTO observer_allocations VALUES('retained',71)");await fails(()=>library.selectOwnedAccount(owner,second.id),/ACCOUNT_REBIND_REQUIRES_RECONCILIATION/);check((await pool.query('SELECT mt5_login FROM client_settings WHERE client_id=71')).rows[0].mt5_login==='10001');
 await pool.query("DELETE FROM observer_allocations WHERE id='retained';INSERT INTO trade_executions(client_id,status) VALUES(71,'pending')");await fails(()=>library.selectOwnedAccount(owner,second.id),/ACCOUNT_REBIND_REQUIRES_RECONCILIATION/);await pool.query("UPDATE trade_executions SET status='failed' WHERE client_id=71");await pool.query("INSERT INTO trade_executions(client_id,status,signal_kind) VALUES(71,'success','OPEN')");await fails(()=>library.selectOwnedAccount(owner,second.id),/ACCOUNT_REBIND_REQUIRES_RECONCILIATION/);await pool.query("UPDATE trade_executions SET status='failed' WHERE client_id=71");await library.selectOwnedAccount(owner,second.id);
 await library.disconnectOwnedAccount(owner,second.id);settings=(await pool.query('SELECT * FROM client_settings WHERE client_id=71')).rows[0];check(settings.mt5_connected===false&&settings.copying_enabled===false);check(settings.encrypted_mt5_password!==null);await fails(()=>library.ownedAccountStatus(owner,second.id),/ACCOUNT_DISCONNECTED/);
 await library.linkOwnedAccount(owner,{...input,login:'10002'});check((await library.ownedAccountStatus(owner,second.id)).verified===true);
 const before=(await library.listOwnedAccounts(owner)).length;rejectProof=true;await fails(()=>library.linkOwnedAccount(owner,{...input,login:'10003'}),/PROOF_FAILED/);check((await library.listOwnedAccounts(owner)).length===before);rejectProof=false;
 await pool.query("INSERT INTO client_settings(client_id,mt5_login,mt5_server) VALUES(99,'10004','Fixture-Live')");await fails(()=>library.linkOwnedAccount(owner,{...input,login:'10004'}),/ACCOUNT_ALREADY_BOUND/);
 const raced=await Promise.allSettled([library.linkOwnedAccount(owner,{...input,login:'10005'}),library.linkOwnedAccount(other,{...input,login:'10005'})]);check(raced.filter(r=>r.status==='fulfilled').length===1);check(raced.filter(r=>r.status==='rejected').length===1);
 check((await pool.query('SELECT count(*)::int AS count FROM mt5_account_inventory_audit')).rows[0].count>=5);
 await pool.query('INSERT INTO client_settings(client_id) VALUES(101)');check((await pool.query('SELECT copying_enabled FROM client_settings WHERE client_id=101')).rows[0].copying_enabled===false);
 console.log(`PASS ${checks} account inventory assertions: disposable SQL migration, multi-account isolation, atomic selection, held mappings, pending submissions, disconnect/reconnect, concurrent ownership, default pause; broker proofs are synthetic`);
 }finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});

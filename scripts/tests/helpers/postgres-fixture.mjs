import pg from '../../../lib/db/node_modules/pg/lib/index.js';
import {randomBytes} from 'node:crypto';
/** Only this explicitly marked disposable loopback server is eligible. Never DATABASE_URL. */
export async function postgresFixture(){
 const raw=process.env.EA_TEST_PG_URL;if(!raw)throw Error('EA_TEST_PG_URL required');
 const url=new URL(raw);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||url.username!=='ea_db_test'||url.pathname!=='/postgres'||url.search||url.hash)throw Error('Disposable loopback admin binding required');
 const admin=new pg.Client({connectionString:url.href});await admin.connect();
 const marker=await admin.query("SELECT current_setting('ea_cloud.test_instance',true) AS marker");
 if(marker.rows[0].marker!=='person2-disposable'){await admin.end();throw Error('Disposable PostgreSQL marker missing');}
 const name='ea_validation_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new pg.Pool({connectionString:url.href,max:8});
 const engine={databaseKind:'PostgreSQL16',pool,query:async(text,params,options={})=>{
  const config=typeof text==='string'?{text,values:params}:{...text,values:params??text.values};
  if(options.rowMode==='array')config.rowMode='array';
  return pool.query(config);
 },exec:text=>pool.query(text),connect:()=>pool.connect(),close:async()=>{
  await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();
 }};
 return engine;
}

import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import pg from '../../lib/db/node_modules/pg/lib/index.js';
import {postgresFixture} from './helpers/postgres-fixture.mjs';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';
test('real PostgreSQL management preflight requires application auth writes and serial sequence privileges',{skip:!process.env.EA_TEST_PG_URL},async()=>{
 const engine=await postgresFixture(),dir=await mkdtemp(join(tmpdir(),'ea-grants-')),role='ea_management_'+randomBytes(6).toString('hex');let restricted;
 try{
  process.env.SESSION_SECRET=randomBytes(32).toString('hex');
  await build({stdin:{contents:`export {verifyManagementDatabase} from './artifacts/api-server/src/lib/management-preflight';export {encryptMT5Password} from './artifacts/api-server/src/lib/mt5-crypto';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'preflight.mjs'),logLevel:'silent'});const api=await import(pathToFileURL(join(dir,'preflight.mjs')));
  await engine.exec('CREATE TABLE users(id serial PRIMARY KEY,api_key text,api_key_encrypted text);CREATE TABLE app_access(id serial PRIMARY KEY);CREATE TABLE client_settings(id serial PRIMARY KEY,encrypted_mt5_password text);CREATE TABLE mt5_connections(id serial PRIMARY KEY,mentor_id integer,mt5_login integer,mt5_server text);CREATE TABLE browser_sessions(token_hash text);CREATE TABLE licenses(id serial);CREATE TABLE eas(id serial);CREATE TABLE trade_executions(id serial);CREATE TABLE observer_allocations(id text)');
  await engine.exec(await readFile('migrations/20261106_mentor_copy_policies.sql','utf8'));await engine.exec(await readFile('migrations/20261108_mt5_enrollment_requests.sql','utf8'));
  await engine.query('INSERT INTO client_settings(encrypted_mt5_password) VALUES($1)',[api.encryptMT5Password('fixture-only-password')]);
  const password=randomBytes(32).toString('hex');await engine.exec(`CREATE ROLE ${role} LOGIN PASSWORD '${password}';GRANT USAGE ON SCHEMA public TO ${role};GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  const url=new URL(engine.pool.options.connectionString);url.username=role;url.password=password;restricted=new pg.Pool({connectionString:url.href});
  await assert.rejects(api.verifyManagementDatabase(restricted,true));
  await engine.exec(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);await api.verifyManagementDatabase(restricted,true);
  await engine.exec(`REVOKE INSERT ON users FROM ${role}`);await assert.rejects(api.verifyManagementDatabase(restricted,true));
  await engine.exec(`GRANT INSERT ON users TO ${role};REVOKE USAGE ON SEQUENCE mt5_connections_id_seq FROM ${role}`);await assert.rejects(api.verifyManagementDatabase(restricted,true));
  await engine.exec(`GRANT USAGE ON SEQUENCE mt5_connections_id_seq TO ${role}`);await api.verifyManagementDatabase(restricted,true);
 }finally{await restricted?.end();await engine.close();const admin=new pg.Client({connectionString:process.env.EA_TEST_PG_URL});await admin.connect();await admin.query('DROP ROLE IF EXISTS '+role);await admin.end();await rm(dir,{recursive:true,force:true});}
});

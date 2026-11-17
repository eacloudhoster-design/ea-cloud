import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
test('legacy authenticated selections work while explicit disconnects and owner changes win',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-receiving-'));
 try{await build({entryPoints:['artifacts/api-server/src/lib/receiving-account.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'account.mjs'),logLevel:'silent'});
 const {receivingAccount:pick}=await import(pathToFileURL(join(dir,'account.mjs')));
 const s={login:123,server:'Fixture',broker:'xm',mode:'live',owner_kind:'client',owner_id:7},legacy={mt5Login:'123',mt5Server:'Fixture',mt5Connected:true,encryptedMt5Password:'ORIGINAL_ENCRYPTED_RECORD'};
 assert.equal(pick(s,7,[],legacy).encrypted_password,legacy.encryptedMt5Password);assert.equal(pick(s,8,[],legacy),null);assert.equal(pick(s,7,[],{...legacy,mt5Connected:false}),null);
 const row={login:'123',server:'Fixture',broker:'xm',account_mode:'live',owner_kind:'client',owner_id:7,account_role:'client',state:'linked',encrypted_password:'INVENTORY'};
 assert.equal(pick(s,7,[row],legacy).encrypted_password,'INVENTORY');assert.equal(pick(s,7,[{...row,state:'disconnected'}],legacy),null);assert.equal(pick(s,7,[{...row,owner_id:8}],legacy),null);assert.equal(pick(s,7,[{...row,account_mode:'demo'}],legacy),null);
 }finally{await rm(dir,{recursive:true,force:true})}
});

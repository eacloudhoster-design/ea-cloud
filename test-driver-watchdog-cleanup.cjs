const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict'),{EventEmitter}=require('events');
const source=fs.readFileSync('infra/provisioning/private-service.cjs','utf8'),children=[],timers=[];
const content=Buffer.from('reviewed fixture driver');
const fakeFs={lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:0,mode:0o100700}),readFileSync:()=>content};
const fakeSpawn=(file,args,options)=>{const c=new EventEmitter();c.pid=1000+children.length;c.stdin=new EventEmitter();c.stdin.end=()=>{};children.push({c,file,args,options});return c;};
const moduleObject={exports:{}};
function mockedRequire(n){if(n==='node:fs')return fakeFs;if(n==='node:child_process')return {spawn:fakeSpawn};return require(n)}
vm.runInNewContext(source,{module:moduleObject,require:mockedRequire,Buffer,process:{kill:()=>{}},setTimeout:(fn,delay)=>{const t={fn,delay};timers.push(t);return t},clearTimeout:()=>{}});
(async()=>{const promise=moduleObject.exports.dispatchDriver({path:'/opt/ea-cloud/releases/fixture/driver',sha256:crypto.createHash('sha256').update(content).digest('hex')},{requestId:'fixed-fixture-id',password:'DO_NOT_LOG'});const assertion=assert.rejects(promise);assert.equal(children.length,1);timers.find(t=>t.delay===15000).fn();assert.equal(children.length,2);assert.deepEqual(Array.from(children[1].args),['--stop-retain','fixed-fixture-id']);assert(!JSON.stringify(children[1].args).includes('DO_NOT_LOG'));children[0].c.emit('exit',null);children[1].c.emit('exit',0);await assertion;console.log('PASS: timeout kills driver group, invokes fixed stop-retain cleanup and retains uncertainty; mocked process only');})().catch(e=>{console.error(e);process.exitCode=1});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startMt5StatusRefresh} from '../../artifacts/ea-app/src/lib/mt5-status-refresh.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';let timer,cleared=false;
 win.setInterval=(fn,ms)=>{assert.equal(ms,30000);timer=fn;return 1;};win.clearInterval=()=>{cleared=true;};
 return {win,doc,poll:()=>timer(),cleared:()=>cleared};
}
test('status refresh serializes reads, recovers online and clears stale evidence on failure',async()=>{
 const f=fixture();let calls=0,resolve,reject,signal;const values=[];
 const stop=startMt5StatusRefresh({window:f.win,document:f.doc,read:s=>{calls++;signal=s;return new Promise((a,b)=>{resolve=a;reject=b;});},success:d=>values.push(d),failure:()=>values.push('unverified')});
 assert.equal(calls,1);f.poll();f.win.dispatchEvent(new Event('online'));assert.equal(calls,1);
 resolve('verified');await tick();assert.deepEqual(values,['verified']);
 f.poll();reject(Error('private upstream error'));await tick();assert.deepEqual(values,['verified','unverified']);
 f.win.dispatchEvent(new Event('offline'));f.poll();assert.equal(calls,2);assert.equal(values.at(-1),'unverified');
 f.win.dispatchEvent(new Event('online'));resolve('recovered');await tick();assert.equal(calls,3);assert.equal(values.at(-1),'recovered');
 f.poll();stop();assert.ok(signal.aborted);resolve('late');await tick();assert.equal(values.at(-1),'recovered');
 f.poll();f.win.dispatchEvent(new Event('online'));assert.equal(calls,4);assert.ok(f.cleared());
});
test('backgrounding invalidates evidence; late cancelled reads cannot overwrite foreground recovery',async()=>{
 const f=fixture(),requests=[],values=[];
 const stop=startMt5StatusRefresh({window:f.win,document:f.doc,read:signal=>new Promise(resolve=>requests.push({signal,resolve})),success:d=>values.push(d),failure:()=>values.push('unverified')});
 f.doc.visibilityState='hidden';f.doc.dispatchEvent(new Event('visibilitychange'));assert.ok(requests[0].signal.aborted);f.poll();assert.equal(requests.length,1);
 f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(requests.length,2);
 requests[1].resolve('fresh');await tick();requests[0].resolve('stale');await tick();assert.deepEqual(values,['unverified','fresh']);stop();
});

test('execution notifications refresh owned status without writes, overlap or listeners after disposal',async()=>{
 const f=fixture();let calls=0,resolve;const values=[];
 const stop=startMt5StatusRefresh({window:f.win,document:f.doc,read:()=>{calls++;return new Promise(done=>{resolve=done;});},success:d=>values.push(d),failure:()=>values.push('unverified')});
 resolve('before');await tick();f.win.dispatchEvent(new Event('ea:engine-refresh'));assert.equal(calls,2);
 f.win.dispatchEvent(new Event('ea:engine-refresh'));assert.equal(calls,2);resolve('actual reread');await tick();assert.equal(values.at(-1),'actual reread');
 stop();f.win.dispatchEvent(new Event('ea:engine-refresh'));assert.equal(calls,2);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateHostedEngineEnvironment as validate} from '../../artifacts/api-server/hosted-engine-start.mjs';
const valid=()=>({EA_MT5_MANAGEMENT_ONLY:'0',EA_SIGNAL_WORKER_MODE:'external',MT5_PROVISIONING_CONSUMER:'0',COPY_ENGINE_MULTI_ACCOUNT:'1',MT5_ACCOUNT_INVENTORY:'1',MT5_SELF_SERVICE_PROVISIONING:'1',OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE:'gateway',MT5_ACCESS_REQUIRED:'1',MT5_VPS_URL:'https://status.example.invalid',OBSERVER_MT5_VPS_URL:'https://gateway.example.invalid',PUBLIC_WEBSITE_ORIGIN:'https://app.example.invalid',MT5_VPS_TOKEN:'fixture-status-secret-'.repeat(3),OBSERVER_MT5_VPS_TOKEN:'fixture-router-secret-'.repeat(3),MT5_ACCESS_CLIENT_ID:'status-id',MT5_ACCESS_CLIENT_SECRET:'status-edge-secret',OBSERVER_MT5_ACCESS_CLIENT_ID:'gateway-id',OBSERVER_MT5_ACCESS_CLIENT_SECRET:'gateway-edge-secret',DATABASE_URL:'postgres://fixture:private-database-password@db.example.invalid/db',SESSION_SECRET:'fixture-original-session-secret'});
test('hosted source entry requires external consumers, paired HTTPS transport and original bindings before importing server',()=>{
 const env=valid(),before={...env};assert.doesNotThrow(()=>validate(env));assert.deepEqual(env,before);
 for(const change of [
  {EA_SIGNAL_WORKER_MODE:'local'},{EA_MT5_MANAGEMENT_ONLY:'1'},{MT5_PROVISIONING_CONSUMER:'1'},
  {EA_RELEASE_MODE:'nontrading'},{OBSERVER_MT5_ACCOUNT_ASSIGNMENTS:'[]'},
  {OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_FILE:'/run/vps-only.json'},
  {MT5_VPS_URL:'http://127.0.0.1:8005'},{OBSERVER_MT5_VPS_URL:'https://user:private-password@gateway.example.invalid'},
  {MT5_ACCESS_REQUIRED:'0'},{MT5_ACCESS_CLIENT_SECRET:undefined},{OBSERVER_MT5_ACCESS_CLIENT_ID:undefined},
  {MT5_VPS_TOKEN:'short'},{MT5_ACCESS_CLIENT_SECRET:'x'.repeat(1025)},{SESSION_SECRET:undefined},{DATABASE_URL:'not-a-url-private-password'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},
 ])assert.throws(()=>validate({...env,...change}),e=>e.message.startsWith('HOSTED_ENGINE_CONFIGURATION_INVALID')&&!e.message.includes('private-password')&&!e.message.includes('fixture-'));
});

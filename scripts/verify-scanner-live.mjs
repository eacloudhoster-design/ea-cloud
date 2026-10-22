// Operator-run REAL API verification. Intentionally performs one paid/credited scan.
// Run from repository root with a secure client token in the environment.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadScannerRenderer } from './scanner-pipeline-render.mjs';
const origin=process.env.EA_SCANNER_ORIGIN,token=process.env.EA_SCANNER_TOKEN;
const imagePath=process.argv[2],output=process.argv[3];
if(!origin||!token||!imagePath||!output)throw Error('Set EA_SCANNER_ORIGIN and EA_SCANNER_TOKEN securely; usage: node scripts/verify-scanner-live.mjs chart.png work/live-scan');
const target=new URL(origin);if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash)throw Error('Use a trusted HTTPS API origin without credentials, query or fragment.');
if(existsSync(resolve(output+'.json'))||existsSync(resolve(output+'.html')))throw Error('Output artifacts already exist. Choose a new output prefix before consuming a scan credit.');
const bytes=readFileSync(imagePath),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[extname(imagePath).toLowerCase()];
if(!mime||bytes.length>2*1024*1024)throw Error('Provide a PNG/JPEG/WebP under 2 MB with a readable price axis.');
async function request(path,init={}){
 const response=await fetch(new URL('/api/app/scanner/'+path,target),{...init,headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(70000)});
 const data=await response.json();if(!response.ok)throw Error(`Scanner request failed: HTTP ${response.status}, code ${String(data.code??'unknown').replace(/[^A-Z_]/g,'')}. No provider body printed.`);return data;
}
const status=await request('status');if(!status.configured)throw Error('Deployed scanner is not configured.');
const form=new FormData();form.append('strategy','Auto');form.append('image',new Blob([bytes],{type:mime}),'chart'+extname(imagePath));
const immediate=await request('chart',{method:'POST',body:form});
let persisted;
for(let page=1;page<=5&&!persisted;page++){const history=await request('history?page='+page);persisted=history.records.find(record=>record.id===immediate.id);if(!history.hasMore)break;}
if(!persisted||!isDeepStrictEqual(persisted.report,immediate.report))throw Error('POST report and persisted history differ or scan is missing.');
mkdirSync('work',{recursive:true});const {render,formatPrice}=await loadScannerRenderer();const html=render(persisted);
const allLevels=['entry','stopLoss','takeProfit'].every(key=>typeof persisted.report[key]==='number');
if(allLevels)for(const key of ['entry','stopLoss','takeProfit'])if(!html.includes(formatPrice(persisted.report[key])))throw Error('Actual frontend component lost '+key);
if(!html.includes('EXECUTE TRADE'))throw Error('Expected interactive trade review action.');
// Private owner-only artifacts, never chart bytes, token or raw Gemini response.
writeFileSync(resolve(output+'.json'),JSON.stringify({verification:'real deployed API; POST equals PostgreSQL history; actual client component SSR',immediate,persisted,allLevels},null,2)+'\n',{mode:0o600,flag:'wx'});
writeFileSync(resolve(output+'.html'),html,{mode:0o600,flag:'wx'});
console.log(JSON.stringify({scanId:immediate.id,historyMatches:true,frontendRendered:true,allLevels,levelAssessment:persisted.report.levelAssessment?.code??'legacy-or-undeployed',artifacts:output+'.{json,html}'}));
if(!allLevels){console.error('Real scan still has missing levels. Inspect the private report and scanner_level_assessment logs; this run is NOT evidence that level generation is fixed.');process.exitCode=2;}

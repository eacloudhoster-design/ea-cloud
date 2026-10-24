import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const result=await build({entryPoints:['artifacts/ea-app/src/hooks/use-ios-standalone-layout.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {isIosStandaloneLayout}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('full-canvas layout is restricted to installed iOS, including legacy standalone detection',()=>{
  const iphone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)',platform:'iPhone',maxTouchPoints:5,standalone:false,displayStandalone:false};
  assert.equal(isIosStandaloneLayout(iphone),false,'regular Safari keeps its browser viewport layout');
  assert.equal(isIosStandaloneLayout({...iphone,standalone:true}),true,'navigator.standalone works even when the media query does not');
  assert.equal(isIosStandaloneLayout({...iphone,displayStandalone:true}),true);
  assert.equal(isIosStandaloneLayout({...iphone,userAgent:'Mozilla/5.0 (iPad)',platform:'iPad',standalone:true}),true);
  assert.equal(isIosStandaloneLayout({...iphone,userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',standalone:true}),true,'desktop-UA iPad');
  assert.equal(isIosStandaloneLayout({...iphone,userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:0,standalone:true}),false,'desktop Mac');
  assert.equal(isIosStandaloneLayout({...iphone,userAgent:'Mozilla/5.0 (Linux; Android 14)',platform:'Linux armv8l',standalone:true}),false,'Android PWA');
});

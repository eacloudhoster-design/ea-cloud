import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const b=await build({stdin:{contents:'import {createElement} from "./artifacts/ea-app/node_modules/react/index.js";import {renderToStaticMarkup} from "./artifacts/ea-app/node_modules/react-dom/server.node.js";import {AppContext} from "./artifacts/ea-app/src/context/AppContext";import Home from "./artifacts/ea-app/src/pages/HomeTab";import Settings,{ShapeChoices} from "./artifacts/ea-app/src/pages/SettingsTab";export {ShapeChoices};export function shapeMenu(props){return renderToStaticMarkup(createElement(ShapeChoices,props));}export function render(value,page="home"){return renderToStaticMarkup(createElement(AppContext.Provider,{value},createElement(page==="home"?Home:Settings)));}export {frameGeometry} from "./artifacts/ea-app/src/lib/robot-frame-shape";export {readShapePreference,saveShapePreference,shapePreferenceKey} from "./artifacts/ea-app/src/lib/shape-preference";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,loader:{'.css':'empty','.jpeg':'dataurl','.jpg':'dataurl'},tsconfig:'artifacts/ea-app/tsconfig.json',banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'}});mkdirSync('work/shape-tests',{recursive:true});const out=resolve('work/shape-tests/actual-layouts.mjs');writeFileSync(out,b.outputFiles[0].text);const {render,frameGeometry,readShapePreference,saveShapePreference,shapePreferenceKey,shapeMenu,ShapeChoices}=await import(pathToFileURL(out));
const context={eaName:'SMC Blueprint EA',eaTagline:'Mentor',bgImageUrl:'/existing-mentor.jpg',accentColor:'#ef4444',botRunning:true,showBg:true,eaSymbols:['XAUUSD'],clientToken:null,setBotRunning(){},setShowBg(){},setInterfaceStyle(){},setAccentColor(){},setShapeStyle(){}};
function outsideFrame(html){const start=html.search(/<div[^>]*data-robot-shape=/);let depth=0;const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let tag;while((tag=tags.exec(html))){depth+=tag[0].startsWith('</')?-1:1;if(depth===0)return html.slice(0,start)+'FRAME'+html.slice(tags.lastIndex);}throw Error('Missing frame end');}
test('all 12 actual layout/shape combinations keep the existing robot image, dimensions and frame placement',()=>{
 for(const interfaceStyle of ['s2tone','regular','matrix'])for(const shapeStyle of ['orbit','cornerstone','fortress','neural']){
  const html=render({...context,interfaceStyle,shapeStyle});assert.equal(outsideFrame(html),outsideFrame(render({...context,interfaceStyle,shapeStyle:'orbit'})),'Only the main frame may change');assert.equal((html.match(/data-robot-shape=/g)||[]).length,1);assert.ok(html.includes(`data-robot-shape="${shapeStyle}"`));assert.ok(html.includes('/existing-mentor.jpg'));assert.ok(html.includes('SMC BLUEPRINT EA'));assert.match(html,/QUOTES|Quotes|SYMBOLS|Symbols/);
  const tag=html.match(/<div[^>]*data-robot-shape="[^"]+"[^>]*>/)[0];
  if(interfaceStyle==='matrix')assert.ok(tag.includes('inset:30px'));else{const size=interfaceStyle==='s2tone'?230:290;assert.ok(tag.includes(`width:${size}px`));assert.ok(tag.includes(`height:${size}px`));}
  if(shapeStyle==='orbit'){assert.ok(tag.includes('border-radius:50%')||tag.includes('rounded-full'));assert.ok(!html.includes('robot-frame-outline'));}
  else{assert.ok(html.includes('robot-frame-outline'));assert.ok(html.includes('stroke="#ef4444"'));assert.ok(html.includes('vector-effect="non-scaling-stroke"'));assert.ok(html.includes('clipPathUnits="objectBoundingBox"'));assert.ok(html.includes('clip-path:url(#robot-frame-'));}
 }
});
test('Fortress is regular and centred; identical polygon geometry clips the image and draws its border at every size',()=>{
 for(const size of [150,230,290]){
  const {points}=frameGeometry('fortress',size,2.5),vertices=points.split(' ').map(p=>p.split(',').map(Number));const edges=vertices.map((v,i)=>Math.hypot(v[0]-vertices[(i+1)%5][0],v[1]-vertices[(i+1)%5][1]));assert.ok(Math.max(...edges)-Math.min(...edges)<1e-12);
  for(const axis of [0,1])assert.ok(Math.abs((Math.min(...vertices.map(v=>v[axis]))+Math.max(...vertices.map(v=>v[axis])))/2-.5)<1e-12);
  assert.equal(frameGeometry('cornerstone',size,2.5).radius,0);assert.equal(frameGeometry('neural',size,2.5).radius,.2);
 }
 const html=render({...context,interfaceStyle:'regular',shapeStyle:'fortress'});const points=[...html.matchAll(/points="([^"]+)"/g)].map(m=>m[1]);assert.equal(points.length,2);assert.equal(points[0],points[1]);
});
test('a single account-scoped shape persists across reload/layout switches, with safe invalid/storage fallback',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const key=shapePreferenceKey(btoa('7:client:session'));const other=shapePreferenceKey(btoa('8:client:session'));assert.notEqual(key,other);assert.equal(shapePreferenceKey('bad token'),null);
 for(const shape of ['orbit','cornerstone','fortress','neural']){assert.equal(saveShapePreference(storage,key,shape),true);for(const interfaceStyle of ['s2tone','regular','matrix']){const restored=readShapePreference(storage,key);assert.equal(restored,shape);assert.ok(render({...context,interfaceStyle,shapeStyle:restored}).includes(`data-robot-shape="${shape}"`));}}
 assert.equal(readShapePreference(storage,other),'orbit');data.set(key,'<invalid>');assert.equal(readShapePreference(storage,key),'orbit');const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};assert.equal(readShapePreference(blocked,key),'orbit');assert.equal(saveShapePreference(blocked,key,'fortress'),false);
});

test('existing Settings choices show one matching checkmark and invoke the shared selection callback',()=>{
 for(const shapeStyle of ['orbit','cornerstone','fortress','neural']){
  let chosen=null;const props={shapeStyle,accentColor:'#ef4444',onSelect:value=>chosen=value};const html=shapeMenu(props);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert.equal((html.match(/lucide-check/g)||[]).length,1);
  const buttons=ShapeChoices(props).props.children;const selected=buttons.find(button=>button.props['aria-pressed']);assert.equal(selected.key,shapeStyle);const next=buttons.find(button=>button.key!==shapeStyle);next.props.onClick();assert.equal(chosen,next.key);
 }
});

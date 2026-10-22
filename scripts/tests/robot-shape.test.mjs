import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const b=await build({stdin:{contents:'import {createElement} from "./artifacts/ea-app/node_modules/react/index.js";import {renderToStaticMarkup} from "./artifacts/ea-app/node_modules/react-dom/server.node.js";import {AppContext} from "./artifacts/ea-app/src/context/AppContext";import Home from "./artifacts/ea-app/src/pages/HomeTab";import Settings,{ShapeChoices} from "./artifacts/ea-app/src/pages/SettingsTab";export {ShapeChoices};export function shapeMenu(props){return renderToStaticMarkup(createElement(ShapeChoices,props));}export function render(value,page="home"){return renderToStaticMarkup(createElement(AppContext.Provider,{value},createElement(page==="home"?Home:Settings)));}export {frameGeometry} from "./artifacts/ea-app/src/lib/robot-frame-shape";export {readShapePreference,saveShapePreference,shapePreferenceKey} from "./artifacts/ea-app/src/lib/shape-preference";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,loader:{'.css':'empty','.jpeg':'dataurl','.jpg':'dataurl'},tsconfig:'artifacts/ea-app/tsconfig.json',banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'}});mkdirSync('work/shape-tests',{recursive:true});const out=resolve('work/shape-tests/actual-layouts.mjs');writeFileSync(out,b.outputFiles[0].text);const {render,frameGeometry,readShapePreference,saveShapePreference,shapePreferenceKey,shapeMenu,ShapeChoices}=await import(pathToFileURL(out));
const context={eaName:'SMC Blueprint EA',eaTagline:'Mentor',bgImageUrl:'/existing-mentor.jpg',accentColor:'#ef4444',botRunning:true,showBg:true,eaSymbols:['XAUUSD'],clientToken:null,setBotRunning(){},setShowBg(){},setInterfaceStyle(){},setAccentColor(){},setShapeStyle(){}};
test('all three layouts preserve the robot image for None, Orbit and Neural',()=>{
 for(const interfaceStyle of ['s2tone','regular','matrix'])for(const shapeStyle of ['none','orbit','neural']){
  const html=render({...context,interfaceStyle,shapeStyle});
  assert.equal((html.match(/data-robot-shape=/g)||[]).length,1);
  assert.ok(html.includes(`data-robot-shape="${shapeStyle}"`));
  assert.ok(html.includes('/existing-mentor.jpg'));assert.ok(html.includes('SMC BLUEPRINT EA'));
  if(shapeStyle==='none'){
   assert.match(html,/<img[^>]*data-robot-shape="none"/);
   assert.ok(!html.includes('robot-frame-outline'));assert.ok(!html.includes('clip-path:url'));
   assert.ok(html.includes('object-fit:contain'));assert.ok(html.includes('border-radius:0'));
   assert.ok(!html.includes('animate-ping'));
  }else if(shapeStyle==='neural')assert.ok(html.includes('robot-frame-outline'));
  else assert.ok(!html.includes('robot-frame-outline'));
 }
});
test('remaining geometry and all menu selections work',()=>{
 assert.equal(frameGeometry('orbit',150,3).radius,.5);assert.equal(frameGeometry('neural',150,3).radius,.2);
 for(const shapeStyle of ['none','orbit','neural']){
  let chosen=null;const props={shapeStyle,accentColor:'#ef4444',onSelect:value=>chosen=value};const html=shapeMenu(props);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert.ok(!/Cornerstone|Fortress/.test(html));assert.ok(html.includes('None'));
  const buttons=ShapeChoices(props).props.children;
  for(const button of buttons){button.props.onClick();assert.equal(chosen,button.key);}
 }
});
test('None persists per account; removed and invalid values safely fall back',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const key=shapePreferenceKey(btoa('7:client:session'));const other=shapePreferenceKey(btoa('8:client:session'));
 for(const shape of ['none','orbit','neural']){assert.equal(saveShapePreference(storage,key,shape),true);assert.equal(readShapePreference(storage,key),shape);}
 assert.equal(readShapePreference(storage,other),'orbit');assert.equal(shapePreferenceKey('invalid'),null);
 for(const old of ['cornerstone','fortress','invalid']){data.set(key,old);assert.equal(readShapePreference(storage,key),'orbit');assert.equal(saveShapePreference(storage,key,old),false);}
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal(readShapePreference(blocked,key),'orbit');assert.equal(saveShapePreference(blocked,key,'none'),false);
});

test('None still shows the existing default robot when no mentor image is configured',()=>{
 for(const interfaceStyle of ['regular','s2tone','matrix'])assert.match(render({...context,interfaceStyle,shapeStyle:'none',bgImageUrl:null}),/<img[^>]*data-robot-shape="none"/);
});

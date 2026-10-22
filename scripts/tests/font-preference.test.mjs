import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const b=await build({stdin:{contents:'import {createElement} from "./artifacts/ea-app/node_modules/react/index.js";import {renderToStaticMarkup} from "./artifacts/ea-app/node_modules/react-dom/server.node.js";import {AppContext} from "./artifacts/ea-app/src/context/AppContext";import Home from "./artifacts/ea-app/src/pages/HomeTab";import Settings,{ShapeChoices} from "./artifacts/ea-app/src/pages/SettingsTab";export {ShapeChoices};export {FontChoices} from "./artifacts/ea-app/src/pages/SettingsTab";export * from "./artifacts/ea-app/src/lib/font-preference";export function shapeMenu(props){return renderToStaticMarkup(createElement(ShapeChoices,props));}export function render(value,page="home"){return renderToStaticMarkup(createElement(AppContext.Provider,{value},createElement(page==="home"?Home:Settings)));}export {frameGeometry} from "./artifacts/ea-app/src/lib/robot-frame-shape";export {readShapePreference,saveShapePreference,shapePreferenceKey} from "./artifacts/ea-app/src/lib/shape-preference";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,loader:{'.css':'empty','.jpeg':'dataurl','.jpg':'dataurl'},tsconfig:'artifacts/ea-app/tsconfig.json',banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'}});mkdirSync('work/font-tests',{recursive:true});const out=resolve('work/font-tests/actual-layouts.mjs');writeFileSync(out,b.outputFiles[0].text);const {render,frameGeometry,readShapePreference,saveShapePreference,shapePreferenceKey,shapeMenu,ShapeChoices,FontChoices,botFonts,botFontStyle,fontPreferenceKey,readFontPreference,saveFontPreference}=await import(pathToFileURL(out));
const context={eaName:'SMC Blueprint EA',eaTagline:'Mentor',bgImageUrl:'/existing-mentor.jpg',accentColor:'#ef4444',botRunning:true,showBg:true,eaSymbols:['XAUUSD'],clientToken:null,setBotRunning(){},setShowBg(){},setInterfaceStyle(){},setAccentColor(){},setShapeStyle(){}};

test('five actual Settings buttons select exactly one font and invoke the real callback',()=>{
 for(const selected of botFonts){
 let chosen;const buttons=FontChoices({selected,onSelect:v=>chosen=v}).props.children;
 assert.equal(buttons.length,5);assert.equal(buttons.filter(b=>b.props['aria-pressed']).length,1);
 for(const button of buttons){button.props.onClick();assert.equal(chosen,button.key);assert.equal(button.props.style.border.includes('#3b82f6'),button.key===selected);}
 }
});
test('all Home layouts use the selected bold font on the real bot name',()=>{
 for(const interfaceStyle of ['matrix','regular','s2tone'])for(const botFont of botFonts){
 const html=render({...context,interfaceStyle,shapeStyle:'orbit',botFont});
 assert.match(html,/data-bot-name="primary"/);assert.ok(html.includes('EA Bot '+botFont));assert.ok(html.includes('font-weight:'+botFontStyle(botFont).fontWeight));assert.ok(html.includes('/existing-mentor.jpg'));
 }
});
test('font preference persists per account and safely defaults to Inter',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const key=fontPreferenceKey(btoa('7:client:session')),other=fontPreferenceKey(btoa('8:client:session'));
 assert.notEqual(key,other);assert.equal(fontPreferenceKey('invalid'),null);assert.equal(fontPreferenceKey(btoa('7:superadmin:session')),null);
 for(const font of botFonts){assert.equal(saveFontPreference(storage,key,font),true);assert.equal(readFontPreference(storage,key),font);}
 assert.equal(readFontPreference(storage,other),'Inter');values.set(key,'invalid');assert.equal(readFontPreference(storage,key),'Inter');
 const blocked={getItem(){throw Error()},setItem(){throw Error()}};assert.equal(readFontPreference(blocked,key),'Inter');assert.equal(saveFontPreference(blocked,key,'Roboto'),false);
});
test('bundled authentic WOFF2 files match recorded upstream hashes and include deployed licences',async()=>{
 const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');const root='artifacts/ea-app/src/assets/bot-fonts/';
 const manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
 for(const pkg of manifest){assert.match(readFileSync('artifacts/ea-app/public/font-licenses/'+pkg.package.replace('@fontsource/','')+'-OFL.txt','utf8'),/SIL OPEN FONT LICENSE/i);
 for(const item of pkg.files){const data=readFileSync(root+item.file);assert.equal(data.subarray(0,4).toString(),'wOF2');assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);}}
});

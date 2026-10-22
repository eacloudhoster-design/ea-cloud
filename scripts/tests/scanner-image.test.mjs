import {test,afterEach} from 'node:test';import assert from 'node:assert/strict';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const b=await build({entryPoints:['artifacts/ea-app/src/lib/scanner.ts','artifacts/ea-app/src/lib/scanner-image.ts'],bundle:true,platform:'node',format:'esm',write:false,outdir:'work/image-bundle'});
const modules=await Promise.all(b.outputFiles.map(f=>import('data:text/javascript;base64,'+Buffer.from(f.text).toString('base64'))));
const {prepareChart}=modules.find(m=>m.prepareChart),{chartImageKind}=modules.find(m=>m.chartImageKind);
const original={bitmap:global.createImageBitmap,document:global.document};afterEach(()=>{global.createImageBitmap=original.bitmap;global.document=original.document;});
const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)]),png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(30)]),webp=Buffer.from('RIFF0000WEBP0000000000000000'),heic=Buffer.from('\0\0\0\x18ftypheic000000000000000000');
test('chart content validation accepts raster/HEIC signatures, rejects spoofed filenames and SVG/HTML',()=>{
 for(const [bytes,kind] of [[jpeg,'jpeg'],[png,'png'],[webp,'webp'],[heic,'heic']])assert.equal(chartImageKind(bytes),kind);
 for(const bytes of [Buffer.from('<svg></svg>'),Buffer.from('<html>'),Buffer.alloc(40)])assert.equal(chartImageKind(bytes),null);
});
test('platform-agnostic chart preparation applies EXIF orientation, bounds size, converts to JPEG and closes decoded image',async()=>{
 for(const [bytes,type] of [[jpeg,'image/jpeg'],[png,'image/png'],[webp,'image/webp'],[heic,'image/heic']]){
  let closed=false,canvas;
  global.createImageBitmap=async(file,options)=>{assert.equal(options.imageOrientation,'from-image');return{width:2400,height:1200,close(){closed=true;}};};
  global.document={createElement(){return canvas={getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob([jpeg],{type:'image/jpeg'}))};}};
  const result=await prepareChart(new File([bytes],'private-chart',{type}));assert.equal(result.type,'image/jpeg');assert.equal(canvas.width,1600);assert.equal(canvas.height,800);assert.ok(closed);
 }
});
test('malformed, oversized, excessive-resolution and unsupported HEIC uploads never reach analysis',async()=>{
 await assert.rejects(prepareChart(new File(['<svg/>'],'chart.png',{type:'image/png'})),/valid PNG/);
 await assert.rejects(prepareChart(new File([Buffer.alloc(10*1024*1024+1)],'chart.jpg',{type:'image/jpeg'})),/under 10 MB/);
 let closed=false;global.createImageBitmap=async()=>({width:10000,height:10000,close(){closed=true;}});
 await assert.rejects(prepareChart(new File([jpeg],'chart.jpg')),/too large/);assert.ok(closed);
});

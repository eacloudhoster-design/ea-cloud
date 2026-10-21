// Loads the actual client component for pipeline verification; no replacement UI.
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function loadScannerRenderer() {
 const result=await build({stdin:{contents:`import {createElement} from './artifacts/ea-app/node_modules/react/index.js';
 import {renderToStaticMarkup} from './artifacts/ea-app/node_modules/react-dom/server.node.js';
 import Component from './artifacts/ea-app/src/components/ScannerChartReport.tsx';
 export {formatScannerPrice as formatPrice} from './artifacts/ea-app/src/lib/scanner-format.ts';
 export function render(record){return renderToStaticMarkup(createElement(Component,{record,settings:{lotUnits:1,positions:1},onEditSettings:()=>{}}));}`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,loader:{'.css':'empty'},tsconfig:'artifacts/ea-app/tsconfig.json',banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'}});
 mkdirSync('work',{recursive:true});
 const directory=mkdtempSync(resolve('work/scanner-render-'));
 try {const path=resolve(directory,'render.mjs');writeFileSync(path,result.outputFiles[0].text);return await import(pathToFileURL(path));}
 finally {rmSync(directory,{recursive:true,force:true});}
}

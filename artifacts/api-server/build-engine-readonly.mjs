import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),outdir=process.env.EA_RELEASE_OUTDIR;
if(!outdir || !path.isAbsolute(outdir) || path.resolve(outdir)===path.join(root,'dist') || path.resolve(outdir).startsWith(path.join(root,'dist')+path.sep))throw Error('Explicit isolated EA_RELEASE_OUTDIR required; normal production dist is excluded');
await build({entryPoints:[path.join(root,'src/engine-readonly.ts')],bundle:true,platform:'node',format:'esm',outdir,external:['pg-native'],outExtension:{'.js':'.mjs'},banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},logLevel:'warning'});

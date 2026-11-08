import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),outdir=process.env.EA_RELEASE_OUTDIR;
if(!outdir||!path.isAbsolute(outdir)||path.resolve(outdir)===path.join(root,'dist')||path.resolve(outdir).startsWith(path.join(root,'dist')+path.sep))throw Error('Explicit isolated EA_RELEASE_OUTDIR required');
await build({entryPoints:[path.join(root,'src/application-nontrading.ts'),path.join(root,'src/export-mt5-enrollment.ts')],bundle:true,platform:'node',format:'esm',outdir,external:['pg-native','pino-pretty','nodemailer','protobufjs'],loader:{'.mq5':'text'},outExtension:{'.js':'.mjs'},banner:{js:'import {createRequire as releaseRequire} from "node:module";const require=releaseRequire(import.meta.url);'},logLevel:'warning'});

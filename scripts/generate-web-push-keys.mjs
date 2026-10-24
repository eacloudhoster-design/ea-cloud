import webpush from '../artifacts/api-server/node_modules/web-push/src/index.js';
import {mkdir,writeFile} from 'node:fs/promises';
const subject=process.argv[process.argv.indexOf('--subject')+1];
if(!/^mailto:[^\s@]+@[^\s@]+$/.test(subject||''))throw Error('Use --subject mailto:your-support-address. Never share the generated private key.');
const {publicKey,privateKey}=webpush.generateVAPIDKeys();
await mkdir('work',{recursive:true});
await writeFile('work/web-push.env',`WEB_PUSH_SUBJECT=${subject}\nWEB_PUSH_PUBLIC_KEY=${publicKey}\nWEB_PUSH_PRIVATE_KEY=${privateKey}\n`,{mode:0o600,flag:'wx'});
console.log('Saved work/web-push.env with owner-only permissions. Configure these variables privately on the existing API service. Do not commit this file.');

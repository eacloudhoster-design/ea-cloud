// Exercise the real Express stack without opening a network socket.
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
export async function appRequest(app, url, init={}) {
  const prepared=new Request(url,init),body=Buffer.from(await prepared.arrayBuffer());
  const chunks=[];
  const socket=new Duplex({read(){},write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
  socket.remoteAddress='127.0.0.1';
  const req=new IncomingMessage(socket);
  req.method=prepared.method;req.url=new URL(url).pathname+new URL(url).search;req.headers=Object.fromEntries(prepared.headers);
  req.headers.host=new URL(url).host;
  if(body.length)req.headers['content-length']=String(body.length);
  const res=new ServerResponse(req);res.assignSocket(socket);
  const result=new Promise((resolve,reject)=>{res.on('error',reject);res.on('finish',()=>{
    const raw=Buffer.concat(chunks),start=raw.indexOf('\r\n\r\n')+4;
    resolve(new Response(raw.subarray(start),{status:res.statusCode,headers:res.getHeaders()}));socket.destroy();
  });});
  req.complete=true;app(req,res);req.push(body.length?body:null);if(body.length)req.push(null);
  return result;
}

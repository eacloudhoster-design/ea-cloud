"""Existing tunnel's bounded provisioning conduit; no token storage or privilege widening.
The relay receives a token digest only; authoritative provisioning remains in the
existing root service. Status tokens cannot authenticate this route.
"""
import hashlib,hmac,json,re,urllib.request,urllib.error
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from account_dispatch import NoRedirect

class ProvisioningProxy:
 def __init__(self,digest,send=None):
  if not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('Pinned provisioning credential digest required')
  self.digest=digest;self.send=send or self.send_private
 @staticmethod
 def supports(method,path):
  return (method=='POST' and (path=='/v1/provision' or re.fullmatch('/v1/provision/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/stop',path) is not None)) or (method=='GET' and re.fullmatch('/v1/provision/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',path) is not None)
 @staticmethod
 def send_private(method,path,authorization,body):
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
  request=urllib.request.Request('http://127.0.0.1:10040'+path,method=method,data=body if method=='POST' else None,headers={'Authorization':authorization,'Content-Type':'application/json'})
  try:response=opener.open(request,timeout=8)
  except urllib.error.HTTPError as error:response=error
  with response:
   raw=response.read(16385)
   if len(raw)>16384:raise ValueError('Oversized private response')
   data=json.loads(raw)
   if not isinstance(data,dict):raise ValueError('Invalid private response')
   # Only protocol metadata can cross this boundary. Do not project arbitrary
   # messages, credentials, server identifiers or worker/vendor debug output.
   fields=('requestId','state','accountMode','executionEnabled','code','success','resourcesDeleted')
   return response.code,{key:data[key] for key in fields if key in data}
 async def __call__(self,request):
  authorization=request.headers.get('authorization','')
  if not re.fullmatch(r'Bearer [\x21-\x7e]{32,2048}',authorization) or not hmac.compare_digest(hashlib.sha256(authorization[7:].encode()).hexdigest(),self.digest):
   return JSONResponse({'code':'AUTH_REQUIRED'},status_code=401,headers={'Cache-Control':'no-store'})
  if request.url.query:return JSONResponse({'code':'INVALID_REQUEST'},status_code=422)
  if request.method=='POST' and request.headers.get('content-type')!='application/json':return JSONResponse({'code':'INVALID_REQUEST'},status_code=422)
  chunks=[];size=0
  async for chunk in request.stream():
   size+=len(chunk)
   if size>8192:return JSONResponse({'code':'INVALID_REQUEST'},status_code=413)
   chunks.append(chunk)
  if request.method=='GET' and size:return JSONResponse({'code':'INVALID_REQUEST'},status_code=422)
  try:
   code,data=await run_in_threadpool(self.send,request.method,request.url.path,authorization,b''.join(chunks))
   return JSONResponse(data,status_code=code,headers={'Cache-Control':'no-store'})
  except Exception:return JSONResponse({'code':'PROVISIONER_TRANSPORT_UNAVAILABLE','executionEnabled':False},status_code=503,headers={'Cache-Control':'no-store'})

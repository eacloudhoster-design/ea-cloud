"""Bound HTTP bodies, including chunked uploads, without logging private payloads."""
from starlette.responses import JSONResponse

class PrivateHttpGuard:
    def __init__(self,app,limit=32768):self.app,self.limit=app,limit
    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        headers=dict(scope.get('headers',[]));length=headers.get(b'content-length')
        try:
            if length is not None and (int(length)<0 or int(length)>self.limit):raise ValueError()
        except ValueError:
            return await JSONResponse({'success':False,'message':'Request too large or invalid'},413)(scope,receive,send)
        # Read before invoking the route so oversize errors cannot occur after dispatch.
        messages=[];total=0
        while True:
            message=await receive()
            if message['type']=='http.disconnect':return
            total+=len(message.get('body',b''))
            if total>self.limit:
                return await JSONResponse({'success':False,'message':'Request too large'},413)(scope,receive,send)
            messages.append(message)
            if not message.get('more_body',False):break
        iterator=iter(messages)
        async def bounded_receive():
            try:return next(iterator)
            except StopIteration:return await receive()
        await self.app(scope,bounded_receive,send)

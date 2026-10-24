// Push-only worker: never intercept/cache HTML, APIs or navigation.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function firstDelivery(id){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ea-cloud-push-receipts',1);r.onupgradeneeded=()=>r.result.createObjectStore('receipts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('receipts','readwrite'),store=tx.objectStore('receipts'),get=store.get(id);let fresh=false;
 get.onsuccess=()=>{if(get.result)return;fresh=true;store.put({id,at:Date.now()});const all=store.getAll();all.onsuccess=()=>{for(const row of all.result.sort((a,b)=>b.at-a.at).slice(255))store.delete(row.id);};};
 tx.oncomplete=()=>resolve(fresh);tx.onerror=tx.onabort=reject;});}finally{db.close();}
}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(!/^[a-f0-9-]{36}$/.test(data.eventId)||data.title!=='EA Cloud'||!['Robot started.','Robot stopped.'].includes(data.body))return;
 let fresh=true;try{fresh=await firstDelivery(data.eventId);}catch{}
 if(fresh)await self.registration.showNotification('EA Cloud',{body:data.body,icon:'/ea-app/apple-touch-icon.jpeg',badge:'/ea-app/apple-touch-icon.jpeg',tag:'ea-cloud-'+data.eventId,data:{url:'/ea-app/'}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=clients.find(c=>new URL(c.url).origin===self.location.origin&&new URL(c.url).pathname.startsWith('/ea-app/'));if(existing)return existing.focus();return self.clients.openWindow('/ea-app/');})());});

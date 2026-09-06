const CACHE='journey-public-v2';
const FILES=['./','./index.html','./styles.css','./app.js','./itinerary.js','./daily-plan.js','./features.js','./manifest.webmanifest','./assets/logo.jpg','./assets/icon-192.png','./assets/icon-512.png','./assets/share-qr.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('journey-public-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never cache identity, shared notes, API responses, or authentication redirects.
 const known=new Set(FILES.map(x=>new URL(x,self.registration.scope).pathname));
 if(!known.has(url.pathname))return;
 event.respondWith((async()=>{
 try{const response=await fetch(event.request);if(response.ok&&!response.redirected){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}return response;}
 catch{const cached=await caches.match(event.request,{ignoreSearch:true});return cached||new Response('此内容尚未离线保存。请联网后重试。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
 })());
});

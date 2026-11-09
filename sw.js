const CACHE='rocket-box-v4';
const SPRITES='rocket-box-pokemon-sprites-v1';
const FILES=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('rocket-box-v')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 const isSprite=url.hostname==='raw.githubusercontent.com'&&url.pathname.startsWith('/PokeAPI/sprites/master/sprites/pokemon/');
 if(isSprite){event.respondWith(caches.open(SPRITES).then(async cache=>{
  const cached=await cache.match(request);
  if(cached)return cached;
  try{const response=await fetch(request);if(response.ok)event.waitUntil(cache.put(request,response.clone()));return response}catch{return Response.error()}
 }));return}
 if(url.origin!==self.location.origin)return;
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));return response})));
});

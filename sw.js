const CACHE="smk-budget-pwa-v1";
const SHELL=[
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/styles.css",
  "/assets/app.js",
  "/assets/import.js",
  "/assets/requests.js",
  "/assets/admin-tools.js",
  "/assets/icon-192.png",
  "/assets/icon-512.png"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  event.respondWith(
    fetch(req).then(res=>{
      if(res&&res.ok){
        const copy=res.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
      }
      return res;
    }).catch(()=>caches.match(req,{ignoreSearch:true}).then(hit=>hit||caches.match("/",{ignoreSearch:true})))
  );
});

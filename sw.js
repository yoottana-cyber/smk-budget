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

self.addEventListener("push",event=>{
  let data={title:"SMK Budget",body:"มีรายการใหม่ในระบบ",url:"/?route=dashboard",tag:"smk-budget"};
  try{if(event.data)data={...data,...event.data.json()}}catch{try{data.body=event.data.text()||data.body}catch{}}
  const options={
    body:data.body||"",
    icon:"/assets/icon-192.png",
    badge:"/assets/icon-192.png",
    tag:data.tag||"smk-budget",
    renotify:true,
    data:{url:data.url||"/?route=dashboard"},
    actions:Array.isArray(data.actions)?data.actions.slice(0,2):[]
  };
  event.waitUntil(self.registration.showNotification(data.title||"SMK Budget",options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification?.data?.url||"/?route=dashboard";
  event.waitUntil((async()=>{
    const all=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of all){
      try{
        if("focus" in client){
          await client.focus();
          if("navigate" in client)await client.navigate(url);
          return;
        }
      }catch{}
    }
    if(clients.openWindow)return clients.openWindow(url);
  })());
});

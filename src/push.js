import {listMany,update,bulkAppend,roleList} from "./budget-db.js";

const enc=new TextEncoder();
const b64u=buf=>{
  const b=buf instanceof Uint8Array?buf:new Uint8Array(buf);let s="";
  for(const x of b)s+=String.fromCharCode(x);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const from64=s=>{
  s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
};
const concat=(...parts)=>{
  const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let off=0;
  for(const p of parts){out.set(p,off);off+=p.length}
  return out;
};
async function hmac(key,data){
  const k=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",k,data));
}
async function hkdfExtract(salt,ikm){return hmac(salt,ikm)}
async function hkdfExpand(prk,info,len){
  const out=[];let prev=new Uint8Array(0),counter=1,total=0;
  while(total<len){
    prev=await hmac(prk,concat(prev,info,new Uint8Array([counter++])));
    out.push(prev);total+=prev.length;
  }
  return concat(...out).slice(0,len);
}
function requireVapid(env){
  const publicKey=String(env.PUSH_VAPID_PUBLIC_KEY||"").trim();
  const privateKey=String(env.PUSH_VAPID_PRIVATE_KEY||"").trim();
  const subject=String(env.PUSH_VAPID_SUBJECT||"mailto:admin@smk-budget.pages.dev").trim();
  if(!publicKey||!privateKey)throw new Error("ยังไม่ได้ตั้งค่า PUSH_VAPID_PUBLIC_KEY และ PUSH_VAPID_PRIVATE_KEY");
  return{publicKey,privateKey,subject};
}
async function vapidJwt(endpoint,env){
  const {publicKey,privateKey,subject}=requireVapid(env),pub=from64(publicKey),d=from64(privateKey);
  if(pub.length!==65||pub[0]!==4||d.length!==32)throw new Error("รูปแบบ VAPID key ไม่ถูกต้อง");
  const jwk={kty:"EC",crv:"P-256",x:b64u(pub.slice(1,33)),y:b64u(pub.slice(33,65)),d:b64u(d),ext:true,key_ops:["sign"]};
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const header=b64u(enc.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const payload=b64u(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+43200,sub:subject})));
  const input=header+"."+payload;
  const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(input)));
  return{jwt:input+"."+b64u(sig),publicKey};
}
async function encryptPayload(subscription,payload){
  const uaPublic=from64(subscription.p256dh),authSecret=from64(subscription.auth);
  if(uaPublic.length!==65||uaPublic[0]!==4||!authSecret.length)throw new Error("Push subscription key ไม่ถูกต้อง");
  const uaKey=await crypto.subtle.importKey("raw",uaPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const asKeys=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const asPublic=new Uint8Array(await crypto.subtle.exportKey("raw",asKeys.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:uaKey},asKeys.privateKey,256));
  const authInfo=concat(enc.encode("WebPush: info\0"),uaPublic,asPublic);
  const authPrk=await hkdfExtract(authSecret,shared);
  const ikm=await hkdfExpand(authPrk,authInfo,32);
  const salt=crypto.getRandomValues(new Uint8Array(16)),prk=await hkdfExtract(salt,ikm);
  const cek=await hkdfExpand(prk,enc.encode("Content-Encoding: aes128gcm\0"),16);
  const nonce=await hkdfExpand(prk,enc.encode("Content-Encoding: nonce\0"),12);
  const raw=enc.encode(JSON.stringify(payload)),max=3000;
  const plain=concat(raw.slice(0,max),new Uint8Array([2]));
  const aes=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,tagLength:128},aes,plain));
  const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096,false);
  return concat(salt,rs,new Uint8Array([asPublic.length]),asPublic,encrypted);
}
async function deliver(env,subscription,payload){
  const body=await encryptPayload(subscription,payload),vapid=await vapidJwt(subscription.endpoint,env);
  const res=await fetch(subscription.endpoint,{
    method:"POST",
    headers:{
      "TTL":"86400",
      "Urgency":"normal",
      "Content-Encoding":"aes128gcm",
      "Content-Type":"application/octet-stream",
      "Authorization":"vapid t="+vapid.jwt+", k="+vapid.publicKey
    },
    body
  });
  return res;
}
export function pushConfigured(env){
  try{requireVapid(env);return true}catch{return false}
}
export function pushPublicKey(env){
  try{return requireVapid(env).publicKey}catch{return""}
}
function resolveTargetUsers(users,target){
  const userIds=new Set((target?.userIds||[]).map(String)),usernames=new Set((target?.usernames||[]).map(String)),roles=new Set(target?.roles||[]);
  const matched=[];
  for(const u of users){
    const active=String(u.status||"")==="active";
    if(!active)continue;
    const byId=userIds.has(String(u.id||"")),byUsername=usernames.has(String(u.username||"")),byRole=roles.size&&roleList(u.role).some(r=>roles.has(r));
    if(byId||byUsername||byRole)matched.push(u);
  }
  return[...new Map(matched.map(u=>[String(u.id||u.username),u])).values()];
}
export async function notifyUsers(env,target,payload){
  const g=await listMany(env,["Users"]),users=resolveTargetUsers(g.Users||[],target),now=new Date().toISOString();
  if(users.length){
    await bulkAppend(env,"Notifications",users.map(u=>({
      id:"ntf_"+crypto.randomUUID(),userId:u.id,username:u.username,title:String(payload?.title||"แจ้งเตือน"),
      body:String(payload?.body||""),url:String(payload?.url||"/?route=dashboard"),tag:String(payload?.tag||""),
      isRead:"0",createdAt:now,readAt:""
    })));
  }
  const pushTarget={userIds:users.map(u=>u.id),usernames:users.map(u=>u.username)};
  const push=await sendPush(env,pushTarget,payload);
  return{notifications:users.length,...push};
}
export async function sendPush(env,target,payload){
  if(!pushConfigured(env))return{configured:false,sent:0,failed:0,expired:0};
  const g=await listMany(env,["PushSubscriptions","Users"]),subs=g.PushSubscriptions||[],users=resolveTargetUsers(g.Users||[],target);
  const userIds=new Set(users.map(u=>String(u.id||""))),usernames=new Set(users.map(u=>String(u.username||"")));
  const selected=subs.filter(s=>String(s.status||"active")==="active"&&(userIds.has(String(s.userId||""))||usernames.has(String(s.username||""))));
  const unique=[...new Map(selected.map(s=>[s.endpoint,s])).values()];
  let sent=0,failed=0,expired=0;
  for(const s of unique){
    try{
      const res=await deliver(env,s,payload);
      if(res.ok){sent++;continue}
      if(res.status===404||res.status===410){
        expired++;try{await update(env,"PushSubscriptions",s.id,{status:"inactive",updatedAt:new Date().toISOString()})}catch{}
      }else failed++;
    }catch{failed++}
  }
  return{configured:true,sent,failed,expired};
}
export async function sendPushToCurrentUser(env,user,payload){
  return sendPush(env,{userIds:[user.id],usernames:[user.username]},payload);
}

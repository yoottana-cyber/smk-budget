
const SCHEMA={
  Users:["id","username","passwordHash","role","displayName","status","createdAt"],
  Projects:["id","fiscalYear","code","name","owner","budget","status","createdAt","updatedAt"],
  Activities:["id","projectId","code","name","budget","owner","status","createdAt","updatedAt"],
  Expenses:["id","projectId","activityId","date","docNo","description","category","amount","payee","note","createdBy","createdAt","updatedAt","requestId","fundType"],
  ProjectMeta:["id","projectId","division","sourceSheet","importKey","createdAt","updatedAt"],
  ActivityFunds:["id","activityId","fundType","budget","createdAt","updatedAt"],
  Requests:["id","requestNo","fiscalYear","projectId","activityId","requesterUserId","requesterName","startDate","endDate","details","fundType","status","totalAmount","procurementDocNo","procurementNote","procurementBy","paymentDate","paymentDocNo","paidAmount","financeNote","financeBy","createdAt","updatedAt","requesterUsername"],
  RequestItems:["id","requestId","description","amount","createdAt"],
  Settings:["key","value","updatedAt"],
  AuditLog:["id","createdAt","userId","username","displayName","action","entityType","entityId","summary","details"],
  DocumentCounters:["key","value","updatedAt"],
  DocumentLocks:["id","resource","owner","createdAt","expiresAt","releasedAt"]
};
const enc=new TextEncoder();
export const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export const bad=(m,s=400)=>json({error:m},s);
export const amount=n=>Number(String(n??0).replace(/,/g,"").replace(/-/g,""))||0;
export const VALID_ROLES=["admin","planner","teacher","procurement","finance","viewer"];
export function roleList(value){
  const src=Array.isArray(value)?value:String(value||"").split(",");
  return [...new Set(src.map(x=>String(x).trim()).filter(x=>VALID_ROLES.includes(x)))];
}
export const hasRole=(u,role)=>roleList(u?.roles?.length?u.roles:u?.role).includes(role);
export const hasAnyRole=(u,roles=[])=>roles.some(role=>hasRole(u,role));
export async function readBody(r){try{return await r.json()}catch{throw new Error("JSON ไม่ถูกต้อง")}}
function col(n){let s="";while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function pem(p){const b=p.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,""),x=atob(b);return Uint8Array.from(x,c=>c.charCodeAt(0)).buffer}
function b64u(buf){const b=buf instanceof Uint8Array?buf:new Uint8Array(buf);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function b64t(s){return b64u(enc.encode(s))}
function from64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
let googleTokenCache={token:"",exp:0};
async function gtoken(env){
  const nowSec=Math.floor(Date.now()/1000);if(googleTokenCache.token&&googleTokenCache.exp-nowSec>120)return googleTokenCache.token;
  const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),now=nowSec;
  const h=b64t(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const c=b64t(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const input=h+"."+c;
  const key=await crypto.subtle.importKey("pkcs8",pem(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(input));
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:input+"."+b64u(sig)})});
  const j=await r.json();if(!r.ok)throw new Error(j.error_description||j.error||"Google auth error");googleTokenCache={token:j.access_token,exp:now+Number(j.expires_in||3600)};return j.access_token;
}
async function gf(env,path,opt={}){
  const t=await gtoken(env);
  const r=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+env.SHEET_ID+path,{...opt,headers:{authorization:"Bearer "+t,"content-type":"application/json",...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||("Sheets API "+r.status));return j;
}
async function values(env,range){return(await gf(env,"/values/"+encodeURIComponent(range)+"?majorDimension=ROWS")).values||[]}
async function batchValues(env,ranges){
  if(!ranges?.length)return[];
  const q=ranges.map(x=>"ranges="+encodeURIComponent(x)).join("&");
  const j=await gf(env,"/values:batchGet?majorDimension=ROWS&"+q);
  return (j.valueRanges||[]).map(x=>x.values||[]);
}
async function put(env,range,vals){return gf(env,"/values/"+encodeURIComponent(range)+"?valueInputOption=USER_ENTERED",{method:"PUT",body:JSON.stringify({values:vals})})}
export async function append(env,sheet,obj){return bulkAppend(env,sheet,[obj])}
export async function bulkAppend(env,sheet,objects){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);if(!objects?.length)return null;
  return gf(env,"/values/"+encodeURIComponent(sheet+"!A:"+col(h.length))+":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",{method:"POST",body:JSON.stringify({values:objects.map(obj=>h.map(k=>obj[k]??""))})});
}
export async function appendStrict(env,sheet,obj){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);
  const rows=await values(env,sheet+"!A:"+col(h.length)),row=Math.max(rows.length+1,2),vals=h.map(k=>obj[k]??"");
  await put(env,sheet+"!A"+row+":"+col(h.length)+row,[vals]);
  return{updates:{updatedRange:sheet+"!A"+row+":"+col(h.length)+row,updatedRows:1}};
}
export async function list(env,sheet){return (await listRows(env,sheet)).map(x=>{const y={...x};delete y.__row;return y})}
export async function listMany(env,sheets){
  const ranges=sheets.map(sheet=>{const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);return sheet+"!A:"+col(h.length)});
  const groups=await batchValues(env,ranges),out={};
  sheets.forEach((sheet,idx)=>{
    const h=SCHEMA[sheet],r=groups[idx]||[];
    out[sheet]=r.slice(1).filter(x=>x.some(v=>String(v).trim())).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??""])));
  });
  return out;
}
export async function listRowsMany(env,sheets){
  const ranges=sheets.map(sheet=>{const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);return sheet+"!A:"+col(h.length)});
  const groups=await batchValues(env,ranges),out={};
  sheets.forEach((sheet,idx)=>{
    const h=SCHEMA[sheet],r=groups[idx]||[];
    out[sheet]=r.slice(1).map((x,i)=>({x,row:i+2})).filter(z=>z.x.some(v=>String(v).trim())).map(z=>({...Object.fromEntries(h.map((k,i)=>[k,z.x[i]??""])),__row:z.row}));
  });
  return out;
}
export async function listRows(env,sheet){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);
  const r=await values(env,sheet+"!A:"+col(h.length));
  return r.slice(1).map((x,i)=>({x,row:i+2})).filter(z=>z.x.some(v=>String(v).trim())).map(z=>({...Object.fromEntries(h.map((k,i)=>[k,z.x[i]??""])),__row:z.row}));
}
export async function batchUpdateRows(env,sheet,rows){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);if(!rows?.length)return null;
  const data=rows.map(({__row,...obj})=>({range:sheet+"!A"+__row+":"+col(h.length)+__row,values:[h.map(k=>obj[k]??"")]}));
  return gf(env,"/values:batchUpdate",{method:"POST",body:JSON.stringify({valueInputOption:"USER_ENTERED",data})});
}
export async function replaceSheetData(env,sheet,objects=[]){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);
  await gf(env,"/values/"+encodeURIComponent(sheet+"!A2:"+col(h.length))+":clear",{method:"POST",body:"{}"});
  if(!objects.length)return{cleared:true,written:0};
  const rows=objects.map(obj=>h.map(k=>obj?.[k]??""));
  await put(env,sheet+"!A2:"+col(h.length)+(rows.length+1),rows);
  return{cleared:true,written:rows.length};
}
export function schemaKeys(sheet){const h=SCHEMA[sheet];return h?[...h]:[]}

export async function update(env,sheet,id,obj){
  const h=SCHEMA[sheet],r=await values(env,sheet+"!A:"+col(h.length)),i=r.findIndex((x,n)=>n>0&&x[0]===id);
  if(i<1)throw new Error("ไม่พบข้อมูล");
  const old=Object.fromEntries(h.map((k,j)=>[k,r[i][j]??""])),m={...old,...obj};
  await put(env,sheet+"!A"+(i+1)+":"+col(h.length)+(i+1),[h.map(k=>m[k]??"")]);return m;
}
let ensureExtraReadyUntil=0,shiftedRequestRepairDone=false;
export async function ensureExtra(env){
  if(Date.now()<ensureExtraReadyUntil)return;
  const meta=await gf(env,"?fields=sheets.properties.title"),have=new Set((meta.sheets||[]).map(x=>x.properties.title));
  const extra=["ProjectMeta","ActivityFunds","Requests","RequestItems","Settings","AuditLog","DocumentCounters","DocumentLocks"],missing=extra.filter(x=>!have.has(x));
  if(missing.length)await gf(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:missing.map(title=>({addSheet:{properties:{title}}}))})});
  const headerSheets=[...new Set([...missing,"Expenses","Requests"])];
  const headerGroups=await batchValues(env,headerSheets.map(s=>s+"!1:1"));
  const headerData=headerSheets.map((s,i)=>({s,h:SCHEMA[s],row:headerGroups[i]?.[0]||[]})).filter(x=>x.row.length<x.h.length||x.h.some((v,j)=>String(x.row[j]||"")!==v)).map(x=>({range:x.s+"!A1:"+col(x.h.length)+"1",values:[x.h]}));
  if(headerData.length)await gf(env,"/values:batchUpdate",{method:"POST",body:JSON.stringify({valueInputOption:"USER_ENTERED",data:headerData})});
  if(missing.includes("Settings")){
    const now=new Date().toISOString();
    await bulkAppend(env,"Settings",[
      {key:"schoolName",value:"โรงเรียนสามัคคีศึกษา",updatedAt:now},
      {key:"schoolLocation",value:"อำเภอห้วยยอด จังหวัดตรัง",updatedAt:now},
      {key:"financeOfficer",value:"นางสาวจันทรา ชำนาญดง",updatedAt:now},
      {key:"directorName",value:"นายจักรพงษ์ ทองประดับ",updatedAt:now},
      {key:"directorTitle",value:"ผู้อำนวยการโรงเรียนสามัคคีศึกษา",updatedAt:now},
      {key:"systemTitle",value:"ระบบบริหารจัดการงบประมาณ",updatedAt:now},
      {key:"schoolLogo",value:"",updatedAt:now}
    ]);
  }
  if(!shiftedRequestRepairDone){
    const requestWidth=SCHEMA.Requests.length,wideWidth=44,wide=await values(env,"Requests!A:AR"),repairData=[];
    for(let i=1;i<wide.length;i++){
      const row=wide[i]||[];if(String(row[0]||"").startsWith("req_"))continue;
      const start=row.findIndex((v,j)=>j>0&&String(v||"").startsWith("req_"));
      if(start>0){
        const req=row.slice(start,start+requestWidth),fixed=Array(wideWidth).fill("");
        for(let j=0;j<requestWidth;j++)fixed[j]=req[j]??"";
        repairData.push({range:"Requests!A"+(i+1)+":AR"+(i+1),values:[fixed]});
      }
    }
    if(repairData.length)await gf(env,"/values:batchUpdate",{method:"POST",body:JSON.stringify({valueInputOption:"USER_ENTERED",data:repairData})});
    shiftedRequestRepairDone=true;
  }
  ensureExtraReadyUntil=Date.now()+300000;
}
async function verify(t,secret){
  try{
    const[h,p,s]=t.split("."),k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    const ok=await crypto.subtle.verify("HMAC",k,from64(s),enc.encode(h+"."+p));if(!ok)return null;
    const u=JSON.parse(new TextDecoder().decode(from64(p)));return u.exp>Math.floor(Date.now()/1000)?u:null;
  }catch{return null}
}
let authUsersCache={rows:null,exp:0};
async function authUsers(env){
  if(authUsersCache.rows&&Date.now()<authUsersCache.exp)return authUsersCache.rows;
  const rows=await list(env,"Users");authUsersCache={rows,exp:Date.now()+15000};return rows;
}
export async function auth(ctx,roles=[]){
  const a=ctx.request.headers.get("authorization")||"",t=await verify(a.startsWith("Bearer ")?a.slice(7):"",ctx.env.JWT_SECRET);
  if(!t)return{error:"UNAUTHORIZED"};
  const us=await authUsers(ctx.env),row=us.find(x=>x.id===t.id&&x.status==="active");if(!row)return{error:"UNAUTHORIZED"};
  const userRoles=roleList(row.role),u={id:row.id,username:row.username,role:userRoles[0]||"viewer",roles:userRoles.length?userRoles:["viewer"],displayName:row.displayName};
  if(roles.length&&!hasAnyRole(u,roles))return{error:"FORBIDDEN",u};return{u};
}
export function normPerson(s){
  return String(s||"").toLowerCase().replace(/\s+/g,"").replace(/^(นาย|นางสาว|นาง|ครู|ดร\.?|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี)/,"");
}
export function ownsProject(u,p){
  if(hasAnyRole(u,["admin","planner"]))return true;
  if(!hasRole(u,"teacher"))return false;
  const a=normPerson(u.displayName),b=normPerson(p.owner);
  return !!a&&!!b&&(b.includes(a)||a.includes(b));
}
export async function writeAudit(env,user,action,entityType,entityId="",summary="",details={}){
  try{
    const detailText=typeof details==="string"?details:JSON.stringify(details??{});
    await append(env,"AuditLog",{
      id:"log_"+crypto.randomUUID(),
      createdAt:new Date().toISOString(),
      userId:user?.id||"",
      username:user?.username||"",
      displayName:user?.displayName||"",
      action:String(action||""),
      entityType:String(entityType||""),
      entityId:String(entityId||""),
      summary:String(summary||"").slice(0,500),
      details:String(detailText||"").slice(0,8000)
    });
  }catch{}
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function acquireDocumentLock(env,resource){
  const id="dlock_"+crypto.randomUUID(),owner=crypto.randomUUID(),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+15000).toISOString();
  const res=await append(env,"DocumentLocks",{id,resource,owner,createdAt,expiresAt,releasedAt:""});
  let myRow=Number(String(res?.updates?.updatedRange||"").match(/![A-Z]+(\d+):/)?.[1]||0);
  const waits=[0,120,220,360,520,760,1000,1300];
  for(const wait of waits){
    if(wait)await sleep(wait);
    const rows=await listRows(env,"DocumentLocks");
    const me=rows.find(x=>x.id===id);if(me)myRow=me.__row;
    const now=Date.now();
    const active=rows.filter(x=>x.resource===resource&&!x.releasedAt&&Number.isFinite(Date.parse(x.expiresAt))&&Date.parse(x.expiresAt)>now).sort((a,b)=>a.__row-b.__row);
    if(active[0]?.id===id)return{id,row:myRow};
  }
  if(myRow)await batchUpdateRows(env,"DocumentLocks",[{__row:myRow,id:"",resource:"",owner:"",createdAt:"",expiresAt:"",releasedAt:""}]);
  throw new Error("ระบบกำลังออกเลขเอกสารให้ผู้ใช้อื่น กรุณาลองอีกครั้ง");
}
async function releaseDocumentLock(env,lock){
  try{if(lock?.row)await batchUpdateRows(env,"DocumentLocks",[{__row:lock.row,id:"",resource:"",owner:"",createdAt:"",expiresAt:"",releasedAt:""}])}catch{}
}
export async function nextDocumentNumber(env,kind,fiscalYear,minValue=0){
  await ensureExtra(env);
  const fy=String(fiscalYear||"").trim();if(!fy)throw new Error("ไม่พบปีงบประมาณสำหรับออกเลขเอกสาร");
  if(!["request","expense"].includes(kind))throw new Error("ชนิดเลขเอกสารไม่ถูกต้อง");
  const key=kind+":"+fy,lock=await acquireDocumentLock(env,key);
  try{
    const rows=await listRows(env,"DocumentCounters");
    const current=rows.find(x=>x.key===key);
    const base=Math.max(Number(current?.value||0)||0,Number(minValue||0)||0),next=base+1,now=new Date().toISOString();
    if(current)await batchUpdateRows(env,"DocumentCounters",[{...current,value:next,updatedAt:now}]);
    else await append(env,"DocumentCounters",{key,value:next,updatedAt:now});
    return kind==="request"?"REQ-"+fy+"-"+String(next).padStart(4,"0"):"บจ."+next;
  }finally{await releaseDocumentLock(env,lock)}
}
export const PENDING_STATUSES=["submitted","procurement","finance"];
export const FUND_LABELS={subsidy:"งบเงินอุดหนุน",activity:"งบเงินกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่นๆ"};

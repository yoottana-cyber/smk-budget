
const SCHEMA={
  Users:["id","username","passwordHash","role","displayName","status","createdAt"],
  Projects:["id","fiscalYear","code","name","owner","budget","status","createdAt","updatedAt"],
  Activities:["id","projectId","code","name","budget","owner","status","createdAt","updatedAt"],
  Expenses:["id","projectId","activityId","date","docNo","description","category","amount","payee","note","createdBy","createdAt","updatedAt"],
  ProjectMeta:["id","projectId","division","sourceSheet","importKey","createdAt","updatedAt"],
  ActivityFunds:["id","activityId","fundType","budget","createdAt","updatedAt"],
  Requests:["id","requestNo","fiscalYear","projectId","activityId","requesterUserId","requesterName","startDate","endDate","details","fundType","status","totalAmount","procurementDocNo","procurementNote","procurementBy","paymentDate","paymentDocNo","paidAmount","financeNote","financeBy","createdAt","updatedAt"],
  RequestItems:["id","requestId","description","amount","createdAt"],
  Settings:["key","value","updatedAt"]
};
const enc=new TextEncoder();
export const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export const bad=(m,s=400)=>json({error:m},s);
export const amount=n=>Number(String(n??0).replace(/,/g,"").replace(/-/g,""))||0;
export async function readBody(r){try{return await r.json()}catch{throw new Error("JSON ไม่ถูกต้อง")}}
function col(n){let s="";while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function pem(p){const b=p.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,""),x=atob(b);return Uint8Array.from(x,c=>c.charCodeAt(0)).buffer}
function b64u(buf){const b=buf instanceof Uint8Array?buf:new Uint8Array(buf);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function b64t(s){return b64u(enc.encode(s))}
function from64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function gtoken(env){
  const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),now=Math.floor(Date.now()/1000);
  const h=b64t(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const c=b64t(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const input=h+"."+c;
  const key=await crypto.subtle.importKey("pkcs8",pem(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(input));
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:input+"."+b64u(sig)})});
  const j=await r.json();if(!r.ok)throw new Error(j.error_description||j.error||"Google auth error");return j.access_token;
}
async function gf(env,path,opt={}){
  const t=await gtoken(env);
  const r=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+env.SHEET_ID+path,{...opt,headers:{authorization:"Bearer "+t,"content-type":"application/json",...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||("Sheets API "+r.status));return j;
}
async function values(env,range){return(await gf(env,"/values/"+encodeURIComponent(range)+"?majorDimension=ROWS")).values||[]}
async function put(env,range,vals){return gf(env,"/values/"+encodeURIComponent(range)+"?valueInputOption=USER_ENTERED",{method:"PUT",body:JSON.stringify({values:vals})})}
export async function append(env,sheet,obj){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);
  return gf(env,"/values/"+encodeURIComponent(sheet+"!A:"+col(h.length))+":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",{method:"POST",body:JSON.stringify({values:[h.map(k=>obj[k]??"")]})});
}
export async function list(env,sheet){
  const h=SCHEMA[sheet];if(!h)throw new Error("ไม่รู้จักชีต "+sheet);
  const r=await values(env,sheet+"!A:"+col(h.length));
  return r.slice(1).filter(x=>x.some(v=>String(v).trim())).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??""])));
}
export async function update(env,sheet,id,obj){
  const h=SCHEMA[sheet],r=await values(env,sheet+"!A:"+col(h.length)),i=r.findIndex((x,n)=>n>0&&x[0]===id);
  if(i<1)throw new Error("ไม่พบข้อมูล");
  const old=Object.fromEntries(h.map((k,j)=>[k,r[i][j]??""])),m={...old,...obj};
  await put(env,sheet+"!A"+(i+1)+":"+col(h.length)+(i+1),[h.map(k=>m[k]??"")]);return m;
}
export async function ensureExtra(env){
  const meta=await gf(env,"?fields=sheets.properties.title"),have=new Set((meta.sheets||[]).map(x=>x.properties.title));
  const extra=["ProjectMeta","ActivityFunds","Requests","RequestItems","Settings"];
  const req=extra.filter(x=>!have.has(x)).map(title=>({addSheet:{properties:{title}}}));
  if(req.length)await gf(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:req})});
  for(const s of extra){const h=SCHEMA[s],r=await values(env,s+"!1:1");if(!r.length)await put(env,s+"!A1:"+col(h.length)+"1",[h])}
  const settings=await list(env,"Settings");
  const defaults={
    schoolName:"โรงเรียนสามัคคีศึกษา",
    schoolLocation:"อำเภอห้วยยอด จังหวัดตรัง",
    financeOfficer:"นางสาวจันทรา ชำนาญดง",
    directorName:"นายจักรพงษ์ ทองประดับ",
    directorTitle:"ผู้อำนวยการโรงเรียนสามัคคีศึกษา"
  };
  for(const [key,value] of Object.entries(defaults))if(!settings.some(x=>x.key===key))await append(env,"Settings",{key,value,updatedAt:new Date().toISOString()});
}
async function verify(t,secret){
  try{
    const[h,p,s]=t.split("."),k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    const ok=await crypto.subtle.verify("HMAC",k,from64(s),enc.encode(h+"."+p));if(!ok)return null;
    const u=JSON.parse(new TextDecoder().decode(from64(p)));return u.exp>Math.floor(Date.now()/1000)?u:null;
  }catch{return null}
}
export async function auth(ctx,roles=[]){
  const a=ctx.request.headers.get("authorization")||"",t=await verify(a.startsWith("Bearer ")?a.slice(7):"",ctx.env.JWT_SECRET);
  if(!t)return{error:"UNAUTHORIZED"};
  const us=await list(ctx.env,"Users"),row=us.find(x=>x.id===t.id&&x.status==="active");if(!row)return{error:"UNAUTHORIZED"};
  const u={id:row.id,username:row.username,role:row.role,displayName:row.displayName};
  if(roles.length&&!roles.includes(u.role))return{error:"FORBIDDEN",u};return{u};
}
export function normPerson(s){
  return String(s||"").toLowerCase().replace(/\s+/g,"").replace(/^(นาย|นางสาว|นาง|ครู|ดร\.?|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี)/,"");
}
export function ownsProject(u,p){
  if(["admin","planner"].includes(u.role))return true;
  if(u.role!=="teacher")return false;
  const a=normPerson(u.displayName),b=normPerson(p.owner);
  return !!a&&!!b&&(b.includes(a)||a.includes(b));
}
export const PENDING_STATUSES=["submitted","procurement","finance"];
export const FUND_LABELS={subsidy:"งบเงินอุดหนุน",activity:"งบเงินกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่นๆ"};

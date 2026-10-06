import {nextDocumentNumber} from "../../src/budget-db.js";

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
  AuditLog:["id","createdAt","userId","username","displayName","action","entityType","entityId","summary","details"]
};
const enc=new TextEncoder();
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const bad=(m,s=400)=>json({error:m},s);
async function body(r){try{return await r.json()}catch{throw new Error("JSON ไม่ถูกต้อง")}}
function col(n){let s="";while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function pem(p){const b=p.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,""),x=atob(b);return Uint8Array.from(x,c=>c.charCodeAt(0)).buffer}
function b64u(buf){const b=buf instanceof Uint8Array?buf:new Uint8Array(buf);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function b64t(s){return b64u(enc.encode(s))}
function from64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function sha(s){const h=await crypto.subtle.digest("SHA-256",enc.encode(s));return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("")}
const VALID_ROLES=["admin","planner","teacher","procurement","finance","viewer"];
function roleList(value){const src=Array.isArray(value)?value:String(value||"").split(",");return[...new Set(src.map(x=>String(x).trim()).filter(x=>VALID_ROLES.includes(x)))]}
function hasRole(u,role){return roleList(u?.roles?.length?u.roles:u?.role).includes(role)}
function hasAnyRole(u,roles=[]){return roles.some(role=>hasRole(u,role))}
function normPerson(s){return String(s||"").toLowerCase().replace(/\s+/g,"").replace(/^(นาย|นางสาว|นาง|ครู|ดร\.?|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี)/,"")}
function ownsProject(u,p){const a=normPerson(u?.displayName),b=normPerson(p?.owner);return !!a&&!!b&&(b.includes(a)||a.includes(b))}
function requestMine(u,r,projectMap){
  const me=normPerson(u?.displayName);
  if(String(r?.requesterUserId||"")===String(u?.id||""))return true;
  if(String(r?.requesterUsername||"")===String(u?.username||""))return true;
  if(me&&normPerson(r?.requesterName)===me)return true;
  const p=projectMap?.[r?.projectId];
  return hasRole(u,"teacher")&&!!p&&ownsProject(u,p);
}
function safeUser(row){const roles=roleList(row.role),r=roles.length?roles:["viewer"];return{id:row.id,username:row.username,role:r[0],roles:r,displayName:row.displayName}}

let googleTokenCache={token:"",exp:0};
async function gtoken(env){
  const nowSec=Math.floor(Date.now()/1000);if(googleTokenCache.token&&googleTokenCache.exp-nowSec>120)return googleTokenCache.token;
  const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),now=nowSec;
  const h=b64t(JSON.stringify({alg:"RS256",typ:"JWT"})),c=b64t(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})),input=`${h}.${c}`;
  const key=await crypto.subtle.importKey("pkcs8",pem(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(input));
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${input}.${b64u(sig)}`})}),j=await r.json();
  if(!r.ok)throw new Error(j.error_description||j.error||"Google auth error");googleTokenCache={token:j.access_token,exp:now+Number(j.expires_in||3600)};return j.access_token;
}
async function gf(env,path,opt={}){
  const t=await gtoken(env),r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}${path}`,{...opt,headers:{authorization:`Bearer ${t}`,"content-type":"application/json",...(opt.headers||{})}}),j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error?.message||`Sheets API ${r.status}`);return j;
}
async function values(env,range){return(await gf(env,`/values/${encodeURIComponent(range)}?majorDimension=ROWS`)).values||[]}
async function batchValues(env,ranges){if(!ranges.length)return[];const q=ranges.map(x=>"ranges="+encodeURIComponent(x)).join("&"),j=await gf(env,"/values:batchGet?majorDimension=ROWS&"+q);return(j.valueRanges||[]).map(x=>x.values||[])}
async function put(env,range,vals){return gf(env,`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,{method:"PUT",body:JSON.stringify({values:vals})})}
async function append(env,sheet,obj){const h=SCHEMA[sheet];return gf(env,`/values/${encodeURIComponent(sheet+"!A:"+col(h.length))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,{method:"POST",body:JSON.stringify({values:[h.map(k=>obj[k]??"")]})})}
async function audit(env,u,action,entityType,entityId="",summary="",details={}){
  try{
    const detailText=typeof details==="string"?details:JSON.stringify(details??{});
    await append(env,"AuditLog",{id:"log_"+crypto.randomUUID(),createdAt:new Date().toISOString(),userId:u?.id||"",username:u?.username||"",displayName:u?.displayName||"",action:String(action||""),entityType:String(entityType||""),entityId:String(entityId||""),summary:String(summary||"").slice(0,500),details:String(detailText||"").slice(0,8000)});
  }catch{}
}
async function list(env,sheet){const h=SCHEMA[sheet],r=await values(env,`${sheet}!A:${col(h.length)}`);return r.slice(1).filter(x=>x.some(v=>String(v).trim())).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??""])))}
async function listRows(env,sheet){const h=SCHEMA[sheet],r=await values(env,`${sheet}!A:${col(h.length)}`);return r.slice(1).map((x,i)=>({x,row:i+2})).filter(z=>z.x.some(v=>String(v).trim())).map(z=>({...Object.fromEntries(h.map((k,i)=>[k,z.x[i]??""])),__row:z.row}))}
async function batchUpdateRows(env,sheet,rows){const h=SCHEMA[sheet];if(!rows?.length)return null;const data=rows.map(({__row,...obj})=>({range:`${sheet}!A${__row}:${col(h.length)}${__row}`,values:[h.map(k=>obj[k]??"")]}));return gf(env,"/values:batchUpdate",{method:"POST",body:JSON.stringify({valueInputOption:"USER_ENTERED",data})})}
async function listMany(env,sheets){const ranges=sheets.map(sheet=>`${sheet}!A:${col(SCHEMA[sheet].length)}`),groups=await batchValues(env,ranges),out={};sheets.forEach((sheet,idx)=>{const h=SCHEMA[sheet],r=groups[idx]||[];out[sheet]=r.slice(1).filter(x=>x.some(v=>String(v).trim())).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??""])))});return out}
async function update(env,sheet,id,obj){const h=SCHEMA[sheet],r=await values(env,`${sheet}!A:${col(h.length)}`),i=r.findIndex((x,n)=>n>0&&x[0]===id);if(i<1)throw new Error("ไม่พบข้อมูล");const old=Object.fromEntries(h.map((k,j)=>[k,r[i][j]??""])),m={...old,...obj,id};await put(env,`${sheet}!A${i+1}:${col(h.length)}${i+1}`,[h.map(k=>m[k]??"")]);return m}
async function del(env,sheet,id){const meta=await gf(env,"?fields=sheets.properties"),p=(meta.sheets||[]).find(x=>x.properties.title===sheet)?.properties,r=await values(env,`${sheet}!A:A`),i=r.findIndex((x,n)=>n>0&&x[0]===id);if(!p||i<1)throw new Error("ไม่พบข้อมูล");return gf(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:p.sheetId,dimension:"ROWS",startIndex:i,endIndex:i+1}}}]})})}
async function ensure(env){
  const meta=await gf(env,"?fields=sheets.properties.title"),have=new Set((meta.sheets||[]).map(x=>x.properties.title)),req=Object.keys(SCHEMA).filter(x=>!have.has(x)).map(title=>({addSheet:{properties:{title}}}));
  if(req.length)await gf(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:req})});
  for(const [s,h] of Object.entries(SCHEMA)){const r=await values(env,`${s}!1:1`),row=r[0]||[];if(row.length<h.length||h.some((v,i)=>String(row[i]||"")!==v))await put(env,`${s}!A1:${col(h.length)}1`,[h])}
}
async function hsign(data,secret){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(data)))}
async function token(user,secret){const h=b64t(JSON.stringify({alg:"HS256",typ:"JWT"})),p=b64t(JSON.stringify({...user,exp:Math.floor(Date.now()/1000)+28800})),d=`${h}.${p}`;return`${d}.${b64u(await hsign(d,secret))}`}
async function verify(t,secret){try{const[h,p,s]=t.split("."),k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]),ok=await crypto.subtle.verify("HMAC",k,from64(s),enc.encode(`${h}.${p}`));if(!ok)return null;const u=JSON.parse(new TextDecoder().decode(from64(p)));return u.exp>Math.floor(Date.now()/1000)?u:null}catch{return null}}
let usersCache={rows:null,exp:0};
async function usersList(env,force=false){if(!force&&usersCache.rows&&Date.now()<usersCache.exp)return usersCache.rows;const rows=await list(env,"Users");usersCache={rows,exp:Date.now()+15000};return rows}
function clearUsersCache(){usersCache={rows:null,exp:0}}
async function user(ctx,roles=[]){const a=ctx.request.headers.get("authorization")||"",t=await verify(a.startsWith("Bearer ")?a.slice(7):"",ctx.env.JWT_SECRET);if(!t)return{error:"UNAUTHORIZED"};const us=await usersList(ctx.env),row=us.find(x=>x.id===t.id&&x.status==="active");if(!row)return{error:"UNAUTHORIZED"};const u=safeUser(row);if(roles.length&&!hasAnyRole(u,roles))return{error:"FORBIDDEN",u};return{u}}
const roleStatus=x=>x==="FORBIDDEN"?403:401;

export async function onRequest(ctx){
  try{
    const path=(ctx.params.path||[]).join("/"),method=ctx.request.method,env=ctx.env;

    if(path==="setup"&&method==="POST"){
      const d=await body(ctx.request);if(!env.SETUP_KEY||d.setupKey!==env.SETUP_KEY)return bad("Setup key ไม่ถูกต้อง",403);await ensure(env);
      const us=await usersList(env,true);if(!us.length){if(!env.ADMIN_USERNAME||!env.ADMIN_PASSWORD)return bad("ยังไม่ได้ตั้ง ADMIN_USERNAME / ADMIN_PASSWORD",500);await append(env,"Users",{id:`usr_${crypto.randomUUID()}`,username:env.ADMIN_USERNAME,passwordHash:await sha(`${env.PASSWORD_PEPPER}:${env.ADMIN_PASSWORD}`),role:"admin",displayName:"ผู้ดูแลระบบ",status:"active",createdAt:new Date().toISOString()})}
      return json({ok:true,message:"Setup เรียบร้อย"});
    }

    if(path==="login"&&method==="POST"){
      const d=await body(ctx.request),us=await usersList(env),u=us.find(x=>x.username===d.username&&x.status==="active");if(!u||u.passwordHash!==await sha(`${env.PASSWORD_PEPPER}:${d.password}`))return bad("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",401);
      const safe=safeUser(u);return json({token:await token(safe,env.JWT_SECRET),user:safe});
    }

    if(path==="me"&&method==="GET"){const a=await user(ctx);return a.error?bad("ไม่ได้รับอนุญาต",401):json({user:a.u})}
    if(path==="data"&&method==="GET"){
      const a=await user(ctx);if(a.error)return bad("ไม่ได้รับอนุญาต",401);
      const g=await listMany(env,["Projects","Activities","Expenses","ProjectMeta","ActivityFunds","Requests"]),pm=Object.fromEntries(g.Projects.map(p=>[p.id,p]));
      const fullData=hasAnyRole(a.u,["admin","planner","viewer","procurement","finance"]);
      let projects=g.Projects,activities=g.Activities,expenses=g.Expenses,projectMeta=g.ProjectMeta,activityFunds=g.ActivityFunds;
      if(!fullData&&hasRole(a.u,"teacher")){
        projects=g.Projects.filter(p=>ownsProject(a.u,p));const pids=new Set(projects.map(p=>p.id));
        activities=g.Activities.filter(x=>pids.has(x.projectId));const aids=new Set(activities.map(x=>x.id));
        expenses=g.Expenses.filter(x=>pids.has(x.projectId));projectMeta=g.ProjectMeta.filter(x=>pids.has(x.projectId));activityFunds=g.ActivityFunds.filter(x=>aids.has(x.activityId));
      }
      let requests=[];
      if(hasAnyRole(a.u,["admin","planner","viewer"]))requests=g.Requests;
      else{
        const own=g.Requests.filter(r=>requestMine(a.u,r,pm));
        const procurement=hasRole(a.u,"procurement")?g.Requests.filter(r=>["submitted","procurement"].includes(String(r.status||"").trim())):[];
        const finance=hasRole(a.u,"finance")?g.Requests.filter(r=>String(r.status||"").trim()==="finance"):[];
        requests=[...new Map([...own,...procurement,...finance].map(r=>[r.id,r])).values()];
      }
      return json({projects,activities,expenses,projectMeta,activityFunds,requests});
    }

    if(path==="users"){
      const a=await user(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบเท่านั้น":"ไม่ได้รับอนุญาต",roleStatus(a.error));
      const roles=["admin","planner","teacher","procurement","finance","viewer"],statuses=["active","inactive"];
      if(method==="GET"){
        const us=await usersList(env);
        return json({users:us.map(x=>{const s=safeUser(x);return{...s,status:x.status,createdAt:x.createdAt}}).sort((x,y)=>x.username.localeCompare(y.username))});
      }
      if(method==="POST"){
        const d=await body(ctx.request),username=String(d.username||"").trim(),displayName=String(d.displayName||"").trim(),password=String(d.password||""),userRoles=roleList(d.roles?.length?d.roles:(d.role||"viewer")),status=String(d.status||"active");
        if(username.length<3)return bad("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
        if(!displayName)return bad("กรุณากรอกชื่อที่แสดง");
        if(password.length<6)return bad("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        if(!userRoles.length||!statuses.includes(status))return bad("สิทธิ์หรือสถานะไม่ถูกต้อง");
        const us=await usersList(env);if(us.some(x=>x.username.toLowerCase()===username.toLowerCase()))return bad("ชื่อผู้ใช้นี้มีอยู่แล้ว",409);
        const row={id:`usr_${crypto.randomUUID()}`,username,passwordHash:await sha(`${env.PASSWORD_PEPPER}:${password}`),role:userRoles.join(","),displayName,status,createdAt:new Date().toISOString()};
        await append(env,"Users",row);clearUsersCache();
        await audit(env,a.u,"CREATE","user",row.id,"เพิ่มผู้ใช้งาน "+row.username,{username:row.username,displayName:row.displayName,role:row.role,status:row.status});
        return json({ok:true,user:{...safeUser(row),status:row.status,createdAt:row.createdAt}},201);
      }
      if(method==="PUT"){
        const d=await body(ctx.request);if(!d.id)return bad("ไม่พบรหัสผู้ใช้งาน");
        const us=await usersList(env),old=us.find(x=>x.id===d.id);if(!old)return bad("ไม่พบผู้ใช้งาน",404);
        const patch={};
        if(d.displayName!==undefined){const v=String(d.displayName||"").trim();if(!v)return bad("ชื่อที่แสดงห้ามว่าง");patch.displayName=v}
        if(d.roles!==undefined||d.role!==undefined){const nextRoles=roleList(d.roles?.length?d.roles:d.role);if(!nextRoles.length)return bad("กรุณาเลือกอย่างน้อย 1 บทบาท");if(d.id===a.u.id&&hasRole(a.u,"admin")&&!nextRoles.includes("admin"))return bad("ไม่สามารถนำสิทธิ์ผู้ดูแลระบบออกจากบัญชีที่กำลังใช้งานอยู่",409);patch.role=nextRoles.join(",")}
        if(d.status!==undefined){if(!statuses.includes(d.status))return bad("สถานะไม่ถูกต้อง");if(d.id===a.u.id&&d.status!=="active")return bad("ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่",409);patch.status=d.status}
        if(d.password!==undefined){const p=String(d.password||"");if(p.length<6)return bad("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");patch.passwordHash=await sha(`${env.PASSWORD_PEPPER}:${p}`)}
        if(!Object.keys(patch).length)return bad("ไม่มีข้อมูลที่ต้องแก้ไข");
        const row=await update(env,"Users",d.id,patch);clearUsersCache();
        await audit(env,a.u,"UPDATE","user",row.id,"แก้ไขผู้ใช้งาน "+row.username,{displayName:row.displayName,role:row.role,status:row.status,passwordChanged:d.password!==undefined});
        return json({ok:true,user:{...safeUser(row),status:row.status,createdAt:row.createdAt}});
      }
      return bad("Method not allowed",405);
    }

    const map={projects:"Projects",activities:"Activities",expenses:"Expenses"},sheet=map[path];
    if(sheet){
      if(method==="POST"||method==="PUT"){
        const editRoles=sheet==="Expenses"?["admin","finance"]:["admin","planner"],a=await user(ctx,editRoles);if(a.error)return bad(a.error==="FORBIDDEN"?(sheet==="Expenses"?"เฉพาะผู้ดูแลระบบหรือการเงินเท่านั้น":"เฉพาะผู้ดูแลระบบหรืองานแผนเท่านั้น"):"ไม่ได้รับอนุญาต",roleStatus(a.error));
        const d=await body(ctx.request),now=new Date().toISOString();
        const amount=n=>Number(String(n??0).replace(/,/g,""))||0;

        // Server-side budget guard: ป้องกันการแก้ข้อมูลจากหน้าเว็บแล้วทำให้งบติดลบ
        if(sheet==="Projects"){
          const g=await listMany(env,["Activities","Expenses"]),acts=g.Activities,exps=g.Expenses;
          const spent=exps.filter(x=>x.projectId===d.id).reduce((s,x)=>s+amount(x.amount),0);
          const allocated=acts.filter(x=>x.projectId===d.id).reduce((s,x)=>s+amount(x.budget),0);
          if(method==="PUT" && amount(d.budget)<spent)return bad(`งบโครงการต่ำกว่ายอดที่ใช้ไปแล้ว ${spent.toLocaleString("th-TH")} บาท`,409);
          if(method==="PUT" && amount(d.budget)<allocated)return bad(`งบโครงการต่ำกว่างบที่จัดสรรให้กิจกรรมแล้ว ${allocated.toLocaleString("th-TH")} บาท`,409);
        }

        if(sheet==="Activities"){
          const g=await listMany(env,["Projects","Activities","Expenses","Requests"]),projects=g.Projects,acts=g.Activities,exps=g.Expenses,reqs=g.Requests;
          const prj=projects.find(x=>x.id===d.projectId);if(!prj)return bad("ไม่พบโครงการที่เลือก",409);
          const allocated=acts.filter(x=>x.projectId===d.projectId && x.id!==d.id).reduce((s,x)=>s+amount(x.budget),0)+amount(d.budget);
          if(allocated>amount(prj.budget))return bad(`งบกิจกรรมรวมเกินงบโครงการ ${amount(prj.budget).toLocaleString("th-TH")} บาท`,409);
          if(method==="PUT"){const spent=exps.filter(x=>x.activityId===d.id).reduce((s,x)=>s+amount(x.amount),0);if(amount(d.budget)<spent)return bad(`งบกิจกรรมต่ำกว่ายอดที่ใช้ไปแล้ว ${spent.toLocaleString("th-TH")} บาท`,409)}
        }

        if(sheet==="Expenses"){
          const g=await listMany(env,["Projects","Activities","Expenses","Requests","ActivityFunds"]),projects=g.Projects,acts=g.Activities,exps=g.Expenses,reqs=g.Requests,funds=g.ActivityFunds;
          const prj=projects.find(x=>x.id===d.projectId);if(!prj)return bad("ไม่พบโครงการที่เลือก",409);
          const old=method==="PUT"?exps.find(x=>x.id===d.id):null;
          const reqNo=e=>(String(e?.note||"").match(/REQ-\d{4}-\d{4}/)||String(e?.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0]||"";
          const linkedOf=e=>e?.requestId?reqs.find(r=>r.id===e.requestId)||null:(reqNo(e)?reqs.find(r=>r.requestNo===reqNo(e))||null:null);
          const linked=old?linkedOf(old):null;
          if(linked&&(d.projectId!==linked.projectId||d.activityId!==linked.activityId||String(d.fundType||old.fundType||linked.fundType)!==String(linked.fundType||"")))return bad("รายจ่ายนี้เชื่อมกับคำขอเบิก กรุณาแก้โครงการ กิจกรรม หรือประเภทเงินจากหน้าคำขอเบิก",409);
          if(linked&&amount(d.amount)>amount(linked.totalAmount))return bad("ยอดจ่ายจริงต้องไม่เกินยอดขอเบิก "+amount(linked.totalAmount).toLocaleString("th-TH")+" บาท",409);
          if(amount(d.amount)<=0)return bad("จำนวนเงินต้องมากกว่า 0");
          if(!d.activityId)return bad("กรุณาเลือกกิจกรรม",409);
          const act=acts.find(x=>x.id===d.activityId);if(!act||act.projectId!==d.projectId)return bad("กิจกรรมไม่ตรงกับโครงการ",409);
          const fundType=String(d.fundType||linked?.fundType||old?.fundType||"");
          const fund=funds.find(x=>x.activityId===d.activityId&&x.fundType===fundType&&amount(x.budget)>0);if(!fund)return bad("กรุณาเลือกประเภทเงินที่มีงบในกิจกรรมนี้",409);
          const otherProjectSpent=exps.filter(x=>x.projectId===d.projectId&&x.id!==d.id).reduce((s,x)=>s+amount(x.amount),0);
          if(otherProjectSpent+amount(d.amount)>amount(prj.budget))return bad(`รายการนี้ทำให้รายจ่ายเกินงบโครงการ เหลืองบ ${Math.max(amount(prj.budget)-otherProjectSpent,0).toLocaleString("th-TH")} บาท`,409);
          const otherActivitySpent=exps.filter(x=>x.activityId===d.activityId&&x.id!==d.id).reduce((s,x)=>s+amount(x.amount),0);
          if(otherActivitySpent+amount(d.amount)>amount(act.budget))return bad(`รายการนี้ทำให้รายจ่ายเกินงบกิจกรรม เหลืองบ ${Math.max(amount(act.budget)-otherActivitySpent,0).toLocaleString("th-TH")} บาท`,409);
          const expenseFund=e=>e.fundType||linkedOf(e)?.fundType||"";
          const otherFundSpent=exps.filter(x=>x.activityId===d.activityId&&x.id!==d.id&&expenseFund(x)===fundType).reduce((s,x)=>s+amount(x.amount),0);
          const pending=reqs.filter(x=>x.activityId===d.activityId&&x.fundType===fundType&&["submitted","procurement","finance"].includes(x.status)).reduce((s,x)=>s+amount(x.totalAmount),0);
          if(otherFundSpent+pending+amount(d.amount)>amount(fund.budget))return bad(`รายการนี้ทำให้งบประเภทเงินติดลบ เหลือพร้อมใช้ ${Math.max(amount(fund.budget)-otherFundSpent-pending,0).toLocaleString("th-TH")} บาท`,409);
          const fy=String(prj.fiscalYear||""),sameYearIds=new Set(projects.filter(p=>String(p.fiscalYear||"")===fy).map(p=>p.id)),docInput=String(d.docNo||"").trim(),duplicateDoc=docInput&&exps.some(e=>e.id!==d.id&&sameYearIds.has(e.projectId)&&String(e.docNo||"").trim()===docInput);
          if(duplicateDoc)return bad("เลขที่เอกสาร "+docInput+" มีอยู่แล้วในปีงบประมาณนี้",409);
          if(method==="POST"&&!docInput){
            const maxDoc=exps.filter(e=>sameYearIds.has(e.projectId)).reduce((m,e)=>{const x=String(e.docNo||"").trim().match(/^บจ\.\s*(\d+)$/);return x?Math.max(m,Number(x[1])||0):m},0);
            d.docNo=await nextDocumentNumber(env,"expense",fy,maxDoc);
          }
          d.fundType=fundType;d.requestId=linked?.id||"";
        }

        if(method==="POST"){const row={...d,createdAt:now,updatedAt:now,...(sheet==="Expenses"?{createdBy:a.u.username}:{})};await append(env,sheet,row);await audit(env,a.u,"CREATE",path,row.id,"เพิ่มข้อมูล "+path,{id:row.id,projectId:row.projectId||"",activityId:row.activityId||"",amount:row.amount||"",docNo:row.docNo||"",fundType:row.fundType||""});return json({ok:true,row},201)}
        if(!d.id)return bad("ไม่พบรหัสข้อมูล");
        const row=await update(env,sheet,d.id,{...d,updatedAt:now,...(sheet==="Expenses"?{createdBy:a.u.username}:{})});
        if(sheet==="Expenses"){
          const g=await listMany(env,["Requests"]),reqs=g.Requests;
          const reqNo=(String(row.note||"").match(/REQ-\d{4}-\d{4}/)||String(row.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0];
          const linked=(row.requestId?reqs.find(x=>x.id===row.requestId):null)||(reqNo?reqs.find(x=>x.requestNo===reqNo):null);
          if(linked)await update(env,"Requests",linked.id,{paymentDate:row.date,paymentDocNo:String(row.docNo||"").trim(),paidAmount:amount(row.amount),updatedAt:now});
        }
        await audit(env,a.u,"UPDATE",path,row.id,"แก้ไขข้อมูล "+path,{id:row.id,projectId:row.projectId||"",activityId:row.activityId||"",amount:row.amount||"",docNo:row.docNo||"",fundType:row.fundType||""});
        return json({ok:true,row});
      }
      if(method==="DELETE"){
        const a=await user(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบเท่านั้น":"ไม่ได้รับอนุญาต",roleStatus(a.error));
        const id=new URL(ctx.request.url).searchParams.get("id");if(!id)return bad("ไม่พบรหัสข้อมูล");
        if(sheet==="Projects"){
          const g=await listMany(env,["Activities","Expenses","Requests","ProjectMeta"]),as=g.Activities,es=g.Expenses,rs=g.Requests,ms=g.ProjectMeta;
          if(as.some(x=>x.projectId===id)||es.some(x=>x.projectId===id)||rs.some(x=>x.projectId===id))return bad("โครงการนี้มีข้อมูลกิจกรรม รายจ่าย หรือคำขอเบิกอยู่",409);
          const meta=ms.find(x=>x.projectId===id);if(meta)await del(env,"ProjectMeta",meta.id);
        }
        if(sheet==="Activities"){
          const g=await listMany(env,["Expenses","Requests","ActivityFunds"]),es=g.Expenses,rs=g.Requests,fs=g.ActivityFunds;
          if(es.some(x=>x.activityId===id)||rs.some(x=>x.activityId===id))return bad("กิจกรรมนี้มีรายจ่ายหรือคำขอเบิกอยู่",409);
          for(const f of fs.filter(x=>x.activityId===id))await del(env,"ActivityFunds",f.id);
        }
        if(sheet==="Expenses"){
          const exps=await list(env,"Expenses"),row=exps.find(x=>x.id===id);
          if(row){
            const reqs=await list(env,"Requests"),no=(String(row.note||"").match(/REQ-\d{4}-\d{4}/)||String(row.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0],linked=(row.requestId?reqs.find(x=>x.id===row.requestId):null)||(no?reqs.find(x=>x.requestNo===no):null);
            if(linked){
              const requestRows=await listRows(env,"Requests"),itemRows=await listRows(env,"RequestItems"),rr=requestRows.find(x=>x.id===linked.id),items=itemRows.filter(x=>x.requestId===linked.id),blank=x=>Object.fromEntries(Object.keys(x).filter(k=>k!=="__row").map(k=>[k,""]));
              if(items.length)await batchUpdateRows(env,"RequestItems",items.map(x=>({__row:x.__row,...blank(x)})));
              if(rr)await batchUpdateRows(env,"Requests",[{__row:rr.__row,...blank(rr)}]);
            }
          }
        }
        const beforeRows=await list(env,sheet),before=beforeRows.find(x=>x.id===id)||null;
        await del(env,sheet,id);await audit(env,a.u,"DELETE",path,id,"ลบข้อมูล "+path,before?{id:before.id,projectId:before.projectId||"",activityId:before.activityId||"",amount:before.amount||"",docNo:before.docNo||""}:{});return json({ok:true});
      }
    }
    return bad("ไม่พบ API",404);
  }catch(e){return bad(e.message||"Server error",500)}
}

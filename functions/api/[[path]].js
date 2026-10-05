const SCHEMA={
  Users:["id","username","passwordHash","role","displayName","status","createdAt"],
  Projects:["id","fiscalYear","code","name","owner","budget","status","createdAt","updatedAt"],
  Activities:["id","projectId","code","name","budget","owner","status","createdAt","updatedAt"],
  Expenses:["id","projectId","activityId","date","docNo","description","category","amount","payee","note","createdBy","createdAt","updatedAt"]
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

async function gtoken(env){
  const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),now=Math.floor(Date.now()/1000);
  const h=b64t(JSON.stringify({alg:"RS256",typ:"JWT"})),c=b64t(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})),input=`${h}.${c}`;
  const key=await crypto.subtle.importKey("pkcs8",pem(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(input));
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${input}.${b64u(sig)}`})}),j=await r.json();
  if(!r.ok)throw new Error(j.error_description||j.error||"Google auth error");return j.access_token;
}
async function gf(env,path,opt={}){
  const t=await gtoken(env),r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}${path}`,{...opt,headers:{authorization:`Bearer ${t}`,"content-type":"application/json",...(opt.headers||{})}}),j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error?.message||`Sheets API ${r.status}`);return j;
}
async function values(env,range){return(await gf(env,`/values/${encodeURIComponent(range)}?majorDimension=ROWS`)).values||[]}
async function put(env,range,vals){return gf(env,`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,{method:"PUT",body:JSON.stringify({values:vals})})}
async function append(env,sheet,obj){const h=SCHEMA[sheet];return gf(env,`/values/${encodeURIComponent(sheet+"!A:"+col(h.length))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,{method:"POST",body:JSON.stringify({values:[h.map(k=>obj[k]??"")]})})}
async function list(env,sheet){const h=SCHEMA[sheet],r=await values(env,`${sheet}!A:${col(h.length)}`);return r.slice(1).filter(x=>x.some(v=>String(v).trim())).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??""])))}
async function update(env,sheet,id,obj){const h=SCHEMA[sheet],r=await values(env,`${sheet}!A:${col(h.length)}`),i=r.findIndex((x,n)=>n>0&&x[0]===id);if(i<1)throw new Error("ไม่พบข้อมูล");const old=Object.fromEntries(h.map((k,j)=>[k,r[i][j]??""])),m={...old,...obj,id};await put(env,`${sheet}!A${i+1}:${col(h.length)}${i+1}`,[h.map(k=>m[k]??"")]);return m}
async function del(env,sheet,id){const meta=await gf(env,"?fields=sheets.properties"),p=(meta.sheets||[]).find(x=>x.properties.title===sheet)?.properties,r=await values(env,`${sheet}!A:A`),i=r.findIndex((x,n)=>n>0&&x[0]===id);if(!p||i<1)throw new Error("ไม่พบข้อมูล");return gf(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:p.sheetId,dimension:"ROWS",startIndex:i,endIndex:i+1}}}]})})}
async function ensure(env){
  const meta=await gf(env,"?fields=sheets.properties.title"),have=new Set((meta.sheets||[]).map(x=>x.properties.title)),req=Object.keys(SCHEMA).filter(x=>!have.has(x)).map(title=>({addSheet:{properties:{title}}}));
  if(req.length)await gf(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:req})});
  for(const [s,h] of Object.entries(SCHEMA)){const r=await values(env,`${s}!1:1`);if(!r.length||r[0][0]!==h[0])await put(env,`${s}!A1:${col(h.length)}1`,[h])}
}
async function hsign(data,secret){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(data)))}
async function token(user,secret){const h=b64t(JSON.stringify({alg:"HS256",typ:"JWT"})),p=b64t(JSON.stringify({...user,exp:Math.floor(Date.now()/1000)+28800})),d=`${h}.${p}`;return`${d}.${b64u(await hsign(d,secret))}`}
async function verify(t,secret){try{const[h,p,s]=t.split("."),k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]),ok=await crypto.subtle.verify("HMAC",k,from64(s),enc.encode(`${h}.${p}`));if(!ok)return null;const u=JSON.parse(new TextDecoder().decode(from64(p)));return u.exp>Math.floor(Date.now()/1000)?u:null}catch{return null}}
async function user(ctx,roles=[]){const a=ctx.request.headers.get("authorization")||"",t=await verify(a.startsWith("Bearer ")?a.slice(7):"",ctx.env.JWT_SECRET);if(!t)return{error:"UNAUTHORIZED"};const us=await list(ctx.env,"Users"),row=us.find(x=>x.id===t.id&&x.status==="active");if(!row)return{error:"UNAUTHORIZED"};const u={id:row.id,username:row.username,role:row.role,displayName:row.displayName};if(roles.length&&!roles.includes(u.role))return{error:"FORBIDDEN",u};return{u}}
const roleStatus=x=>x==="FORBIDDEN"?403:401;

export async function onRequest(ctx){
  try{
    const path=(ctx.params.path||[]).join("/"),method=ctx.request.method,env=ctx.env;

    if(path==="setup"&&method==="POST"){
      const d=await body(ctx.request);if(!env.SETUP_KEY||d.setupKey!==env.SETUP_KEY)return bad("Setup key ไม่ถูกต้อง",403);await ensure(env);
      const us=await list(env,"Users");if(!us.length){if(!env.ADMIN_USERNAME||!env.ADMIN_PASSWORD)return bad("ยังไม่ได้ตั้ง ADMIN_USERNAME / ADMIN_PASSWORD",500);await append(env,"Users",{id:`usr_${crypto.randomUUID()}`,username:env.ADMIN_USERNAME,passwordHash:await sha(`${env.PASSWORD_PEPPER}:${env.ADMIN_PASSWORD}`),role:"admin",displayName:"ผู้ดูแลระบบ",status:"active",createdAt:new Date().toISOString()})}
      return json({ok:true,message:"Setup เรียบร้อย"});
    }

    if(path==="login"&&method==="POST"){
      const d=await body(ctx.request),us=await list(env,"Users"),u=us.find(x=>x.username===d.username&&x.status==="active");if(!u||u.passwordHash!==await sha(`${env.PASSWORD_PEPPER}:${d.password}`))return bad("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",401);
      const safe={id:u.id,username:u.username,role:u.role,displayName:u.displayName};return json({token:await token(safe,env.JWT_SECRET),user:safe});
    }

    if(path==="me"&&method==="GET"){const a=await user(ctx);return a.error?bad("ไม่ได้รับอนุญาต",401):json({user:a.u})}
    if(path==="data"&&method==="GET"){const a=await user(ctx);if(a.error)return bad("ไม่ได้รับอนุญาต",401);const[projects,activities,expenses]=await Promise.all([list(env,"Projects"),list(env,"Activities"),list(env,"Expenses")]);return json({projects,activities,expenses})}

    if(path==="users"){
      const a=await user(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบเท่านั้น":"ไม่ได้รับอนุญาต",roleStatus(a.error));
      const roles=["admin","planner","finance","viewer"],statuses=["active","inactive"];
      if(method==="GET"){
        const us=await list(env,"Users");
        return json({users:us.map(x=>({id:x.id,username:x.username,role:x.role,displayName:x.displayName,status:x.status,createdAt:x.createdAt})).sort((x,y)=>x.username.localeCompare(y.username))});
      }
      if(method==="POST"){
        const d=await body(ctx.request),username=String(d.username||"").trim(),displayName=String(d.displayName||"").trim(),password=String(d.password||""),role=String(d.role||"viewer"),status=String(d.status||"active");
        if(username.length<3)return bad("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
        if(!displayName)return bad("กรุณากรอกชื่อที่แสดง");
        if(password.length<6)return bad("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        if(!roles.includes(role)||!statuses.includes(status))return bad("สิทธิ์หรือสถานะไม่ถูกต้อง");
        const us=await list(env,"Users");if(us.some(x=>x.username.toLowerCase()===username.toLowerCase()))return bad("ชื่อผู้ใช้นี้มีอยู่แล้ว",409);
        const row={id:`usr_${crypto.randomUUID()}`,username,passwordHash:await sha(`${env.PASSWORD_PEPPER}:${password}`),role,displayName,status,createdAt:new Date().toISOString()};
        await append(env,"Users",row);
        return json({ok:true,user:{id:row.id,username:row.username,role:row.role,displayName:row.displayName,status:row.status,createdAt:row.createdAt}},201);
      }
      if(method==="PUT"){
        const d=await body(ctx.request);if(!d.id)return bad("ไม่พบรหัสผู้ใช้งาน");
        const us=await list(env,"Users"),old=us.find(x=>x.id===d.id);if(!old)return bad("ไม่พบผู้ใช้งาน",404);
        const patch={};
        if(d.displayName!==undefined){const v=String(d.displayName||"").trim();if(!v)return bad("ชื่อที่แสดงห้ามว่าง");patch.displayName=v}
        if(d.role!==undefined){if(!roles.includes(d.role))return bad("สิทธิ์ไม่ถูกต้อง");if(d.id===a.u.id&&d.role!=="admin")return bad("ไม่สามารถลดสิทธิ์บัญชีที่กำลังใช้งานอยู่",409);patch.role=d.role}
        if(d.status!==undefined){if(!statuses.includes(d.status))return bad("สถานะไม่ถูกต้อง");if(d.id===a.u.id&&d.status!=="active")return bad("ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่",409);patch.status=d.status}
        if(d.password!==undefined){const p=String(d.password||"");if(p.length<6)return bad("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");patch.passwordHash=await sha(`${env.PASSWORD_PEPPER}:${p}`)}
        if(!Object.keys(patch).length)return bad("ไม่มีข้อมูลที่ต้องแก้ไข");
        const row=await update(env,"Users",d.id,patch);
        return json({ok:true,user:{id:row.id,username:row.username,role:row.role,displayName:row.displayName,status:row.status,createdAt:row.createdAt}});
      }
      return bad("Method not allowed",405);
    }

    const map={projects:"Projects",activities:"Activities",expenses:"Expenses"},sheet=map[path];
    if(sheet){
      if(method==="POST"||method==="PUT"){
        const a=await user(ctx,["admin","planner","finance"]);if(a.error)return bad(a.error==="FORBIDDEN"?"ไม่มีสิทธิ์แก้ไขข้อมูล":"ไม่ได้รับอนุญาต",roleStatus(a.error));
        const d=await body(ctx.request),now=new Date().toISOString();
        const amount=n=>Number(String(n??0).replace(/,/g,""))||0;

        // Server-side budget guard: ป้องกันการแก้ข้อมูลจากหน้าเว็บแล้วทำให้งบติดลบ
        if(sheet==="Projects"){
          const [acts,exps]=await Promise.all([list(env,"Activities"),list(env,"Expenses")]);
          const spent=exps.filter(x=>x.projectId===d.id).reduce((s,x)=>s+amount(x.amount),0);
          const allocated=acts.filter(x=>x.projectId===d.id).reduce((s,x)=>s+amount(x.budget),0);
          if(method==="PUT" && amount(d.budget)<spent)return bad(`งบโครงการต่ำกว่ายอดที่ใช้ไปแล้ว ${spent.toLocaleString("th-TH")} บาท`,409);
          if(method==="PUT" && amount(d.budget)<allocated)return bad(`งบโครงการต่ำกว่างบที่จัดสรรให้กิจกรรมแล้ว ${allocated.toLocaleString("th-TH")} บาท`,409);
        }

        if(sheet==="Activities"){
          const [projects,acts,exps]=await Promise.all([list(env,"Projects"),list(env,"Activities"),list(env,"Expenses")]);
          const prj=projects.find(x=>x.id===d.projectId);if(!prj)return bad("ไม่พบโครงการที่เลือก",409);
          const allocated=acts.filter(x=>x.projectId===d.projectId && x.id!==d.id).reduce((s,x)=>s+amount(x.budget),0)+amount(d.budget);
          if(allocated>amount(prj.budget))return bad(`งบกิจกรรมรวมเกินงบโครงการ ${amount(prj.budget).toLocaleString("th-TH")} บาท`,409);
          if(method==="PUT"){const spent=exps.filter(x=>x.activityId===d.id).reduce((s,x)=>s+amount(x.amount),0);if(amount(d.budget)<spent)return bad(`งบกิจกรรมต่ำกว่ายอดที่ใช้ไปแล้ว ${spent.toLocaleString("th-TH")} บาท`,409)}
        }

        if(sheet==="Expenses"){
          const [projects,acts,exps]=await Promise.all([list(env,"Projects"),list(env,"Activities"),list(env,"Expenses")]);
          const prj=projects.find(x=>x.id===d.projectId);if(!prj)return bad("ไม่พบโครงการที่เลือก",409);
          if(amount(d.amount)<=0)return bad("จำนวนเงินต้องมากกว่า 0");
          const otherProjectSpent=exps.filter(x=>x.projectId===d.projectId && x.id!==d.id).reduce((s,x)=>s+amount(x.amount),0);
          if(otherProjectSpent+amount(d.amount)>amount(prj.budget))return bad(`รายการนี้ทำให้รายจ่ายเกินงบโครงการ เหลืองบ ${Math.max(amount(prj.budget)-otherProjectSpent,0).toLocaleString("th-TH")} บาท`,409);
          if(d.activityId){
            const act=acts.find(x=>x.id===d.activityId);if(!act||act.projectId!==d.projectId)return bad("กิจกรรมไม่ตรงกับโครงการ",409);
            const otherActivitySpent=exps.filter(x=>x.activityId===d.activityId && x.id!==d.id).reduce((s,x)=>s+amount(x.amount),0);
            if(otherActivitySpent+amount(d.amount)>amount(act.budget))return bad(`รายการนี้ทำให้รายจ่ายเกินงบกิจกรรม เหลืองบ ${Math.max(amount(act.budget)-otherActivitySpent,0).toLocaleString("th-TH")} บาท`,409);
          }
        }

        if(method==="POST"){const row={...d,createdAt:now,updatedAt:now,...(sheet==="Expenses"?{createdBy:a.u.username}:{})};await append(env,sheet,row);return json({ok:true,row},201)}
        if(!d.id)return bad("ไม่พบรหัสข้อมูล");const row=await update(env,sheet,d.id,{...d,updatedAt:now,...(sheet==="Expenses"?{createdBy:a.u.username}:{})});return json({ok:true,row});
      }
      if(method==="DELETE"){
        const a=await user(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบเท่านั้น":"ไม่ได้รับอนุญาต",roleStatus(a.error));
        const id=new URL(ctx.request.url).searchParams.get("id");if(!id)return bad("ไม่พบรหัสข้อมูล");
        if(sheet==="Projects"){const[as,es]=await Promise.all([list(env,"Activities"),list(env,"Expenses")]);if(as.some(x=>x.projectId===id)||es.some(x=>x.projectId===id))return bad("โครงการนี้มีข้อมูลกิจกรรมหรือรายจ่ายอยู่",409)}
        if(sheet==="Activities"){const es=await list(env,"Expenses");if(es.some(x=>x.activityId===id))return bad("กิจกรรมนี้มีรายจ่ายอยู่",409)}
        await del(env,sheet,id);return json({ok:true});
      }
    }
    return bad("ไม่พบ API",404);
  }catch(e){return bad(e.message||"Server error",500)}
}

const state={token:sessionStorage.getItem("budget_token")||"",user:null,data:{projects:[],activities:[],expenses:[]},route:"dashboard",fiscalYear:"",charts:{},integrityReady:false,integrityReport:null};
const $=(s,e=document)=>e.querySelector(s), $$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const num=n=>Number(String(n??0).replace(/,/g,""))||0;
const money=n=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB"}).format(num(n));
const uid=p=>`${p}_${crypto.randomUUID()}`, today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}, currentFiscalYear=()=>String(new Date().getFullYear()+543+(new Date().getMonth()>=9?1:0));
const ROLE_LABELS={admin:"ผู้ดูแลระบบ",planner:"งานแผน",teacher:"ครูผู้รับผิดชอบโครงการ",procurement:"เจ้าหน้าที่พัสดุ",finance:"การเงิน",viewer:"ผู้ดูข้อมูล"};
const userRoles=u=>Array.isArray(u?.roles)&&u.roles.length?u.roles:(u?.role?[u.role]:[]);
const hasRole=(role,u=state.user)=>userRoles(u).includes(role);
const hasAnyRole=(roles,u=state.user)=>roles.some(role=>hasRole(role,u));
const canPlanEdit=()=>hasAnyRole(["admin","planner"]), canFinanceEdit=()=>hasAnyRole(["admin","finance"]), canAdmin=()=>hasRole("admin");

const busyTasks=new Map();let busySeq=0;
function requestStatusLabel(path,method="GET"){
  const m=String(method||"GET").toUpperCase(),p=String(path||"");
  if(p.includes("/login"))return"กำลังเข้าสู่ระบบ...";
  if(p.includes("/import-projects"))return"กำลังนำเข้าข้อมูล...";
  if(p.includes("/data-health"))return m==="GET"?"กำลังตรวจสุขภาพข้อมูล...":"กำลังซ่อมข้อมูล...";
  if(p.includes("/data-integrity"))return"กำลังตรวจสอบข้อมูล...";
  if(p.includes("/audit-log"))return"กำลังโหลดประวัติ...";
  if(p.includes("/settings"))return m==="GET"?"กำลังโหลดการตั้งค่า...":"กำลังบันทึกการตั้งค่า...";
  if(p.includes("/users"))return m==="GET"?"กำลังโหลดผู้ใช้งาน...":"กำลังบันทึกผู้ใช้งาน...";
  if(p.includes("/requests")){
    if(m==="DELETE")return"กำลังลบคำขอ...";
    if(m==="GET")return"กำลังโหลดคำขอ...";
    return"กำลังอัปเดตคำขอ...";
  }
  if(p.includes("/expenses"))return m==="GET"?"กำลังโหลดรายจ่าย...":m==="DELETE"?"กำลังลบรายจ่าย...":"กำลังบันทึกรายจ่าย...";
  if(p.includes("/projects"))return m==="DELETE"?"กำลังลบโครงการ...":"กำลังบันทึกโครงการ...";
  if(p.includes("/activities"))return m==="DELETE"?"กำลังลบกิจกรรม...":"กำลังบันทึกกิจกรรม...";
  if(p.includes("/data"))return"กำลังโหลดข้อมูล...";
  return m==="GET"?"กำลังโหลด...":"กำลังประมวลผล...";
}
function updateAppStatus(){
  const el=$("#appStatus"),txt=$("#appStatusText");if(!el||!txt)return;
  const active=[...busyTasks.values()],busy=active.length>0;
  el.classList.toggle("busy",busy);el.classList.toggle("ready",!busy);
  txt.textContent=busy?(active[active.length-1]||"กำลังประมวลผล..."):"พร้อมใช้งาน";
  document.body.classList.toggle("app-busy",busy);
}
function beginBusy(label){const id=++busySeq;busyTasks.set(id,label);updateAppStatus();return id}
function endBusy(id){busyTasks.delete(id);updateAppStatus()}
async function api(path,opt={}){
  const method=String(opt.method||"GET").toUpperCase(),busyId=beginBusy(requestStatusLabel(path,method));
  try{
    const headers={"content-type":"application/json",...(opt.headers||{})};
    if(state.token)headers.authorization=`Bearer ${state.token}`;
    const r=await fetch(path,{...opt,headers}),j=await r.json().catch(()=>({}));
    if(r.status===401){logout(false);throw new Error(j.error||"กรุณาเข้าสู่ระบบใหม่")}
    if(!r.ok)throw new Error(j.error||"เกิดข้อผิดพลาด");
    return j;
  }finally{endBusy(busyId)}
}
const err=e=>Swal.fire({icon:"error",title:"ไม่สำเร็จ",text:e.message||String(e),confirmButtonColor:"#0f766e"});

function applyBrand(settings={}){
  const schoolName=settings.schoolName||"โรงเรียนสามัคคีศึกษา",systemTitle=settings.systemTitle||"ระบบบริหารจัดการงบประมาณ",logo=settings.schoolLogo||"";
  if($("#loginSchoolName"))$("#loginSchoolName").textContent=schoolName;
  if($("#loginSystemTitle"))$("#loginSystemTitle").textContent=systemTitle;
  if($("#sidebarSchoolName"))$("#sidebarSchoolName").textContent=schoolName;
  for(const id of ["loginBrandMark","appBrandMark"]){
    const el=$("#"+id);if(!el)continue;
    if(logo){
      const current=el.querySelector("img")?.getAttribute("src")||"";
      if(current!==logo)el.innerHTML=`<img src="${logo}" alt="ตราโรงเรียน" decoding="async" fetchpriority="${id==="loginBrandMark"?"high":"auto"}">`;
      el.classList.add("logo-ready");
    }else{
      el.innerHTML='<i data-lucide="landmark"></i>';el.classList.remove("logo-ready");
    }
  }
  document.title=systemTitle+" | "+schoolName;
  lucide.createIcons();
}
const BRAND_CACHE_KEY="budget_public_brand_v1";
function readBrandCache(){
  try{const x=JSON.parse(localStorage.getItem(BRAND_CACHE_KEY)||"null");return x&&typeof x==="object"?x:null}catch{return null}
}
function writeBrandCache(settings){
  try{localStorage.setItem(BRAND_CACHE_KEY,JSON.stringify(settings||{}))}catch{}
}
async function loadPublicBrand(){
  const cached=readBrandCache();if(cached)applyBrand(cached);
  try{
    const x=await api("/api/settings?public=1&_="+Date.now()),settings=x.settings||{};
    applyBrand(settings);writeBrandCache(settings);
  }catch{}
}
async function resizeSchoolLogo(file,maxSide=280,quality=.82){
  if(!file||!String(file.type||"").startsWith("image/"))throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  if(file.size>5*1024*1024)throw new Error("ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB");
  const src=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error("ไม่สามารถอ่านไฟล์รูปได้"));x.src=src});
    const scale=Math.min(1,maxSide/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    canvas.getContext("2d").drawImage(img,0,0,w,h);
    let data=canvas.toDataURL("image/webp",quality);
    if(data.length>45000){
      const s=Math.min(1,220/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*s));canvas.height=Math.max(1,Math.round(img.height*s));canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);data=canvas.toDataURL("image/webp",.72);
    }
    if(data.length>45000)throw new Error("ตราโรงเรียนยังมีขนาดใหญ่เกินไป กรุณาใช้รูปที่รายละเอียดน้อยลง");
    return data;
  }finally{URL.revokeObjectURL(src)}
}

async function init(){
  const cachedBrand=readBrandCache();if(cachedBrand)applyBrand(cachedBrand);
  lucide.createIcons();
  $("#loginForm").onsubmit=login; $("#logoutBtn").onclick=()=>logout(true); $("#refreshBtn").onclick=refreshData;
  $("#togglePassword").onclick=()=>{
    const input=$("#password"),show=input.type==="password";input.type=show?"text":"password";
    $("#togglePassword").innerHTML=`<i data-lucide="${show?"eye-off":"eye"}"></i>`;
    $("#togglePassword").setAttribute("aria-label",show?"ซ่อนรหัสผ่าน":"แสดงรหัสผ่าน");lucide.createIcons();
  };
  $("#fiscalYearFilter").onchange=e=>{state.fiscalYear=e.target.value;updateWorkflowBadges();render()};
  $("#mainNav").onclick=e=>{const b=e.target.closest("[data-route]");if(!b)return;state.route=b.dataset.route;Array.from($("#mainNav").querySelectorAll(".nav-item")).forEach(x=>x.classList.toggle("active",x===b));render()};
  loadPublicBrand();
  if(state.token){try{state.user=(await api("/api/me")).user;showApp();await refreshData()}catch{showLogin()}}else showLogin();
}
function setLoginLoading(active,text="กำลังเข้าสู่ระบบ..."){
  const notice=$("#loginNotice"),noticeText=$("#loginNoticeText"),btn=$("#loginSubmitBtn");
  if(notice){notice.classList.toggle("hidden",!active);notice.classList.toggle("is-error",false)}
  if(noticeText)noticeText.textContent=text;
  if(btn){btn.disabled=active;btn.classList.toggle("is-loading",active);btn.innerHTML=active?'<span class="login-spinner small"></span><span>กำลังเข้าสู่ระบบ...</span>':'<i data-lucide="log-in"></i><span>เข้าสู่ระบบ</span>'}
  if(active){$("#username").readOnly=true;$("#password").readOnly=true}else{$("#username").readOnly=false;$("#password").readOnly=false}
  lucide.createIcons();
}
function showLoginError(message){
  const notice=$("#loginNotice"),noticeText=$("#loginNoticeText");
  if(!notice||!noticeText)return;
  notice.classList.remove("hidden");notice.classList.add("is-error");
  noticeText.textContent=message||"เข้าสู่ระบบไม่สำเร็จ";
}
function resetLoginUi(){
  const notice=$("#loginNotice"),noticeText=$("#loginNoticeText"),btn=$("#loginSubmitBtn"),user=$("#username"),pass=$("#password"),toggle=$("#togglePassword");
  if(notice){notice.classList.add("hidden");notice.classList.remove("is-error")}
  if(noticeText)noticeText.textContent="กำลังเข้าสู่ระบบ...";
  if(btn){btn.disabled=false;btn.classList.remove("is-loading");btn.innerHTML='<i data-lucide="log-in"></i><span>เข้าสู่ระบบ</span>'}
  if(user)user.readOnly=false;
  if(pass){pass.readOnly=false;pass.type="password";pass.value=""}
  if(toggle){toggle.innerHTML='<i data-lucide="eye"></i>';toggle.setAttribute("aria-label","แสดงรหัสผ่าน")}
  lucide.createIcons();
}
async function login(e){
  e.preventDefault();
  const username=$("#username").value.trim(),password=$("#password").value;
  if(!username||!password)return showLoginError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
  setLoginLoading(true);
  try{
    const x=await api("/api/login",{method:"POST",body:JSON.stringify({username,password})});
    state.token=x.token;state.user=x.user;sessionStorage.setItem("budget_token",x.token);
    if($("#loginNoticeText"))$("#loginNoticeText").textContent="เข้าสู่ระบบสำเร็จ กำลังโหลดข้อมูล...";
    showApp();await refreshData();
  }catch(ex){
    setLoginLoading(false);showLoginError(ex.message||"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }finally{
    if(!state.user)setLoginLoading(false);
  }
}
function logout(show=true){
  sessionStorage.removeItem("budget_token");
  state.token="";state.user=null;state.integrityReady=false;state.integrityReport=null;state.route="dashboard";state.fiscalYear="";
  state.data={projects:[],activities:[],expenses:[],projectMeta:[],activityFunds:[],requests:[]};
  busyTasks.clear();updateAppStatus();resetLoginUi();showLogin();
  if(show){Swal.close();Swal.fire({icon:"success",title:"ออกจากระบบแล้ว",timer:900,showConfirmButton:false})}
}
function showLogin(){$("#loginView").classList.remove("hidden");$("#appView").classList.add("hidden");resetLoginUi()}
function showApp(){$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");const roles=userRoles(state.user);$("#userBox").innerHTML=`<strong>${esc(state.user.displayName)}</strong><span>${roles.map(r=>ROLE_LABELS[r]||r).join(" • ")}</span>`;$("#usersNav")?.classList.toggle("hidden",!hasRole("admin"));$("#settingsNav")?.classList.toggle("hidden",!hasRole("admin"));$("#healthNav")?.classList.toggle("hidden",!hasRole("admin"));$("#auditNav")?.classList.toggle("hidden",!hasRole("admin"));$("#importNav")?.classList.toggle("hidden",!hasAnyRole(["admin","planner"]));$("#requestsNav")?.classList.toggle("hidden",!hasAnyRole(["admin","planner","teacher","procurement","finance"]));$("#procurementNav")?.classList.toggle("hidden",!hasAnyRole(["admin","procurement"]));$("#financeNav")?.classList.toggle("hidden",!hasAnyRole(["admin","finance"]));lucide.createIcons()}
function setNavBadge(id,count,label){
  const el=$("#"+id);if(!el)return;
  const n=Math.max(0,Number(count)||0);
  el.textContent=n>99?"99+":String(n);
  el.classList.toggle("hidden",n===0);
  if(label)el.setAttribute("aria-label",label+" "+n+" รายการ");
}
function normalizePersonLite(value){
  return String(value||"").toLowerCase().replace(/\s+/g,"").replace(/^(นาย|นางสาว|นาง|ครู|ดร\.?|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี)/,"");
}
function updateWorkflowBadges(){
  const rows=state.data.requests||[],projects=state.data.projects||[];
  const projectById=Object.fromEntries(projects.map(p=>[p.id,p]));
  const selectedYear=String(state.fiscalYear||"");
  const inYear=r=>!selectedYear||String(r.fiscalYear||projectById[r.projectId]?.fiscalYear||"")===selectedYear;
  const meId=String(state.user?.id||""),meUser=String(state.user?.username||""),meName=normalizePersonLite(state.user?.displayName);
  const mine=r=>{
    if(hasRole("admin"))return true;
    if(String(r.requesterUserId||"")===meId)return true;
    if(meUser&&String(r.requesterUsername||"")===meUser)return true;
    if(meName&&normalizePersonLite(r.requesterName)===meName)return true;
    const p=projectById[r.projectId],owner=normalizePersonLite(p?.owner);
    return hasRole("teacher")&&meName&&owner&&(owner.includes(meName)||meName.includes(owner));
  };
  const returned=rows.filter(r=>inYear(r)&&String(r.status||"").trim()==="returned"&&mine(r)).length;
  const procurement=rows.filter(r=>inYear(r)&&["submitted","procurement"].includes(String(r.status||"").trim())).length;
  const finance=rows.filter(r=>inYear(r)&&String(r.status||"").trim()==="finance").length;
  setNavBadge("requestsBadge",returned,"คำขอที่ถูกส่งกลับแก้ไข");
  setNavBadge("procurementBadge",hasAnyRole(["admin","procurement"])?procurement:0,"รายการงานพัสดุที่รอดำเนินการ");
  setNavBadge("financeBadge",hasAnyRole(["admin","finance"])?finance:0,"รายการที่รอการเงิน");
  const rq=$("#requestsNav"),pn=$("#procurementNav"),fn=$("#financeNav");
  if(rq)rq.title=returned?"มี "+returned+" รายการถูกส่งกลับแก้ไข":"ขอเบิกเงิน";
  if(pn)pn.title=procurement?"มี "+procurement+" รายการรอดำเนินการ":"งานพัสดุ";
  if(fn)fn.title=finance?"มี "+finance+" รายการรอจ่าย":"รอจ่ายเงิน";
}
async function refreshData(){try{state.data=await api("/api/data");years();updateWorkflowBadges();render()}catch(e){err(e)}}
function years(){const ys=[...new Set(state.data.projects.map(x=>x.fiscalYear).filter(Boolean))].sort().reverse();$("#fiscalYearFilter").innerHTML=`<option value="">ทุกปีงบประมาณ</option>`+ys.map(y=>`<option ${y===state.fiscalYear?"selected":""}>${esc(y)}</option>`).join("")}
function filtered(){const projects=state.fiscalYear?state.data.projects.filter(p=>p.fiscalYear===state.fiscalYear):state.data.projects,ids=new Set(projects.map(p=>p.id));const activities=state.data.activities.filter(a=>ids.has(a.projectId)),aids=new Set(activities.map(a=>a.id));const expenses=state.data.expenses.filter(e=>ids.has(e.projectId)&&(!e.activityId||aids.has(e.activityId)));return{projects,activities,expenses}}
function pstat(p,exps=state.data.expenses){const spent=exps.filter(e=>e.projectId===p.id).reduce((s,e)=>s+num(e.amount),0);return{budget:num(p.budget),spent,balance:num(p.budget)-spent}}
function astat(a,exps=state.data.expenses){const spent=exps.filter(e=>e.activityId===a.id).reduce((s,e)=>s+num(e.amount),0);return{budget:num(a.budget),spent,balance:num(a.budget)-spent}}
function destroy(){Object.values(state.charts).forEach(c=>c?.destroy());state.charts={}}
function render(){destroy();$("#pageTitle").textContent=({dashboard:"ภาพรวม",projects:"โครงการ",activities:"กิจกรรม",import:"นำเข้าโครงการ",requests:"ขอเบิกเงิน",procurement:"งานพัสดุ",financeQueue:"รอจ่ายเงิน",expenses:"รายจ่าย",reports:"รายงาน",users:"จัดการผู้ใช้งาน",settings:"ตั้งค่าระบบ",health:"ตรวจสุขภาพข้อมูล",audit:"ประวัติการใช้งาน"})[state.route];const fn=({dashboard,projects,activities,import:importProjects,requests,procurement:procurementQueue,financeQueue,expenses,reports,users,settings:systemSettings,health:dataHealth,audit:auditLog})[state.route]||dashboard;fn();lucide.createIcons()}

function dashboard(){
  const {projects,activities,expenses}=filtered();
  const projectIds=new Set(projects.map(p=>p.id)),activityIds=new Set(activities.map(a=>a.id));
  const metas=(state.data.projectMeta||[]).filter(x=>projectIds.has(x.projectId));
  const funds=(state.data.activityFunds||[]).filter(x=>activityIds.has(x.activityId));
  const requests=(state.data.requests||[]).filter(x=>projectIds.has(x.projectId));
  const pendingStatuses=new Set(["submitted","procurement","finance"]);
  const budget=projects.reduce((s,p)=>s+num(p.budget),0);
  const spent=expenses.reduce((s,e)=>s+num(e.amount),0);
  const reserved=requests.filter(r=>pendingStatuses.has(r.status)).reduce((s,r)=>s+num(r.totalAmount),0);
  const available=budget-spent-reserved,pct=budget?spent/budget*100:0;
  const rows=projects.map(p=>({...p,...pstat(p,expenses)})).sort((a,b)=>(b.budget?b.spent/b.budget:0)-(a.budget?a.spent/a.budget:0));

  const fundLabels={subsidy:"งบเงินอุดหนุน",activity:"งบกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่น ๆ"};
  const fundOrder=["subsidy","activity","income","other"];
  const requestById=Object.fromEntries(requests.map(r=>[r.id,r])),requestByNo=Object.fromEntries(requests.map(r=>[r.requestNo,r]));
  const expenseFund=e=>{
    if(e.fundType)return e.fundType;
    if(e.requestId&&requestById[e.requestId])return requestById[e.requestId].fundType||"";
    const no=(String(e.note||"").match(/REQ-\d{4}-\d{4}/)||String(e.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0];
    return no&&requestByNo[no]?requestByNo[no].fundType||"":"";
  };
  const unclassifiedExpenses=expenses.filter(e=>!expenseFund(e)).length;
  const fundRows=fundOrder.map(type=>{
    const fb=funds.filter(f=>f.fundType===type).reduce((s,f)=>s+num(f.budget),0);
    const paid=expenses.filter(e=>expenseFund(e)===type).reduce((s,e)=>s+num(e.amount),0);
    const hold=requests.filter(r=>r.fundType===type&&pendingStatuses.has(r.status)).reduce((s,r)=>s+num(r.totalAmount),0);
    return{type,label:fundLabels[type],budget:fb,paid,reserved:hold,available:fb-paid-hold};
  });

  const metaMap=Object.fromEntries(metas.map(x=>[x.projectId,x.division||"ไม่ระบุฝ่าย"]));
  const divisions=[...new Set(projects.map(p=>metaMap[p.id]||"ไม่ระบุฝ่าย"))];
  const needsImportRepair=funds.reduce((s,f)=>s+num(f.budget),0)===0||(!metas.length&&projects.length>0);
  const activityProject=Object.fromEntries(activities.map(a=>[a.id,a.projectId]));
  const divisionRows=divisions.map(division=>{
    const ps=projects.filter(p=>(metaMap[p.id]||"ไม่ระบุฝ่าย")===division),ids=new Set(ps.map(p=>p.id));
    const db=ps.reduce((s,p)=>s+num(p.budget),0);
    const ds=expenses.filter(e=>ids.has(e.projectId)).reduce((s,e)=>s+num(e.amount),0);
    const dr=requests.filter(r=>ids.has(r.projectId)&&pendingStatuses.has(r.status)).reduce((s,r)=>s+num(r.totalAmount),0);
    const byFund=fundOrder.map(type=>{
      const fb=funds.filter(f=>f.fundType===type&&ids.has(activityProject[f.activityId])).reduce((s,f)=>s+num(f.budget),0);
      const paid=expenses.filter(e=>ids.has(e.projectId)&&expenseFund(e)===type).reduce((s,e)=>s+num(e.amount),0);
      const hold=requests.filter(r=>ids.has(r.projectId)&&r.fundType===type&&pendingStatuses.has(r.status)).reduce((s,r)=>s+num(r.totalAmount),0);
      return{type,label:fundLabels[type],budget:fb,paid,reserved:hold,available:fb-paid-hold};
    });
    return{division,budget:db,spent:ds,reserved:dr,available:db-ds-dr,byFund};
  }).sort((a,b)=>b.budget-a.budget);

  $("#content").innerHTML=`${unclassifiedExpenses&&hasRole("admin")?`<section class="panel" style="border-color:#f59e0b;background:#fffbeb"><strong>มีรายจ่าย ${unclassifiedExpenses} รายการที่ยังไม่ระบุประเภทเงิน</strong><p class="muted" style="margin:3px 0 0">กรุณาเปิดหน้า “รายจ่าย” แล้วแก้ไขรายการเก่าเพื่อเลือกประเภทเงิน ระบบจะนำยอดไปคำนวณแยกประเภทเงินให้ถูกต้อง</p></section>`:""}${needsImportRepair&&projects.length?`<section class="panel" style="border-color:#f59e0b;background:#fffbeb"><div class="toolbar" style="margin:0"><div><strong>ข้อมูลประเภทเงิน/ฝ่ายยังไม่ครบ</strong><p class="muted" style="margin:3px 0 0">โครงการถูกนำเข้าแล้ว แต่ข้อมูลแยกประเภทเงินหรือฝ่ายยังไม่ได้ผูกกับโครงการเดิม กรุณานำเข้าไฟล์ Excel ต้นแบบเดิมอีกครั้ง ระบบจะอัปเดตข้อมูลเดิม ไม่สร้างโครงการซ้ำ</p></div><button id="repairImportBtn" class="btn btn-primary"><i data-lucide="file-up"></i>นำเข้าเพื่อซ่อมข้อมูล</button></div></section>`:""}<section class="stats-grid">
    ${[
      ["wallet-cards","งบประมาณทั้งหมด",money(budget)],
      ["badge-dollar-sign","จ่ายจริงแล้ว",money(spent)],
      ["clock-3","รอเบิก / ผูกพัน",money(reserved)],
      ["piggy-bank","พร้อมใช้",money(available)]
    ].map(x=>`<article class="stat-card"><span class="stat-icon"><i data-lucide="${x[0]}"></i></span><div><small>${x[1]}</small><strong>${x[2]}</strong></div></article>`).join("")}
  </section>

  <section class="grid-2">
    <article class="panel"><div class="panel-head"><div><h3>งบประมาณเทียบรายจ่าย</h3><p class="muted">แยกตามโครงการ</p></div></div><div class="chart-wrap"><canvas id="projectChart"></canvas></div></article>
    <article class="panel"><div class="panel-head"><div><h3>สัดส่วนการใช้จ่าย</h3><p class="muted">จ่ายจริง ${pct.toFixed(1)}% ของงบทั้งหมด</p></div></div><div class="chart-wrap"><canvas id="usageChart"></canvas></div></article>
  </section>

  <section class="grid-2">
    <article class="panel">
      <div class="panel-head"><div><h3>แยกตามประเภทเงิน</h3><p class="muted">ยอดจ่ายแล้วอ้างอิงรายการรายจ่ายจริงทั้งจากคำขอเบิกและรายการที่บันทึกโดยตรง</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>ประเภทเงิน</th><th class="num">งบ</th><th class="num">จ่ายแล้ว</th><th class="num">รอเบิก</th><th class="num">พร้อมใช้</th></tr></thead><tbody>
        ${fundRows.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td class="num">${money(x.budget)}</td><td class="num">${money(x.paid)}</td><td class="num">${money(x.reserved)}</td><td class="num ${x.available<0?"negative":""}"><strong>${money(x.available)}</strong></td></tr>`).join("")}
      </tbody></table></div>
    </article>
    <article class="panel"><div class="panel-head"><div><h3>สัดส่วนงบตามประเภทเงิน</h3><p class="muted">งบดำเนินงานที่นำเข้าจากกิจกรรม</p></div></div><div class="chart-wrap"><canvas id="fundChart"></canvas></div></article>
  </section>

  <section class="grid-2">
    <article class="panel">
      <div class="panel-head"><div><h3>แยกตามฝ่ายและประเภทเงิน</h3><p class="muted">แต่ละฝ่ายแสดงยอดรวม และรายละเอียดงบแต่ละประเภทเงิน</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>ฝ่าย / ประเภทเงิน</th><th class="num">งบ</th><th class="num">จ่ายแล้ว</th><th class="num">รอเบิก</th><th class="num">พร้อมใช้</th></tr></thead><tbody>
        ${divisionRows.length?divisionRows.map(x=>`
          <tr style="background:#f8fafc">
            <td><strong>${esc(x.division)}</strong></td>
            <td class="num"><strong>${money(x.budget)}</strong></td>
            <td class="num"><strong>${money(x.spent)}</strong></td>
            <td class="num"><strong>${money(x.reserved)}</strong></td>
            <td class="num ${x.available<0?"negative":""}"><strong>${money(x.available)}</strong></td>
          </tr>
          ${x.byFund.map(f=>`<tr>
            <td><span style="display:inline-block;padding-left:22px">↳ ${esc(f.label)}</span></td>
            <td class="num">${money(f.budget)}</td>
            <td class="num">${money(f.paid)}</td>
            <td class="num">${money(f.reserved)}</td>
            <td class="num ${f.available<0?"negative":""}">${money(f.available)}</td>
          </tr>`).join("")}
        `).join(""):'<tr><td colspan="5" class="empty">ยังไม่มีข้อมูลฝ่าย</td></tr>'}
      </tbody></table></div>
    </article>
    <article class="panel"><div class="panel-head"><div><h3>โครงสร้างงบของแต่ละฝ่าย</h3><p class="muted">แยกประเภทเงินภายในแต่ละฝ่าย</p></div></div><div class="chart-wrap"><canvas id="divisionChart"></canvas></div></article>
  </section>

  <section class="panel"><div class="panel-head"><div><h3>สถานะงบประมาณรายโครงการ</h3></div></div><div class="table-wrap"><table><thead><tr><th>โครงการ</th><th>ผู้รับผิดชอบ</th><th class="num">งบ</th><th class="num">ใช้ไป</th><th class="num">คงเหลือ</th><th>ความคืบหน้า</th></tr></thead><tbody>
    ${rows.length?rows.map(p=>{const pc=p.budget?p.spent/p.budget*100:0;return`<tr><td><strong>${esc(p.code)}</strong><br>${esc(p.name)}</td><td>${esc(p.owner)}</td><td class="num">${money(p.budget)}</td><td class="num">${money(p.spent)}</td><td class="num ${p.balance<0?"negative":""}">${money(p.balance)}</td><td><div class="progress"><div class="progress-track"><div class="progress-bar" style="width:${Math.min(pc,100)}%"></div></div><span>${pc.toFixed(0)}%</span></div></td></tr>`}).join(""):`<tr><td colspan="6" class="empty">ยังไม่มีข้อมูลโครงการ</td></tr>`}
  </tbody></table></div></section>`;

  if($("#repairImportBtn"))$("#repairImportBtn").onclick=()=>{state.route="import";$$(".nav-item",$("#mainNav")).forEach(x=>x.classList.toggle("active",x.dataset.route==="import"));render()};
  state.charts.p=new Chart($("#projectChart"),{type:"bar",data:{labels:rows.slice(0,10).map(x=>x.code||x.name),datasets:[{label:"งบประมาณ",data:rows.slice(0,10).map(x=>x.budget),backgroundColor:"rgba(15,118,110,.72)",borderRadius:6},{label:"รายจ่าย",data:rows.slice(0,10).map(x=>x.spent),backgroundColor:"rgba(217,119,6,.72)",borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});
  state.charts.u=new Chart($("#usageChart"),{type:"doughnut",data:{labels:["จ่ายจริง","รอเบิก","พร้อมใช้"],datasets:[{data:[spent,Math.max(reserved,0),Math.max(available,0)],backgroundColor:["#0f766e","#f59e0b","#dbeafe"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"68%",plugins:{legend:{position:"bottom"}}}});
  state.charts.f=new Chart($("#fundChart"),{type:"doughnut",data:{labels:fundRows.map(x=>x.label),datasets:[{data:fundRows.map(x=>x.budget),backgroundColor:["#0f766e","#2563eb","#d97706","#7c3aed"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"bottom"}}}});
  state.charts.d=new Chart($("#divisionChart"),{type:"bar",data:{labels:divisionRows.map(x=>x.division),datasets:fundOrder.map((type,i)=>({label:fundLabels[type],data:divisionRows.map(x=>x.byFund.find(f=>f.type===type)?.budget||0),backgroundColor:["rgba(15,118,110,.76)","rgba(37,99,235,.76)","rgba(217,119,6,.76)","rgba(124,58,237,.76)"][i],borderRadius:4}))},options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}},plugins:{legend:{position:"bottom"}}}});
}
function panel(head,button,cols,allowAdd=false){return`<section class="panel"><div class="toolbar"><input id="search" class="search" placeholder="ค้นหา...">${allowAdd?`<button id="addBtn" class="btn btn-primary"><i data-lucide="plus"></i>${button}</button>`:""}</div><div class="table-wrap"><table><thead><tr>${cols}</tr></thead><tbody id="rows"></tbody></table></div></section>`}
function projects(){
  const {projects:ps,activities:as,expenses:ex}=filtered();
  const projectIds=new Set(ps.map(p=>p.id));
  const metaMap=Object.fromEntries((state.data.projectMeta||[]).filter(x=>projectIds.has(x.projectId)).map(x=>[x.projectId,x.division||"ไม่ระบุฝ่าย"]));
  const allDivisions=[...new Set(ps.map(p=>metaMap[p.id]||"ไม่ระบุฝ่าย"))];
  let activeDivision=allDivisions[0]||"";
  const openActivities=new Set();
  const divisionTone=division=>{
    const d=String(division||"");
    if(d.includes("วิชาการ"))return "tone-academic";
    if(d.includes("งบประมาณ"))return "tone-budget";
    if(d.includes("บุคคล"))return "tone-personnel";
    if(d.includes("กิจการนักเรียน"))return "tone-student";
    if(d.includes("บริหารทั่วไป"))return "tone-general";
    return "tone-default";
  };
  $("#content").innerHTML=`<section class="panel">
    <div class="toolbar">
      <input id="search" class="search" placeholder="ค้นหาโครงการ กิจกรรม หรือผู้รับผิดชอบ">
      ${canPlanEdit()?'<button id="addBtn" class="btn btn-primary"><i data-lucide="plus"></i>เพิ่มโครงการ</button>':""}
    </div>
    <div id="divisionTabs" class="division-tabs"></div>
    <div id="projectGroups"></div>
  </section>`;
  if(canPlanEdit())$("#addBtn").onclick=()=>projectForm();

  const paintTabs=()=>{
    $("#divisionTabs").innerHTML=allDivisions.length?allDivisions.map(division=>{
      const count=ps.filter(p=>(metaMap[p.id]||"ไม่ระบุฝ่าย")===division).length;
      return `<button class="division-tab ${division===activeDivision?"active":""}" data-division="${esc(division)}"><span>${esc(division)}</span><small>${count}</small></button>`;
    }).join(""):'';
    $$(".division-tab").forEach(b=>b.onclick=()=>{activeDivision=b.dataset.division;paintTabs();paintProjects()});
  };

  const paintProjects=()=>{
    const q=$("#search").value.toLowerCase();
    const dProjects=ps.filter(p=>{
      if((metaMap[p.id]||"ไม่ระบุฝ่าย")!==activeDivision)return false;
      const acts=as.filter(a=>a.projectId===p.id);
      return `${p.code} ${p.name} ${p.owner} ${acts.map(a=>`${a.code} ${a.name} ${a.owner}`).join(" ")}`.toLowerCase().includes(q);
    });
    const dBudget=dProjects.reduce((s,p)=>s+num(p.budget),0);
    const dIds=new Set(dProjects.map(p=>p.id));
    const dSpent=ex.filter(e=>dIds.has(e.projectId)).reduce((s,e)=>s+num(e.amount),0);

    $("#projectGroups").innerHTML=dProjects.length?`<section class="division-tab-content">
      <div class="division-head">
        <div><div class="division-title"><i data-lucide="building-2"></i><strong>${esc(activeDivision)}</strong></div><small>${dProjects.length} โครงการ</small></div>
        <div class="division-totals"><span>งบ <strong>${money(dBudget)}</strong></span><span>ใช้ไป <strong>${money(dSpent)}</strong></span><span>คงเหลือ <strong>${money(dBudget-dSpent)}</strong></span></div>
      </div>
      <div class="project-stack">
        ${dProjects.map(p=>{
          const s=pstat(p,ex),acts=as.filter(a=>a.projectId===p.id);
          return `<article class="project-box ${divisionTone(activeDivision)}">
            <div class="project-box-head">
              <div class="project-main">
                <div class="project-code">${esc(p.code)}</div>
                <div class="project-name-wrap"><h4>${esc(p.name)}</h4><p>ผู้รับผิดชอบ: ${esc(p.owner||"-")}</p></div>
              </div>
              <div class="project-summary">
                <span>งบ <strong>${money(s.budget)}</strong></span>
                <span>ใช้ไป <strong>${money(s.spent)}</strong></span>
                <span>คงเหลือ <strong class="${s.balance<0?"negative":""}">${money(s.balance)}</strong></span>
                <span class="badge ${p.status==="ปิดโครงการ"?"gray":""}">${esc(p.status||"ดำเนินการ")}</span>
                <div class="actions">
                  ${canPlanEdit()?`<button class="icon-btn" data-add-activity="${p.id}" title="เพิ่มกิจกรรม"><i data-lucide="list-plus"></i></button><button class="icon-btn" data-pe="${p.id}" title="แก้ไขโครงการ"><i data-lucide="pencil"></i></button>`:""}
                  ${canAdmin()?`<button class="icon-btn" data-pd="${p.id}" title="ลบโครงการ"><i data-lucide="trash-2"></i></button>`:""}
                </div>
              </div>
            </div>
            <div class="activity-block">
              <button type="button" class="activity-toggle" data-toggle-activities="${p.id}" aria-expanded="${openActivities.has(p.id)?"true":"false"}">
                <span class="activity-label"><i data-lucide="list-checks"></i><strong>กิจกรรม</strong><span>${acts.length} รายการ</span></span>
                <span class="activity-toggle-hint">${openActivities.has(p.id)?"ซ่อนกิจกรรม":"ดูกิจกรรม"} <i data-lucide="chevron-down" class="${openActivities.has(p.id)?"rotated":""}"></i></span>
              </button>
              <div class="activity-collapse ${openActivities.has(p.id)?"open":""}">
                ${acts.length?`<div class="table-wrap activity-table"><table><thead><tr><th>รหัส</th><th>กิจกรรม</th><th>ผู้รับผิดชอบ</th><th class="num">งบดำเนินงาน</th><th class="num">ใช้ไป</th><th class="num">คงเหลือ</th><th>สถานะ</th><th></th></tr></thead><tbody>
                  ${acts.map(a=>{const x=astat(a,ex);return`<tr><td><strong>${esc(a.code||"-")}</strong></td><td>${esc(a.name)}</td><td>${esc(a.owner||"-")}</td><td class="num">${money(x.budget)}</td><td class="num">${money(x.spent)}</td><td class="num ${x.balance<0?"negative":""}">${money(x.balance)}</td><td><span class="badge ${a.status==="เสร็จสิ้น"?"gray":""}">${esc(a.status||"ดำเนินการ")}</span></td><td><div class="actions">${canPlanEdit()?`<button class="icon-btn" data-ae="${a.id}" title="แก้ไขกิจกรรม"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-ad="${a.id}" title="ลบกิจกรรม"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`}).join("")}
                </tbody></table></div>`:'<div class="empty activity-empty">ยังไม่มีกิจกรรมในโครงการนี้</div>'}
              </div>
            </div>
          </article>`;
        }).join("")}
      </div>
    </section>`:`<div class="empty">ไม่พบโครงการหรือกิจกรรมในฝ่าย ${esc(activeDivision||"-")}</div>`;

    $$("[data-toggle-activities]").forEach(b=>b.onclick=()=>{const id=b.dataset.toggleActivities;openActivities.has(id)?openActivities.delete(id):openActivities.add(id);paintProjects()});
    $$("[data-add-activity]").forEach(b=>b.onclick=()=>activityForm(null,b.dataset.addActivity));
    $$("[data-pe]").forEach(b=>b.onclick=()=>projectForm(state.data.projects.find(x=>x.id===b.dataset.pe)));
    $$("[data-pd]").forEach(b=>b.onclick=()=>remove("projects",b.dataset.pd));
    $$("[data-ae]").forEach(b=>b.onclick=()=>activityForm(state.data.activities.find(x=>x.id===b.dataset.ae)));
    $$("[data-ad]").forEach(b=>b.onclick=()=>remove("activities",b.dataset.ad));
    lucide.createIcons();
  };

  $("#search").oninput=paintProjects;
  paintTabs();paintProjects();lucide.createIcons();
}
async function projectForm(p=null){
  const r=await Swal.fire({title:p?"แก้ไขโครงการ":"เพิ่มโครงการ",html:`<div class="form-stack" style="text-align:left"><label>ปีงบประมาณ<input id="fy" value="${esc(p?.fiscalYear||currentFiscalYear())}"></label><label>รหัสโครงการ<input id="code" value="${esc(p?.code||"")}"></label><label>ชื่อโครงการ<input id="name" value="${esc(p?.name||"")}"></label><label>ผู้รับผิดชอบ<input id="owner" value="${esc(p?.owner||"")}"></label><label>งบประมาณ<input id="budget" type="number" min="0" step=".01" value="${esc(p?.budget||"")}"></label><label>สถานะ<select id="status"><option>ดำเนินการ</option><option>ปิดโครงการ</option></select></label></div>`,showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",didOpen:()=>$("#status").value=p?.status||"ดำเนินการ",preConfirm:()=>{const v={id:p?.id||uid("prj"),fiscalYear:$("#fy").value.trim(),code:$("#code").value.trim(),name:$("#name").value.trim(),owner:$("#owner").value.trim(),budget:num($("#budget").value),status:$("#status").value};if(!v.fiscalYear||!v.code||!v.name)return Swal.showValidationMessage("กรุณากรอกข้อมูลสำคัญให้ครบ");return v}});
  if(!r.value)return;try{await api("/api/projects",{method:p?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData();Swal.fire({icon:"success",title:"บันทึกแล้ว",timer:800,showConfirmButton:false})}catch(e){err(e)}
}
function activities(){
  const {activities:as,expenses:ex}=filtered(),pm=Object.fromEntries(state.data.projects.map(p=>[p.id,p]));$("#content").innerHTML=panel("","เพิ่มกิจกรรม","<th>โครงการ</th><th>กิจกรรม</th><th>ผู้รับผิดชอบ</th><th class='num'>งบดำเนินงาน</th><th class='num'>ใช้ไป</th><th class='num'>คงเหลือ</th><th>สถานะ</th><th></th>",canPlanEdit());if(canPlanEdit())$("#addBtn").onclick=()=>activityForm();
  const paint=()=>{const q=$("#search").value.toLowerCase(),rs=as.filter(a=>`${a.code} ${a.name} ${a.owner} ${pm[a.projectId]?.name||""}`.toLowerCase().includes(q));$("#rows").innerHTML=rs.length?rs.map(a=>{const s=astat(a,ex);return`<tr><td>${esc(pm[a.projectId]?.code||"-")}<br><small>${esc(pm[a.projectId]?.name||"")}</small></td><td><strong>${esc(a.code)}</strong><br>${esc(a.name)}</td><td>${esc(a.owner)}</td><td class="num">${money(s.budget)}</td><td class="num">${money(s.spent)}</td><td class="num ${s.balance<0?"negative":""}">${money(s.balance)}</td><td><span class="badge ${a.status==="เสร็จสิ้น"?"gray":""}">${esc(a.status||"ดำเนินการ")}</span></td><td><div class="actions">${canPlanEdit()?`<button class="icon-btn" data-e="${a.id}"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${a.id}"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`}).join(""):`<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;$$("[data-e]").forEach(b=>b.onclick=()=>activityForm(state.data.activities.find(x=>x.id===b.dataset.e)));$$("[data-d]").forEach(b=>b.onclick=()=>remove("activities",b.dataset.d));lucide.createIcons()};$("#search").oninput=paint;paint()
}
async function activityForm(a=null,defaultProjectId=""){
  const ps=state.data.projects;if(!ps.length)return Swal.fire({icon:"info",title:"กรุณาเพิ่มโครงการก่อน"});const opts=ps.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("");
  const r=await Swal.fire({title:a?"แก้ไขกิจกรรม":"เพิ่มกิจกรรม",html:`<div class="form-stack" style="text-align:left"><label>โครงการ<select id="prj">${opts}</select></label><label>รหัสกิจกรรม<input id="code" value="${esc(a?.code||"")}"></label><label>ชื่อกิจกรรม<input id="name" value="${esc(a?.name||"")}"></label><label>ผู้รับผิดชอบ<input id="owner" value="${esc(a?.owner||"")}"></label><label>งบดำเนินงาน<input id="budget" type="number" min="0" step=".01" value="${esc(a?.budget||"")}"></label><label>สถานะ<select id="status"><option>ดำเนินการ</option><option>เสร็จสิ้น</option></select></label></div>`,showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",didOpen:()=>{$("#prj").value=a?.projectId||defaultProjectId||ps[0].id;$("#status").value=a?.status||"ดำเนินการ"},preConfirm:()=>{const v={id:a?.id||uid("act"),projectId:$("#prj").value,code:$("#code").value.trim(),name:$("#name").value.trim(),owner:$("#owner").value.trim(),budget:num($("#budget").value),status:$("#status").value};if(!v.code||!v.name)return Swal.showValidationMessage("กรุณากรอกรหัสและชื่อกิจกรรม");return v}});
  if(!r.value)return;try{await api("/api/activities",{method:a?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData()}catch(e){err(e)}
}
function expenses(){
  const {expenses:es}=filtered(),pm=Object.fromEntries(state.data.projects.map(p=>[p.id,p])),am=Object.fromEntries(state.data.activities.map(a=>[a.id,a]));
  const fundLabels={subsidy:"งบเงินอุดหนุน",activity:"งบกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่น ๆ"};
  $("#content").innerHTML=panel("","เพิ่มรายจ่าย","<th>วันที่</th><th>เอกสาร</th><th>โครงการ / กิจกรรม</th><th>ประเภทเงิน</th><th>รายการ</th><th>หมวด</th><th>ผู้รับเงิน</th><th class='num'>จำนวนเงิน</th><th></th>",canFinanceEdit());
  if(canFinanceEdit())$("#addBtn").onclick=()=>expenseForm();
  const paint=()=>{
    const q=$("#search").value.toLowerCase(),rs=[...es].sort((a,b)=>String(b.date).localeCompare(String(a.date))).filter(e=>`${e.docNo} ${e.description} ${e.payee} ${e.category} ${fundLabels[e.fundType]||e.fundType||""}`.toLowerCase().includes(q));
    $("#rows").innerHTML=rs.length?rs.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.docNo)}</td><td>${esc(pm[e.projectId]?.code||"-")}<br><small>${esc(am[e.activityId]?.name||"-")}</small></td><td>${e.fundType?`<span class="badge gray">${esc(fundLabels[e.fundType]||e.fundType)}</span>`:'<span class="badge request-warning">ยังไม่ระบุ</span>'}${e.requestId?'<br><small>เชื่อมคำขอเบิก</small>':""}</td><td>${esc(e.description)}</td><td><span class="badge gray">${esc(e.category||"-")}</span></td><td>${esc(e.payee||"-")}</td><td class="num"><strong>${money(e.amount)}</strong></td><td><div class="actions">${canFinanceEdit()?`<button class="icon-btn" data-e="${e.id}" title="แก้ไข"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${e.id}" title="ลบ"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`).join(""):'<tr><td colspan="9" class="empty">ไม่พบข้อมูล</td></tr>';
    $$("[data-e]").forEach(b=>b.onclick=()=>expenseForm(state.data.expenses.find(x=>x.id===b.dataset.e)));
    $$("[data-d]").forEach(b=>b.onclick=()=>remove("expenses",b.dataset.d));
    lucide.createIcons();
  };
  $("#search").oninput=paint;paint();
}
async function expenseForm(e=null){
  const ps=state.data.projects;if(!ps.length)return Swal.fire({icon:"info",title:"กรุณาเพิ่มโครงการก่อน"});
  const opts=ps.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("");
  const fundLabels={subsidy:"งบเงินอุดหนุน",activity:"งบกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่น ๆ"};
  const reqNo=(String(e?.note||"").match(/REQ-\d{4}-\d{4}/)||String(e?.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0]||"",linkedRequest=(state.data.requests||[]).find(r=>(e?.requestId&&r.id===e.requestId)||(reqNo&&r.requestNo===reqNo)),effectiveFund=e?.fundType||linkedRequest?.fundType||"";
  const linked=!!linkedRequest||!!e?.requestId||!!reqNo;
  const r=await Swal.fire({
    title:e?"แก้ไขรายจ่าย":"บันทึกรายจ่าย",width:700,
    html:`<div class="form-stack" style="text-align:left">${linked?'<div class="badge request-info" style="padding:8px 10px">รายการนี้เชื่อมกับคำขอเบิก หากต้องการเปลี่ยนโครงการ กิจกรรม หรือประเภทเงิน ให้แก้จากหน้าคำขอเบิก</div>':""}<label>โครงการ<select id="prj">${opts}</select></label><label>กิจกรรม<select id="act"></select></label><label>ประเภทเงิน<select id="expenseFund"></select><small id="expenseFundInfo" class="muted"></small></label><label>วันที่<input id="date" type="date" value="${esc(e?.date||today())}"></label><label>เลขที่เอกสาร<input id="doc" value="${esc(e?.docNo||"")}" placeholder="เว้นว่างเพื่อรัน บจ. อัตโนมัติ"><small class="muted">รายการใหม่หากเว้นว่าง ระบบจะรันเลข บจ. ต่อจากรายการรายจ่ายล่าสุด</small></label><label>รายการ<input id="desc" value="${esc(e?.description||"")}"></label><label>หมวด<select id="cat"><option>ค่าตอบแทน</option><option>ค่าใช้สอย</option><option>ค่าวัสดุ</option><option>ค่าครุภัณฑ์</option><option>อื่น ๆ</option></select></label><label>จำนวนเงิน<input id="amount" type="number" min=".01" step=".01" value="${esc(e?.amount||"")}"></label><label>ผู้รับเงิน/ร้านค้า<input id="payee" value="${esc(e?.payee||"")}"></label><label>หมายเหตุ<textarea id="note">${esc(e?.note||"")}</textarea></label></div>`,
    showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
    didOpen:()=>{
      const p=$("#prj"),a=$("#act"),f=$("#expenseFund");
      const fillFunds=()=>{
        const fs=(state.data.activityFunds||[]).filter(x=>x.activityId===a.value&&num(x.budget)>0);
        f.innerHTML=fs.length?fs.map(x=>`<option value="${x.fundType}">${esc(fundLabels[x.fundType]||x.fundType)} — ${money(x.budget)}</option>`).join(""):'<option value="">ไม่พบงบประเภทเงิน</option>';
        if(effectiveFund&&fs.some(x=>x.fundType===effectiveFund))f.value=effectiveFund;
        const show=()=>{const x=fs.find(z=>z.fundType===f.value);$("#expenseFundInfo").textContent=x?"วงเงินประเภทนี้ "+money(x.budget):""};f.onchange=show;show();
      };
      const fillActs=()=>{
        const xs=state.data.activities.filter(x=>x.projectId===p.value);
        a.innerHTML=xs.length?xs.map(x=>`<option value="${x.id}">${esc(x.code)} - ${esc(x.name)}</option>`).join(""):'<option value="">ยังไม่มีกิจกรรม</option>';
        if(e?.activityId&&xs.some(x=>x.id===e.activityId))a.value=e.activityId;
        fillFunds();
      };
      p.value=e?.projectId||ps[0].id;fillActs();p.onchange=fillActs;a.onchange=fillFunds;$("#cat").value=e?.category||"ค่าวัสดุ";
      if(linked){p.disabled=true;a.disabled=true;f.disabled=true}
    },
    preConfirm:()=>{
      const v={id:e?.id||uid("exp"),projectId:$("#prj").value,activityId:$("#act").value,fundType:$("#expenseFund").value,requestId:e?.requestId||"",date:$("#date").value,docNo:$("#doc").value.trim(),description:$("#desc").value.trim(),category:$("#cat").value,amount:num($("#amount").value),payee:$("#payee").value.trim(),note:$("#note").value.trim()};
      if(!v.activityId)return Swal.showValidationMessage("กรุณาเลือกกิจกรรม");
      if(!v.fundType)return Swal.showValidationMessage("กรุณาเลือกประเภทเงิน");
      if(!v.date||!v.description||v.amount<=0)return Swal.showValidationMessage("กรุณากรอกวันที่ รายการ และจำนวนเงิน");
      return v;
    }
  });
  if(!r.value)return;try{await api("/api/expenses",{method:e?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData()}catch(x){err(x)}
}
async function remove(type,id){const x=await Swal.fire({icon:"warning",title:"ยืนยันการลบ",text:"ข้อมูลที่ลบไม่สามารถย้อนกลับได้",showCancelButton:true,confirmButtonText:"ลบ",cancelButtonText:"ยกเลิก",confirmButtonColor:"#dc2626"});if(!x.isConfirmed)return;try{await api(`/api/${type}?id=${encodeURIComponent(id)}`,{method:"DELETE"});await refreshData()}catch(e){err(e)}}


const REPORT_FUND_LABELS={subsidy:"งบเงินอุดหนุน",activity:"งบกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่น ๆ"};
const REPORT_STATUS_LABELS={submitted:"รอพัสดุ",procurement:"พัสดุดำเนินการ",finance:"รอการเงิน",returned:"ส่งกลับแก้ไข",rejected:"ไม่อนุมัติ",paid:"จ่ายเงินแล้ว",cancelled:"ยกเลิก"};
function reportData(filters={}){
  const projects=state.data.projects||[],activities=state.data.activities||[],expenses=state.data.expenses||[],requests=state.data.requests||[],metas=state.data.projectMeta||[],funds=state.data.activityFunds||[];
  const metaMap=Object.fromEntries(metas.map(x=>[x.projectId,x.division||"ไม่ระบุฝ่าย"]));
  const projectById=Object.fromEntries(projects.map(x=>[x.id,x])),activityById=Object.fromEntries(activities.map(x=>[x.id,x]));
  const activityIdsByProject=new Map();
  for(const a of activities){const xs=activityIdsByProject.get(a.projectId)||[];xs.push(a.id);activityIdsByProject.set(a.projectId,xs)}
  const requestById=Object.fromEntries(requests.map(r=>[r.id,r])),requestByNo=Object.fromEntries(requests.filter(r=>r.requestNo).map(r=>[r.requestNo,r]));
  const expenseFund=e=>{
    if(e.fundType)return e.fundType;
    if(e.requestId&&requestById[e.requestId])return requestById[e.requestId].fundType||"";
    const no=(String(e.note||"").match(/REQ-\d{4}-\d{4}/)||String(e.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0];
    return no&&requestByNo[no]?requestByNo[no].fundType||"":"";
  };
  const selected=projects.filter(p=>(!filters.year||String(p.fiscalYear||"")===filters.year)&&(!filters.division||(metaMap[p.id]||"ไม่ระบุฝ่าย")===filters.division)&&(!filters.projectId||p.id===filters.projectId));
  const ids=new Set(selected.map(p=>p.id));
  const relevantRequests=requests.filter(r=>ids.has(r.projectId)&&(!filters.fundType||r.fundType===filters.fundType));
  const relevantExpenses=expenses.filter(e=>ids.has(e.projectId)&&(!filters.fundType||expenseFund(e)===filters.fundType));
  const pending=new Set(["submitted","procurement","finance"]);
  const projectRows=selected.map(p=>{
    const aids=new Set(activityIdsByProject.get(p.id)||[]);
    const budget=filters.fundType?funds.filter(f=>aids.has(f.activityId)&&f.fundType===filters.fundType).reduce((s,f)=>s+num(f.budget),0):num(p.budget);
    const spent=relevantExpenses.filter(e=>e.projectId===p.id).reduce((s,e)=>s+num(e.amount),0);
    const reserved=relevantRequests.filter(r=>r.projectId===p.id&&pending.has(String(r.status||"").trim())).reduce((s,r)=>s+num(r.totalAmount),0);
    return{...p,division:metaMap[p.id]||"ไม่ระบุฝ่าย",budget,spent,reserved,available:budget-spent-reserved};
  }).sort((a,b)=>String(a.code||"").localeCompare(String(b.code||""),"th",{numeric:true}));
  const requestRows=relevantRequests.filter(r=>!filters.status||String(r.status||"").trim()===filters.status).map(r=>({
    ...r,projectCode:projectById[r.projectId]?.code||"",projectName:projectById[r.projectId]?.name||"",activityName:activityById[r.activityId]?.name||"",division:metaMap[r.projectId]||"ไม่ระบุฝ่าย"
  })).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  const expenseRows=relevantExpenses.map(e=>({
    ...e,projectCode:projectById[e.projectId]?.code||"",projectName:projectById[e.projectId]?.name||"",activityName:activityById[e.activityId]?.name||"",division:metaMap[e.projectId]||"ไม่ระบุฝ่าย",resolvedFundType:expenseFund(e)
  })).sort((a,b)=>String(b.date||b.createdAt||"").localeCompare(String(a.date||a.createdAt||"")));
  const summary={
    budget:projectRows.reduce((s,x)=>s+x.budget,0),
    spent:projectRows.reduce((s,x)=>s+x.spent,0),
    reserved:projectRows.reduce((s,x)=>s+x.reserved,0)
  };
  summary.available=summary.budget-summary.spent-summary.reserved;
  return{projectRows,requestRows,expenseRows,summary,metaMap};
}
function reportFiltersText(filters){
  const parts=[];
  if(filters.year)parts.push("ปีงบประมาณ "+filters.year);
  if(filters.division)parts.push("ฝ่าย "+filters.division);
  if(filters.fundType)parts.push(REPORT_FUND_LABELS[filters.fundType]||filters.fundType);
  if(filters.status)parts.push(REPORT_STATUS_LABELS[filters.status]||filters.status);
  return parts.join(" • ")||"ทุกข้อมูล";
}
function reportTableHTML(type,data){
  if(type==="requests")return `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เลขที่คำขอ</th><th>ผู้ขอเบิก</th><th>โครงการ / กิจกรรม</th><th>ประเภทเงิน</th><th class="num">ยอดขอ</th><th>สถานะ</th></tr></thead><tbody>${data.requestRows.length?data.requestRows.map(r=>`<tr><td>${esc((r.createdAt||"").slice(0,10)||"-")}</td><td><strong>${esc(r.requestNo||"-")}</strong></td><td>${esc(r.requesterName||"-")}</td><td><strong>${esc((r.projectCode?r.projectCode+" - ":"")+(r.projectName||""))}</strong><br><small>${esc(r.activityName||"-")}</small></td><td>${esc(REPORT_FUND_LABELS[r.fundType]||r.fundType||"-")}</td><td class="num">${money(r.totalAmount)}</td><td><span class="badge gray">${esc(REPORT_STATUS_LABELS[String(r.status||"").trim()]||r.status||"-")}</span></td></tr>`).join(""):'<tr><td colspan="7" class="empty">ไม่พบรายการ</td></tr>'}</tbody></table></div>`;
  if(type==="expenses")return `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>เลข บจ.</th><th>โครงการ / กิจกรรม</th><th>ประเภทเงิน</th><th>รายละเอียด</th><th>ผู้รับเงิน</th><th class="num">จำนวนเงิน</th></tr></thead><tbody>${data.expenseRows.length?data.expenseRows.map(e=>`<tr><td>${esc(e.date||"-")}</td><td><strong>${esc(e.docNo||"-")}</strong></td><td><strong>${esc((e.projectCode?e.projectCode+" - ":"")+(e.projectName||""))}</strong><br><small>${esc(e.activityName||"-")}</small></td><td>${esc(REPORT_FUND_LABELS[e.resolvedFundType]||e.resolvedFundType||"-")}</td><td>${esc(e.description||"-")}</td><td>${esc(e.payee||"-")}</td><td class="num">${money(e.amount)}</td></tr>`).join(""):'<tr><td colspan="7" class="empty">ไม่พบรายการ</td></tr>'}</tbody></table></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>ฝ่าย</th><th>รหัส</th><th>โครงการ</th><th>ผู้รับผิดชอบ</th><th class="num">งบประมาณ</th><th class="num">จ่ายแล้ว</th><th class="num">รอเบิก</th><th class="num">พร้อมใช้</th></tr></thead><tbody>${data.projectRows.length?data.projectRows.map(p=>`<tr><td>${esc(p.division)}</td><td><strong>${esc(p.code||"-")}</strong></td><td>${esc(p.name||"-")}</td><td>${esc(p.owner||"-")}</td><td class="num">${money(p.budget)}</td><td class="num">${money(p.spent)}</td><td class="num">${money(p.reserved)}</td><td class="num"><strong>${money(p.available)}</strong></td></tr>`).join(""):'<tr><td colspan="8" class="empty">ไม่พบรายการ</td></tr>'}</tbody></table></div>`;
}
function exportReportExcel(filters){
  if(typeof XLSX==="undefined")return Swal.fire({icon:"error",title:"ไม่สามารถส่งออก Excel",text:"ไลบรารี Excel ยังโหลดไม่สำเร็จ"});
  const data=reportData(filters),wb=XLSX.utils.book_new();
  const projectRows=data.projectRows.map(p=>({"ฝ่าย":p.division,"รหัสโครงการ":p.code,"ชื่อโครงการ":p.name,"ผู้รับผิดชอบ":p.owner,"งบประมาณ":p.budget,"จ่ายแล้ว":p.spent,"รอเบิก":p.reserved,"พร้อมใช้":p.available}));
  const requestRows=data.requestRows.map(r=>({"วันที่":(r.createdAt||"").slice(0,10),"เลขที่คำขอ":r.requestNo,"ผู้ขอเบิก":r.requesterName,"ฝ่าย":r.division,"รหัสโครงการ":r.projectCode,"โครงการ":r.projectName,"กิจกรรม":r.activityName,"ประเภทเงิน":REPORT_FUND_LABELS[r.fundType]||r.fundType,"ยอดขอ":num(r.totalAmount),"สถานะ":REPORT_STATUS_LABELS[String(r.status||"").trim()]||r.status}));
  const expenseRows=data.expenseRows.map(e=>({"วันที่":e.date,"เลข บจ.":e.docNo,"ฝ่าย":e.division,"รหัสโครงการ":e.projectCode,"โครงการ":e.projectName,"กิจกรรม":e.activityName,"ประเภทเงิน":REPORT_FUND_LABELS[e.resolvedFundType]||e.resolvedFundType,"รายละเอียด":e.description,"ผู้รับเงิน":e.payee,"จำนวนเงิน":num(e.amount)}));
  const addSheet=(name,rows,widths)=>{
    const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"ข้อมูล":"ไม่พบรายการ"}]);
    ws["!cols"]=widths.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,name);
  };
  addSheet("สรุปโครงการ",projectRows,[16,14,42,28,16,16,16,16]);
  addSheet("คำขอเบิก",requestRows,[13,18,26,16,14,38,36,28,16,20]);
  addSheet("รายจ่าย",expenseRows,[13,14,16,14,38,36,28,45,28,16]);
  const y=filters.year||"ทุกปี",file="รายงานงบประมาณ_"+y+"_"+today()+".xlsx";
  XLSX.writeFile(wb,file);
}
function exportReportPdf(type,filters){
  const data=reportData(filters),school=$("#sidebarSchoolName")?.textContent||"โรงเรียนสามัคคีศึกษา";
  const titles={summary:"รายงานสรุปงบประมาณตามโครงการ",requests:"รายงานรายการขอเบิกเงิน",expenses:"รายงานรายจ่าย"},title=titles[type]||titles.summary;
  const w=window.open("","_blank");if(!w)return Swal.fire({icon:"warning",title:"เบราว์เซอร์บล็อกหน้าต่างพิมพ์",text:"กรุณาอนุญาต Pop-up แล้วลองส่งออก PDF อีกครั้ง"});
  const html=reportTableHTML(type,data).replaceAll('class="table-wrap"','').replaceAll('class="num"','class="num"');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:"Sarabun","Tahoma",sans-serif;color:#111827;font-size:11px;margin:0}h1{font-size:20px;margin:0;text-align:center}h2{font-size:15px;margin:4px 0 0;text-align:center;font-weight:500}.meta{text-align:center;margin:6px 0 14px;color:#475569}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}.card{border:1px solid #d1d5db;border-radius:8px;padding:8px}.card small{display:block;color:#64748b}.card strong{font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px 6px;vertical-align:top}th{background:#f1f5f9;text-align:left}.num{text-align:right;white-space:nowrap}.badge{display:inline-block}small{color:#64748b}.foot{margin-top:8px;text-align:right;color:#64748b}@media print{button{display:none}}
  </style></head><body><h1>${esc(school)}</h1><h2>${esc(title)}</h2><div class="meta">${esc(reportFiltersText(filters))}</div>
  <div class="summary"><div class="card"><small>งบประมาณ</small><strong>${money(data.summary.budget)}</strong></div><div class="card"><small>จ่ายแล้ว</small><strong>${money(data.summary.spent)}</strong></div><div class="card"><small>รอเบิก</small><strong>${money(data.summary.reserved)}</strong></div><div class="card"><small>พร้อมใช้</small><strong>${money(data.summary.available)}</strong></div></div>
  ${html}<div class="foot">จัดทำเมื่อ ${new Date().toLocaleString("th-TH")}</div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  w.document.close();
}
function reports(){
  const projects=state.data.projects||[],metas=state.data.projectMeta||[];
  const metaMap=Object.fromEntries(metas.map(x=>[x.projectId,x.division||"ไม่ระบุฝ่าย"]));
  const years=[...new Set(projects.map(p=>String(p.fiscalYear||"")).filter(Boolean))].sort().reverse();
  const divisions=[...new Set(projects.map(p=>metaMap[p.id]||"ไม่ระบุฝ่าย"))].sort((a,b)=>a.localeCompare(b,"th"));
  const fundOptions=Object.entries(REPORT_FUND_LABELS),statusOptions=Object.entries(REPORT_STATUS_LABELS);
  $("#content").innerHTML=`<section class="panel report-panel">
    <div class="panel-head"><div><h3>รายงานงบประมาณ</h3><p class="muted">กรองข้อมูลแล้วส่งออก Excel หรือ PDF ได้ทันที</p></div><div class="actions"><button id="reportExcel" class="btn btn-ghost"><i data-lucide="file-spreadsheet"></i>Excel</button><button id="reportPdf" class="btn btn-primary"><i data-lucide="file-down"></i>PDF</button></div></div>
    <div class="report-filters">
      <label>รูปแบบรายงาน<select id="reportType" class="control"><option value="summary">สรุปโครงการ</option><option value="requests">รายการขอเบิก</option><option value="expenses">รายจ่าย</option></select></label>
      <label>ปีงบประมาณ<select id="reportYear" class="control"><option value="">ทุกปี</option>${years.map(y=>`<option value="${esc(y)}" ${y===state.fiscalYear?"selected":""}>${esc(y)}</option>`).join("")}</select></label>
      <label>ฝ่าย<select id="reportDivision" class="control"><option value="">ทุกฝ่าย</option>${divisions.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
      <label>โครงการ<select id="reportProject" class="control"><option value="">ทุกโครงการ</option></select></label>
      <label>ประเภทเงิน<select id="reportFund" class="control"><option value="">ทุกประเภท</option>${fundOptions.map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <label>สถานะคำขอ<select id="reportStatus" class="control"><option value="">ทุกสถานะ</option>${statusOptions.map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
    </div>
  </section>
  <section id="reportSummary" class="stats-grid"></section>
  <section class="panel"><div id="reportCaption" class="report-caption"></div><div id="reportTable"></div></section>`;

  const filters=()=>({year:$("#reportYear").value,division:$("#reportDivision").value,projectId:$("#reportProject").value,fundType:$("#reportFund").value,status:$("#reportStatus").value});
  const fillProjects=()=>{
    const f=filters(),current=$("#reportProject").value;
    const rows=projects.filter(p=>(!f.year||String(p.fiscalYear||"")===f.year)&&(!f.division||(metaMap[p.id]||"ไม่ระบุฝ่าย")===f.division)).sort((a,b)=>String(a.code||"").localeCompare(String(b.code||""),"th",{numeric:true}));
    $("#reportProject").innerHTML='<option value="">ทุกโครงการ</option>'+rows.map(p=>`<option value="${p.id}">${esc((p.code?p.code+" - ":"")+p.name)}</option>`).join("");
    if(rows.some(p=>p.id===current))$("#reportProject").value=current;
  };
  const paint=()=>{
    const f=filters(),type=$("#reportType").value,data=reportData(f);
    $("#reportSummary").innerHTML=[
      ["wallet-cards","งบประมาณ",data.summary.budget],
      ["badge-dollar-sign","จ่ายแล้ว",data.summary.spent],
      ["clock-3","รอเบิก",data.summary.reserved],
      ["piggy-bank","พร้อมใช้",data.summary.available]
    ].map(x=>`<article class="stat-card"><span class="stat-icon"><i data-lucide="${x[0]}"></i></span><div><small>${x[1]}</small><strong>${money(x[2])}</strong></div></article>`).join("");
    const typeLabel={summary:"สรุปโครงการ",requests:"รายการขอเบิก",expenses:"รายจ่าย"}[type];
    $("#reportCaption").innerHTML=`<div><strong>${typeLabel}</strong><p class="muted">${esc(reportFiltersText(f))}</p></div><span class="badge gray">${type==="summary"?data.projectRows.length:type==="requests"?data.requestRows.length:data.expenseRows.length} รายการ</span>`;
    $("#reportTable").innerHTML=reportTableHTML(type,data);
    $("#reportStatus").disabled=type!=="requests";
    lucide.createIcons();
  };
  $("#reportYear").onchange=()=>{fillProjects();paint()};
  $("#reportDivision").onchange=()=>{fillProjects();paint()};
  $("#reportProject").onchange=paint;$("#reportFund").onchange=paint;$("#reportStatus").onchange=paint;$("#reportType").onchange=paint;
  $("#reportExcel").onclick=()=>exportReportExcel(filters());
  $("#reportPdf").onclick=()=>exportReportPdf($("#reportType").value,filters());
  fillProjects();paint();lucide.createIcons();
}
function healthStatusMeta(status){
  if(status==="critical")return{label:"พบปัญหาที่ต้องตรวจสอบ",icon:"circle-alert",cls:"critical"};
  if(status==="warning")return{label:"พบรายการที่ควรตรวจสอบ",icon:"triangle-alert",cls:"warning"};
  return{label:"ข้อมูลปกติ",icon:"circle-check-big",cls:"healthy"};
}
function renderDataHealthReport(report){
  const meta=healthStatusMeta(report.status),issues=report.issues||[],counts=report.counts||{},totals=report.totals||{},order={critical:0,warning:1,info:2};
  $("#content").innerHTML=`<section class="health-hero health-${meta.cls}">
    <div class="health-hero-main"><span class="health-hero-icon"><i data-lucide="${meta.icon}"></i></span><div><p class="eyebrow">DATA HEALTH</p><h3>${esc(meta.label)}</h3><p class="muted">ตรวจล่าสุด ${new Date(report.checkedAt).toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})}</p></div></div>
    <div class="actions"><button id="healthRefresh" class="btn btn-ghost"><i data-lucide="refresh-cw"></i>ตรวจใหม่</button>${totals.autoFixable?'<button id="healthRepair" class="btn btn-primary"><i data-lucide="wand-sparkles"></i>ซ่อมอัตโนมัติ ('+totals.autoFixable+')</button>':""}</div>
  </section>
  <section class="stats-grid health-stats">
    <article class="stat-card"><span class="stat-icon"><i data-lucide="circle-alert"></i></span><div><small>ปัญหาร้ายแรง</small><strong>${totals.critical||0}</strong></div></article>
    <article class="stat-card"><span class="stat-icon"><i data-lucide="triangle-alert"></i></span><div><small>ควรตรวจสอบ</small><strong>${totals.warning||0}</strong></div></article>
    <article class="stat-card"><span class="stat-icon"><i data-lucide="info"></i></span><div><small>ข้อมูลประกอบ</small><strong>${totals.info||0}</strong></div></article>
    <article class="stat-card"><span class="stat-icon"><i data-lucide="wand-sparkles"></i></span><div><small>ซ่อมอัตโนมัติได้</small><strong>${totals.autoFixable||0}</strong></div></article>
  </section>
  <section class="panel">
    <div class="panel-head"><div><h3>ภาพรวมฐานข้อมูล</h3><p class="muted">ตรวจความสัมพันธ์ระหว่างโครงการ กิจกรรม คำขอเบิก รายการบิล และรายจ่าย</p></div></div>
    <div class="health-counts"><span><strong>${counts.projects||0}</strong> โครงการ</span><span><strong>${counts.activities||0}</strong> กิจกรรม</span><span><strong>${counts.requests||0}</strong> คำขอเบิก</span><span><strong>${counts.requestItems||0}</strong> รายการบิล</span><span><strong>${counts.expenses||0}</strong> รายจ่าย</span></div>
  </section>
  <section class="panel">
    <div class="panel-head"><div><h3>ผลการตรวจ</h3><p class="muted">รายการที่มีปัญหาจะแสดงก่อน สามารถกดดูตัวอย่างได้</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>ระดับ</th><th>รายการตรวจ</th><th>รายละเอียด</th><th class="num">จำนวน</th><th></th></tr></thead><tbody>
      ${issues.slice().sort((a,b)=>(order[a.severity]??9)-(order[b.severity]??9)||b.count-a.count).map(x=>`<tr class="${x.count?"health-issue-active":""}">
        <td><span class="health-severity health-severity-${x.severity}">${x.severity==="critical"?"ร้ายแรง":x.severity==="warning"?"ตรวจสอบ":"ข้อมูล"}</span></td>
        <td><strong>${esc(x.title)}</strong>${x.autoFixable?'<br><small class="health-fixable">ซ่อมอัตโนมัติได้</small>':""}</td>
        <td>${esc(x.description)}</td><td class="num"><strong>${x.count}</strong></td>
        <td>${x.count?'<button class="icon-btn" data-health-detail="'+esc(x.key)+'" title="ดูตัวอย่าง"><i data-lucide="search"></i></button>':'<i data-lucide="check" class="health-ok-icon"></i>'}</td>
      </tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="margin:12px 0 0">ซ่อมอัตโนมัติจะแก้เฉพาะ requestId, fundType และ requesterUsername ที่ระบบยืนยันได้อย่างปลอดภัย รายการที่กระทบยอดเงินหรือเลขเอกสารจะไม่แก้อัตโนมัติ</p>
  </section>`;
  $("#healthRefresh").onclick=()=>dataHealth();
  if($("#healthRepair"))$("#healthRepair").onclick=async()=>{
    const q=await Swal.fire({icon:"question",title:"ซ่อมข้อมูลอัตโนมัติ?",text:"ระบบจะแก้เฉพาะรายการที่ปลอดภัย และบันทึกลงประวัติการใช้งาน",showCancelButton:true,confirmButtonText:"ซ่อมข้อมูล",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e"});
    if(!q.isConfirmed)return;
    try{
      const x=await api("/api/data-health",{method:"POST",body:JSON.stringify({action:"repair"})}),rr=x.repaired||{};
      await Swal.fire({icon:"success",title:"ซ่อมข้อมูลเรียบร้อย",html:`<div style="text-align:left">อัปเดตรายจ่าย <strong>${rr.expensesUpdated||0}</strong> รายการ<br>ผูกคำขอ <strong>${rr.linkedExpenses||0}</strong> รายการ<br>เติมประเภทเงิน <strong>${rr.inferredFunds||0}</strong> รายการ<br>เติม Username ผู้ขอ <strong>${rr.requestUsers||0}</strong> รายการ</div>`,confirmButtonColor:"#0f766e"});
      renderDataHealthReport(x.report);
    }catch(e){err(e)}
  };
  $$("[data-health-detail]").forEach(b=>b.onclick=()=>{
    const issue=issues.find(x=>x.key===b.dataset.healthDetail);if(!issue)return;
    const rows=(issue.examples||[]).map(x=>`<tr><td><strong>${esc(x.label||x.id||"-")}</strong><br><small>${esc(x.id||"")}</small></td><td>${esc(x.detail||"-")}</td></tr>`).join("");
    Swal.fire({title:issue.title,html:`<div style="text-align:left"><p class="muted">${esc(issue.description)}</p><div class="table-wrap"><table><thead><tr><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>${rows||'<tr><td colspan="2" class="empty">ไม่พบตัวอย่าง</td></tr>'}</tbody></table></div>${issue.count>(issue.examples||[]).length?'<p class="muted">แสดงตัวอย่างบางส่วนจากทั้งหมด '+issue.count+' รายการ</p>':""}</div>`,width:760,confirmButtonText:"ปิด",confirmButtonColor:"#0f766e"});
  });
  lucide.createIcons();
}
async function dataHealth(){
  if(!canAdmin()){state.route="dashboard";return render()}
  $("#content").innerHTML='<section class="panel"><div class="empty">กำลังตรวจสุขภาพข้อมูล...</div></section>';
  try{const x=await api("/api/data-health?_="+Date.now());renderDataHealthReport(x.report)}catch(e){err(e)}
}
async function auditLog(){
  if(!canAdmin()){state.route="dashboard";return render()}
  $("#content").innerHTML='<section class="panel"><div class="empty">กำลังโหลดประวัติการใช้งาน...</div></section>';
  try{
    const data=await api("/api/audit-log?limit=500"),logs=data.logs||[];
    const actionLabels={CREATE:"เพิ่ม",UPDATE:"แก้ไข",DELETE:"ลบ",STATUS:"เปลี่ยนสถานะ",PAY:"จ่ายเงิน",IMPORT:"นำเข้า",RETURN:"ส่งกลับ",REJECT:"ไม่อนุมัติ",RESUBMIT:"ส่งใหม่",REPAIR:"ซ่อมข้อมูล"};
    const entityLabels={request:"คำขอเบิก",projects:"โครงการ",activities:"กิจกรรม",expenses:"รายจ่าย",user:"ผู้ใช้งาน",settings:"ตั้งค่าระบบ",data_health:"ตรวจสุขภาพข้อมูล"};
    const actionOptions=[...new Set(logs.map(x=>x.action).filter(Boolean))];
    $("#content").innerHTML=`<section class="panel">
      <div class="toolbar" style="align-items:flex-end">
        <div style="flex:1;min-width:220px"><label>ค้นหา<input id="auditSearch" class="search" placeholder="ผู้ใช้งาน รายการ หรือเลขเอกสาร"></label></div>
        <div><label>การกระทำ<select id="auditAction" class="control"><option value="">ทั้งหมด</option>${actionOptions.map(x=>`<option value="${esc(x)}">${esc(actionLabels[x]||x)}</option>`).join("")}</select></label></div>
        <button id="auditRefresh" class="btn btn-ghost"><i data-lucide="refresh-cw"></i>รีเฟรช</button>
      </div>
      <div class="table-wrap"><table><thead><tr><th>วันเวลา</th><th>ผู้ดำเนินการ</th><th>การกระทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody id="auditRows"></tbody></table></div>
      <p class="muted" style="margin:12px 0 0">แสดงประวัติล่าสุดสูงสุด 500 รายการ</p>
    </section>`;
    const dt=v=>{if(!v)return"-";const d=new Date(v);return Number.isNaN(d.getTime())?esc(v):d.toLocaleString("th-TH",{dateStyle:"short",timeStyle:"medium"})};
    const paint=()=>{
      const q=$("#auditSearch").value.toLowerCase(),act=$("#auditAction").value;
      const rows=logs.filter(x=>(!act||x.action===act)&&`${x.username} ${x.displayName} ${x.summary} ${x.entityId} ${x.entityType}`.toLowerCase().includes(q));
      $("#auditRows").innerHTML=rows.length?rows.map(x=>`<tr>
        <td style="white-space:nowrap">${dt(x.createdAt)}</td>
        <td><strong>${esc(x.displayName||x.username||"-")}</strong><br><small>${esc(x.username||"")}</small></td>
        <td><span class="badge gray">${esc(actionLabels[x.action]||x.action||"-")}</span></td>
        <td><strong>${esc(entityLabels[x.entityType]||x.entityType||"-")}</strong><br><small>${esc(x.entityId||"")}</small></td>
        <td>${esc(x.summary||"-")}${x.details?` <button class="icon-btn audit-detail" data-id="${x.id}" title="ดูรายละเอียด"><i data-lucide="search"></i></button>`:""}</td>
      </tr>`).join(""):'<tr><td colspan="5" class="empty">ไม่พบประวัติ</td></tr>';
      $$(".audit-detail").forEach(b=>b.onclick=()=>{
        const x=logs.find(z=>z.id===b.dataset.id);let detail=x?.details||"";
        try{detail=JSON.stringify(JSON.parse(detail),null,2)}catch{}
        Swal.fire({title:x?.summary||"รายละเอียด",html:`<pre style="text-align:left;white-space:pre-wrap;word-break:break-word;max-height:55vh;overflow:auto;background:#f8fafc;padding:14px;border-radius:12px">${esc(detail||"-")}</pre>`,width:760,confirmButtonColor:"#0f766e"});
      });
      lucide.createIcons();
    };
    $("#auditSearch").oninput=paint;$("#auditAction").onchange=paint;$("#auditRefresh").onclick=()=>auditLog();paint();lucide.createIcons();
  }catch(e){err(e)}
}
async function systemSettings(){
  if(!canAdmin()){state.route="dashboard";return render()}
  $("#content").innerHTML='<section class="panel"><div class="empty">กำลังโหลดการตั้งค่าระบบ...</div></section>';
  try{
    const x=await api("/api/settings"),s=x.settings||{};
    let currentLogo=s.schoolLogo||"";
    $("#content").innerHTML=`<section class="panel settings-panel">
      <div class="panel-head"><div><h3>ตั้งค่าระบบ</h3><p class="muted">ข้อมูลโรงเรียนและผู้ลงนามจะนำไปใช้ในหน้าเว็บและเอกสารของระบบ</p></div></div>
      <div class="settings-grid">
        <div class="settings-logo-card">
          <div id="schoolLogoPreview" class="settings-logo-preview">${currentLogo?`<img src="${currentLogo}" alt="ตราโรงเรียน">`:'<i data-lucide="school"></i>'}</div>
          <strong>ตราโรงเรียน</strong>
          <p class="muted">รองรับ JPG, PNG, WebP ระบบจะย่อรูปอัตโนมัติ</p>
          <input id="schoolLogoFile" type="file" accept="image/*" hidden>
          <div class="actions" style="justify-content:center">
            <button id="pickSchoolLogo" class="btn btn-ghost" type="button"><i data-lucide="image-up"></i>เลือกตราโรงเรียน</button>
            <button id="removeSchoolLogo" class="btn btn-ghost" type="button"><i data-lucide="trash-2"></i>เอาตราออก</button>
          </div>
        </div>
        <form id="settingsForm" class="form-stack settings-form">
          <label>ชื่อระบบ<input id="setSystemTitle" value="${esc(s.systemTitle||"ระบบบริหารจัดการงบประมาณ")}"></label>
          <label>ชื่อโรงเรียน<input id="setSchoolName" value="${esc(s.schoolName||"")}"></label>
          <label>ที่ตั้งโรงเรียน<input id="setSchoolLocation" value="${esc(s.schoolLocation||"")}"></label>
          <div class="form-grid-2">
            <label>เจ้าหน้าที่การเงิน<input id="setFinanceOfficer" value="${esc(s.financeOfficer||"")}"></label>
            <label>ผู้อำนวยการ<input id="setDirectorName" value="${esc(s.directorName||"")}"></label>
          </div>
          <label>ตำแหน่งผู้อำนวยการ<input id="setDirectorTitle" value="${esc(s.directorTitle||"")}"></label>
          <div><button class="btn btn-primary" type="submit"><i data-lucide="save"></i>บันทึกการตั้งค่า</button></div>
        </form>
      </div>
    </section>`;
    const preview=()=>{
      const p=$("#schoolLogoPreview");p.innerHTML=currentLogo?`<img src="${currentLogo}" alt="ตราโรงเรียน">`:'<i data-lucide="school"></i>';lucide.createIcons();
    };
    $("#pickSchoolLogo").onclick=()=>$("#schoolLogoFile").click();
    $("#schoolLogoFile").onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{currentLogo=await resizeSchoolLogo(file);preview()}catch(ex){err(ex)}
    };
    $("#removeSchoolLogo").onclick=()=>{currentLogo="";$("#schoolLogoFile").value="";preview()};
    $("#settingsForm").onsubmit=async e=>{
      e.preventDefault();
      const btn=e.submitter;btn.disabled=true;
      try{
        const payload={systemTitle:$("#setSystemTitle").value.trim(),schoolName:$("#setSchoolName").value.trim(),schoolLocation:$("#setSchoolLocation").value.trim(),financeOfficer:$("#setFinanceOfficer").value.trim(),directorName:$("#setDirectorName").value.trim(),directorTitle:$("#setDirectorTitle").value.trim(),schoolLogo:currentLogo};
        if(!payload.schoolName||!payload.systemTitle)return Swal.fire({icon:"warning",title:"กรุณากรอกชื่อโรงเรียนและชื่อระบบ"});
        const saved=await api("/api/settings",{method:"PUT",body:JSON.stringify(payload)});
        applyBrand(saved.settings||payload);writeBrandCache(saved.settings||payload);
        await Swal.fire({icon:"success",title:"บันทึกการตั้งค่าแล้ว",timer:1000,showConfirmButton:false});
      }catch(ex){err(ex)}finally{btn.disabled=false}
    };
    lucide.createIcons();
  }catch(e){err(e)}
}
async function users(){
  if(!canAdmin()){state.route="dashboard";return render()}
  $("#content").innerHTML='<section class="panel"><div class="empty">กำลังโหลดข้อมูลผู้ใช้งาน...</div></section>';
  try{
    const data=await api("/api/users");
    $("#content").innerHTML='<section class="panel"><div class="toolbar"><input id="search" class="search" placeholder="ค้นหาชื่อผู้ใช้ ชื่อ-สกุล หรือบทบาท"><button id="addBtn" class="btn btn-primary"><i data-lucide="user-plus"></i>เพิ่มผู้ใช้งาน</button></div><div class="table-wrap"><table><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อผู้ใช้งาน</th><th>บทบาท</th><th>สถานะ</th><th>สร้างเมื่อ</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section>';
    $("#addBtn").onclick=()=>userForm();
    const paint=()=>{
      const q=$("#search").value.toLowerCase();
      const rows=data.users.filter(u=>`${u.username} ${u.displayName} ${userRoles(u).map(r=>ROLE_LABELS[r]||r).join(" ")}`.toLowerCase().includes(q));
      $("#rows").innerHTML=rows.length?rows.map(u=>{
        const self=u.id===state.user.id,roles=userRoles(u);
        const roleBadges=roles.map(r=>`<span class="badge gray">${esc(ROLE_LABELS[r]||r)}</span>`).join(" ");
        return `<tr><td><strong>${esc(u.username)}</strong>${self?' <span class="badge gray">บัญชีนี้</span>':''}</td><td>${esc(u.displayName)}</td><td><div style="display:flex;flex-wrap:wrap;gap:5px">${roleBadges}</div></td><td><span class="badge ${u.status==="active"?"":"gray"}">${u.status==="active"?"เปิดใช้งาน":"ปิดใช้งาน"}</span></td><td>${esc((u.createdAt||"").slice(0,10)||"-")}</td><td><div class="actions"><button class="icon-btn" data-edit="${u.id}" title="แก้ไข"><i data-lucide="pencil"></i></button><button class="icon-btn" data-pass="${u.id}" title="ตั้งรหัสผ่านใหม่"><i data-lucide="key-round"></i></button>${self?"":`<button class="icon-btn" data-toggle="${u.id}" title="${u.status==="active"?"ปิดบัญชี":"เปิดบัญชี"}"><i data-lucide="${u.status==="active"?"user-x":"user-check"}"></i></button>`}</div></td></tr>`
      }).join(""):'<tr><td colspan="6" class="empty">ไม่พบผู้ใช้งาน</td></tr>';
      $$("[data-edit]").forEach(b=>b.onclick=()=>userForm(data.users.find(x=>x.id===b.dataset.edit)));
      $$("[data-pass]").forEach(b=>b.onclick=()=>resetUserPassword(data.users.find(x=>x.id===b.dataset.pass)));
      $$("[data-toggle]").forEach(b=>b.onclick=()=>toggleUser(data.users.find(x=>x.id===b.dataset.toggle)));
      lucide.createIcons();
    };
    $("#search").oninput=paint;paint();lucide.createIcons();
  }catch(e){err(e)}
}
async function userForm(u=null){
  const self=u?.id===state.user.id,selected=new Set(userRoles(u).length?userRoles(u):["viewer"]);
  const roleOptions=Object.entries(ROLE_LABELS).map(([value,label])=>`<label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:9px;padding:9px 10px;border:1px solid #e5e7eb;border-radius:10px;font-weight:500"><input class="role-check" type="checkbox" value="${value}" style="width:auto" ${selected.has(value)?"checked":""}><span>${esc(label)}</span></label>`).join("");
  const r=await Swal.fire({
    title:u?"แก้ไขผู้ใช้งาน":"เพิ่มผู้ใช้งาน",
    width:650,
    html:`<div class="form-stack" style="text-align:left">
      <label>ชื่อผู้ใช้<input id="usr" value="${esc(u?.username||"")}" ${u?"disabled":""}></label>
      <label>ชื่อที่แสดง<input id="display" value="${esc(u?.displayName||"")}"></label>
      ${u?"":'<label>รหัสผ่านเริ่มต้น<input id="pwd" type="password" minlength="6" autocomplete="new-password"><small class="muted">อย่างน้อย 6 ตัวอักษร</small></label>'}
      <div><div style="font-size:.9rem;font-weight:600;margin-bottom:7px">บทบาท <span class="muted" style="font-weight:400">(เลือกได้มากกว่า 1)</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${roleOptions}</div></div>
      <label>สถานะ<select id="ustatus" ${self?"disabled":""}><option value="active">เปิดใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></label>
    </div>`,
    showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
    didOpen:()=>{$("#ustatus").value=u?.status||"active"},
    preConfirm:()=>{
      const roles=$$(".role-check").filter(x=>x.checked).map(x=>x.value);
      if(!roles.length)return Swal.showValidationMessage("กรุณาเลือกอย่างน้อย 1 บทบาท");
      const v={displayName:$("#display").value.trim(),roles,status:self?u.status:$("#ustatus").value};
      if(!u){v.username=$("#usr").value.trim();v.password=$("#pwd").value;if(!v.username||v.username.length<3)return Swal.showValidationMessage("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");if(!v.password||v.password.length<6)return Swal.showValidationMessage("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")}
      else v.id=u.id;
      if(!v.displayName)return Swal.showValidationMessage("กรุณากรอกชื่อที่แสดง");
      return v;
    }
  });
  if(!r.value)return;
  try{
    await api("/api/users",{method:u?"PUT":"POST",body:JSON.stringify(r.value)});
    if(self){state.user.displayName=r.value.displayName;state.user.roles=r.value.roles;state.user.role=r.value.roles[0]||state.user.role;showApp()}
    await users();Swal.fire({icon:"success",title:"บันทึกผู้ใช้งานแล้ว",timer:900,showConfirmButton:false})
  }catch(e){err(e)}
}
async function resetUserPassword(u){
  const r=await Swal.fire({title:"ตั้งรหัสผ่านใหม่",text:`บัญชี ${u.username}`,input:"password",inputAttributes:{autocomplete:"new-password",minlength:"6"},inputPlaceholder:"รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร",showCancelButton:true,confirmButtonText:"เปลี่ยนรหัสผ่าน",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",inputValidator:v=>!v||v.length<6?"รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร":undefined});
  if(!r.value)return;
  try{await api("/api/users",{method:"PUT",body:JSON.stringify({id:u.id,password:r.value})});Swal.fire({icon:"success",title:"เปลี่ยนรหัสผ่านแล้ว",timer:900,showConfirmButton:false})}catch(e){err(e)}
}
async function toggleUser(u){
  const next=u.status==="active"?"inactive":"active",word=next==="active"?"เปิดใช้งาน":"ปิดใช้งาน";
  const r=await Swal.fire({icon:"question",title:`${word}บัญชี ${u.username}?`,showCancelButton:true,confirmButtonText:word,cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e"});
  if(!r.isConfirmed)return;
  try{await api("/api/users",{method:"PUT",body:JSON.stringify({id:u.id,status:next})});await users()}catch(e){err(e)}
}
window.addEventListener("DOMContentLoaded",init);

const state={token:sessionStorage.getItem("budget_token")||"",user:null,data:{projects:[],activities:[],expenses:[]},route:"dashboard",fiscalYear:"",charts:{}};
const $=(s,e=document)=>e.querySelector(s), $$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const num=n=>Number(String(n??0).replace(/,/g,""))||0;
const money=n=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB"}).format(num(n));
const uid=p=>`${p}_${crypto.randomUUID()}`, today=()=>new Date().toISOString().slice(0,10);
const ROLE_LABELS={admin:"ผู้ดูแลระบบ",planner:"งานแผน",teacher:"ครูผู้รับผิดชอบโครงการ",procurement:"เจ้าหน้าที่พัสดุ",finance:"การเงิน",viewer:"ผู้ดูข้อมูล"};
const userRoles=u=>Array.isArray(u?.roles)&&u.roles.length?u.roles:(u?.role?[u.role]:[]);
const hasRole=(role,u=state.user)=>userRoles(u).includes(role);
const hasAnyRole=(roles,u=state.user)=>roles.some(role=>hasRole(role,u));
const canEdit=()=>hasAnyRole(["admin","planner","finance"]), canAdmin=()=>hasRole("admin");

async function api(path,opt={}){
  const headers={"content-type":"application/json",...(opt.headers||{})};
  if(state.token)headers.authorization=`Bearer ${state.token}`;
  const r=await fetch(path,{...opt,headers}),j=await r.json().catch(()=>({}));
  if(r.status===401){logout(false);throw new Error(j.error||"กรุณาเข้าสู่ระบบใหม่")}
  if(!r.ok)throw new Error(j.error||"เกิดข้อผิดพลาด"); return j;
}
const err=e=>Swal.fire({icon:"error",title:"ไม่สำเร็จ",text:e.message||String(e),confirmButtonColor:"#0f766e"});

async function init(){
  lucide.createIcons();
  $("#loginForm").onsubmit=login; $("#logoutBtn").onclick=()=>logout(true); $("#refreshBtn").onclick=refreshData;
  $("#fiscalYearFilter").onchange=e=>{state.fiscalYear=e.target.value;render()};
  $("#mainNav").onclick=e=>{const b=e.target.closest("[data-route]");if(!b)return;state.route=b.dataset.route;$$(".nav-item",$("#mainNav")).forEach(x=>x.classList.toggle("active",x===b));render()};
  if(state.token){try{state.user=(await api("/api/me")).user;showApp();await refreshData()}catch{showLogin()}}else showLogin();
}
async function login(e){
  e.preventDefault(); const b=e.submitter;b.disabled=true;
  try{const x=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("#username").value.trim(),password:$("#password").value})});state.token=x.token;state.user=x.user;sessionStorage.setItem("budget_token",x.token);showApp();await refreshData()}catch(e){err(e)}finally{b.disabled=false}
}
function logout(show=true){sessionStorage.removeItem("budget_token");state.token="";state.user=null;showLogin();if(show)Swal.fire({icon:"success",title:"ออกจากระบบแล้ว",timer:900,showConfirmButton:false})}
function showLogin(){$("#loginView").classList.remove("hidden");$("#appView").classList.add("hidden")}
function showApp(){$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");const roles=userRoles(state.user);$("#userBox").innerHTML=`<strong>${esc(state.user.displayName)}</strong><span>${roles.map(r=>ROLE_LABELS[r]||r).join(" • ")}</span>`;$("#usersNav")?.classList.toggle("hidden",!hasRole("admin"));$("#importNav")?.classList.toggle("hidden",!hasAnyRole(["admin","planner"]));$("#requestsNav")?.classList.toggle("hidden",!hasAnyRole(["admin","planner","teacher","procurement","finance"]));$("#procurementNav")?.classList.toggle("hidden",!hasAnyRole(["admin","procurement"]));$("#financeNav")?.classList.toggle("hidden",!hasAnyRole(["admin","finance"]));lucide.createIcons()}
async function refreshData(){try{state.data=await api("/api/data");years();render()}catch(e){err(e)}}
function years(){const ys=[...new Set(state.data.projects.map(x=>x.fiscalYear).filter(Boolean))].sort().reverse();$("#fiscalYearFilter").innerHTML=`<option value="">ทุกปีงบประมาณ</option>`+ys.map(y=>`<option ${y===state.fiscalYear?"selected":""}>${esc(y)}</option>`).join("")}
function filtered(){const projects=state.fiscalYear?state.data.projects.filter(p=>p.fiscalYear===state.fiscalYear):state.data.projects,ids=new Set(projects.map(p=>p.id));const activities=state.data.activities.filter(a=>ids.has(a.projectId)),aids=new Set(activities.map(a=>a.id));const expenses=state.data.expenses.filter(e=>ids.has(e.projectId)&&(!e.activityId||aids.has(e.activityId)));return{projects,activities,expenses}}
function pstat(p,exps=state.data.expenses){const spent=exps.filter(e=>e.projectId===p.id).reduce((s,e)=>s+num(e.amount),0);return{budget:num(p.budget),spent,balance:num(p.budget)-spent}}
function astat(a,exps=state.data.expenses){const spent=exps.filter(e=>e.activityId===a.id).reduce((s,e)=>s+num(e.amount),0);return{budget:num(a.budget),spent,balance:num(a.budget)-spent}}
function destroy(){Object.values(state.charts).forEach(c=>c?.destroy());state.charts={}}
function render(){destroy();$("#pageTitle").textContent=({dashboard:"ภาพรวม",projects:"โครงการ",activities:"กิจกรรม",import:"นำเข้าโครงการ",requests:"ขอเบิกเงิน",procurement:"งานพัสดุ",financeQueue:"รอจ่ายเงิน",expenses:"รายจ่าย",users:"จัดการผู้ใช้งาน"})[state.route];const fn=({dashboard,projects,activities,import:importProjects,requests,procurement:procurementQueue,financeQueue,expenses,users})[state.route]||dashboard;fn();lucide.createIcons()}

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
  const fundRows=fundOrder.map(type=>{
    const fb=funds.filter(f=>f.fundType===type).reduce((s,f)=>s+num(f.budget),0);
    const paid=requests.filter(r=>r.fundType===type&&r.status==="paid").reduce((s,r)=>s+num(r.paidAmount||r.totalAmount),0);
    const hold=requests.filter(r=>r.fundType===type&&pendingStatuses.has(r.status)).reduce((s,r)=>s+num(r.totalAmount),0);
    return{type,label:fundLabels[type],budget:fb,paid,reserved:hold,available:fb-paid-hold};
  });

  const metaMap=Object.fromEntries(metas.map(x=>[x.projectId,x.division||"ไม่ระบุฝ่าย"]));
  const divisions=[...new Set(projects.map(p=>metaMap[p.id]||"ไม่ระบุฝ่าย"))];
  const divisionRows=divisions.map(division=>{
    const ps=projects.filter(p=>(metaMap[p.id]||"ไม่ระบุฝ่าย")===division),ids=new Set(ps.map(p=>p.id));
    const db=ps.reduce((s,p)=>s+num(p.budget),0);
    const ds=expenses.filter(e=>ids.has(e.projectId)).reduce((s,e)=>s+num(e.amount),0);
    const dr=requests.filter(r=>ids.has(r.projectId)&&pendingStatuses.has(r.status)).reduce((s,r)=>s+num(r.totalAmount),0);
    return{division,budget:db,spent:ds,reserved:dr,available:db-ds-dr};
  }).sort((a,b)=>b.budget-a.budget);

  $("#content").innerHTML=`<section class="stats-grid">
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
      <div class="panel-head"><div><h3>แยกตามประเภทเงิน</h3><p class="muted">ยอดจ่ายแล้วส่วนนี้อ้างอิงรายการขอเบิกที่การเงินลงจ่ายแล้ว</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>ประเภทเงิน</th><th class="num">งบ</th><th class="num">จ่ายแล้ว</th><th class="num">รอเบิก</th><th class="num">พร้อมใช้</th></tr></thead><tbody>
        ${fundRows.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td class="num">${money(x.budget)}</td><td class="num">${money(x.paid)}</td><td class="num">${money(x.reserved)}</td><td class="num ${x.available<0?"negative":""}"><strong>${money(x.available)}</strong></td></tr>`).join("")}
      </tbody></table></div>
    </article>
    <article class="panel"><div class="panel-head"><div><h3>สัดส่วนงบตามประเภทเงิน</h3><p class="muted">งบดำเนินงานที่นำเข้าจากกิจกรรม</p></div></div><div class="chart-wrap"><canvas id="fundChart"></canvas></div></article>
  </section>

  <section class="grid-2">
    <article class="panel">
      <div class="panel-head"><div><h3>แยกตามฝ่าย</h3><p class="muted">สรุปงบ การใช้จ่าย และยอดรอเบิกของแต่ละฝ่าย</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>ฝ่าย</th><th class="num">งบ</th><th class="num">จ่ายแล้ว</th><th class="num">รอเบิก</th><th class="num">พร้อมใช้</th></tr></thead><tbody>
        ${divisionRows.length?divisionRows.map(x=>`<tr><td><strong>${esc(x.division)}</strong></td><td class="num">${money(x.budget)}</td><td class="num">${money(x.spent)}</td><td class="num">${money(x.reserved)}</td><td class="num ${x.available<0?"negative":""}"><strong>${money(x.available)}</strong></td></tr>`).join(""):'<tr><td colspan="5" class="empty">ยังไม่มีข้อมูลฝ่าย</td></tr>'}
      </tbody></table></div>
    </article>
    <article class="panel"><div class="panel-head"><div><h3>เปรียบเทียบงบตามฝ่าย</h3><p class="muted">งบประมาณ / จ่ายจริง / รอเบิก</p></div></div><div class="chart-wrap"><canvas id="divisionChart"></canvas></div></article>
  </section>

  <section class="panel"><div class="panel-head"><div><h3>สถานะงบประมาณรายโครงการ</h3></div></div><div class="table-wrap"><table><thead><tr><th>โครงการ</th><th>ผู้รับผิดชอบ</th><th class="num">งบ</th><th class="num">ใช้ไป</th><th class="num">คงเหลือ</th><th>ความคืบหน้า</th></tr></thead><tbody>
    ${rows.length?rows.map(p=>{const pc=p.budget?p.spent/p.budget*100:0;return`<tr><td><strong>${esc(p.code)}</strong><br>${esc(p.name)}</td><td>${esc(p.owner)}</td><td class="num">${money(p.budget)}</td><td class="num">${money(p.spent)}</td><td class="num ${p.balance<0?"negative":""}">${money(p.balance)}</td><td><div class="progress"><div class="progress-track"><div class="progress-bar" style="width:${Math.min(pc,100)}%"></div></div><span>${pc.toFixed(0)}%</span></div></td></tr>`}).join(""):`<tr><td colspan="6" class="empty">ยังไม่มีข้อมูลโครงการ</td></tr>`}
  </tbody></table></div></section>`;

  state.charts.p=new Chart($("#projectChart"),{type:"bar",data:{labels:rows.slice(0,10).map(x=>x.code||x.name),datasets:[{label:"งบประมาณ",data:rows.slice(0,10).map(x=>x.budget),backgroundColor:"rgba(15,118,110,.72)",borderRadius:6},{label:"รายจ่าย",data:rows.slice(0,10).map(x=>x.spent),backgroundColor:"rgba(217,119,6,.72)",borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});
  state.charts.u=new Chart($("#usageChart"),{type:"doughnut",data:{labels:["จ่ายจริง","รอเบิก","พร้อมใช้"],datasets:[{data:[spent,Math.max(reserved,0),Math.max(available,0)],backgroundColor:["#0f766e","#f59e0b","#dbeafe"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"68%",plugins:{legend:{position:"bottom"}}}});
  state.charts.f=new Chart($("#fundChart"),{type:"doughnut",data:{labels:fundRows.map(x=>x.label),datasets:[{data:fundRows.map(x=>x.budget),backgroundColor:["#0f766e","#2563eb","#d97706","#7c3aed"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"bottom"}}}});
  state.charts.d=new Chart($("#divisionChart"),{type:"bar",data:{labels:divisionRows.map(x=>x.division),datasets:[{label:"งบประมาณ",data:divisionRows.map(x=>x.budget),backgroundColor:"rgba(15,118,110,.72)",borderRadius:5},{label:"จ่ายจริง",data:divisionRows.map(x=>x.spent),backgroundColor:"rgba(37,99,235,.72)",borderRadius:5},{label:"รอเบิก",data:divisionRows.map(x=>x.reserved),backgroundColor:"rgba(217,119,6,.72)",borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});
}
function panel(head,button,cols){return`<section class="panel"><div class="toolbar"><input id="search" class="search" placeholder="ค้นหา...">${canEdit()?`<button id="addBtn" class="btn btn-primary"><i data-lucide="plus"></i>${button}</button>`:""}</div><div class="table-wrap"><table><thead><tr>${cols}</tr></thead><tbody id="rows"></tbody></table></div></section>`}
function projects(){
  const {projects:ps,expenses:ex}=filtered();$("#content").innerHTML=panel("","เพิ่มโครงการ","<th>ปี/รหัส</th><th>โครงการ</th><th>ผู้รับผิดชอบ</th><th class='num'>งบ</th><th class='num'>ใช้ไป</th><th class='num'>คงเหลือ</th><th>สถานะ</th><th></th>");if(canEdit())$("#addBtn").onclick=()=>projectForm();
  const paint=()=>{const q=$("#search").value.toLowerCase(),rs=ps.filter(p=>`${p.code} ${p.name} ${p.owner}`.toLowerCase().includes(q));$("#rows").innerHTML=rs.length?rs.map(p=>{const s=pstat(p,ex);return`<tr><td>${esc(p.fiscalYear)}<br><strong>${esc(p.code)}</strong></td><td>${esc(p.name)}</td><td>${esc(p.owner)}</td><td class="num">${money(s.budget)}</td><td class="num">${money(s.spent)}</td><td class="num ${s.balance<0?"negative":""}">${money(s.balance)}</td><td><span class="badge ${p.status==="ปิดโครงการ"?"gray":""}">${esc(p.status||"ดำเนินการ")}</span></td><td><div class="actions">${canEdit()?`<button class="icon-btn" data-e="${p.id}"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${p.id}"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`}).join(""):`<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;$$("[data-e]").forEach(b=>b.onclick=()=>projectForm(state.data.projects.find(x=>x.id===b.dataset.e)));$$("[data-d]").forEach(b=>b.onclick=()=>remove("projects",b.dataset.d));lucide.createIcons()};$("#search").oninput=paint;paint()
}
async function projectForm(p=null){
  const r=await Swal.fire({title:p?"แก้ไขโครงการ":"เพิ่มโครงการ",html:`<div class="form-stack" style="text-align:left"><label>ปีงบประมาณ<input id="fy" value="${esc(p?.fiscalYear||new Date().getFullYear()+543)}"></label><label>รหัสโครงการ<input id="code" value="${esc(p?.code||"")}"></label><label>ชื่อโครงการ<input id="name" value="${esc(p?.name||"")}"></label><label>ผู้รับผิดชอบ<input id="owner" value="${esc(p?.owner||"")}"></label><label>งบประมาณ<input id="budget" type="number" min="0" step=".01" value="${esc(p?.budget||"")}"></label><label>สถานะ<select id="status"><option>ดำเนินการ</option><option>ปิดโครงการ</option></select></label></div>`,showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",didOpen:()=>$("#status").value=p?.status||"ดำเนินการ",preConfirm:()=>{const v={id:p?.id||uid("prj"),fiscalYear:$("#fy").value.trim(),code:$("#code").value.trim(),name:$("#name").value.trim(),owner:$("#owner").value.trim(),budget:num($("#budget").value),status:$("#status").value};if(!v.fiscalYear||!v.code||!v.name)return Swal.showValidationMessage("กรุณากรอกข้อมูลสำคัญให้ครบ");return v}});
  if(!r.value)return;try{await api("/api/projects",{method:p?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData();Swal.fire({icon:"success",title:"บันทึกแล้ว",timer:800,showConfirmButton:false})}catch(e){err(e)}
}
function activities(){
  const {activities:as,expenses:ex}=filtered(),pm=Object.fromEntries(state.data.projects.map(p=>[p.id,p]));$("#content").innerHTML=panel("","เพิ่มกิจกรรม","<th>โครงการ</th><th>กิจกรรม</th><th>ผู้รับผิดชอบ</th><th class='num'>งบดำเนินงาน</th><th class='num'>ใช้ไป</th><th class='num'>คงเหลือ</th><th>สถานะ</th><th></th>");if(canEdit())$("#addBtn").onclick=()=>activityForm();
  const paint=()=>{const q=$("#search").value.toLowerCase(),rs=as.filter(a=>`${a.code} ${a.name} ${a.owner} ${pm[a.projectId]?.name||""}`.toLowerCase().includes(q));$("#rows").innerHTML=rs.length?rs.map(a=>{const s=astat(a,ex);return`<tr><td>${esc(pm[a.projectId]?.code||"-")}<br><small>${esc(pm[a.projectId]?.name||"")}</small></td><td><strong>${esc(a.code)}</strong><br>${esc(a.name)}</td><td>${esc(a.owner)}</td><td class="num">${money(s.budget)}</td><td class="num">${money(s.spent)}</td><td class="num ${s.balance<0?"negative":""}">${money(s.balance)}</td><td><span class="badge ${a.status==="เสร็จสิ้น"?"gray":""}">${esc(a.status||"ดำเนินการ")}</span></td><td><div class="actions">${canEdit()?`<button class="icon-btn" data-e="${a.id}"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${a.id}"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`}).join(""):`<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;$$("[data-e]").forEach(b=>b.onclick=()=>activityForm(state.data.activities.find(x=>x.id===b.dataset.e)));$$("[data-d]").forEach(b=>b.onclick=()=>remove("activities",b.dataset.d));lucide.createIcons()};$("#search").oninput=paint;paint()
}
async function activityForm(a=null){
  const ps=state.data.projects;if(!ps.length)return Swal.fire({icon:"info",title:"กรุณาเพิ่มโครงการก่อน"});const opts=ps.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("");
  const r=await Swal.fire({title:a?"แก้ไขกิจกรรม":"เพิ่มกิจกรรม",html:`<div class="form-stack" style="text-align:left"><label>โครงการ<select id="prj">${opts}</select></label><label>รหัสกิจกรรม<input id="code" value="${esc(a?.code||"")}"></label><label>ชื่อกิจกรรม<input id="name" value="${esc(a?.name||"")}"></label><label>ผู้รับผิดชอบ<input id="owner" value="${esc(a?.owner||"")}"></label><label>งบดำเนินงาน<input id="budget" type="number" min="0" step=".01" value="${esc(a?.budget||"")}"></label><label>สถานะ<select id="status"><option>ดำเนินการ</option><option>เสร็จสิ้น</option></select></label></div>`,showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",didOpen:()=>{$("#prj").value=a?.projectId||ps[0].id;$("#status").value=a?.status||"ดำเนินการ"},preConfirm:()=>{const v={id:a?.id||uid("act"),projectId:$("#prj").value,code:$("#code").value.trim(),name:$("#name").value.trim(),owner:$("#owner").value.trim(),budget:num($("#budget").value),status:$("#status").value};if(!v.code||!v.name)return Swal.showValidationMessage("กรุณากรอกรหัสและชื่อกิจกรรม");return v}});
  if(!r.value)return;try{await api("/api/activities",{method:a?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData()}catch(e){err(e)}
}
function expenses(){
  const {expenses:es}=filtered(),pm=Object.fromEntries(state.data.projects.map(p=>[p.id,p])),am=Object.fromEntries(state.data.activities.map(a=>[a.id,a]));$("#content").innerHTML=panel("","เพิ่มรายจ่าย","<th>วันที่</th><th>เอกสาร</th><th>โครงการ / กิจกรรม</th><th>รายการ</th><th>หมวด</th><th>ผู้รับเงิน</th><th class='num'>จำนวนเงิน</th><th></th>");if(canEdit())$("#addBtn").onclick=()=>expenseForm();
  const paint=()=>{const q=$("#search").value.toLowerCase(),rs=[...es].sort((a,b)=>String(b.date).localeCompare(String(a.date))).filter(e=>`${e.docNo} ${e.description} ${e.payee} ${e.category}`.toLowerCase().includes(q));$("#rows").innerHTML=rs.length?rs.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.docNo)}</td><td>${esc(pm[e.projectId]?.code||"-")}<br><small>${esc(am[e.activityId]?.name||"-")}</small></td><td>${esc(e.description)}</td><td><span class="badge gray">${esc(e.category||"-")}</span></td><td>${esc(e.payee||"-")}</td><td class="num"><strong>${money(e.amount)}</strong></td><td><div class="actions">${canEdit()?`<button class="icon-btn" data-e="${e.id}"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${e.id}"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`).join(""):`<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;$$("[data-e]").forEach(b=>b.onclick=()=>expenseForm(state.data.expenses.find(x=>x.id===b.dataset.e)));$$("[data-d]").forEach(b=>b.onclick=()=>remove("expenses",b.dataset.d));lucide.createIcons()};$("#search").oninput=paint;paint()
}
async function expenseForm(e=null){
  const ps=state.data.projects;if(!ps.length)return Swal.fire({icon:"info",title:"กรุณาเพิ่มโครงการก่อน"});const opts=ps.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("");
  const r=await Swal.fire({title:e?"แก้ไขรายจ่าย":"บันทึกรายจ่าย",width:700,html:`<div class="form-stack" style="text-align:left"><label>โครงการ<select id="prj">${opts}</select></label><label>กิจกรรม<select id="act"></select></label><label>วันที่<input id="date" type="date" value="${esc(e?.date||today())}"></label><label>เลขที่เอกสาร<input id="doc" value="${esc(e?.docNo||"")}"></label><label>รายการ<input id="desc" value="${esc(e?.description||"")}"></label><label>หมวด<select id="cat"><option>ค่าตอบแทน</option><option>ค่าใช้สอย</option><option>ค่าวัสดุ</option><option>ค่าครุภัณฑ์</option><option>อื่น ๆ</option></select></label><label>จำนวนเงิน<input id="amount" type="number" min=".01" step=".01" value="${esc(e?.amount||"")}"></label><label>ผู้รับเงิน/ร้านค้า<input id="payee" value="${esc(e?.payee||"")}"></label><label>หมายเหตุ<textarea id="note">${esc(e?.note||"")}</textarea></label></div>`,showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",didOpen:()=>{const p=$("#prj"),a=$("#act"),fill=()=>{const xs=state.data.activities.filter(x=>x.projectId===p.value);a.innerHTML=`<option value="">ไม่ระบุกิจกรรม</option>`+xs.map(x=>`<option value="${x.id}">${esc(x.code)} - ${esc(x.name)}</option>`).join("");if(e?.activityId&&xs.some(x=>x.id===e.activityId))a.value=e.activityId};p.value=e?.projectId||ps[0].id;fill();p.onchange=fill;$("#cat").value=e?.category||"ค่าวัสดุ"},preConfirm:()=>{const v={id:e?.id||uid("exp"),projectId:$("#prj").value,activityId:$("#act").value,date:$("#date").value,docNo:$("#doc").value.trim(),description:$("#desc").value.trim(),category:$("#cat").value,amount:num($("#amount").value),payee:$("#payee").value.trim(),note:$("#note").value.trim()};if(!v.date||!v.description||v.amount<=0)return Swal.showValidationMessage("กรุณากรอกวันที่ รายการ และจำนวนเงิน");return v}});
  if(!r.value)return;try{await api("/api/expenses",{method:e?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData()}catch(x){err(x)}
}
async function remove(type,id){const x=await Swal.fire({icon:"warning",title:"ยืนยันการลบ",text:"ข้อมูลที่ลบไม่สามารถย้อนกลับได้",showCancelButton:true,confirmButtonText:"ลบ",cancelButtonText:"ยกเลิก",confirmButtonColor:"#dc2626"});if(!x.isConfirmed)return;try{await api(`/api/${type}?id=${encodeURIComponent(id)}`,{method:"DELETE"});await refreshData()}catch(e){err(e)}}
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

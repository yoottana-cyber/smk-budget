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
function logout(show=true){sessionStorage.removeItem("budget_token");state.token="";state.user=null;state.integrityReady=false;state.integrityReport=null;showLogin();if(show)Swal.fire({icon:"success",title:"ออกจากระบบแล้ว",timer:900,showConfirmButton:false})}
function showLogin(){$("#loginView").classList.remove("hidden");$("#appView").classList.add("hidden")}
function showApp(){$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");const roles=userRoles(state.user);$("#userBox").innerHTML=`<strong>${esc(state.user.displayName)}</strong><span>${roles.map(r=>ROLE_LABELS[r]||r).join(" • ")}</span>`;$("#usersNav")?.classList.toggle("hidden",!hasRole("admin"));$("#importNav")?.classList.toggle("hidden",!hasAnyRole(["admin","planner"]));$("#requestsNav")?.classList.toggle("hidden",!hasAnyRole(["admin","planner","teacher","procurement","finance"]));$("#procurementNav")?.classList.toggle("hidden",!hasAnyRole(["admin","procurement"]));$("#financeNav")?.classList.toggle("hidden",!hasAnyRole(["admin","finance"]));lucide.createIcons()}
async function refreshData(){try{if(hasRole("admin")&&!state.integrityReady){try{state.integrityReport=await api("/api/data-integrity",{method:"POST"})}catch{}state.integrityReady=true}state.data=await api("/api/data");years();render()}catch(e){err(e)}}
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
function panel(head,button,cols){return`<section class="panel"><div class="toolbar"><input id="search" class="search" placeholder="ค้นหา...">${canEdit()?`<button id="addBtn" class="btn btn-primary"><i data-lucide="plus"></i>${button}</button>`:""}</div><div class="table-wrap"><table><thead><tr>${cols}</tr></thead><tbody id="rows"></tbody></table></div></section>`}
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
      ${canEdit()?'<button id="addBtn" class="btn btn-primary"><i data-lucide="plus"></i>เพิ่มโครงการ</button>':""}
    </div>
    <div id="divisionTabs" class="division-tabs"></div>
    <div id="projectGroups"></div>
  </section>`;
  if(canEdit())$("#addBtn").onclick=()=>projectForm();

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
                  ${canEdit()?`<button class="icon-btn" data-add-activity="${p.id}" title="เพิ่มกิจกรรม"><i data-lucide="list-plus"></i></button><button class="icon-btn" data-pe="${p.id}" title="แก้ไขโครงการ"><i data-lucide="pencil"></i></button>`:""}
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
                  ${acts.map(a=>{const x=astat(a,ex);return`<tr><td><strong>${esc(a.code||"-")}</strong></td><td>${esc(a.name)}</td><td>${esc(a.owner||"-")}</td><td class="num">${money(x.budget)}</td><td class="num">${money(x.spent)}</td><td class="num ${x.balance<0?"negative":""}">${money(x.balance)}</td><td><span class="badge ${a.status==="เสร็จสิ้น"?"gray":""}">${esc(a.status||"ดำเนินการ")}</span></td><td><div class="actions">${canEdit()?`<button class="icon-btn" data-ae="${a.id}" title="แก้ไขกิจกรรม"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-ad="${a.id}" title="ลบกิจกรรม"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`}).join("")}
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
  const {activities:as,expenses:ex}=filtered(),pm=Object.fromEntries(state.data.projects.map(p=>[p.id,p]));$("#content").innerHTML=panel("","เพิ่มกิจกรรม","<th>โครงการ</th><th>กิจกรรม</th><th>ผู้รับผิดชอบ</th><th class='num'>งบดำเนินงาน</th><th class='num'>ใช้ไป</th><th class='num'>คงเหลือ</th><th>สถานะ</th><th></th>");if(canEdit())$("#addBtn").onclick=()=>activityForm();
  const paint=()=>{const q=$("#search").value.toLowerCase(),rs=as.filter(a=>`${a.code} ${a.name} ${a.owner} ${pm[a.projectId]?.name||""}`.toLowerCase().includes(q));$("#rows").innerHTML=rs.length?rs.map(a=>{const s=astat(a,ex);return`<tr><td>${esc(pm[a.projectId]?.code||"-")}<br><small>${esc(pm[a.projectId]?.name||"")}</small></td><td><strong>${esc(a.code)}</strong><br>${esc(a.name)}</td><td>${esc(a.owner)}</td><td class="num">${money(s.budget)}</td><td class="num">${money(s.spent)}</td><td class="num ${s.balance<0?"negative":""}">${money(s.balance)}</td><td><span class="badge ${a.status==="เสร็จสิ้น"?"gray":""}">${esc(a.status||"ดำเนินการ")}</span></td><td><div class="actions">${canEdit()?`<button class="icon-btn" data-e="${a.id}"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${a.id}"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`}).join(""):`<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;$$("[data-e]").forEach(b=>b.onclick=()=>activityForm(state.data.activities.find(x=>x.id===b.dataset.e)));$$("[data-d]").forEach(b=>b.onclick=()=>remove("activities",b.dataset.d));lucide.createIcons()};$("#search").oninput=paint;paint()
}
async function activityForm(a=null,defaultProjectId=""){
  const ps=state.data.projects;if(!ps.length)return Swal.fire({icon:"info",title:"กรุณาเพิ่มโครงการก่อน"});const opts=ps.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("");
  const r=await Swal.fire({title:a?"แก้ไขกิจกรรม":"เพิ่มกิจกรรม",html:`<div class="form-stack" style="text-align:left"><label>โครงการ<select id="prj">${opts}</select></label><label>รหัสกิจกรรม<input id="code" value="${esc(a?.code||"")}"></label><label>ชื่อกิจกรรม<input id="name" value="${esc(a?.name||"")}"></label><label>ผู้รับผิดชอบ<input id="owner" value="${esc(a?.owner||"")}"></label><label>งบดำเนินงาน<input id="budget" type="number" min="0" step=".01" value="${esc(a?.budget||"")}"></label><label>สถานะ<select id="status"><option>ดำเนินการ</option><option>เสร็จสิ้น</option></select></label></div>`,showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",didOpen:()=>{$("#prj").value=a?.projectId||defaultProjectId||ps[0].id;$("#status").value=a?.status||"ดำเนินการ"},preConfirm:()=>{const v={id:a?.id||uid("act"),projectId:$("#prj").value,code:$("#code").value.trim(),name:$("#name").value.trim(),owner:$("#owner").value.trim(),budget:num($("#budget").value),status:$("#status").value};if(!v.code||!v.name)return Swal.showValidationMessage("กรุณากรอกรหัสและชื่อกิจกรรม");return v}});
  if(!r.value)return;try{await api("/api/activities",{method:a?"PUT":"POST",body:JSON.stringify(r.value)});await refreshData()}catch(e){err(e)}
}
function expenses(){
  const {expenses:es}=filtered(),pm=Object.fromEntries(state.data.projects.map(p=>[p.id,p])),am=Object.fromEntries(state.data.activities.map(a=>[a.id,a]));$("#content").innerHTML=panel("","เพิ่มรายจ่าย","<th>วันที่</th><th>เอกสาร</th><th>โครงการ / กิจกรรม</th><th>รายการ</th><th>หมวด</th><th>ผู้รับเงิน</th><th class='num'>จำนวนเงิน</th><th></th>");if(canEdit())$("#addBtn").onclick=()=>expenseForm();
  const paint=()=>{const q=$("#search").value.toLowerCase(),rs=[...es].sort((a,b)=>String(b.date).localeCompare(String(a.date))).filter(e=>`${e.docNo} ${e.description} ${e.payee} ${e.category}`.toLowerCase().includes(q));$("#rows").innerHTML=rs.length?rs.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.docNo)}</td><td>${esc(pm[e.projectId]?.code||"-")}<br><small>${esc(am[e.activityId]?.name||"-")}</small></td><td>${esc(e.description)}</td><td><span class="badge gray">${esc(e.category||"-")}</span></td><td>${esc(e.payee||"-")}</td><td class="num"><strong>${money(e.amount)}</strong></td><td><div class="actions">${canEdit()?`<button class="icon-btn" data-e="${e.id}"><i data-lucide="pencil"></i></button>`:""}${canAdmin()?`<button class="icon-btn" data-d="${e.id}"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`).join(""):`<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>`;$$("[data-e]").forEach(b=>b.onclick=()=>expenseForm(state.data.expenses.find(x=>x.id===b.dataset.e)));$$("[data-d]").forEach(b=>b.onclick=()=>remove("expenses",b.dataset.d));lucide.createIcons()};$("#search").oninput=paint;paint()
}
async function expenseForm(e=null){
  const ps=state.data.projects;if(!ps.length)return Swal.fire({icon:"info",title:"กรุณาเพิ่มโครงการก่อน"});
  const opts=ps.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("");
  const fundLabels={subsidy:"งบเงินอุดหนุน",activity:"งบกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่น ๆ"};
  const linked=!!e?.requestId||/REQ-\d{4}-\d{4}/.test(String(e?.note||"")+" "+String(e?.description||""));
  const r=await Swal.fire({
    title:e?"แก้ไขรายจ่าย":"บันทึกรายจ่าย",width:700,
    html:`<div class="form-stack" style="text-align:left">${linked?'<div class="badge request-info" style="padding:8px 10px">รายการนี้เชื่อมกับคำขอเบิก หากต้องการเปลี่ยนโครงการ กิจกรรม หรือประเภทเงิน ให้แก้จากหน้าคำขอเบิก</div>':""}<label>โครงการ<select id="prj">${opts}</select></label><label>กิจกรรม<select id="act"></select></label><label>ประเภทเงิน<select id="expenseFund"></select><small id="expenseFundInfo" class="muted"></small></label><label>วันที่<input id="date" type="date" value="${esc(e?.date||today())}"></label><label>เลขที่เอกสาร<input id="doc" value="${esc(e?.docNo||"")}" placeholder="เว้นว่างเพื่อรัน บจ. อัตโนมัติ"><small class="muted">รายการใหม่หากเว้นว่าง ระบบจะรันเลข บจ. ต่อจากรายการรายจ่ายล่าสุด</small></label><label>รายการ<input id="desc" value="${esc(e?.description||"")}"></label><label>หมวด<select id="cat"><option>ค่าตอบแทน</option><option>ค่าใช้สอย</option><option>ค่าวัสดุ</option><option>ค่าครุภัณฑ์</option><option>อื่น ๆ</option></select></label><label>จำนวนเงิน<input id="amount" type="number" min=".01" step=".01" value="${esc(e?.amount||"")}"></label><label>ผู้รับเงิน/ร้านค้า<input id="payee" value="${esc(e?.payee||"")}"></label><label>หมายเหตุ<textarea id="note">${esc(e?.note||"")}</textarea></label></div>`,
    showCancelButton:true,confirmButtonText:"บันทึก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
    didOpen:()=>{
      const p=$("#prj"),a=$("#act"),f=$("#expenseFund");
      const fillFunds=()=>{
        const fs=(state.data.activityFunds||[]).filter(x=>x.activityId===a.value&&num(x.budget)>0);
        f.innerHTML=fs.length?fs.map(x=>`<option value="${x.fundType}">${esc(fundLabels[x.fundType]||x.fundType)} — ${money(x.budget)}</option>`).join(""):'<option value="">ไม่พบงบประเภทเงิน</option>';
        if(e?.fundType&&fs.some(x=>x.fundType===e.fundType))f.value=e.fundType;
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

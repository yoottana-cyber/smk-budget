
function importMoney(v){
  if(v===null||v===undefined||v===""||String(v).trim()==="-")return 0;
  return Number(String(v).replace(/,/g,"").trim())||0;
}
function splitActivityName(v){
  const s=String(v||"").trim(),m=s.match(/^(\d+(?:\.\d+)*)[.)]?\s*(.*)$/);
  return m?{code:m[1],name:(m[2]||s).trim()}:{code:"",name:s};
}
function parseProjectWorkbook(wb){
  const projects=[],summary=[];
  for(const sheetName of wb.SheetNames){
    if(sheetName.includes("ตรวจสอบเงินกิจกรรม"))continue;
    const ws=wb.Sheets[sheetName],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
    const headerIndex=rows.findIndex(r=>String(r[0]||"").trim()==="ที่"&&String(r[1]||"").includes("โครงการ"));
    if(headerIndex<0)continue;
    const headText=rows.slice(0,Math.min(headerIndex+2,8)).flat().join(" ");
    const fy=(headText.match(/ปีงบประมาณ\s*(\d{4})/)||[])[1]||"";
    let current=null,projectCount=0,activityCount=0,total=0;
    for(let i=headerIndex+2;i<rows.length;i++){
      const r=rows[i]||[],a=String(r[0]??"").trim(),b=String(r[1]??"").trim(),owner=String(r[2]??"").trim();
      if(!b)continue;
      if(/^รวม/.test(b)||/รวมทั้งสิ้น|งบที่ใช้ไป|คงเหลือ/.test(b))continue;
      const isProject=a!==""&&/^\d+(?:\.\d+)*$/.test(a);
      if(isProject){
        current={fiscalYear:fy,division:sheetName,sourceSheet:sheetName,code:a,name:b,owner,budget:0,activities:[]};
        projects.push(current);projectCount++;continue;
      }
      if(!current)continue;
      const n=splitActivityName(b);
      const subsidyBudget=importMoney(r[3]),activityBudget=importMoney(r[4]),incomeBudget=importMoney(r[5]),otherBudget=importMoney(r[6]);
      const budget=subsidyBudget+activityBudget+incomeBudget+otherBudget;
      current.activities.push({code:n.code,name:n.name,owner:owner||current.owner,budget,subsidyBudget,activityBudget,incomeBudget,otherBudget});
      current.budget+=budget;activityCount++;total+=budget;
    }
    if(projectCount)summary.push({division:sheetName,fiscalYear:fy,projects:projectCount,activities:activityCount,total});
  }
  return{projects,summary};
}
async function importProjects(){
  if(!hasAnyRole(["admin","planner"])){state.route="dashboard";return render()}
  $("#content").innerHTML=`
    <section class="panel">
      <div class="panel-head"><div><h3>นำเข้าข้อมูลโครงการจาก Excel</h3><p class="muted">รองรับรูปแบบเดียวกับไฟล์สรุปงบประมาณ ปี 2569 ที่ใช้เป็นต้นแบบ</p></div></div>
      <div class="import-drop">
        <i data-lucide="file-spreadsheet"></i>
        <div><strong>เลือกไฟล์ Excel</strong><p class="muted">ระบบจะอ่านชีตฝ่ายงาน โครงการ กิจกรรม และงบแยกตามประเภทเงิน</p></div>
        <input id="projectImportFile" type="file" accept=".xlsx,.xls">
      </div>
      <div id="importPreview" class="hidden"></div>
    </section>`;
  lucide.createIcons();
  $("#projectImportFile").onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:"array"}),parsed=parseProjectWorkbook(wb);
      window.__projectImport=parsed;
      if(!parsed.projects.length)throw new Error("ไม่พบข้อมูลโครงการตามรูปแบบต้นแบบ");
      const totalProjects=parsed.projects.length,totalActivities=parsed.projects.reduce((s,p)=>s+p.activities.length,0),totalBudget=parsed.projects.reduce((s,p)=>s+num(p.budget),0);
      $("#importPreview").classList.remove("hidden");
      $("#importPreview").innerHTML=`
        <div class="stats-grid import-stats">
          <article class="stat-card"><span class="stat-icon"><i data-lucide="folder-kanban"></i></span><div><small>โครงการ</small><strong>${totalProjects}</strong></div></article>
          <article class="stat-card"><span class="stat-icon"><i data-lucide="list-checks"></i></span><div><small>กิจกรรม</small><strong>${totalActivities}</strong></div></article>
          <article class="stat-card"><span class="stat-icon"><i data-lucide="wallet-cards"></i></span><div><small>งบรวม</small><strong>${money(totalBudget)}</strong></div></article>
        </div>
        <div class="table-wrap"><table><thead><tr><th>ฝ่ายงาน/ชีต</th><th>ปีงบประมาณ</th><th class="num">โครงการ</th><th class="num">กิจกรรม</th><th class="num">งบรวม</th></tr></thead><tbody>
          ${parsed.summary.map(x=>`<tr><td>${esc(x.division)}</td><td>${esc(x.fiscalYear)}</td><td class="num">${x.projects}</td><td class="num">${x.activities}</td><td class="num">${money(x.total)}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="import-actions"><p class="muted">นำเข้าซ้ำได้ ระบบจะอัปเดตโครงการ/กิจกรรมเดิมที่ตรงกัน แทนการสร้างซ้ำ</p><button id="confirmImportBtn" class="btn btn-primary"><i data-lucide="upload"></i>นำเข้า ${totalProjects} โครงการ</button></div>`;
      lucide.createIcons();
      $("#confirmImportBtn").onclick=()=>confirmProjectImport();
    }catch(x){err(x)}
  };
}
async function confirmProjectImport(){
  const parsed=window.__projectImport;if(!parsed?.projects?.length)return;
  const ok=await Swal.fire({icon:"question",title:"ยืนยันการนำเข้าข้อมูล",text:"ระบบจะเพิ่มหรืออัปเดตโครงการ กิจกรรม และประเภทเงินจากไฟล์นี้",showCancelButton:true,confirmButtonText:"นำเข้า",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e"});
  if(!ok.isConfirmed)return;
  Swal.fire({title:"กำลังนำเข้าข้อมูล",text:"กรุณารอสักครู่...",allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try{
    const r=await api("/api/import-projects",{method:"POST",body:JSON.stringify({projects:parsed.projects})});
    await refreshData();
    await Swal.fire({icon:"success",title:"นำเข้าเรียบร้อย",html:`สร้างโครงการใหม่ <b>${r.projectCreated}</b> / อัปเดต <b>${r.projectUpdated}</b><br>สร้างกิจกรรมใหม่ <b>${r.activityCreated}</b> / อัปเดต <b>${r.activityUpdated}</b>`});
    state.route="projects";render();
  }catch(x){err(x)}
}

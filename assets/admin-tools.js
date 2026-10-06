function downloadBlobFile(name,blob){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function fetchSystemBackup(){
  const x=await api("/api/admin-tools?action=backup&_="+Date.now());
  if(!x.backup)throw new Error("ไม่พบข้อมูลสำรอง");
  return x.backup;
}
function backupFileStamp(){
  const d=new Date(),p=n=>String(n).padStart(2,"0");
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"_"+p(d.getHours())+p(d.getMinutes());
}
async function backupJson(){
  try{
    const backup=await fetchSystemBackup(),blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json;charset=utf-8"});
    downloadBlobFile("smk-budget-backup_"+backupFileStamp()+".json",blob);
    Swal.fire({icon:"success",title:"สร้างไฟล์สำรองแล้ว",text:"เก็บไฟล์ JSON นี้ไว้สำหรับกู้คืนข้อมูล",timer:1400,showConfirmButton:false});
  }catch(e){err(e)}
}
async function backupExcel(){
  try{
    if(typeof XLSX==="undefined")throw new Error("ไลบรารี Excel ยังโหลดไม่สำเร็จ");
    const backup=await fetchSystemBackup(),wb=XLSX.utils.book_new();
    for(const [sheet,rows] of Object.entries(backup.sheets||{})){
      const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{ข้อมูล:"ไม่มีข้อมูล"}]);
      ws["!cols"]=Object.keys(rows[0]||{ข้อมูล:""}).map(k=>({wch:Math.min(42,Math.max(12,k.length+4))}));
      XLSX.utils.book_append_sheet(wb,ws,sheet.slice(0,31));
    }
    XLSX.writeFile(wb,"smk-budget-backup_"+backupFileStamp()+".xlsx");
  }catch(e){err(e)}
}
async function restoreBackupFile(file){
  if(!file)return;
  try{
    const text=await file.text();let backup;
    try{backup=JSON.parse(text)}catch{throw new Error("ไฟล์ JSON ไม่ถูกต้อง")}
    if(backup?.app!=="smk-budget"||Number(backup?.version)!==1)throw new Error("ไฟล์นี้ไม่ใช่ Backup ของระบบเวอร์ชันที่รองรับ");
    const q=await Swal.fire({
      icon:"warning",title:"กู้คืนข้อมูลจากไฟล์สำรอง?",
      html:'<div style="text-align:left"><p>ข้อมูลโครงการ กิจกรรม รายจ่าย คำขอเบิก และการตั้งค่าปัจจุบันจะถูกแทนที่ด้วยข้อมูลในไฟล์สำรอง</p><p><strong>บัญชีผู้ใช้งานจะไม่ถูกเปลี่ยนแปลง</strong></p><p class="muted">Backup วันที่ '+esc(new Date(backup.createdAt||Date.now()).toLocaleString("th-TH"))+'</p></div>',
      showCancelButton:true,confirmButtonText:"กู้คืนข้อมูล",cancelButtonText:"ยกเลิก",confirmButtonColor:"#b91c1c"
    });
    if(!q.isConfirmed)return;
    const x=await api("/api/admin-tools",{method:"POST",body:JSON.stringify({action:"restore",confirm:"RESTORE",backup})});
    const total=Object.values(x.counts||{}).reduce((s,n)=>s+Number(n||0),0);
    await Swal.fire({icon:"success",title:"กู้คืนข้อมูลเรียบร้อย",text:"กู้คืน "+total+" แถวข้อมูลแล้ว",confirmButtonColor:"#0f766e"});
    await refreshData();adminTools();
  }catch(e){err(e)}
}
async function createNewFiscalYear(){
  const years=[...new Set((state.data.projects||[]).map(p=>String(p.fiscalYear||"")).filter(Boolean))].sort().reverse();
  if(!years.length)return Swal.fire({icon:"info",title:"ยังไม่มีปีงบประมาณต้นทาง"});
  const opts=years.map(y=>'<option value="'+esc(y)+'">'+esc(y)+'</option>').join("");
  const suggested=String((Number(years[0])||Number(currentFiscalYear()))+1);
  const r=await Swal.fire({
    title:"เปิดปีงบประมาณใหม่",width:620,
    html:'<div class="form-stack" style="text-align:left"><label>คัดลอกโครงสร้างจากปี<select id="newYearSource">'+opts+'</select></label><label>ปีงบประมาณใหม่<input id="newYearTarget" inputmode="numeric" maxlength="4" value="'+esc(suggested)+'"></label><div class="backup-note"><i data-lucide="info"></i><span>ระบบจะคัดลอกโครงการ กิจกรรม ประเภทเงิน และวงเงินเดิม แต่จะไม่คัดลอกคำขอเบิกหรือรายจ่ายเก่า</span></div></div>',
    showCancelButton:true,confirmButtonText:"สร้างปีงบประมาณ",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
    didOpen:()=>lucide.createIcons(),
    preConfirm:()=>{
      const sourceYear=$("#newYearSource").value,targetYear=$("#newYearTarget").value.trim();
      if(!/^\d{4}$/.test(targetYear))return Swal.showValidationMessage("กรุณาระบุปีงบประมาณ 4 หลัก");
      if(sourceYear===targetYear)return Swal.showValidationMessage("ปีงบประมาณใหม่ต้องไม่ซ้ำกับปีต้นทาง");
      return{sourceYear,targetYear};
    }
  });
  if(!r.value)return;
  try{
    const x=await api("/api/admin-tools",{method:"POST",body:JSON.stringify({action:"new_fiscal_year",...r.value})}),z=x.result||{};
    await Swal.fire({icon:"success",title:"เปิดปีงบประมาณ "+esc(z.targetYear)+" แล้ว",html:'คัดลอก <strong>'+Number(z.projects||0)+'</strong> โครงการ<br><strong>'+Number(z.activities||0)+'</strong> กิจกรรม',confirmButtonColor:"#0f766e"});
    await refreshData();adminTools();
  }catch(e){err(e)}
}
async function adminTools(){
  if(!hasRole("admin")){state.route="dashboard";return render()}
  const years=[...new Set((state.data.projects||[]).map(p=>String(p.fiscalYear||"")).filter(Boolean))].sort().reverse();
  $("#content").innerHTML=`<section class="panel">
    <div class="panel-head"><div><h3>เครื่องมือผู้ดูแลระบบ</h3><p class="muted">สำรองข้อมูล กู้คืน และเตรียมปีงบประมาณใหม่</p></div></div>
    <div class="admin-tool-grid">
      <article class="admin-tool-card"><span class="admin-tool-icon"><i data-lucide="database-backup"></i></span><div><h4>สำรองข้อมูล</h4><p>เก็บ Snapshot ข้อมูลระบบก่อนนำเข้า แก้ไขครั้งใหญ่ หรือเปิดปีงบประมาณใหม่</p><div class="actions"><button id="backupJsonBtn" class="btn btn-primary"><i data-lucide="download"></i>Backup JSON</button><button id="backupExcelBtn" class="btn btn-ghost"><i data-lucide="file-spreadsheet"></i>Backup Excel</button></div></div></article>
      <article class="admin-tool-card"><span class="admin-tool-icon danger"><i data-lucide="rotate-ccw"></i></span><div><h4>กู้คืนข้อมูล</h4><p>กู้คืนจากไฟล์ JSON ที่สร้างโดยระบบ บัญชีผู้ใช้งานจะไม่ถูกเขียนทับ</p><input id="restoreBackupFile" type="file" accept=".json,application/json" hidden><button id="restoreBackupBtn" class="btn btn-ghost danger"><i data-lucide="upload"></i>เลือกไฟล์เพื่อกู้คืน</button></div></article>
      <article class="admin-tool-card"><span class="admin-tool-icon"><i data-lucide="calendar-plus-2"></i></span><div><h4>เปิดปีงบประมาณใหม่</h4><p>คัดลอกโครงสร้างจากปีเดิมโดยไม่คัดลอกคำขอเบิกและรายจ่าย ปีที่มีอยู่: ${years.map(esc).join(", ")||"-"}</p><button id="newFiscalYearBtn" class="btn btn-primary"><i data-lucide="copy-plus"></i>สร้างปีงบประมาณใหม่</button></div></article>
    </div>
  </section>
  <section class="panel"><div class="backup-note"><i data-lucide="shield-check"></i><span><strong>แนะนำ:</strong> ดาวน์โหลด Backup JSON ก่อนการนำเข้า/กู้คืน/เปิดปีใหม่ทุกครั้ง เพื่อให้ย้อนกลับได้หากข้อมูลผิดพลาด</span></div></section>`;
  $("#backupJsonBtn").onclick=backupJson;$("#backupExcelBtn").onclick=backupExcel;
  $("#restoreBackupBtn").onclick=()=>$("#restoreBackupFile").click();
  $("#restoreBackupFile").onchange=e=>{const file=e.target.files?.[0];if(file)restoreBackupFile(file);e.target.value=""};
  $("#newFiscalYearBtn").onclick=createNewFiscalYear;lucide.createIcons();
}

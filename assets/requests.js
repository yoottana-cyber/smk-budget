
const REQUEST_STATUS={
  submitted:["รอพัสดุ","warning"],
  procurement:["พัสดุดำเนินการ","warning"],
  finance:["รอการเงิน","info"],
  returned:["ส่งกลับแก้ไข","warning"],
  rejected:["ไม่อนุมัติ","gray"],
  paid:["จ่ายเงินแล้ว","success"],
  cancelled:["ยกเลิก","gray"]
};
const REQUEST_ROLES=["admin","planner","teacher","procurement","finance"];
let requestVisibleStatuses=new Set(Object.keys(REQUEST_STATUS));
function requestStatusBadge(s){
  const x=REQUEST_STATUS[s]||[s,"gray"];
  return `<span class="badge request-${x[1]}">${esc(x[0])}</span>`;
}
async function requests(){
  if(!hasAnyRole(REQUEST_ROLES)){state.route="dashboard";return render()}
  $("#content").innerHTML='<section class="panel"><div class="empty">กำลังโหลดรายการขอเบิก...</div></section>';
  try{
    const adminView=hasRole("admin"),d=await api("/api/requests?scope="+(adminView?"all":"mine")+"&_="+Date.now()),canNew=hasAnyRole(["admin","planner","teacher"]);
    const statusOptions=Object.entries(REQUEST_STATUS);
    const allStatuses=Object.keys(REQUEST_STATUS);
    $("#content").innerHTML=`
      <section class="panel">
        <div class="toolbar"><div><strong>${adminView?"รายการขอเบิกทั้งหมด":"รายการขอเบิกของฉัน"}</strong><p class="muted request-sub">${adminView?"ผู้ดูแลระบบสามารถตรวจสอบและแก้ไขรายการที่ยังไม่จ่ายเงินได้":"ส่งคำขอแล้วติดตามสถานะพัสดุและการเงินได้จากหน้านี้"}</p></div>
        ${canNew?'<button id="newRequestBtn" class="btn btn-primary"><i data-lucide="plus"></i>ขอเบิกเงิน</button>':""}</div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:4px 0 14px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
          <strong style="margin-right:2px">แสดงสถานะ</strong>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input id="requestStatusAll" type="checkbox"> ทั้งหมด</label>
          ${statusOptions.map(([key,val])=>`<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input class="request-status-check" type="checkbox" value="${key}"> ${esc(val[0])}</label>`).join("")}
        </div>
        <div class="table-wrap"><table><thead><tr><th>เลขที่คำขอ</th><th>โครงการ / กิจกรรม</th><th>ช่วงดำเนินการ</th><th>ประเภทเงิน</th><th class="num">ยอดขอเบิก</th><th>สถานะ</th><th></th></tr></thead><tbody id="requestRows"></tbody></table></div>
      </section>`;
    if(canNew)$("#newRequestBtn").onclick=()=>newRequest();

    const checks=$$(".request-status-check");
    checks.forEach(x=>x.checked=requestVisibleStatuses.has(x.value));
    const all=$("#requestStatusAll");
    all.checked=allStatuses.every(s=>requestVisibleStatuses.has(s));

    const paintRows=()=>{
      const rows=d.requests.filter(r=>requestVisibleStatuses.has(r.status));
      $("#requestRows").innerHTML=rows.length?rows.map(r=>`<tr>
        <td><strong>${esc(r.requestNo)}</strong><br><small>${esc((r.createdAt||"").slice(0,10))}</small></td>
        <td><strong>${esc(r.projectCode)} ${esc(r.projectName)}</strong><br><small>${esc(r.activityName)}</small></td>
        <td>${esc(r.startDate)}<br>ถึง ${esc(r.endDate)}</td>
        <td>${esc(r.fundLabel||r.fundType)}</td>
        <td class="num"><strong>${money(r.totalAmount)}</strong></td>
        <td>${requestStatusBadge(r.status)}</td>
        <td><div class="actions"><button class="icon-btn" data-timeline="${r.id}" title="ดูประวัติขั้นตอน"><i data-lucide="history"></i></button><button class="icon-btn" data-print="${r.id}" title="พิมพ์บันทึกขอเบิก"><i data-lucide="printer"></i></button>${adminView||r.status==="returned"&&r.requesterUserId===state.user.id?`<button class="icon-btn" data-edit-request="${r.id}" title="${r.status==="returned"&&!adminView?"แก้ไขและส่งใหม่":"แก้ไขรายการขอเบิก"}"><i data-lucide="${r.status==="returned"&&!adminView?"rotate-ccw":"pencil"}"></i></button>`:""}${r.status==="submitted"&&(!adminView||r.requesterUserId===state.user.id)?`<button class="icon-btn" data-cancel="${r.id}" title="ยกเลิกคำขอ"><i data-lucide="x"></i></button>`:""}${adminView?`<button class="icon-btn" data-delete-request="${r.id}" title="ลบรายการ"><i data-lucide="trash-2"></i></button>`:""}</div></td>
      </tr>`).join(""):'<tr><td colspan="7" class="empty">ไม่พบรายการตามสถานะที่เลือก</td></tr>';
      $$("[data-timeline]").forEach(b=>b.onclick=()=>requestTimeline(b.dataset.timeline));
      $$("[data-print]").forEach(b=>b.onclick=()=>printRequest(b.dataset.print));
      $$("[data-edit-request]").forEach(b=>b.onclick=()=>editRequest(b.dataset.editRequest));
      $$("[data-cancel]").forEach(b=>b.onclick=()=>cancelRequest(b.dataset.cancel));
      $$("[data-delete-request]").forEach(b=>b.onclick=()=>deleteRequest(d.requests.find(r=>r.id===b.dataset.deleteRequest),requests));
      lucide.createIcons();
    };

    checks.forEach(x=>x.onchange=()=>{
      if(x.checked)requestVisibleStatuses.add(x.value);else requestVisibleStatuses.delete(x.value);
      all.checked=allStatuses.every(s=>requestVisibleStatuses.has(s));
      paintRows();
    });
    all.onchange=()=>{
      requestVisibleStatuses=new Set(all.checked?allStatuses:[]);
      checks.forEach(x=>x.checked=all.checked);
      paintRows();
    };
    paintRows();
  }catch(e){err(e)}
}
function addBillRow(description="",amountValue=""){
  const box=$("#billRows");if(!box)return;
  const row=document.createElement("div");row.className="bill-row";
  row.innerHTML=`<input class="bill-desc" placeholder="ค่าอะไร / รายการ" value="${esc(description)}"><input class="bill-amount" type="number" min="0.01" step="0.01" placeholder="ยอดเงิน" value="${esc(amountValue)}"><button type="button" class="icon-btn bill-remove" title="ลบรายการ"><i data-lucide="trash-2"></i></button>`;
  box.appendChild(row);
  row.querySelector(".bill-remove").onclick=()=>{if($$(".bill-row",box).length>1)row.remove();else{row.querySelector(".bill-desc").value="";row.querySelector(".bill-amount").value=""}refreshBillTotal()};
  row.querySelector(".bill-amount").oninput=refreshBillTotal;
  lucide.createIcons();refreshBillTotal();
}
function refreshBillTotal(){
  const total=$$(".bill-amount",$("#billRows")||document).reduce((s,x)=>s+num(x.value),0);
  if($("#billTotal"))$("#billTotal").textContent=money(total);
}
async function newRequest(){
  try{
    const ctx=await api("/api/request-context");
    if(!ctx.projects.length)return Swal.fire({icon:"info",title:"ไม่พบโครงการที่รับผิดชอบ",text:"กรุณาตรวจชื่อผู้ใช้งานให้ตรงกับชื่อผู้รับผิดชอบโครงการ หรือติดต่อผู้ดูแลระบบ"});
    const divisionOrder=["วิชาการ","งบประมาณ","บุคคล","กิจการนักเรียน","บริหารทั่วไป"];
    const divisions=[...new Set(ctx.projects.map(p=>p.division||"ไม่ระบุฝ่าย"))].sort((a,b)=>{
      const ia=divisionOrder.indexOf(a),ib=divisionOrder.indexOf(b);
      if(ia>=0&&ib>=0)return ia-ib;
      if(ia>=0)return-1;if(ib>=0)return 1;
      return a.localeCompare(b,"th");
    });
    const pOpts=divisions.map(division=>{
      const rows=ctx.projects.filter(p=>(p.division||"ไม่ระบุฝ่าย")===division)
        .sort((a,b)=>String(a.code||"").localeCompare(String(b.code||""),"th",{numeric:true}));
      return `<optgroup label="${esc(division)}">${rows.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("")}</optgroup>`;
    }).join("");
    const r=await Swal.fire({
      title:"ส่งรายการขอเบิกเงินโครงการ",width:860,
      html:`<div class="form-stack request-form" style="text-align:left">
        <label>โครงการ<select id="rqProject">${pOpts}</select></label>
        <label>กิจกรรม<select id="rqActivity"></select></label>
        <div class="form-grid-2"><label>วันที่เริ่มดำเนินกิจกรรม<input id="rqStart" type="date"></label><label>วันที่สิ้นสุด<input id="rqEnd" type="date"></label></div>
        <label>รายละเอียด/วัตถุประสงค์ (ถ้ามี)<textarea id="rqDetails" placeholder="ใช้ในบันทึกขอเบิกเงิน"></textarea></label>
        <label>ประเภทเงิน<select id="rqFund"></select><small id="fundInfo" class="muted"></small></label>
        <div class="bill-head"><strong>รายการบิล</strong><button id="addBillBtn" type="button" class="btn btn-ghost"><i data-lucide="plus"></i>เพิ่มบิล</button></div>
        <div id="billRows" class="bill-list"></div>
        <div class="bill-total"><span>รวมยอดขอเบิก</span><strong id="billTotal">฿0.00</strong></div>
      </div>`,
      showCancelButton:true,confirmButtonText:"ส่งขอเบิก",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
      didOpen:()=>{
        const p=$("#rqProject"),a=$("#rqActivity"),f=$("#rqFund"),start=$("#rqStart"),end=$("#rqEnd");
        const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);start.value=local;end.value=local;
        const fillFunds=()=>{
          const fs=ctx.funds.filter(x=>x.activityId===a.value&&num(x.budget)>0);
          f.innerHTML=fs.length?fs.map(x=>`<option value="${x.fundType}">${esc(({subsidy:"งบเงินอุดหนุน",activity:"งบเงินกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่นๆ"})[x.fundType]||x.fundType)}</option>`).join(""):'<option value="">ไม่พบงบของกิจกรรมนี้</option>';
          const show=()=>{const x=fs.find(z=>z.fundType===f.value);$("#fundInfo").textContent=x?"งบ "+money(x.budget)+" • จ่ายแล้ว "+money(x.paid)+" • รอเบิก "+money(x.reserved)+" • พร้อมใช้ "+money(x.available):""};f.onchange=show;show();
        };
        const fillActs=()=>{
          const xs=ctx.activities.filter(x=>x.projectId===p.value);
          a.innerHTML=xs.map(x=>`<option value="${x.id}">${esc(x.code?x.code+" - ":"")}${esc(x.name)}</option>`).join("");
          fillFunds();
        };
        p.onchange=fillActs;a.onchange=fillFunds;fillActs();
        $("#addBillBtn").onclick=()=>addBillRow();addBillRow();lucide.createIcons();
      },
      preConfirm:()=>{
        const items=$$(".bill-row",$("#billRows")).map(row=>({description:row.querySelector(".bill-desc").value.trim(),amount:num(row.querySelector(".bill-amount").value)})).filter(x=>x.description&&x.amount>0);
        const fund=ctx.funds.find(x=>x.activityId===$("#rqActivity").value&&x.fundType===$("#rqFund").value);
        const total=items.reduce((s,x)=>s+x.amount,0);
        if(!$("#rqActivity").value)return Swal.showValidationMessage("กรุณาเลือกกิจกรรม");
        if(!fund)return Swal.showValidationMessage("กิจกรรมนี้ไม่มีประเภทเงินที่สามารถเบิกได้");
        if(!$("#rqStart").value||!$("#rqEnd").value||$("#rqEnd").value<$("#rqStart").value)return Swal.showValidationMessage("กรุณาตรวจช่วงวันที่ดำเนินกิจกรรม");
        if(!items.length)return Swal.showValidationMessage("กรุณาเพิ่มรายการบิลอย่างน้อย 1 รายการ");
        if(total>num(fund.available))return Swal.showValidationMessage("ยอดขอเบิกเกินเงินพร้อมใช้ "+money(fund.available));
        return{projectId:$("#rqProject").value,activityId:$("#rqActivity").value,startDate:$("#rqStart").value,endDate:$("#rqEnd").value,details:$("#rqDetails").value.trim(),fundType:$("#rqFund").value,items};
      }
    });
    if(!r.value)return;
    const x=await api("/api/requests",{method:"POST",body:JSON.stringify(r.value)});
    await Swal.fire({icon:"success",title:"ส่งคำขอเรียบร้อย",text:"เลขที่ "+x.request.requestNo});
    await refreshData();
    await requests();
  }catch(e){err(e)}
}
async function editRequest(id,refreshFn=requests){
  try{
    const [detail,ctx]=await Promise.all([
      api("/api/requests?scope=detail&id="+encodeURIComponent(id)),
      api("/api/request-context")
    ]);
    const rq=detail.request,adminMode=hasRole("admin"),resubmitMode=!adminMode&&rq.status==="returned"&&rq.requesterUserId===state.user.id;
    if(!adminMode&&!resubmitMode)return Swal.fire({icon:"warning",title:"ไม่มีสิทธิ์แก้ไขรายการนี้"});
    const eligibleProjects=ctx.projects.filter(p=>String(p.fiscalYear||"")===String(rq.fiscalYear||""));
    const divisionOrder=["วิชาการ","งบประมาณ","บุคคล","กิจการนักเรียน","บริหารทั่วไป"];
    const divisions=[...new Set(eligibleProjects.map(p=>p.division||"ไม่ระบุฝ่าย"))].sort((a,b)=>{
      const ia=divisionOrder.indexOf(a),ib=divisionOrder.indexOf(b);
      if(ia>=0&&ib>=0)return ia-ib;if(ia>=0)return-1;if(ib>=0)return 1;
      return a.localeCompare(b,"th");
    });
    const pOpts=divisions.map(division=>{
      const rows=eligibleProjects.filter(p=>(p.division||"ไม่ระบุฝ่าย")===division).sort((a,b)=>String(a.code||"").localeCompare(String(b.code||""),"th",{numeric:true}));
      return `<optgroup label="${esc(division)}">${rows.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}</option>`).join("")}</optgroup>`;
    }).join("");
    const x=await Swal.fire({
      title:(resubmitMode?"แก้ไขและส่งคำขอใหม่ ":"แก้ไขรายการขอเบิก ")+esc(rq.requestNo),width:860,
      html:`<div class="form-stack request-form" style="text-align:left">
        ${resubmitMode?'<div class="badge request-warning" style="padding:8px 10px">รายการนี้ถูกส่งกลับ กรุณาแก้ไขข้อมูลแล้วส่งใหม่ ระบบจะตรวจงบคงเหลืออีกครั้ง</div>':rq.status==="paid"?'<div class="badge request-warning" style="padding:8px 10px">รายการนี้จ่ายเงินแล้ว การแก้โครงการ/กิจกรรม/ประเภทเงินจะซิงก์ไปยังรายจ่ายที่เชื่อมกัน</div>':rq.status==="cancelled"?'<div class="badge gray" style="padding:8px 10px">รายการนี้ถูกยกเลิก การแก้ไขจะเปลี่ยนเฉพาะข้อมูลประวัติและไม่กระทบยอดงบ</div>':rq.status==="rejected"?'<div class="badge gray" style="padding:8px 10px">รายการนี้ไม่อนุมัติและเก็บไว้เป็นประวัติ</div>':""}
        <label>ผู้ขอเบิก<input value="${esc(rq.requesterName||"-")}" disabled></label>
        <label>โครงการ<select id="rqProject">${pOpts}</select></label>
        <label>กิจกรรม<select id="rqActivity"></select></label>
        <div class="form-grid-2"><label>วันที่เริ่มดำเนินกิจกรรม<input id="rqStart" type="date" value="${esc(rq.startDate||"")}"></label><label>วันที่สิ้นสุด<input id="rqEnd" type="date" value="${esc(rq.endDate||"")}"></label></div>
        <label>รายละเอียด/วัตถุประสงค์<textarea id="rqDetails">${esc(rq.details||"")}</textarea></label>
        <label>ประเภทเงิน<select id="rqFund"></select><small id="fundInfo" class="muted"></small></label>
        <div class="bill-head"><strong>รายการบิล</strong><button id="addBillBtn" type="button" class="btn btn-ghost"><i data-lucide="plus"></i>เพิ่มบิล</button></div>
        <div id="billRows" class="bill-list"></div>
        <div class="bill-total"><span>รวมยอดขอเบิก</span><strong id="billTotal">฿0.00</strong></div>
      </div>`,
      showCancelButton:true,confirmButtonText:resubmitMode?"บันทึกและส่งใหม่":"บันทึกการแก้ไข",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
      didOpen:()=>{
        const p=$("#rqProject"),a=$("#rqActivity"),f=$("#rqFund");
        p.value=rq.projectId;
        const fillFunds=(preferred="")=>{
          const fs=ctx.funds.filter(z=>z.activityId===a.value&&num(z.budget)>0);
          f.innerHTML=fs.length?fs.map(z=>`<option value="${z.fundType}">${esc(({subsidy:"งบเงินอุดหนุน",activity:"งบเงินกิจกรรมพัฒนาคุณภาพผู้เรียน",income:"งบเงินรายได้ฯ",other:"อื่นๆ"})[z.fundType]||z.fundType)}</option>`).join(""):'<option value="">ไม่พบงบของกิจกรรมนี้</option>';
          if(preferred&&fs.some(z=>z.fundType===preferred))f.value=preferred;
          const show=()=>{const z=fs.find(q=>q.fundType===f.value);const committed=rq.status==="paid"?num(rq.paidAmount||rq.totalAmount):(["submitted","procurement","finance"].includes(rq.status)?num(rq.totalAmount):0);const addBack=(a.value===rq.activityId&&f.value===rq.fundType)?committed:0;$("#fundInfo").textContent=z?"งบ "+money(z.budget)+" • จ่ายแล้ว "+money(z.paid)+" • รอเบิก "+money(Math.max(num(z.reserved)-(rq.status==="paid"?0:addBack),0))+" • พร้อมใช้ "+money(num(z.available)+addBack):""};f.onchange=show;show();
        };
        const fillActs=(preferredAct="",preferredFund="")=>{
          const xs=ctx.activities.filter(z=>z.projectId===p.value);
          a.innerHTML=xs.map(z=>`<option value="${z.id}">${esc(z.code?z.code+" - ":"")}${esc(z.name)}</option>`).join("");
          if(preferredAct&&xs.some(z=>z.id===preferredAct))a.value=preferredAct;
          fillFunds(preferredFund);
        };
        p.onchange=()=>fillActs();a.onchange=()=>fillFunds();
        fillActs(rq.activityId,rq.fundType);
        $("#addBillBtn").onclick=()=>addBillRow();
        (detail.items||[]).forEach(z=>addBillRow(z.description,z.amount));
        if(!(detail.items||[]).length)addBillRow();
        lucide.createIcons();
      },
      preConfirm:()=>{
        const items=$$(".bill-row",$("#billRows")).map(row=>({description:row.querySelector(".bill-desc").value.trim(),amount:num(row.querySelector(".bill-amount").value)})).filter(z=>z.description&&z.amount>0);
        const fund=ctx.funds.find(z=>z.activityId===$("#rqActivity").value&&z.fundType===$("#rqFund").value);
        const total=items.reduce((s,z)=>s+z.amount,0);
        const committed=rq.status==="paid"?num(rq.paidAmount||rq.totalAmount):(["submitted","procurement","finance"].includes(rq.status)?num(rq.totalAmount):0);const addBack=($("#rqActivity").value===rq.activityId&&$("#rqFund").value===rq.fundType)?committed:0;
        if(!$("#rqActivity").value)return Swal.showValidationMessage("กรุณาเลือกกิจกรรม");
        if(!fund)return Swal.showValidationMessage("กิจกรรมนี้ไม่มีประเภทเงินที่สามารถเบิกได้");
        if(!$("#rqStart").value||!$("#rqEnd").value||$("#rqEnd").value<$("#rqStart").value)return Swal.showValidationMessage("กรุณาตรวจช่วงวันที่ดำเนินกิจกรรม");
        if(!items.length)return Swal.showValidationMessage("กรุณาเพิ่มรายการบิลอย่างน้อย 1 รายการ");
        if(total>num(fund.available)+addBack)return Swal.showValidationMessage("ยอดขอเบิกเกินเงินพร้อมใช้ "+money(num(fund.available)+addBack));
        return{id:rq.id,action:resubmitMode?"resubmit":"admin_edit",projectId:$("#rqProject").value,activityId:$("#rqActivity").value,startDate:$("#rqStart").value,endDate:$("#rqEnd").value,details:$("#rqDetails").value.trim(),fundType:$("#rqFund").value,items};
      }
    });
    if(!x.value)return;
    await api("/api/requests",{method:"PUT",body:JSON.stringify(x.value)});
    await refreshData();
    await Swal.fire({icon:"success",title:resubmitMode?"ส่งคำขอใหม่แล้ว":"แก้ไขรายการขอเบิกแล้ว",timer:1000,showConfirmButton:false});
    refreshFn();
  }catch(e){err(e)}
}
async function cancelRequest(id){
  const r=await Swal.fire({icon:"warning",title:"ยกเลิกคำขอนี้?",text:"ยอดที่กันไว้จะถูกคืนเป็นเงินพร้อมใช้",showCancelButton:true,confirmButtonText:"ยกเลิกคำขอ",cancelButtonText:"ไม่ยกเลิก",confirmButtonColor:"#dc2626"});
  if(!r.isConfirmed)return;
  try{await api("/api/requests",{method:"PUT",body:JSON.stringify({id,action:"cancel"})});requests()}catch(e){err(e)}
}
async function deleteRequest(r,refreshFn=requests){
  if(!hasRole("admin")||!r)return;
  const paid=r.status==="paid";
  const q=await Swal.fire({
    icon:"warning",
    title:"ลบ "+esc(r.requestNo)+" ?",
    html:paid
      ?'<div style="text-align:left">รายการนี้ <strong>จ่ายเงินแล้ว</strong><br>ระบบจะลบคำขอ รายการบิล และรายจ่ายที่เชื่อมกับคำขอนี้ด้วย ทำให้งบประมาณถูกคืนกลับ</div>'
      :'ข้อมูลคำขอและรายการบิลจะถูกลบออกจากระบบ',
    showCancelButton:true,
    confirmButtonText:"ลบรายการ",
    cancelButtonText:"ยกเลิก",
    confirmButtonColor:"#dc2626"
  });
  if(!q.isConfirmed)return;
  try{
    await api("/api/requests?id="+encodeURIComponent(r.id),{method:"DELETE"});
    await refreshData();
    await Swal.fire({icon:"success",title:"ลบรายการแล้ว",timer:900,showConfirmButton:false});
    refreshFn();
  }catch(e){err(e)}
}

async function workflowDecision(id,action,refreshFn){
  const labels={
    return_edit:{title:"ส่งกลับแก้ไข",prompt:"ระบุเหตุผลที่ส่งกลับให้ผู้ขอเบิกแก้ไข",confirm:"ส่งกลับแก้ไข"},
    return_procurement:{title:"ส่งกลับงานพัสดุ",prompt:"ระบุเหตุผลที่ส่งกลับให้พัสดุดำเนินการ",confirm:"ส่งกลับพัสดุ"},
    reject:{title:"ไม่อนุมัติคำขอ",prompt:"ระบุเหตุผลที่ไม่อนุมัติ",confirm:"ยืนยันไม่อนุมัติ"}
  },x=labels[action]||labels.return_edit;
  const r=await Swal.fire({
    icon:action==="reject"?"warning":"question",
    title:x.title,
    input:"textarea",
    inputLabel:x.prompt,
    inputPlaceholder:"กรุณาระบุเหตุผล...",
    inputAttributes:{maxlength:"1000"},
    showCancelButton:true,
    confirmButtonText:x.confirm,
    cancelButtonText:"ยกเลิก",
    confirmButtonColor:action==="reject"?"#dc2626":"#0f766e",
    inputValidator:v=>!String(v||"").trim()?"กรุณาระบุเหตุผล":undefined
  });
  if(!r.isConfirmed)return;
  try{
    await api("/api/requests",{method:"PUT",body:JSON.stringify({id,action,reason:String(r.value||"").trim()})});
    await refreshData();
    await Swal.fire({icon:"success",title:"ดำเนินการเรียบร้อย",timer:900,showConfirmButton:false});
    refreshFn();
  }catch(e){err(e)}
}
async function requestTimeline(id){
  try{
    const d=await api("/api/requests?scope=detail&id="+encodeURIComponent(id)),r=d.request,logs=d.timeline||[];
    const actionLabels={CREATE:"ส่งคำขอ",UPDATE:"แก้ไข",STATUS:"เปลี่ยนสถานะ",PAY:"จ่ายเงิน",RETURN:"ส่งกลับ",REJECT:"ไม่อนุมัติ",RESUBMIT:"ส่งใหม่",DELETE:"ลบ"};
    const statusLabels=Object.fromEntries(Object.entries(REQUEST_STATUS).map(([k,v])=>[k,v[0]]));
    const rows=logs.map(x=>{
      let detail={};try{detail=JSON.parse(x.details||"{}")}catch{}
      const reason=detail.reason?'<div class="timeline-reason"><strong>เหตุผล:</strong> '+esc(detail.reason)+'</div>':"";
      const move=(detail.from||detail.to)?'<small>'+ (detail.from?esc(statusLabels[detail.from]||detail.from):"") +(detail.from&&detail.to?" → ":"")+(detail.to?esc(statusLabels[detail.to]||detail.to):"")+'</small>':"";
      const when=x.createdAt?new Date(x.createdAt).toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"}):"-";
      return '<div class="request-timeline-item"><div class="request-timeline-dot"></div><div class="request-timeline-body"><div class="request-timeline-head"><strong>'+esc(actionLabels[x.action]||x.action||"รายการ")+'</strong><span>'+esc(when)+'</span></div><div>'+esc(x.summary||"")+'</div>'+move+'<div class="muted">โดย '+esc(x.displayName||x.username||"-")+'</div>'+reason+'</div></div>';
    }).join("");
    await Swal.fire({
      title:"ประวัติ "+esc(r.requestNo),
      html:'<div style="text-align:left"><div style="margin-bottom:12px">'+requestStatusBadge(r.status)+' <strong style="margin-left:6px">'+esc(r.projectName||"")+'</strong><br><small class="muted">'+esc(r.activityName||"")+'</small></div><div class="request-timeline">'+(rows||'<div class="empty">ยังไม่มีประวัติขั้นตอน</div>')+'</div></div>',
      width:760,confirmButtonText:"ปิด",confirmButtonColor:"#0f766e"
    });
  }catch(e){err(e)}
}
async function procurementQueue(){
  if(!hasAnyRole(["admin","procurement"])){state.route="dashboard";return render()}
  try{
    const d=await api("/api/requests?scope=procurement");
    $("#content").innerHTML=`<section class="panel"><div class="panel-head"><div><h3>รายการรอพัสดุดำเนินการ</h3><p class="muted">ตรวจคำขอ จัดทำชุดเบิกจ่าย และส่งต่อเจ้าหน้าที่การเงิน</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>คำขอ</th><th>ผู้ขอเบิก</th><th>โครงการ / กิจกรรม</th><th>ประเภทเงิน</th><th class="num">ยอด</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${d.requests.length?d.requests.map(r=>`<tr><td><strong>${esc(r.requestNo)}</strong></td><td>${esc(r.requesterName)}</td><td>${esc(r.projectName)}<br><small>${esc(r.activityName)}</small></td><td>${esc(r.fundLabel)}</td><td class="num">${money(r.totalAmount)}</td><td>${requestStatusBadge(r.status)}</td><td><div class="actions"><button class="icon-btn" data-timeline="${r.id}" title="ดูประวัติ"><i data-lucide="history"></i></button><button class="icon-btn" data-print="${r.id}"><i data-lucide="printer"></i></button>${r.status==="submitted"?`<button class="btn btn-ghost" data-start="${r.id}">รับดำเนินการ</button>`:""}<button class="btn btn-primary" data-send="${r.id}">ส่งการเงิน</button><button class="btn btn-ghost" data-return="${r.id}">ส่งกลับแก้ไข</button><button class="btn btn-ghost danger" data-reject="${r.id}">ไม่อนุมัติ</button>${hasRole("admin")?`<button class="icon-btn" data-edit-request="${r.id}" title="แก้ไขรายการ"><i data-lucide="pencil"></i></button><button class="icon-btn" data-delete-request="${r.id}" title="ลบรายการ"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`).join(""):'<tr><td colspan="7" class="empty">ไม่มีรายการรอพัสดุ</td></tr>'}
      </tbody></table></div></section>`;
    $$("[data-timeline]").forEach(b=>b.onclick=()=>requestTimeline(b.dataset.timeline));
    $$("[data-print]").forEach(b=>b.onclick=()=>printRequest(b.dataset.print));
    $$("[data-return]").forEach(b=>b.onclick=()=>workflowDecision(b.dataset.return,"return_edit",procurementQueue));
    $$("[data-reject]").forEach(b=>b.onclick=()=>workflowDecision(b.dataset.reject,"reject",procurementQueue));
    $$("[data-start]").forEach(b=>b.onclick=()=>procurementAction(b.dataset.start,"procurement_start"));
    $$("[data-send]").forEach(b=>b.onclick=()=>procurementAction(b.dataset.send,"send_finance"));
    $$("[data-edit-request]").forEach(b=>b.onclick=()=>editRequest(b.dataset.editRequest,procurementQueue));
    $$("[data-delete-request]").forEach(b=>b.onclick=()=>deleteRequest(d.requests.find(r=>r.id===b.dataset.deleteRequest),procurementQueue));
    lucide.createIcons();
  }catch(e){err(e)}
}
async function procurementAction(id,action){
  if(action==="procurement_start"){
    try{await api("/api/requests",{method:"PUT",body:JSON.stringify({id,action})});procurementQueue()}catch(e){err(e)};return;
  }
  const r=await Swal.fire({title:"ส่งชุดเบิกให้การเงิน",html:'<div class="form-stack" style="text-align:left"><label>เลขที่ชุดเบิก/เอกสารพัสดุ<input id="pdDoc"></label><label>หมายเหตุ<textarea id="pdNote"></textarea></label></div>',showCancelButton:true,confirmButtonText:"ส่งการเงิน",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",preConfirm:()=>({procurementDocNo:$("#pdDoc").value.trim(),note:$("#pdNote").value.trim()})});
  if(!r.value)return;
  try{await api("/api/requests",{method:"PUT",body:JSON.stringify({id,action,...r.value})});procurementQueue();Swal.fire({icon:"success",title:"ส่งให้การเงินแล้ว",timer:900,showConfirmButton:false})}catch(e){err(e)}
}
async function financeQueue(){
  if(!hasAnyRole(["admin","finance"])){state.route="dashboard";return render()}
  try{
    const d=await api("/api/requests?scope=finance");
    $("#content").innerHTML=`<section class="panel"><div class="panel-head"><div><h3>รายการรอจ่ายเงิน</h3><p class="muted">เมื่อบันทึกจ่ายแล้ว ระบบจะลงรายจ่ายจริงให้โครงการและกิจกรรมอัตโนมัติ</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>คำขอ</th><th>ผู้ขอเบิก</th><th>โครงการ / กิจกรรม</th><th>ประเภทเงิน</th><th class="num">ยอดขอเบิก</th><th></th></tr></thead><tbody>
      ${d.requests.length?d.requests.map(r=>`<tr><td><strong>${esc(r.requestNo)}</strong></td><td>${esc(r.requesterName)}</td><td>${esc(r.projectName)}<br><small>${esc(r.activityName)}</small></td><td>${esc(r.fundLabel)}</td><td class="num">${money(r.totalAmount)}</td><td><div class="actions"><button class="icon-btn" data-timeline="${r.id}" title="ดูประวัติ"><i data-lucide="history"></i></button><button class="icon-btn" data-print="${r.id}"><i data-lucide="printer"></i></button><button class="btn btn-primary" data-pay="${r.id}" data-total="${r.totalAmount}">ลงจ่ายเงิน</button><button class="btn btn-ghost" data-return-proc="${r.id}">ส่งกลับพัสดุ</button><button class="btn btn-ghost" data-return="${r.id}">ส่งกลับครู</button><button class="btn btn-ghost danger" data-reject="${r.id}">ไม่อนุมัติ</button>${hasRole("admin")?`<button class="icon-btn" data-edit-request="${r.id}" title="แก้ไขรายการ"><i data-lucide="pencil"></i></button><button class="icon-btn" data-delete-request="${r.id}" title="ลบรายการ"><i data-lucide="trash-2"></i></button>`:""}</div></td></tr>`).join(""):'<tr><td colspan="6" class="empty">ไม่มีรายการรอการเงิน</td></tr>'}
      </tbody></table></div></section>`;
    $$("[data-timeline]").forEach(b=>b.onclick=()=>requestTimeline(b.dataset.timeline));
    $$("[data-print]").forEach(b=>b.onclick=()=>printRequest(b.dataset.print));
    $$("[data-return-proc]").forEach(b=>b.onclick=()=>workflowDecision(b.dataset.returnProc,"return_procurement",financeQueue));
    $$("[data-return]").forEach(b=>b.onclick=()=>workflowDecision(b.dataset.return,"return_edit",financeQueue));
    $$("[data-reject]").forEach(b=>b.onclick=()=>workflowDecision(b.dataset.reject,"reject",financeQueue));
    $$("[data-pay]").forEach(b=>b.onclick=()=>payRequest(b.dataset.pay,num(b.dataset.total)));
    $$("[data-edit-request]").forEach(b=>b.onclick=()=>editRequest(b.dataset.editRequest,financeQueue));
    $$("[data-delete-request]").forEach(b=>b.onclick=()=>deleteRequest(d.requests.find(r=>r.id===b.dataset.deleteRequest),financeQueue));
    lucide.createIcons();
  }catch(e){err(e)}
}
async function payRequest(id,total){
  const todayLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const r=await Swal.fire({title:"บันทึกการจ่ายเงิน",html:`<div class="form-stack" style="text-align:left"><label>วันที่จ่าย<input id="payDate" type="date" value="${todayLocal}"></label><label>เลขที่เอกสาร/เลขที่จ่าย<input id="payDoc"></label><label>ยอดจ่ายจริง<input id="paidAmount" type="number" min="0.01" max="${total}" step="0.01" value="${total}"></label><label>หมายเหตุ<textarea id="finNote"></textarea></label></div>`,showCancelButton:true,confirmButtonText:"ยืนยันจ่ายเงิน",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",preConfirm:()=>{const paid=num($("#paidAmount").value);if(!$("#payDate").value)return Swal.showValidationMessage("กรุณาระบุวันที่จ่าย");if(paid<=0||paid>total)return Swal.showValidationMessage("ยอดจ่ายจริงไม่ถูกต้อง");return{paymentDate:$("#payDate").value,paymentDocNo:$("#payDoc").value.trim(),paidAmount:paid,note:$("#finNote").value.trim()}}});
  if(!r.value)return;
  try{await api("/api/requests",{method:"PUT",body:JSON.stringify({id,action:"pay",...r.value})});await refreshData();financeQueue();Swal.fire({icon:"success",title:"ลงจ่ายเงินแล้ว",timer:1000,showConfirmButton:false})}catch(e){err(e)}
}
function thaiNumText(n){
  n=Math.floor(Math.abs(Number(n)||0));if(n===0)return"ศูนย์";
  const digit=["","สิบ","ร้อย","พัน","หมื่น","แสน"],numTxt=["ศูนย์","หนึ่ง","สอง","สาม","สี่","ห้า","หก","เจ็ด","แปด","เก้า"];
  if(n>=1000000)return thaiNumText(Math.floor(n/1000000))+"ล้าน"+(n%1000000?thaiNumText(n%1000000):"");
  const s=String(n),len=s.length;let out="";
  for(let i=0;i<len;i++){
    const d=Number(s[i]),pos=len-i-1;if(!d)continue;
    if(pos===1&&d===1)out+="สิบ";
    else if(pos===1&&d===2)out+="ยี่สิบ";
    else if(pos===0&&d===1&&len>1)out+="เอ็ด";
    else out+=numTxt[d]+digit[pos];
  }
  return out;
}
function bahtText(v){
  const n=Math.round((Number(v)||0)*100)/100,baht=Math.floor(n),sat=Math.round((n-baht)*100);
  return thaiNumText(baht)+"บาท"+(sat?thaiNumText(sat)+"สตางค์":"ถ้วน");
}
function thaiDateText(s){
  if(!s)return"";
  const d=new Date(s+"T12:00:00");return d.toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});
}
function firstProjectOwnerName(value){
  return String(value||"").split(/\r?\n|,|;|\/|\s+และ\s+/).map(x=>x.trim()).filter(Boolean)[0]||"";
}
async function printRequest(id){
  let w=null;
  try{
    const d=await api("/api/requests?scope=detail&id="+encodeURIComponent(id)),r=d.request,s=d.settings||{},fund=r.fundType;
    const defaultProjectOwner=firstProjectOwnerName(r.projectOwner)||r.requesterName||"";
    const ownerPick=await Swal.fire({
      title:"ผู้รับผิดชอบโครงการในบันทึกข้อความ",
      html:'<div style="text-align:left"><p class="muted" style="margin:0 0 10px">ระบบดึงชื่อผู้รับผิดชอบลำดับแรกจากข้อมูลโครงการ สามารถแก้ไขชื่อก่อนพิมพ์ได้</p><input id="memoProjectOwner" class="swal2-input" style="width:calc(100% - 2em);margin:0" value="'+esc(defaultProjectOwner)+'"></div>',
      showCancelButton:true,confirmButtonText:"สร้างบันทึกข้อความ",cancelButtonText:"ยกเลิก",confirmButtonColor:"#0f766e",
      preConfirm:()=>{const v=$("#memoProjectOwner")?.value.trim();if(!v)return Swal.showValidationMessage("กรุณาระบุชื่อผู้รับผิดชอบโครงการ");return v}
    });
    if(!ownerPick.isConfirmed)return;
    const projectOwnerName=ownerPick.value;
    w=window.open("","_blank");
    if(!w)return Swal.fire({icon:"warning",title:"เบราว์เซอร์บล็อกหน้าต่างพิมพ์",text:"กรุณาอนุญาต Pop-up สำหรับเว็บไซต์นี้"});
    w.document.write("<p style='font-family:sans-serif;padding:30px'>กำลังจัดทำบันทึกขอเบิกเงิน...</p>");
    const checks={subsidy:fund==="subsidy"?"☑":"☐",activity:fund==="activity"?"☑":"☐",income:fund==="income"?"☑":"☐",other:fund==="other"?"☑":"☐"};
    const itemRows=d.items.map((x,i)=>`<tr><td class="c">${i+1}</td><td>${esc(x.description)}</td><td class="money">${num(x.amount).toLocaleString("th-TH",{minimumFractionDigits:2})}</td><td class="c">${esc(r.paymentDocNo||"")}</td></tr>`).join("");
    const html=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(r.requestNo)}</title><style>
      @page{size:A4;margin:16mm 18mm}*{box-sizing:border-box}body{font-family:"Sarabun","TH Sarabun New",sans-serif;color:#111;font-size:14pt;line-height:1.4;margin:0}.memo-top{position:relative;min-height:74px}.garuda{position:absolute;left:0;top:0;width:58px;height:62px;object-fit:contain}.tools{position:fixed;right:18px;top:14px}.tools button{padding:9px 16px}.doc{max-width:800px;margin:auto}.head{position:absolute;left:0;right:0;bottom:4px;text-align:center;font-size:24px;font-weight:700;line-height:1.2;margin:0}.row{margin:3px 0}.indent{text-indent:42px}.line{border-bottom:1px dotted #555;padding:0 5px}.money{text-align:right}.c{text-align:center}.items{width:100%;border-collapse:collapse;margin:8px 0}.items th,.items td{border:1px solid #666;padding:4px 6px;line-height:1.3}.items th{background:#f4f4f4}.total{display:flex;justify-content:flex-end;gap:14px;font-weight:700}.signs{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-top:34px;text-align:center}.director{width:100%;margin:38px 0 0;text-align:left}.director-sign{width:100%;text-align:center;margin-top:14px}.small{font-size:14px}@media print{.tools{display:none}body{font-size:14pt}.doc{max-width:none}}</style></head><body><div class="tools"><button onclick="window.print()">พิมพ์ / บันทึก PDF</button></div><div class="doc">
      <div class="memo-top"><img class="garuda" alt="ตราครุฑ" src="/assets/garuda.png"><div class="head">บันทึกข้อความ</div></div>
      <div class="row"><strong>ส่วนราชการ</strong> ${esc(s.schoolName||"โรงเรียนสามัคคีศึกษา")} ${esc(s.schoolLocation||"")}</div>
      <div class="row"><strong>ที่</strong> <span class="line">${esc(r.requestNo)}</span> &nbsp;&nbsp; <strong>วันที่</strong> <span class="line">${thaiDateText((r.createdAt||"").slice(0,10))}</span></div>
      <div class="row"><strong>เรื่อง</strong> ขออนุมัติเบิกเงินตามกิจกรรม <span class="line">${esc(r.activityName)}</span></div>
      <hr><div class="row"><strong>เรียน</strong> ผู้อำนวยการโรงเรียนสามัคคีศึกษา</div>
      <p class="indent">ตามที่ ข้าพเจ้า <span class="line">${esc(projectOwnerName)}</span> ตำแหน่ง <span class="line">ครู</span> ฝ่ายงาน/กลุ่มสาระการเรียนรู้ <span class="line">${esc(d.division||"-")}</span> รับผิดชอบในการดำเนินงาน <span class="line">${esc(r.activityName)}</span> โดยมีวัตถุประสงค์เพื่อ <span class="line">${esc(r.details||"ดำเนินกิจกรรมตามโครงการที่กำหนด")}</span> ได้ดำเนินงานตั้งแต่วันที่ <span class="line">${thaiDateText(r.startDate)}</span> ถึงวันที่ <span class="line">${thaiDateText(r.endDate)}</span></p>
      <p class="indent">บัดนี้ข้าพเจ้าดำเนินการเรียบร้อยแล้ว จึงรายงานผลตามรายละเอียดดังแนบและขออนุมัติเบิกจ่ายเงิน งบเงินสนับสนุนค่าใช้จ่ายในการจัดการศึกษาขั้นพื้นฐาน<br>
      ${checks.subsidy} งบเงินอุดหนุน &nbsp;&nbsp; ${checks.activity} งบเงินกิจกรรมพัฒนาคุณภาพผู้เรียน &nbsp;&nbsp; ${checks.income} งบเงินรายได้ฯ &nbsp;&nbsp; ${checks.other} อื่นๆ</p>
      <div class="row"><strong>โครงการ</strong> <span class="line">${esc(r.projectName)}</span></div><div class="row"><strong>กิจกรรม</strong> <span class="line">${esc(r.activityName)}</span> ตามรายการต่อไปนี้</div>
      <table class="items"><thead><tr><th style="width:48px">ที่</th><th>รายการ</th><th style="width:125px">เป็นเงิน (บาท)</th><th style="width:120px">เลขที่จ่าย</th></tr></thead><tbody>${itemRows}</tbody></table>
      <div class="total"><span>รวมเป็นเงินทั้งสิ้น</span><span>${num(r.totalAmount).toLocaleString("th-TH",{minimumFractionDigits:2})} บาท</span></div>
      <div class="row c">(${bahtText(r.totalAmount)})</div>
      <p class="indent">จึงเรียนมาเพื่อโปรดทราบและพิจารณา</p>
      <div class="signs"><div>ลงชื่อ ........................................................<br>(${esc(projectOwnerName)})<br>ผู้รับผิดชอบโครงการ</div><div>ลงชื่อ ........................................................<br>(${esc(s.financeOfficer||"")})<br>เจ้าหน้าที่การเงิน</div></div>
      <div class="director">เสนอ ผู้อำนวยการโรงเรียนสามัคคีศึกษา<br>☐ ทราบ/อนุมัติ<div class="director-sign">ลงชื่อ ........................................................<br>(${esc(s.directorName||"")})<br>${esc(s.directorTitle||"ผู้อำนวยการโรงเรียนสามัคคีศึกษา")}</div></div>
    </div></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }catch(e){if(w)w.close();err(e)}
}

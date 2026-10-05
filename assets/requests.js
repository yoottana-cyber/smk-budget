
const REQUEST_STATUS={
  submitted:["รอพัสดุ","warning"],
  procurement:["พัสดุดำเนินการ","warning"],
  finance:["รอการเงิน","info"],
  paid:["จ่ายเงินแล้ว","success"],
  cancelled:["ยกเลิก","gray"]
};
const REQUEST_ROLES=["admin","planner","teacher","procurement","finance"];
function requestStatusBadge(s){
  const x=REQUEST_STATUS[s]||[s,"gray"];
  return `<span class="badge request-${x[1]}">${esc(x[0])}</span>`;
}
async function requests(){
  if(!hasAnyRole(REQUEST_ROLES)){state.route="dashboard";return render()}
  $("#content").innerHTML='<section class="panel"><div class="empty">กำลังโหลดรายการขอเบิก...</div></section>';
  try{
    const d=await api("/api/requests?scope=mine"),canNew=hasAnyRole(["admin","planner","teacher"]);
    $("#content").innerHTML=`
      <section class="panel">
        <div class="toolbar"><div><strong>รายการขอเบิกของฉัน</strong><p class="muted request-sub">ส่งคำขอแล้วติดตามสถานะพัสดุและการเงินได้จากหน้านี้</p></div>
        ${canNew?'<button id="newRequestBtn" class="btn btn-primary"><i data-lucide="plus"></i>ขอเบิกเงิน</button>':""}</div>
        <div class="table-wrap"><table><thead><tr><th>เลขที่คำขอ</th><th>โครงการ / กิจกรรม</th><th>ช่วงดำเนินการ</th><th>ประเภทเงิน</th><th class="num">ยอดขอเบิก</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${d.requests.length?d.requests.map(r=>`<tr>
          <td><strong>${esc(r.requestNo)}</strong><br><small>${esc((r.createdAt||"").slice(0,10))}</small></td>
          <td><strong>${esc(r.projectCode)} ${esc(r.projectName)}</strong><br><small>${esc(r.activityName)}</small></td>
          <td>${esc(r.startDate)}<br>ถึง ${esc(r.endDate)}</td>
          <td>${esc(r.fundLabel||r.fundType)}</td>
          <td class="num"><strong>${money(r.totalAmount)}</strong></td>
          <td>${requestStatusBadge(r.status)}</td>
          <td><div class="actions"><button class="icon-btn" data-print="${r.id}" title="พิมพ์บันทึกขอเบิก"><i data-lucide="printer"></i></button>${r.status==="submitted"?`<button class="icon-btn" data-cancel="${r.id}" title="ยกเลิกคำขอ"><i data-lucide="x"></i></button>`:""}</div></td>
        </tr>`).join(""):'<tr><td colspan="7" class="empty">ยังไม่มีรายการขอเบิก</td></tr>'}
        </tbody></table></div>
      </section>`;
    if(canNew)$("#newRequestBtn").onclick=()=>newRequest();
    $$("[data-print]").forEach(b=>b.onclick=()=>printRequest(b.dataset.print));
    $$("[data-cancel]").forEach(b=>b.onclick=()=>cancelRequest(b.dataset.cancel));
    lucide.createIcons();
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
    const pOpts=ctx.projects.map(p=>`<option value="${p.id}">${esc(p.code)} - ${esc(p.name)}${p.division?" ["+esc(p.division)+"]":""}</option>`).join("");
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
    requests();
  }catch(e){err(e)}
}
async function cancelRequest(id){
  const r=await Swal.fire({icon:"warning",title:"ยกเลิกคำขอนี้?",text:"ยอดที่กันไว้จะถูกคืนเป็นเงินพร้อมใช้",showCancelButton:true,confirmButtonText:"ยกเลิกคำขอ",cancelButtonText:"ไม่ยกเลิก",confirmButtonColor:"#dc2626"});
  if(!r.isConfirmed)return;
  try{await api("/api/requests",{method:"PUT",body:JSON.stringify({id,action:"cancel"})});requests()}catch(e){err(e)}
}
async function procurementQueue(){
  if(!hasAnyRole(["admin","procurement"])){state.route="dashboard";return render()}
  try{
    const d=await api("/api/requests?scope=procurement");
    $("#content").innerHTML=`<section class="panel"><div class="panel-head"><div><h3>รายการรอพัสดุดำเนินการ</h3><p class="muted">ตรวจคำขอ จัดทำชุดเบิกจ่าย และส่งต่อเจ้าหน้าที่การเงิน</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>คำขอ</th><th>ผู้ขอเบิก</th><th>โครงการ / กิจกรรม</th><th>ประเภทเงิน</th><th class="num">ยอด</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${d.requests.length?d.requests.map(r=>`<tr><td><strong>${esc(r.requestNo)}</strong></td><td>${esc(r.requesterName)}</td><td>${esc(r.projectName)}<br><small>${esc(r.activityName)}</small></td><td>${esc(r.fundLabel)}</td><td class="num">${money(r.totalAmount)}</td><td>${requestStatusBadge(r.status)}</td><td><div class="actions"><button class="icon-btn" data-print="${r.id}"><i data-lucide="printer"></i></button>${r.status==="submitted"?`<button class="btn btn-ghost" data-start="${r.id}">รับดำเนินการ</button>`:""}<button class="btn btn-primary" data-send="${r.id}">ส่งการเงิน</button></div></td></tr>`).join(""):'<tr><td colspan="7" class="empty">ไม่มีรายการรอพัสดุ</td></tr>'}
      </tbody></table></div></section>`;
    $$("[data-print]").forEach(b=>b.onclick=()=>printRequest(b.dataset.print));
    $$("[data-start]").forEach(b=>b.onclick=()=>procurementAction(b.dataset.start,"procurement_start"));
    $$("[data-send]").forEach(b=>b.onclick=()=>procurementAction(b.dataset.send,"send_finance"));
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
      ${d.requests.length?d.requests.map(r=>`<tr><td><strong>${esc(r.requestNo)}</strong></td><td>${esc(r.requesterName)}</td><td>${esc(r.projectName)}<br><small>${esc(r.activityName)}</small></td><td>${esc(r.fundLabel)}</td><td class="num">${money(r.totalAmount)}</td><td><div class="actions"><button class="icon-btn" data-print="${r.id}"><i data-lucide="printer"></i></button><button class="btn btn-primary" data-pay="${r.id}" data-total="${r.totalAmount}">ลงจ่ายเงิน</button></div></td></tr>`).join(""):'<tr><td colspan="6" class="empty">ไม่มีรายการรอการเงิน</td></tr>'}
      </tbody></table></div></section>`;
    $$("[data-print]").forEach(b=>b.onclick=()=>printRequest(b.dataset.print));
    $$("[data-pay]").forEach(b=>b.onclick=()=>payRequest(b.dataset.pay,num(b.dataset.total)));
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
      @page{size:A4;margin:16mm 18mm}*{box-sizing:border-box}body{font-family:"Sarabun","TH Sarabun New",sans-serif;color:#111;font-size:14pt;line-height:1.55;margin:0}.memo-top{position:relative;min-height:74px}.garuda{position:absolute;left:0;top:0;width:58px;height:62px;object-fit:contain}.tools{position:fixed;right:18px;top:14px}.tools button{padding:9px 16px}.doc{max-width:800px;margin:auto}.head{position:absolute;left:0;right:0;bottom:4px;text-align:center;font-size:24px;font-weight:700;line-height:1.2;margin:0}.row{margin:5px 0}.indent{text-indent:42px}.line{border-bottom:1px dotted #555;padding:0 5px}.money{text-align:right}.c{text-align:center}.items{width:100%;border-collapse:collapse;margin:12px 0}.items th,.items td{border:1px solid #666;padding:6px 8px}.items th{background:#f4f4f4}.total{display:flex;justify-content:flex-end;gap:14px;font-weight:700}.signs{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-top:34px;text-align:center}.director{width:100%;margin:38px 0 0;text-align:left}.director-sign{width:100%;text-align:center;margin-top:14px}.small{font-size:14px}@media print{.tools{display:none}body{font-size:14pt}.doc{max-width:none}}</style></head><body><div class="tools"><button onclick="window.print()">พิมพ์ / บันทึก PDF</button></div><div class="doc">
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


import {ensureExtra,listMany,listRows,append,bulkAppend,batchUpdateRows,update,auth,json,bad,amount,readBody,ownsProject,hasRole,hasAnyRole,PENDING_STATUSES,FUND_LABELS} from "../../src/budget-db.js";

const allowedRoles=["admin","planner","teacher","procurement","finance"];
const canSee=(u,r)=>hasAnyRole(u,["admin","planner","procurement","finance"])||r.requesterUserId===u.id;
async function loadAll(env){
  const g=await listMany(env,["Requests","RequestItems","Projects","Activities","ActivityFunds","ProjectMeta","Settings","Expenses"]);
  return[g.Requests,g.RequestItems,g.Projects,g.Activities,g.ActivityFunds,g.ProjectMeta,g.Settings,g.Expenses];
}
function enrich(rs,projects,activities){
  const pm=Object.fromEntries(projects.map(x=>[x.id,x])),am=Object.fromEntries(activities.map(x=>[x.id,x]));
  return rs.map(r=>({...r,projectCode:pm[r.projectId]?.code||"",projectName:pm[r.projectId]?.name||"",projectOwner:pm[r.projectId]?.owner||"",activityCode:am[r.activityId]?.code||"",activityName:am[r.activityId]?.name||"",fundLabel:FUND_LABELS[r.fundType]||r.fundType}));
}
function expenseRequest(expense,requests){
  if(expense.requestId)return requests.find(r=>r.id===expense.requestId)||null;
  const no=(String(expense.note||"").match(/REQ-\d{4}-\d{4}/)||String(expense.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0];
  return no?requests.find(r=>r.requestNo===no)||null:null;
}
function expenseFundType(expense,requests){return expense.fundType||expenseRequest(expense,requests)?.fundType||""}
function availableFor(requests,expenses,fund,excludeId=""){
  const excluded=requests.find(r=>r.id===excludeId);
  const paid=expenses.filter(e=>e.activityId===fund.activityId&&expenseFundType(e,requests)===fund.fundType&&!(excluded&&expenseRequest(e,requests)?.id===excluded.id)).reduce((s,e)=>s+amount(e.amount),0);
  const reserved=requests.filter(r=>r.id!==excludeId&&r.activityId===fund.activityId&&r.fundType===fund.fundType&&PENDING_STATUSES.includes(r.status)).reduce((s,r)=>s+amount(r.totalAmount),0);
  return Math.max(amount(fund.budget)-paid-reserved,0);
}
function nextExpenseDocNo(expenses,projects,fiscalYear){
  const ids=new Set(projects.filter(p=>String(p.fiscalYear||"")===String(fiscalYear||"")).map(p=>p.id));
  const max=expenses.filter(e=>!ids.size||ids.has(e.projectId)).reduce((m,e)=>{
    const x=String(e.docNo||"").trim().match(/^บจ\.\s*(\d+)$/);
    return x?Math.max(m,Number(x[1])||0):m;
  },0);
  return "บจ."+(max+1);
}
export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,allowedRoles);if(a.error)return bad("ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const [requests,items,projects,activities,funds,metas,settings,expenses]=await loadAll(ctx.env);
    const url=new URL(ctx.request.url),scope=url.searchParams.get("scope")||"mine",id=url.searchParams.get("id")||"";
    if(scope==="detail"){
      const r=requests.find(x=>x.id===id);if(!r||!canSee(a.u,r))return bad("ไม่พบคำขอ",404);
      const meta=metas.find(x=>x.projectId===r.projectId);
      const paidExpense=expenses.find(x=>x.requestId===r.id)||expenses.find(x=>x.projectId===r.projectId&&x.activityId===r.activityId&&(String(x.note||"").includes("คำขอ "+r.requestNo)||String(x.description||"").includes(r.requestNo)));
      const enriched=enrich([r],projects,activities)[0];
      if(paidExpense?.docNo)enriched.paymentDocNo=paidExpense.docNo;
      return json({request:enriched,items:items.filter(x=>x.requestId===r.id),division:meta?.division||"",settings:Object.fromEntries(settings.map(x=>[x.key,x.value]))});
    }
    let rows=[];
    if(scope==="mine")rows=requests.filter(r=>r.requesterUserId===a.u.id);
    else if(scope==="procurement"){
      if(!hasAnyRole(a.u,["admin","procurement"]))return bad("เฉพาะเจ้าหน้าที่พัสดุ",403);
      rows=requests.filter(r=>["submitted","procurement"].includes(r.status));
    }else if(scope==="finance"){
      if(!hasAnyRole(a.u,["admin","finance"]))return bad("เฉพาะเจ้าหน้าที่การเงิน",403);
      rows=requests.filter(r=>r.status==="finance");
    }else if(scope==="all"){
      if(!hasAnyRole(a.u,["admin","planner"]))return bad("ไม่มีสิทธิ์",403);rows=requests;
    }else return bad("scope ไม่ถูกต้อง");
    rows=enrich(rows,projects,activities).sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt)));
    return json({requests:rows});
  }catch(e){return bad(e.message||"โหลดคำขอไม่สำเร็จ",500)}
}
export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin","planner","teacher"]);if(a.error)return bad(a.error==="FORBIDDEN"?"ไม่มีสิทธิ์ส่งคำขอ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request);
    const g=await listMany(ctx.env,["Requests","RequestItems","Projects","Activities","ActivityFunds"]);
    const requests=g.Requests,items=g.RequestItems,projects=g.Projects,activities=g.Activities,funds=g.ActivityFunds;
    const p=projects.find(x=>x.id===d.projectId),act=activities.find(x=>x.id===d.activityId&&x.projectId===d.projectId);
    if(!p||!act)return bad("โครงการหรือกิจกรรมไม่ถูกต้อง");
    if(hasRole(a.u,"teacher")&&!hasAnyRole(a.u,["admin","planner"])&&!ownsProject(a.u,p))return bad("คุณไม่มีสิทธิ์เบิกโครงการนี้",403);
    const fund=funds.find(x=>x.activityId===act.id&&x.fundType===d.fundType&&amount(x.budget)>0);if(!fund)return bad("ประเภทเงินไม่ตรงกับกิจกรรม");
    const rows=Array.isArray(d.items)?d.items.map(x=>({description:String(x.description||"").trim(),amount:amount(x.amount)})).filter(x=>x.description&&x.amount>0):[];
    if(!rows.length)return bad("กรุณาเพิ่มรายการบิลอย่างน้อย 1 รายการ");
    if(rows.length>50)return bad("รายการบิลมากเกินไป");
    const total=rows.reduce((s,x)=>s+x.amount,0),available=availableFor(requests,expenses,fund);
    if(total>available)return bad("ยอดขอเบิกเกินเงินคงเหลือของประเภทเงินนี้ คงเหลือ "+available.toLocaleString("th-TH")+" บาท",409);
    if(!d.startDate||!d.endDate||d.endDate<d.startDate)return bad("ช่วงวันที่ดำเนินกิจกรรมไม่ถูกต้อง");
    const fy=String(p.fiscalYear||""),seq=requests.filter(x=>x.fiscalYear===fy).reduce((m,x)=>{const n=Number(String(x.requestNo||"").match(/-(\d+)$/)?.[1]||0);return Math.max(m,n)},0)+1,now=new Date().toISOString();
    const r={id:"req_"+crypto.randomUUID(),requestNo:"REQ-"+fy+"-"+String(seq).padStart(4,"0"),fiscalYear:fy,projectId:p.id,activityId:act.id,requesterUserId:a.u.id,requesterName:a.u.displayName,startDate:d.startDate,endDate:d.endDate,details:String(d.details||"").trim(),fundType:d.fundType,status:"submitted",totalAmount:total,procurementDocNo:"",procurementNote:"",procurementBy:"",paymentDate:"",paymentDocNo:"",paidAmount:"",financeNote:"",financeBy:"",createdAt:now,updatedAt:now};
    await append(ctx.env,"Requests",r);
    await bulkAppend(ctx.env,"RequestItems",rows.map(x=>({id:"ritem_"+crypto.randomUUID(),requestId:r.id,description:x.description,amount:x.amount,createdAt:now})));
    return json({ok:true,request:r},201);
  }catch(e){return bad(e.message||"ส่งคำขอไม่สำเร็จ",500)}
}
export async function onRequestPut(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,allowedRoles);if(a.error)return bad("ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request);
    const [requests,items,projects,activities,funds,metas,settings,expenses]=await loadAll(ctx.env);
    const r=requests.find(x=>x.id===d.id);if(!r)return bad("ไม่พบคำขอ",404);
    const now=new Date().toISOString();
    if(d.action==="admin_edit"){
      if(!hasRole(a.u,"admin"))return bad("เฉพาะผู้ดูแลระบบ",403);
      const p=projects.find(x=>x.id===d.projectId),act=activities.find(x=>x.id===d.activityId&&x.projectId===d.projectId);
      if(!p||!act)return bad("โครงการหรือกิจกรรมไม่ถูกต้อง");
      if(String(p.fiscalYear||"")!==String(r.fiscalYear||""))return bad("ไม่สามารถย้ายคำขอไปต่างปีงบประมาณได้",409);
      const fund=funds.find(x=>x.activityId===act.id&&x.fundType===d.fundType&&amount(x.budget)>0);
      if(!fund)return bad("ประเภทเงินไม่ตรงกับกิจกรรม");
      const rows=Array.isArray(d.items)?d.items.map(x=>({description:String(x.description||"").trim(),amount:amount(x.amount)})).filter(x=>x.description&&x.amount>0):[];
      if(!rows.length)return bad("กรุณาเพิ่มรายการบิลอย่างน้อย 1 รายการ");
      if(rows.length>50)return bad("รายการบิลมากเกินไป");
      const total=rows.reduce((s,x)=>s+x.amount,0),available=availableFor(requests,expenses,fund,r.id);
      if(total>available)return bad("ยอดขอเบิกเกินเงินคงเหลือของประเภทเงินนี้ คงเหลือ "+available.toLocaleString("th-TH")+" บาท",409);
      if(r.status==="paid"&&amount(r.paidAmount)>total)return bad("ยอดขอเบิกใหม่ต้องไม่น้อยกว่ายอดที่จ่ายแล้ว "+amount(r.paidAmount).toLocaleString("th-TH")+" บาท",409);
      if(!d.startDate||!d.endDate||d.endDate<d.startDate)return bad("ช่วงวันที่ดำเนินกิจกรรมไม่ถูกต้อง");
      const edited=await update(ctx.env,"Requests",r.id,{projectId:p.id,activityId:act.id,startDate:d.startDate,endDate:d.endDate,details:String(d.details||"").trim(),fundType:d.fundType,totalAmount:total,updatedAt:now});
      const oldItems=(await listRows(ctx.env,"RequestItems")).filter(x=>x.requestId===r.id).sort((x,y)=>x.__row-y.__row);
      const updates=[];
      const common=Math.min(oldItems.length,rows.length);
      for(let i=0;i<common;i++)updates.push({...oldItems[i],description:rows[i].description,amount:rows[i].amount});
      for(let i=rows.length;i<oldItems.length;i++)updates.push({...oldItems[i],id:"",requestId:"",description:"",amount:"",createdAt:""});
      if(updates.length)await batchUpdateRows(ctx.env,"RequestItems",updates);
      if(rows.length>oldItems.length)await bulkAppend(ctx.env,"RequestItems",rows.slice(oldItems.length).map(x=>({id:"ritem_"+crypto.randomUUID(),requestId:r.id,description:x.description,amount:x.amount,createdAt:now})));
      if(r.status==="paid"){
        const linkedExpense=expenses.find(x=>x.requestId===r.id)||expenses.find(x=>String(x.note||"").includes("คำขอ "+r.requestNo)||String(x.description||"").includes(r.requestNo));
        if(linkedExpense)await update(ctx.env,"Expenses",linkedExpense.id,{projectId:p.id,activityId:act.id,requestId:r.id,fundType:d.fundType,description:"เบิกจ่ายตามคำขอ "+r.requestNo+" - "+(act?.name||""),note:"ประเภทเงิน: "+(FUND_LABELS[d.fundType]||d.fundType)+"; คำขอ "+r.requestNo+"; โครงการ "+(p?.name||""),updatedAt:now});
      }
      return json({ok:true,request:edited});
    }
    if(d.action==="cancel"){
      if(!(r.requesterUserId===a.u.id||hasRole(a.u,"admin"))||r.status!=="submitted")return bad("ไม่สามารถยกเลิกคำขอนี้",403);
      await update(ctx.env,"Requests",r.id,{status:"cancelled",updatedAt:now});return json({ok:true});
    }
    if(d.action==="procurement_start"){
      if(!hasAnyRole(a.u,["admin","procurement"]))return bad("เฉพาะเจ้าหน้าที่พัสดุ",403);
      if(r.status!=="submitted")return bad("สถานะคำขอไม่ถูกต้อง",409);
      await update(ctx.env,"Requests",r.id,{status:"procurement",procurementBy:a.u.displayName,updatedAt:now});return json({ok:true});
    }
    if(d.action==="send_finance"){
      if(!hasAnyRole(a.u,["admin","procurement"]))return bad("เฉพาะเจ้าหน้าที่พัสดุ",403);
      if(!["submitted","procurement"].includes(r.status))return bad("สถานะคำขอไม่ถูกต้อง",409);
      await update(ctx.env,"Requests",r.id,{status:"finance",procurementDocNo:String(d.procurementDocNo||"").trim(),procurementNote:String(d.note||"").trim(),procurementBy:a.u.displayName,updatedAt:now});return json({ok:true});
    }
    if(d.action==="pay"){
      if(!hasAnyRole(a.u,["admin","finance"]))return bad("เฉพาะเจ้าหน้าที่การเงิน",403);
      if(r.status!=="finance")return bad("รายการนี้ไม่ได้อยู่ในสถานะรอการเงิน",409);
      const paid=amount(d.paidAmount||r.totalAmount);if(paid<=0||paid>amount(r.totalAmount))return bad("ยอดจ่ายจริงไม่ถูกต้อง");
      if(!d.paymentDate)return bad("กรุณาระบุวันที่จ่ายเงิน");
      const fund=funds.find(x=>x.activityId===r.activityId&&x.fundType===r.fundType);if(!fund)return bad("ไม่พบข้อมูลงบกิจกรรม");
      const available=availableFor(requests,expenses,fund,r.id);if(paid>available)return bad("ยอดจ่ายทำให้งบประเภทเงินนี้ติดลบ",409);
      const p=projects.find(x=>x.id===r.projectId),act=activities.find(x=>x.id===r.activityId);
      const paymentDocNo=String(d.paymentDocNo||"").trim()||nextExpenseDocNo(expenses,projects,p?.fiscalYear||r.fiscalYear);
      const paidReq=await update(ctx.env,"Requests",r.id,{status:"paid",paymentDate:d.paymentDate,paymentDocNo,paidAmount:paid,financeNote:String(d.note||"").trim(),financeBy:a.u.displayName,updatedAt:now});
      await append(ctx.env,"Expenses",{id:"exp_"+crypto.randomUUID(),projectId:r.projectId,activityId:r.activityId,date:d.paymentDate,docNo:paymentDocNo,description:"เบิกจ่ายตามคำขอ "+r.requestNo+" - "+(act?.name||""),category:"เบิกจ่ายตามคำขอ",amount:paid,payee:r.requesterName,note:"ประเภทเงิน: "+(FUND_LABELS[r.fundType]||r.fundType)+"; คำขอ "+r.requestNo+"; โครงการ "+(p?.name||""),createdBy:a.u.username,createdAt:now,updatedAt:now,requestId:r.id,fundType:r.fundType});
      return json({ok:true,request:paidReq});
    }
    return bad("ไม่รู้จักคำสั่ง");
  }catch(e){return bad(e.message||"อัปเดตคำขอไม่สำเร็จ",500)}
}

export async function onRequestDelete(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad("เฉพาะผู้ดูแลระบบ",a.error==="FORBIDDEN"?403:401);
    const id=new URL(ctx.request.url).searchParams.get("id");if(!id)return bad("ไม่พบรหัสคำขอ");
    const [requestRows,itemRows,expenseRows]=await Promise.all([
      listRows(ctx.env,"Requests"),
      listRows(ctx.env,"RequestItems"),
      listRows(ctx.env,"Expenses")
    ]);
    const r=requestRows.find(x=>x.id===id);if(!r)return bad("ไม่พบคำขอ",404);
    const reqNo=String(r.requestNo||"");
    const linkedItems=itemRows.filter(x=>x.requestId===id);
    const linkedExpenses=expenseRows.filter(x=>
      x.requestId===r.id||
      String(x.note||"").includes("คำขอ "+reqNo)||
      String(x.description||"").includes(reqNo)
    );
    const blank=row=>Object.fromEntries(Object.keys(row).filter(k=>k!=="__row").map(k=>[k,""]));
    if(linkedItems.length)await batchUpdateRows(ctx.env,"RequestItems",linkedItems.map(x=>({__row:x.__row,...blank(x)})));
    if(linkedExpenses.length)await batchUpdateRows(ctx.env,"Expenses",linkedExpenses.map(x=>({__row:x.__row,...blank(x)})));
    await batchUpdateRows(ctx.env,"Requests",[{__row:r.__row,...blank(r)}]);
    return json({ok:true,deleted:{request:1,items:linkedItems.length,expenses:linkedExpenses.length}});
  }catch(e){return bad(e.message||"ลบคำขอไม่สำเร็จ",500)}
}


import {ensureExtra,listMany,append,bulkAppend,update,auth,json,bad,amount,readBody,ownsProject,PENDING_STATUSES,FUND_LABELS} from "../../src/budget-db.js";

const allowedRoles=["admin","planner","teacher","procurement","finance"];
const canSee=(u,r)=>["admin","planner","procurement","finance"].includes(u.role)||r.requesterUserId===u.id;
async function loadAll(env){
  const g=await listMany(env,["Requests","RequestItems","Projects","Activities","ActivityFunds","ProjectMeta","Settings","Expenses"]);
  return[g.Requests,g.RequestItems,g.Projects,g.Activities,g.ActivityFunds,g.ProjectMeta,g.Settings,g.Expenses];
}
function enrich(rs,projects,activities){
  const pm=Object.fromEntries(projects.map(x=>[x.id,x])),am=Object.fromEntries(activities.map(x=>[x.id,x]));
  return rs.map(r=>({...r,projectCode:pm[r.projectId]?.code||"",projectName:pm[r.projectId]?.name||"",activityCode:am[r.activityId]?.code||"",activityName:am[r.activityId]?.name||"",fundLabel:FUND_LABELS[r.fundType]||r.fundType}));
}
function availableFor(requests,fund,excludeId=""){
  const paid=requests.filter(r=>r.id!==excludeId&&r.activityId===fund.activityId&&r.fundType===fund.fundType&&r.status==="paid").reduce((s,r)=>s+amount(r.paidAmount||r.totalAmount),0);
  const reserved=requests.filter(r=>r.id!==excludeId&&r.activityId===fund.activityId&&r.fundType===fund.fundType&&PENDING_STATUSES.includes(r.status)).reduce((s,r)=>s+amount(r.totalAmount),0);
  return Math.max(amount(fund.budget)-paid-reserved,0);
}
export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,allowedRoles);if(a.error)return bad("ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const [requests,items,projects,activities,funds,metas,settings]=await loadAll(ctx.env);
    const url=new URL(ctx.request.url),scope=url.searchParams.get("scope")||"mine",id=url.searchParams.get("id")||"";
    if(scope==="detail"){
      const r=requests.find(x=>x.id===id);if(!r||!canSee(a.u,r))return bad("ไม่พบคำขอ",404);
      const meta=metas.find(x=>x.projectId===r.projectId);
      return json({request:enrich([r],projects,activities)[0],items:items.filter(x=>x.requestId===r.id),division:meta?.division||"",settings:Object.fromEntries(settings.map(x=>[x.key,x.value]))});
    }
    let rows=[];
    if(scope==="mine")rows=requests.filter(r=>r.requesterUserId===a.u.id);
    else if(scope==="procurement"){
      if(!["admin","procurement"].includes(a.u.role))return bad("เฉพาะเจ้าหน้าที่พัสดุ",403);
      rows=requests.filter(r=>["submitted","procurement"].includes(r.status));
    }else if(scope==="finance"){
      if(!["admin","finance"].includes(a.u.role))return bad("เฉพาะเจ้าหน้าที่การเงิน",403);
      rows=requests.filter(r=>r.status==="finance");
    }else if(scope==="all"){
      if(!["admin","planner"].includes(a.u.role))return bad("ไม่มีสิทธิ์",403);rows=requests;
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
    if(a.u.role==="teacher"&&!ownsProject(a.u,p))return bad("คุณไม่มีสิทธิ์เบิกโครงการนี้",403);
    const fund=funds.find(x=>x.activityId===act.id&&x.fundType===d.fundType&&amount(x.budget)>0);if(!fund)return bad("ประเภทเงินไม่ตรงกับกิจกรรม");
    const rows=Array.isArray(d.items)?d.items.map(x=>({description:String(x.description||"").trim(),amount:amount(x.amount)})).filter(x=>x.description&&x.amount>0):[];
    if(!rows.length)return bad("กรุณาเพิ่มรายการบิลอย่างน้อย 1 รายการ");
    if(rows.length>50)return bad("รายการบิลมากเกินไป");
    const total=rows.reduce((s,x)=>s+x.amount,0),available=availableFor(requests,fund);
    if(total>available)return bad("ยอดขอเบิกเกินเงินคงเหลือของประเภทเงินนี้ คงเหลือ "+available.toLocaleString("th-TH")+" บาท",409);
    if(!d.startDate||!d.endDate||d.endDate<d.startDate)return bad("ช่วงวันที่ดำเนินกิจกรรมไม่ถูกต้อง");
    const fy=String(p.fiscalYear||""),seq=requests.filter(x=>x.fiscalYear===fy).length+1,now=new Date().toISOString();
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
    if(d.action==="cancel"){
      if(!(r.requesterUserId===a.u.id||a.u.role==="admin")||r.status!=="submitted")return bad("ไม่สามารถยกเลิกคำขอนี้",403);
      await update(ctx.env,"Requests",r.id,{status:"cancelled",updatedAt:now});return json({ok:true});
    }
    if(d.action==="procurement_start"){
      if(!["admin","procurement"].includes(a.u.role))return bad("เฉพาะเจ้าหน้าที่พัสดุ",403);
      if(r.status!=="submitted")return bad("สถานะคำขอไม่ถูกต้อง",409);
      await update(ctx.env,"Requests",r.id,{status:"procurement",procurementBy:a.u.displayName,updatedAt:now});return json({ok:true});
    }
    if(d.action==="send_finance"){
      if(!["admin","procurement"].includes(a.u.role))return bad("เฉพาะเจ้าหน้าที่พัสดุ",403);
      if(!["submitted","procurement"].includes(r.status))return bad("สถานะคำขอไม่ถูกต้อง",409);
      await update(ctx.env,"Requests",r.id,{status:"finance",procurementDocNo:String(d.procurementDocNo||"").trim(),procurementNote:String(d.note||"").trim(),procurementBy:a.u.displayName,updatedAt:now});return json({ok:true});
    }
    if(d.action==="pay"){
      if(!["admin","finance"].includes(a.u.role))return bad("เฉพาะเจ้าหน้าที่การเงิน",403);
      if(r.status!=="finance")return bad("รายการนี้ไม่ได้อยู่ในสถานะรอการเงิน",409);
      const paid=amount(d.paidAmount||r.totalAmount);if(paid<=0||paid>amount(r.totalAmount))return bad("ยอดจ่ายจริงไม่ถูกต้อง");
      if(!d.paymentDate)return bad("กรุณาระบุวันที่จ่ายเงิน");
      const fund=funds.find(x=>x.activityId===r.activityId&&x.fundType===r.fundType);if(!fund)return bad("ไม่พบข้อมูลงบกิจกรรม");
      const available=availableFor(requests,fund,r.id);if(paid>available)return bad("ยอดจ่ายทำให้งบประเภทเงินนี้ติดลบ",409);
      const paidReq=await update(ctx.env,"Requests",r.id,{status:"paid",paymentDate:d.paymentDate,paymentDocNo:String(d.paymentDocNo||"").trim(),paidAmount:paid,financeNote:String(d.note||"").trim(),financeBy:a.u.displayName,updatedAt:now});
      const p=projects.find(x=>x.id===r.projectId),act=activities.find(x=>x.id===r.activityId);
      await append(ctx.env,"Expenses",{id:"exp_"+crypto.randomUUID(),projectId:r.projectId,activityId:r.activityId,date:d.paymentDate,docNo:String(d.paymentDocNo||r.requestNo),description:"เบิกจ่ายตามคำขอ "+r.requestNo+" - "+(act?.name||""),category:"เบิกจ่ายตามคำขอ",amount:paid,payee:r.requesterName,note:"ประเภทเงิน: "+(FUND_LABELS[r.fundType]||r.fundType)+"; คำขอ "+r.requestNo+"; โครงการ "+(p?.name||""),createdBy:a.u.username,createdAt:now,updatedAt:now});
      return json({ok:true,request:paidReq});
    }
    return bad("ไม่รู้จักคำสั่ง");
  }catch(e){return bad(e.message||"อัปเดตคำขอไม่สำเร็จ",500)}
}

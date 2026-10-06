import {ensureExtra,listRowsMany,batchUpdateRows,auth,json,bad,amount,readBody,writeAudit,normPerson} from "../../src/budget-db.js";

const VALID_REQUEST_STATUS=new Set(["submitted","procurement","finance","returned","rejected","paid","cancelled"]);
const round2=n=>Math.round((Number(n)||0)*100)/100;
const neq=(a,b)=>Math.abs(round2(a)-round2(b))>.009;
const sample=(rows,fn)=>rows.slice(0,12).map(fn);

function buildReport(g){
  const projects=g.Projects||[],activities=g.Activities||[],metas=g.ProjectMeta||[],funds=g.ActivityFunds||[],requests=g.Requests||[],items=g.RequestItems||[],expenses=g.Expenses||[],users=g.Users||[];
  const projectById=Object.fromEntries(projects.map(x=>[x.id,x]));
  const activityById=Object.fromEntries(activities.map(x=>[x.id,x]));
  const requestById=Object.fromEntries(requests.map(x=>[x.id,x]));
  const requestByNo=Object.fromEntries(requests.filter(x=>x.requestNo).map(x=>[x.requestNo,x]));
  const userById=Object.fromEntries(users.map(x=>[x.id,x]));
  const itemsByRequest=new Map(),fundsByActivity=new Map();
  for(const x of items){const a=itemsByRequest.get(x.requestId)||[];a.push(x);itemsByRequest.set(x.requestId,a)}
  for(const x of funds){const a=fundsByActivity.get(x.activityId)||[];a.push(x);fundsByActivity.set(x.activityId,a)}
  const reqNoFrom=e=>(String(e.note||"").match(/REQ-\d{4}-\d{4}/)||String(e.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0]||"";
  const linkedRequest=e=>e.requestId?requestById[e.requestId]||null:(reqNoFrom(e)?requestByNo[reqNoFrom(e)]||null:null);

  const missingItems=requests.filter(r=>!itemsByRequest.get(r.id)?.length);
  const orphanItems=items.filter(x=>!requestById[x.requestId]);
  const missingFund=expenses.filter(e=>!String(e.fundType||"").trim());
  const missingRequestLink=expenses.filter(e=>!String(e.requestId||"").trim()&&!!linkedRequest(e));
  const paidMissingExpense=requests.filter(r=>r.status==="paid"&&!expenses.some(e=>e.requestId===r.id||reqNoFrom(e)===r.requestNo));
  const orphanActivities=activities.filter(a=>!projectById[a.projectId]);
  const orphanFunds=funds.filter(f=>!activityById[f.activityId]);
  const orphanExpenses=expenses.filter(e=>!projectById[e.projectId]||(e.activityId&&!activityById[e.activityId]));
  const orphanMeta=metas.filter(m=>!projectById[m.projectId]);
  const invalidStatus=requests.filter(r=>!VALID_REQUEST_STATUS.has(String(r.status||"").trim()));
  const missingRequester=requests.filter(r=>!String(r.requesterUserId||"").trim()&&!String(r.requesterUsername||"").trim()&&!String(r.requesterName||"").trim());
  const missingUsername=requests.filter(r=>!String(r.requesterUsername||"").trim()&&r.requesterUserId&&userById[r.requesterUserId]);

  const reqGroups=new Map();
  for(const r of requests){const k=String(r.requestNo||"").trim();if(!k)continue;const a=reqGroups.get(k)||[];a.push(r);reqGroups.set(k,a)}
  const dupReq=[...reqGroups.entries()].filter(([,a])=>a.length>1);

  const docGroups=new Map();
  for(const e of expenses){
    const doc=String(e.docNo||"").trim();if(!doc)continue;
    const fy=String(projectById[e.projectId]?.fiscalYear||"");
    const k=fy+"|"+doc,a=docGroups.get(k)||[];a.push(e);docGroups.set(k,a);
  }
  const dupDoc=[...docGroups.entries()].filter(([,a])=>a.length>1);

  const totalMismatch=requests.map(r=>{
    const its=itemsByRequest.get(r.id)||[],sum=its.reduce((s,x)=>s+amount(x.amount),0);
    return{r,sum,count:its.length};
  }).filter(x=>x.count&&neq(x.sum,x.r.totalAmount));

  const activityFundMismatch=activities.map(a=>{
    const fs=fundsByActivity.get(a.id)||[],sum=fs.reduce((s,x)=>s+amount(x.budget),0);
    return{a,sum,count:fs.length};
  }).filter(x=>x.count&&neq(x.sum,x.a.budget));

  const issues=[
    {key:"request_missing_items",title:"คำขอที่ไม่มีรายการบิล",severity:"critical",autoFixable:false,count:missingItems.length,description:"คำขอมีอยู่ใน Requests แต่ไม่มีรายการใน RequestItems",examples:sample(missingItems,r=>({id:r.id,label:r.requestNo||r.id,detail:r.requesterName||""}))},
    {key:"orphan_request_items",title:"รายการบิลที่ไม่พบคำขอแม่",severity:"critical",autoFixable:false,count:orphanItems.length,description:"RequestItems อ้างถึง requestId ที่ไม่มีอยู่แล้ว",examples:sample(orphanItems,x=>({id:x.id,label:x.description||x.id,detail:x.requestId||""}))},
    {key:"paid_missing_expense",title:"จ่ายแล้วแต่ไม่พบรายจ่ายเชื่อม",severity:"critical",autoFixable:false,count:paidMissingExpense.length,description:"สถานะคำขอเป็นจ่ายเงินแล้ว แต่ไม่มี Expense ที่เชื่อมกับคำขอนั้น",examples:sample(paidMissingExpense,r=>({id:r.id,label:r.requestNo||r.id,detail:"ยอด "+amount(r.paidAmount||r.totalAmount).toLocaleString("th-TH")+" บาท"}))},
    {key:"duplicate_request_no",title:"เลข REQ ซ้ำ",severity:"critical",autoFixable:false,count:dupReq.length,description:"พบเลขคำขอเดียวกันมากกว่า 1 รายการ",examples:sample(dupReq,([k,a])=>({id:k,label:k,detail:a.length+" รายการ"}))},
    {key:"duplicate_payment_doc",title:"เลข บจ. ซ้ำ",severity:"critical",autoFixable:false,count:dupDoc.length,description:"พบเลขเอกสารจ่ายซ้ำภายในปีงบประมาณเดียวกัน",examples:sample(dupDoc,([k,a])=>({id:k,label:k.split("|")[1],detail:"ปี "+(k.split("|")[0]||"-")+" • "+a.length+" รายการ"}))},
    {key:"orphan_activity",title:"กิจกรรมที่ไม่พบโครงการ",severity:"critical",autoFixable:false,count:orphanActivities.length,description:"Activities อ้าง projectId ที่ไม่มีใน Projects",examples:sample(orphanActivities,a=>({id:a.id,label:a.name||a.id,detail:a.projectId||""}))},
    {key:"orphan_expense",title:"รายจ่ายที่อ้างข้อมูลไม่ครบ",severity:"critical",autoFixable:false,count:orphanExpenses.length,description:"Expense อ้างโครงการหรือกิจกรรมที่ไม่พบ",examples:sample(orphanExpenses,e=>({id:e.id,label:e.docNo||e.description||e.id,detail:e.projectId+" / "+(e.activityId||"-")}))},
    {key:"expense_missing_fund",title:"รายจ่ายที่ยังไม่มีประเภทเงิน",severity:"warning",autoFixable:true,count:missingFund.length,description:"ระบบจะพยายามเติมจากคำขอที่เชื่อม หรือจากกิจกรรมที่มีเงินเพียงประเภทเดียว",examples:sample(missingFund,e=>({id:e.id,label:e.docNo||e.description||e.id,detail:e.activityId||""}))},
    {key:"expense_missing_request_link",title:"รายจ่ายที่ยังไม่ผูก requestId",severity:"warning",autoFixable:true,count:missingRequestLink.length,description:"พบเลข REQ ในรายละเอียด แต่ requestId ยังว่าง ระบบซ่อมได้อัตโนมัติ",examples:sample(missingRequestLink,e=>({id:e.id,label:e.docNo||e.id,detail:reqNoFrom(e)}))},
    {key:"request_missing_username",title:"คำขอที่ยังไม่มี requesterUsername",severity:"warning",autoFixable:true,count:missingUsername.length,description:"ข้อมูลคำขอเก่าบางรายการยังไม่มี username ของผู้ขอเบิก",examples:sample(missingUsername,r=>({id:r.id,label:r.requestNo||r.id,detail:r.requesterName||""}))},
    {key:"request_total_mismatch",title:"ยอดรายการบิลไม่ตรงยอดคำขอ",severity:"warning",autoFixable:false,count:totalMismatch.length,description:"ผลรวม RequestItems ไม่เท่ากับ totalAmount ของ Requests",examples:sample(totalMismatch,x=>({id:x.r.id,label:x.r.requestNo||x.r.id,detail:"คำขอ "+amount(x.r.totalAmount).toLocaleString("th-TH")+" / รายการ "+x.sum.toLocaleString("th-TH")}))},
    {key:"invalid_request_status",title:"สถานะคำขอไม่ถูกต้อง",severity:"warning",autoFixable:false,count:invalidStatus.length,description:"สถานะไม่อยู่ใน workflow ที่ระบบรองรับ",examples:sample(invalidStatus,r=>({id:r.id,label:r.requestNo||r.id,detail:String(r.status||"(ว่าง)")}))},
    {key:"activity_fund_mismatch",title:"งบกิจกรรมไม่ตรงผลรวมประเภทเงิน",severity:"warning",autoFixable:false,count:activityFundMismatch.length,description:"งบรวมของ ActivityFunds ไม่เท่ากับงบของกิจกรรม",examples:sample(activityFundMismatch,x=>({id:x.a.id,label:x.a.name||x.a.id,detail:"กิจกรรม "+amount(x.a.budget).toLocaleString("th-TH")+" / ประเภทเงิน "+x.sum.toLocaleString("th-TH")}))},
    {key:"orphan_fund",title:"ActivityFunds ที่ไม่พบกิจกรรม",severity:"warning",autoFixable:false,count:orphanFunds.length,description:"ข้อมูลประเภทเงินอ้าง activityId ที่ไม่มีอยู่",examples:sample(orphanFunds,f=>({id:f.id,label:f.fundType||f.id,detail:f.activityId||""}))},
    {key:"orphan_project_meta",title:"ProjectMeta ที่ไม่พบโครงการ",severity:"info",autoFixable:false,count:orphanMeta.length,description:"ข้อมูล metadata อ้าง projectId ที่ไม่มีอยู่",examples:sample(orphanMeta,m=>({id:m.id,label:m.division||m.id,detail:m.projectId||""}))},
    {key:"request_missing_identity",title:"คำขอที่ไม่มีข้อมูลผู้ขอเบิก",severity:"critical",autoFixable:false,count:missingRequester.length,description:"ไม่พบทั้ง user id, username และชื่อผู้ขอเบิก",examples:sample(missingRequester,r=>({id:r.id,label:r.requestNo||r.id,detail:""}))}
  ];

  const totals={critical:0,warning:0,info:0,all:0,autoFixable:0};
  for(const x of issues){totals[x.severity]+=x.count;totals.all+=x.count;if(x.autoFixable)totals.autoFixable+=x.count}
  const status=totals.critical?"critical":totals.warning?"warning":"healthy";
  return{
    checkedAt:new Date().toISOString(),
    status,totals,
    counts:{projects:projects.length,activities:activities.length,requests:requests.length,requestItems:items.length,expenses:expenses.length},
    issues
  };
}

async function load(env){
  return listRowsMany(env,["Users","Projects","Activities","ProjectMeta","ActivityFunds","Requests","RequestItems","Expenses"]);
}

async function repair(env,user){
  const g=await load(env),requests=g.Requests,expenses=g.Expenses,funds=g.ActivityFunds,users=g.Users;
  const requestById=Object.fromEntries(requests.map(r=>[r.id,r]));
  const requestByNo=Object.fromEntries(requests.filter(r=>r.requestNo).map(r=>[r.requestNo,r]));
  const userById=Object.fromEntries(users.map(u=>[u.id,u])),usersByName=new Map();
  for(const u of users){const n=normPerson(u.displayName);if(!n)continue;const a=usersByName.get(n)||[];a.push(u);usersByName.set(n,a)}
  const fundByActivity=new Map();
  for(const f of funds){
    if(amount(f.budget)<=0)continue;
    const a=fundByActivity.get(f.activityId)||[];a.push(f.fundType);fundByActivity.set(f.activityId,a);
  }
  const reqNo=e=>(String(e.note||"").match(/REQ-\d{4}-\d{4}/)||String(e.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0]||"";
  const expenseUpdates=[];
  let linkedExpenses=0,inferredFunds=0,requestUsers=0;
  for(const e of expenses){
    let requestId=String(e.requestId||""),fundType=String(e.fundType||"");
    let r=requestId?requestById[requestId]:null;
    if(!r){const no=reqNo(e);r=no?requestByNo[no]:null}
    if(r&&!requestId){requestId=r.id;linkedExpenses++}
    if(r&&!fundType)fundType=r.fundType||"";
    if(!fundType&&e.activityId){
      const choices=[...new Set(fundByActivity.get(e.activityId)||[])];
      if(choices.length===1){fundType=choices[0];inferredFunds++}
    }
    if(requestId!==String(e.requestId||"")||fundType!==String(e.fundType||""))expenseUpdates.push({...e,requestId,fundType});
  }
  if(expenseUpdates.length)await batchUpdateRows(env,"Expenses",expenseUpdates);

  const requestUpdates=[];
  for(const r of requests){
    if(String(r.requesterUsername||"").trim())continue;
    let u=r.requesterUserId?userById[r.requesterUserId]:null;
    if(!u&&r.requesterName){const matches=usersByName.get(normPerson(r.requesterName))||[];if(matches.length===1)u=matches[0]}
    if(u?.username){requestUpdates.push({...r,requesterUserId:r.requesterUserId||u.id,requesterUsername:u.username});requestUsers++}
  }
  if(requestUpdates.length)await batchUpdateRows(env,"Requests",requestUpdates);

  await writeAudit(env,user,"REPAIR","data_health","system","ซ่อมข้อมูลอัตโนมัติ",{expensesUpdated:expenseUpdates.length,linkedExpenses,inferredFunds,requestUsers});
  return{expensesUpdated:expenseUpdates.length,linkedExpenses,inferredFunds,requestUsers};
}

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    return json({report:buildReport(await load(ctx.env))});
  }catch(e){return bad(e.message||"ตรวจสุขภาพข้อมูลไม่สำเร็จ",500)}
}

export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request);if(d.action!=="repair")return bad("คำสั่งไม่ถูกต้อง");
    const repaired=await repair(ctx.env,a.u),report=buildReport(await load(ctx.env));
    return json({ok:true,repaired,report});
  }catch(e){return bad(e.message||"ซ่อมข้อมูลไม่สำเร็จ",500)}
}

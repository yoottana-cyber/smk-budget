import {ensureExtra,listMany,bulkAppend,replaceSheetData,auth,json,bad,readBody,writeAudit} from "../../src/budget-db.js";

const BACKUP_SHEETS=["Projects","Activities","Expenses","ProjectMeta","ActivityFunds","Requests","RequestItems","Settings","DocumentCounters"];
const clean=s=>String(s??"").trim();
const keyOf=(fy,division,code)=>[fy,division,code].map(clean).join("|").toLowerCase();

async function backupData(env){
  const sheets=await listMany(env,BACKUP_SHEETS);
  return{
    app:"smk-budget",
    version:1,
    createdAt:new Date().toISOString(),
    sheets
  };
}

async function restoreData(env,user,payload){
  const backup=payload?.backup;
  if(!backup||backup.app!=="smk-budget"||Number(backup.version)!==1||!backup.sheets)throw new Error("ไฟล์สำรองไม่ถูกต้องหรือไม่รองรับ");
  const required=["Projects","Activities","Expenses","ProjectMeta","ActivityFunds","Requests","RequestItems","Settings"];
  if(required.some(sheet=>!Array.isArray(backup.sheets[sheet])))throw new Error("ไฟล์สำรองไม่ครบถ้วน กรุณาใช้ไฟล์ที่สร้างจากเมนู Backup ของระบบ");
  if(payload.confirm!=="RESTORE")throw new Error("ยังไม่ได้ยืนยันการกู้คืนข้อมูล");
  const counts={};
  for(const sheet of BACKUP_SHEETS){
    const rows=Array.isArray(backup.sheets[sheet])?backup.sheets[sheet]:[];
    const result=await replaceSheetData(env,sheet,rows);
    counts[sheet]=result.written||0;
  }
  await writeAudit(env,user,"RESTORE","system","backup","กู้คืนข้อมูลจากไฟล์สำรอง",{backupCreatedAt:backup.createdAt||"",counts});
  return counts;
}

async function createFiscalYear(env,user,sourceYear,targetYear){
  sourceYear=clean(sourceYear);targetYear=clean(targetYear);
  if(!/^\d{4}$/.test(sourceYear)||!/^\d{4}$/.test(targetYear))throw new Error("ปีงบประมาณต้องเป็นตัวเลข 4 หลัก");
  if(sourceYear===targetYear)throw new Error("ปีต้นทางและปีใหม่ต้องไม่ซ้ำกัน");
  const g=await listMany(env,["Projects","Activities","ProjectMeta","ActivityFunds"]);
  const srcProjects=g.Projects.filter(p=>String(p.fiscalYear||"")===sourceYear);
  if(!srcProjects.length)throw new Error("ไม่พบโครงการในปีงบประมาณ "+sourceYear);
  if(g.Projects.some(p=>String(p.fiscalYear||"")===targetYear))throw new Error("ปีงบประมาณ "+targetYear+" มีโครงการอยู่แล้ว กรุณาตรวจสอบก่อน");

  const now=new Date().toISOString(),projectMap=new Map(),activityMap=new Map();
  const newProjects=[],newMetas=[],newActivities=[],newFunds=[];
  const metaByProject=Object.fromEntries(g.ProjectMeta.map(m=>[m.projectId,m]));

  for(const p of srcProjects){
    const id="prj_"+crypto.randomUUID();projectMap.set(p.id,id);
    newProjects.push({
      id,fiscalYear:targetYear,code:p.code,name:p.name,owner:p.owner,budget:p.budget,
      status:"ดำเนินการ",createdAt:now,updatedAt:now
    });
    const m=metaByProject[p.id];
    if(m)newMetas.push({
      id:"pmeta_"+crypto.randomUUID(),projectId:id,division:m.division,sourceSheet:m.sourceSheet,
      importKey:keyOf(targetYear,m.division,p.code),createdAt:now,updatedAt:now
    });
  }

  for(const a of g.Activities.filter(a=>projectMap.has(a.projectId))){
    const id="act_"+crypto.randomUUID();activityMap.set(a.id,id);
    newActivities.push({
      id,projectId:projectMap.get(a.projectId),code:a.code,name:a.name,budget:a.budget,owner:a.owner,
      status:"ดำเนินการ",createdAt:now,updatedAt:now
    });
  }

  for(const f of g.ActivityFunds.filter(f=>activityMap.has(f.activityId))){
    newFunds.push({
      id:"fund_"+crypto.randomUUID(),activityId:activityMap.get(f.activityId),fundType:f.fundType,budget:f.budget,
      createdAt:now,updatedAt:now
    });
  }

  if(newProjects.length)await bulkAppend(env,"Projects",newProjects);
  if(newMetas.length)await bulkAppend(env,"ProjectMeta",newMetas);
  if(newActivities.length)await bulkAppend(env,"Activities",newActivities);
  if(newFunds.length)await bulkAppend(env,"ActivityFunds",newFunds);
  await writeAudit(env,user,"NEW_YEAR","system",targetYear,"เปิดปีงบประมาณ "+targetYear,{sourceYear,targetYear,projects:newProjects.length,activities:newActivities.length,funds:newFunds.length});
  return{sourceYear,targetYear,projects:newProjects.length,activities:newActivities.length,funds:newFunds.length};
}

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const action=new URL(ctx.request.url).searchParams.get("action")||"backup";
    if(action!=="backup")return bad("คำสั่งไม่ถูกต้อง");
    const backup=await backupData(ctx.env);await writeAudit(ctx.env,a.u,"BACKUP","system","backup","ดาวน์โหลดข้อมูลสำรองระบบ",{createdAt:backup.createdAt});
    return json({backup});
  }catch(e){return bad(e.message||"สร้างไฟล์สำรองไม่สำเร็จ",500)}
}

export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request);
    if(d.action==="restore")return json({ok:true,counts:await restoreData(ctx.env,a.u,d)});
    if(d.action==="new_fiscal_year")return json({ok:true,result:await createFiscalYear(ctx.env,a.u,d.sourceYear,d.targetYear)});
    return bad("คำสั่งไม่ถูกต้อง");
  }catch(e){return bad(e.message||"ดำเนินการเครื่องมือระบบไม่สำเร็จ",500)}
}

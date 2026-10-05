
import {ensureExtra,list,append,update,auth,json,bad,amount,readBody} from "../../src/budget-db.js";

const clean=s=>String(s??"").trim();
const keyOf=(fy,division,code)=>[fy,division,code].map(clean).join("|").toLowerCase();
export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin","planner"]);if(a.error)return bad(a.error==="FORBIDDEN"?"ไม่มีสิทธิ์นำเข้าข้อมูล":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request),incoming=Array.isArray(d.projects)?d.projects:[];
    if(!incoming.length)return bad("ไม่พบข้อมูลโครงการสำหรับนำเข้า");
    if(incoming.length>1000)return bad("จำนวนโครงการมากเกินไป");
    const [projects,activities,metas,funds]=await Promise.all([list(ctx.env,"Projects"),list(ctx.env,"Activities"),list(ctx.env,"ProjectMeta"),list(ctx.env,"ActivityFunds")]);
    let projectCreated=0,projectUpdated=0,activityCreated=0,activityUpdated=0,fundUpdated=0;
    const now=new Date().toISOString();

    for(const p0 of incoming){
      const fiscalYear=clean(p0.fiscalYear),division=clean(p0.division),code=clean(p0.code),name=clean(p0.name),owner=clean(p0.owner);
      if(!fiscalYear||!code||!name)continue;
      const importKey=keyOf(fiscalYear,division,code);
      let meta=metas.find(x=>String(x.importKey).toLowerCase()===importKey);
      let p=meta?projects.find(x=>x.id===meta.projectId):projects.find(x=>x.fiscalYear===fiscalYear&&x.code===code&&x.name===name);
      const budget=amount(p0.budget);
      if(p){
        await update(ctx.env,"Projects",p.id,{fiscalYear,code,name,owner,budget,status:p.status||"ดำเนินการ",updatedAt:now});
        Object.assign(p,{fiscalYear,code,name,owner,budget});projectUpdated++;
      }else{
        p={id:"prj_"+crypto.randomUUID(),fiscalYear,code,name,owner,budget,status:"ดำเนินการ",createdAt:now,updatedAt:now};
        await append(ctx.env,"Projects",p);projects.push(p);projectCreated++;
      }
      if(meta){
        await update(ctx.env,"ProjectMeta",meta.id,{projectId:p.id,division,sourceSheet:clean(p0.sourceSheet)||division,importKey,updatedAt:now});
        Object.assign(meta,{projectId:p.id,division,sourceSheet:clean(p0.sourceSheet)||division,importKey});
      }else{
        meta={id:"pmeta_"+crypto.randomUUID(),projectId:p.id,division,sourceSheet:clean(p0.sourceSheet)||division,importKey,createdAt:now,updatedAt:now};
        await append(ctx.env,"ProjectMeta",meta);metas.push(meta);
      }

      const acts=Array.isArray(p0.activities)?p0.activities:[];
      for(const a0 of acts){
        const acode=clean(a0.code),aname=clean(a0.name);if(!aname)continue;
        let act=activities.find(x=>x.projectId===p.id&&clean(x.code)===acode&&clean(x.name)===aname);
        const row={projectId:p.id,code:acode,name:aname,budget:amount(a0.budget),owner:clean(a0.owner)||owner,status:"ดำเนินการ",updatedAt:now};
        if(act){
          await update(ctx.env,"Activities",act.id,row);Object.assign(act,row);activityUpdated++;
        }else{
          act={id:"act_"+crypto.randomUUID(),...row,createdAt:now};
          await append(ctx.env,"Activities",act);activities.push(act);activityCreated++;
        }
        const fm={subsidy:amount(a0.subsidyBudget),activity:amount(a0.activityBudget),income:amount(a0.incomeBudget),other:amount(a0.otherBudget)};
        for(const [fundType,budgetValue] of Object.entries(fm)){
          let f=funds.find(x=>x.activityId===act.id&&x.fundType===fundType);
          if(f){await update(ctx.env,"ActivityFunds",f.id,{budget:budgetValue,updatedAt:now});Object.assign(f,{budget:budgetValue});fundUpdated++}
          else if(budgetValue>0){f={id:"fund_"+crypto.randomUUID(),activityId:act.id,fundType,budget:budgetValue,createdAt:now,updatedAt:now};await append(ctx.env,"ActivityFunds",f);funds.push(f);fundUpdated++}
        }
      }
    }
    return json({ok:true,projectCreated,projectUpdated,activityCreated,activityUpdated,fundUpdated});
  }catch(e){return bad(e.message||"นำเข้าข้อมูลไม่สำเร็จ",500)}
}

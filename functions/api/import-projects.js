
import {ensureExtra,listRowsMany,bulkAppend,batchUpdateRows,auth,json,bad,amount,readBody} from "../../src/budget-db.js";

const clean=s=>String(s??"").trim();
const keyOf=(fy,division,code)=>[fy,division,code].map(clean).join("|").toLowerCase();

export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin","planner"]);
    if(a.error)return bad(a.error==="FORBIDDEN"?"ไม่มีสิทธิ์นำเข้าข้อมูล":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);

    const d=await readBody(ctx.request),incoming=Array.isArray(d.projects)?d.projects:[];
    if(!incoming.length)return bad("ไม่พบข้อมูลโครงการสำหรับนำเข้า");
    if(incoming.length>1000)return bad("จำนวนโครงการมากเกินไป");

    const grouped=await listRowsMany(ctx.env,["Projects","Activities","ProjectMeta","ActivityFunds"]);
    const projects=grouped.Projects,activities=grouped.Activities,metas=grouped.ProjectMeta,funds=grouped.ActivityFunds;

    const newProjects=[],updProjects=[],newMetas=[],updMetas=[],newActs=[],updActs=[],newFunds=[],updFunds=[];
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
        Object.assign(p,{fiscalYear,code,name,owner,budget,status:p.status||"ดำเนินการ",updatedAt:now});
        if(p.__row)updProjects.push({...p});projectUpdated++;
      }else{
        p={id:"prj_"+crypto.randomUUID(),fiscalYear,code,name,owner,budget,status:"ดำเนินการ",createdAt:now,updatedAt:now};
        projects.push(p);newProjects.push(p);projectCreated++;
      }

      if(meta){
        Object.assign(meta,{projectId:p.id,division,sourceSheet:clean(p0.sourceSheet)||division,importKey,updatedAt:now});
        if(meta.__row)updMetas.push({...meta});
      }else{
        meta={id:"pmeta_"+crypto.randomUUID(),projectId:p.id,division,sourceSheet:clean(p0.sourceSheet)||division,importKey,createdAt:now,updatedAt:now};
        metas.push(meta);newMetas.push(meta);
      }

      const acts=Array.isArray(p0.activities)?p0.activities:[];
      for(const a0 of acts){
        const acode=clean(a0.code),aname=clean(a0.name);if(!aname)continue;
        let act=activities.find(x=>x.projectId===p.id&&clean(x.code)===acode&&clean(x.name)===aname);
        const row={projectId:p.id,code:acode,name:aname,budget:amount(a0.budget),owner:clean(a0.owner)||owner,status:"ดำเนินการ",updatedAt:now};

        if(act){
          Object.assign(act,row);if(act.__row)updActs.push({...act});activityUpdated++;
        }else{
          act={id:"act_"+crypto.randomUUID(),...row,createdAt:now};
          activities.push(act);newActs.push(act);activityCreated++;
        }

        const fm={subsidy:amount(a0.subsidyBudget),activity:amount(a0.activityBudget),income:amount(a0.incomeBudget),other:amount(a0.otherBudget)};
        for(const [fundType,budgetValue] of Object.entries(fm)){
          let f=funds.find(x=>x.activityId===act.id&&x.fundType===fundType);
          if(f){
            Object.assign(f,{budget:budgetValue,updatedAt:now});if(f.__row)updFunds.push({...f});fundUpdated++;
          }else if(budgetValue>0){
            f={id:"fund_"+crypto.randomUUID(),activityId:act.id,fundType,budget:budgetValue,createdAt:now,updatedAt:now};
            funds.push(f);newFunds.push(f);fundUpdated++;
          }
        }
      }
    }

    const jobs=[];
    if(newProjects.length)jobs.push(bulkAppend(ctx.env,"Projects",newProjects));
    if(updProjects.length)jobs.push(batchUpdateRows(ctx.env,"Projects",updProjects));
    if(newMetas.length)jobs.push(bulkAppend(ctx.env,"ProjectMeta",newMetas));
    if(updMetas.length)jobs.push(batchUpdateRows(ctx.env,"ProjectMeta",updMetas));
    if(newActs.length)jobs.push(bulkAppend(ctx.env,"Activities",newActs));
    if(updActs.length)jobs.push(batchUpdateRows(ctx.env,"Activities",updActs));
    if(newFunds.length)jobs.push(bulkAppend(ctx.env,"ActivityFunds",newFunds));
    if(updFunds.length)jobs.push(batchUpdateRows(ctx.env,"ActivityFunds",updFunds));
    await Promise.all(jobs);

    return json({ok:true,projectCreated,projectUpdated,activityCreated,activityUpdated,fundUpdated});
  }catch(e){
    return bad(e.message||"นำเข้าข้อมูลไม่สำเร็จ",500);
  }
}

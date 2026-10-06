
import {ensureExtra,listMany,auth,json,bad,amount,ownsProject,hasRole,hasAnyRole,PENDING_STATUSES} from "../../src/budget-db.js";

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin","planner","teacher","procurement","finance"]);if(a.error)return bad("ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const grouped=await listMany(ctx.env,["Projects","Activities","ProjectMeta","ActivityFunds","Requests","Expenses"]);
    const projects=grouped.Projects,activities=grouped.Activities,metas=grouped.ProjectMeta,funds=grouped.ActivityFunds,requests=grouped.Requests,expenses=grouped.Expenses;
    const limitToOwn=hasRole(a.u,"teacher")&&!hasAnyRole(a.u,["admin","planner"]);
    const visible=projects.filter(p=>limitToOwn?ownsProject(a.u,p):true);
    const ids=new Set(visible.map(x=>x.id)),acts=activities.filter(x=>ids.has(x.projectId)),aids=new Set(acts.map(x=>x.id));
    const metaMap=Object.fromEntries(metas.map(x=>[x.projectId,x]));
    const enrichedProjects=visible.map(p=>({...p,division:metaMap[p.id]?.division||""}));
    const requestById=Object.fromEntries(requests.map(r=>[r.id,r]));
    const requestByNo=Object.fromEntries(requests.map(r=>[r.requestNo,r]));
    const expenseFundType=e=>{
      if(e.fundType)return e.fundType;
      if(e.requestId&&requestById[e.requestId])return requestById[e.requestId].fundType||"";
      const no=(String(e.note||"").match(/REQ-\d{4}-\d{4}/)||String(e.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0];
      return no&&requestByNo[no]?requestByNo[no].fundType||"":"";
    };
    const fundRows=funds.filter(f=>aids.has(f.activityId)).map(f=>{
      const paid=expenses.filter(e=>e.activityId===f.activityId&&expenseFundType(e)===f.fundType).reduce((s,e)=>s+amount(e.amount),0);
      const reserved=requests.filter(r=>r.activityId===f.activityId&&r.fundType===f.fundType&&PENDING_STATUSES.includes(r.status)).reduce((s,r)=>s+amount(r.totalAmount),0);
      const budget=amount(f.budget);return{...f,budget,paid,reserved,available:Math.max(budget-paid-reserved,0)};
    });
    return json({projects:enrichedProjects,activities:acts,funds:fundRows});
  }catch(e){return bad(e.message||"โหลดข้อมูลไม่สำเร็จ",500)}
}

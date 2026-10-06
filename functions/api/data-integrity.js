import {ensureExtra,listRowsMany,batchUpdateRows,auth,json,bad,amount} from "../../src/budget-db.js";

export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);
    if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ": "ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);

    const g=await listRowsMany(ctx.env,["Expenses","Requests","ActivityFunds"]);
    const expenses=g.Expenses,requests=g.Requests,funds=g.ActivityFunds;
    const byId=Object.fromEntries(requests.map(r=>[r.id,r]));
    const byNo=Object.fromEntries(requests.map(r=>[r.requestNo,r]));
    const fundByActivity=new Map();
    for(const f of funds){
      if(amount(f.budget)<=0)continue;
      const arr=fundByActivity.get(f.activityId)||[];
      arr.push(f.fundType);
      fundByActivity.set(f.activityId,arr);
    }
    const reqNo=e=>(String(e.note||"").match(/REQ-\d{4}-\d{4}/)||String(e.description||"").match(/REQ-\d{4}-\d{4}/)||[])[0]||"";
    const updates=[];
    let linked=0,inferred=0,unresolved=0;
    for(const e of expenses){
      let requestId=String(e.requestId||""),fundType=String(e.fundType||"");
      let r=requestId?byId[requestId]:null;
      if(!r){const no=reqNo(e);r=no?byNo[no]:null}
      if(r){
        if(!requestId){requestId=r.id;linked++}
        if(!fundType)fundType=r.fundType||"";
      }
      if(!fundType&&e.activityId){
        const choices=[...new Set(fundByActivity.get(e.activityId)||[])];
        if(choices.length===1){fundType=choices[0];inferred++}
      }
      if(!fundType)unresolved++;
      if(requestId!==String(e.requestId||"")||fundType!==String(e.fundType||""))updates.push({...e,requestId,fundType});
    }
    if(updates.length)await batchUpdateRows(ctx.env,"Expenses",updates);
    return json({ok:true,scanned:expenses.length,updated:updates.length,linked,inferred,unresolved});
  }catch(e){return bad(e.message||"ตรวจสอบความเชื่อมโยงข้อมูลไม่สำเร็จ",500)}
}

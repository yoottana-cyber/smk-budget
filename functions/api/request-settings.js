import {ensureExtra,list,append,update,auth,json,bad,hasRole,readBody} from "../../src/budget-db.js";

const KEY="requestOpen";
const isOpen=rows=>String(rows.find(x=>x.key===KEY)?.value??"true").toLowerCase()!=="false";

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin","planner","teacher","procurement","finance"]);if(a.error)return bad("ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const rows=await list(ctx.env,"Settings");
    return json({open:isOpen(rows)});
  }catch(e){return bad(e.message||"โหลดสถานะรับคำขอไม่สำเร็จ",500)}
}

export async function onRequestPut(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad("เฉพาะผู้ดูแลระบบ",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request),open=d.open===true;
    const rows=await list(ctx.env,"Settings"),now=new Date().toISOString(),old=rows.find(x=>x.key===KEY);
    if(old)await update(ctx.env,"Settings",KEY,{value:open?"true":"false",updatedAt:now});
    else await append(ctx.env,"Settings",{key:KEY,value:open?"true":"false",updatedAt:now});
    return json({ok:true,open});
  }catch(e){return bad(e.message||"บันทึกสถานะรับคำขอไม่สำเร็จ",500)}
}

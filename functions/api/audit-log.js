import {ensureExtra,list,auth,json,bad} from "../../src/budget-db.js";

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);
    if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const url=new URL(ctx.request.url),limit=Math.min(Math.max(Number(url.searchParams.get("limit")||300),1),1000);
    const rows=(await list(ctx.env,"AuditLog")).sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt))).slice(0,limit);
    return json({logs:rows});
  }catch(e){return bad(e.message||"โหลดประวัติการใช้งานไม่สำเร็จ",500)}
}

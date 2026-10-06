import {ensureExtra,listRows,update,batchUpdateRows,auth,json,bad,readBody} from "../../src/budget-db.js";

const isReadValue=v=>["1","true","yes","read"].includes(String(v||"").toLowerCase());
const belongs=(u,n)=>String(n.userId||"")===String(u.id||"")||String(n.username||"")===String(u.username||"");

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx);if(a.error)return bad("ไม่ได้รับอนุญาต",401);
    const url=new URL(ctx.request.url),limit=Math.max(1,Math.min(Number(url.searchParams.get("limit")||60),100));
    const rows=(await listRows(ctx.env,"Notifications")).filter(n=>belongs(a.u,n)).sort((x,y)=>String(y.createdAt||"").localeCompare(String(x.createdAt||"")));
    const unread=rows.filter(n=>!isReadValue(n.isRead)).length;
    return json({notifications:rows.slice(0,limit).map(({__row,...n})=>n),unread,total:rows.length});
  }catch(e){return bad(e.message||"โหลดศูนย์แจ้งเตือนไม่สำเร็จ",500)}
}

export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx);if(a.error)return bad("ไม่ได้รับอนุญาต",401);
    const d=await readBody(ctx.request),action=String(d.action||""),now=new Date().toISOString();
    const rows=(await listRows(ctx.env,"Notifications")).filter(n=>belongs(a.u,n));
    if(action==="mark_read"){
      const n=rows.find(x=>x.id===d.id);if(!n)return bad("ไม่พบการแจ้งเตือน",404);
      if(!isReadValue(n.isRead))await update(ctx.env,"Notifications",n.id,{isRead:"1",readAt:now});
      return json({ok:true});
    }
    if(action==="mark_all"){
      const unread=rows.filter(n=>!isReadValue(n.isRead));
      if(unread.length)await batchUpdateRows(ctx.env,"Notifications",unread.map(n=>({...n,isRead:"1",readAt:now})));
      return json({ok:true,count:unread.length});
    }
    return bad("คำสั่งไม่ถูกต้อง");
  }catch(e){return bad(e.message||"อัปเดตการแจ้งเตือนไม่สำเร็จ",500)}
}

import {ensureExtra,listRows,append,update,auth,json,bad,readBody,writeAudit} from "../../src/budget-db.js";
import {pushConfigured,pushPublicKey,sendPushToCurrentUser} from "../../src/push.js";

function cleanSubscription(d){
  const endpoint=String(d?.endpoint||"").trim(),keys=d?.keys||{},p256dh=String(keys.p256dh||"").trim(),authKey=String(keys.auth||"").trim();
  if(!endpoint||!p256dh||!authKey)throw new Error("ข้อมูล Push subscription ไม่ครบถ้วน");
  if(!/^https:\/\//i.test(endpoint))throw new Error("Push endpoint ไม่ถูกต้อง");
  return{endpoint,p256dh,auth:authKey};
}
export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx);if(a.error)return bad("ไม่ได้รับอนุญาต",401);
    const rows=await listRows(ctx.env,"PushSubscriptions"),active=rows.filter(x=>x.userId===a.u.id&&String(x.status||"active")==="active");
    return json({configured:pushConfigured(ctx.env),publicKey:pushPublicKey(ctx.env),subscriptions:active.length});
  }catch(e){return bad(e.message||"โหลดการตั้งค่าแจ้งเตือนไม่สำเร็จ",500)}
}
export async function onRequestPost(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx);if(a.error)return bad("ไม่ได้รับอนุญาต",401);
    const d=await readBody(ctx.request),action=String(d.action||"subscribe"),now=new Date().toISOString();
    if(action==="subscribe"){
      if(!pushConfigured(ctx.env))return bad("ระบบ Push ยังไม่ได้ตั้งค่า VAPID",503);
      const s=cleanSubscription(d.subscription),rows=await listRows(ctx.env,"PushSubscriptions"),same=rows.find(x=>x.endpoint===s.endpoint);
      if(same){
        await update(ctx.env,"PushSubscriptions",same.id,{userId:a.u.id,username:a.u.username,p256dh:s.p256dh,auth:s.auth,userAgent:String(d.userAgent||"").slice(0,500),status:"active",updatedAt:now});
      }else{
        await append(ctx.env,"PushSubscriptions",{id:"push_"+crypto.randomUUID(),userId:a.u.id,username:a.u.username,endpoint:s.endpoint,p256dh:s.p256dh,auth:s.auth,userAgent:String(d.userAgent||"").slice(0,500),status:"active",createdAt:now,updatedAt:now});
      }
      await writeAudit(ctx.env,a.u,"PUSH_SUBSCRIBE","system","push","เปิดการแจ้งเตือน Push",{endpointHost:new URL(s.endpoint).host});
      return json({ok:true,subscribed:true});
    }
    if(action==="unsubscribe"){
      const endpoint=String(d.endpoint||"").trim(),rows=await listRows(ctx.env,"PushSubscriptions");
      const mine=rows.filter(x=>x.userId===a.u.id&&(!endpoint||x.endpoint===endpoint)&&String(x.status||"active")==="active");
      for(const x of mine)await update(ctx.env,"PushSubscriptions",x.id,{status:"inactive",updatedAt:now});
      await writeAudit(ctx.env,a.u,"PUSH_UNSUBSCRIBE","system","push","ปิดการแจ้งเตือน Push",{count:mine.length});
      return json({ok:true,subscribed:false,count:mine.length});
    }
    if(action==="test"){
      if(!pushConfigured(ctx.env))return bad("ระบบ Push ยังไม่ได้ตั้งค่า VAPID",503);
      const result=await sendPushToCurrentUser(ctx.env,a.u,{title:"ทดสอบการแจ้งเตือน",body:"Push Notification ของระบบงบประมาณพร้อมใช้งานแล้ว",url:"/?route=dashboard",tag:"push-test"});
      return json({ok:true,result});
    }
    return bad("คำสั่งไม่ถูกต้อง");
  }catch(e){return bad(e.message||"ตั้งค่าการแจ้งเตือนไม่สำเร็จ",500)}
}

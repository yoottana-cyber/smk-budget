import {ensureExtra,list,append,update,auth,json,bad,readBody} from "../../src/budget-db.js";

const ALLOWED_KEYS=["schoolName","schoolLocation","financeOfficer","directorName","directorTitle","systemTitle","schoolLogo"];
const DEFAULTS={
  schoolName:"โรงเรียนสามัคคีศึกษา",
  schoolLocation:"อำเภอห้วยยอด จังหวัดตรัง",
  financeOfficer:"นางสาวจันทรา ชำนาญดง",
  directorName:"นายจักรพงษ์ ทองประดับ",
  directorTitle:"ผู้อำนวยการโรงเรียนสามัคคีศึกษา",
  systemTitle:"ระบบบริหารจัดการงบประมาณ",
  schoolLogo:""
};

const asObject=rows=>{
  const out={...DEFAULTS};
  for(const row of rows)if(ALLOWED_KEYS.includes(row.key))out[row.key]=String(row.value??"");
  return out;
};

export async function onRequestGet(ctx){
  try{
    await ensureExtra(ctx.env);
    const rows=await list(ctx.env,"Settings");
    const settings=asObject(rows);
    const url=new URL(ctx.request.url);
    if(url.searchParams.get("public")==="1"){
      return json({settings:{schoolName:settings.schoolName,systemTitle:settings.systemTitle,schoolLogo:settings.schoolLogo}});
    }
    const a=await auth(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    return json({settings});
  }catch(e){return bad(e.message||"โหลดการตั้งค่าระบบไม่สำเร็จ",500)}
}

export async function onRequestPut(ctx){
  try{
    await ensureExtra(ctx.env);
    const a=await auth(ctx,["admin"]);if(a.error)return bad(a.error==="FORBIDDEN"?"เฉพาะผู้ดูแลระบบ":"ไม่ได้รับอนุญาต",a.error==="FORBIDDEN"?403:401);
    const d=await readBody(ctx.request),rows=await list(ctx.env,"Settings"),now=new Date().toISOString();
    if(d.schoolLogo!==undefined&&String(d.schoolLogo||"").length>45000)return bad("ไฟล์ตราโรงเรียนมีขนาดใหญ่เกินไป กรุณาใช้รูปที่เล็กลง",413);
    const values={};
    for(const key of ALLOWED_KEYS)if(d[key]!==undefined)values[key]=String(d[key]??"").trim();
    for(const [key,value] of Object.entries(values)){
      const old=rows.find(x=>x.key===key);
      if(old)await update(ctx.env,"Settings",key,{value,updatedAt:now});
      else await append(ctx.env,"Settings",{key,value,updatedAt:now});
    }
    const latest=await list(ctx.env,"Settings");
    return json({ok:true,settings:asObject(latest)});
  }catch(e){return bad(e.message||"บันทึกการตั้งค่าระบบไม่สำเร็จ",500)}
}

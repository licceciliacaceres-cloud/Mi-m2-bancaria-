import {sb,json} from './_supabase.js';
function token(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):null}
async function authUser(t){
  if(!t) return null; const r=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${t}`}}); if(!r.ok) return null; return await r.json();
}
function allowed(email){return (process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(String(email||'').toLowerCase())}
export default async function handler(req){
  try{
    const u=await authUser(token(req)); if(!u||!allowed(u.email)) return json({error:'No autorizado'},401);
    if(req.method==='GET'){
      const rows=await sb('m2_units?select=id,status,public_name,acquired_at&order=id');
      const reservations=await sb('reservations?select=id,buyer_first_name,buyer_last_name,division,email,public_name,amount,status,expires_at,paid_at,voucher_code,created_at&order=created_at.desc&limit=500');
      return json({user:{email:u.email},units:rows,reservations});
    }
    if(req.method==='PATCH'){
      const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{}; const id=Number(b.id);
      if(!Number.isInteger(id)||id<1||id>600||!['available','blocked'].includes(b.status)) return json({error:'Datos inválidos'},400);
      await sb(`m2_units?id=eq.${id}`,{method:'PATCH',body:{status:b.status,blocked_reason:b.reason||null,updated_at:new Date().toISOString()}}); return json({ok:true});
    }
    return json({error:'Método no permitido'},405);
  }catch(e){return json({error:e.message},500)}
}

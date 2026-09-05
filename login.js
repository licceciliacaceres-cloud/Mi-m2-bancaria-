import {json} from './_supabase.js';
function allowed(email){return (process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(String(email||'').toLowerCase())}
export default async function handler(req){
  try{
    if(req.method!=='POST') return json({error:'Método no permitido'},405);
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{}; const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
    if(!allowed(email)) return json({error:'Este usuario no tiene acceso al panel.'},403);
    const r=await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d=await r.json(); if(!r.ok) return json({error:d.error_description||'Credenciales inválidas'},401);
    return json({access_token:d.access_token,refresh_token:d.refresh_token,user:d.user});
  }catch(e){return json({error:e.message},500)}
}

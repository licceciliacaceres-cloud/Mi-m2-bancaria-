import crypto from 'node:crypto';
import {rpc,sb,json} from './_supabase.js';
function clean(v,max=200){return String(v??'').trim().slice(0,max)}
function publicName(mode,first,last,honor){
  if(mode==='nombre') return `${first} ${last}`;
  if(mode==='familia') return `Familia ${last}`;
  if(mode==='honor') return `En honor a ${honor||`${first} ${last}`}`;
  return 'Aporte anónimo';
}
export default async function handler(req){
  try{
    if(req.method!=='POST') return json({error:'Método no permitido'},405);
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const unitIds=[...new Set((b.unitIds||[]).map(Number).filter(x=>Number.isInteger(x)&&x>=1&&x<=600))];
    const first=clean(b.firstName,80), last=clean(b.lastName,80), division=clean(b.division,120), email=clean(b.email,160).toLowerCase();
    const mode=['nombre','familia','anonimo','honor'].includes(b.publicMode)?b.publicMode:'anonimo';
    const honor=clean(b.honorText,120);
    if(!unitIds.length||!first||!last||!division||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({error:'Completá todos los datos y seleccioná al menos un m².'},400);
    const publicDisplay=publicName(mode,first,last,honor);
    const ref=`M2-${crypto.randomUUID()}`;
    const r=await rpc('reserve_units',{p_unit_ids:unitIds,p_first_name:first,p_last_name:last,p_division:division,p_email:email,p_public_mode:mode,p_public_name:publicDisplay,p_honor_text:honor,p_external_reference:ref});
    const preference={
      items:[{title:`Mi M² en Bancaria — ${unitIds.length} m²`,quantity:1,unit_price:r.amount,currency_id:'ARS'}],
      payer:{email},external_reference:ref,
      back_urls:{success:`${process.env.PUBLIC_URL}/?payment=success`,failure:`${process.env.PUBLIC_URL}/?payment=failure`,pending:`${process.env.PUBLIC_URL}/?payment=pending`},
      auto_return:'approved',notification_url:`${process.env.PUBLIC_URL}/api/webhook/mercadopago`,
      expires:true,expiration_date_from:new Date().toISOString(),expiration_date_to:new Date(r.expires_at).toISOString()
    };
    if(!process.env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurado');
    const mp=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${process.env.MP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(preference)});
    const mpData=await mp.json();
    if(!mp.ok){ await rpc('cancel_reservation',{p_reservation_id:r.reservation_id}); throw new Error(mpData.message||'Mercado Pago no pudo crear la preferencia'); }
    await sb(`reservations?id=eq.${r.reservation_id}`,{method:'PATCH',body:{mp_preference_id:mpData.id}});
    return json({reservationId:r.reservation_id,expiresAt:r.expires_at,amount:r.amount,initPoint:mpData.init_point});
  }catch(e){return json({error:e.message},500)}
}

import {sb,json} from './_supabase.js';
export default async function handler(req){
  try{
    const u=new URL(req.url,'http://localhost'); const id=u.searchParams.get('reservationId');
    if(!id) return json({error:'Falta reservationId'},400);
    const rows=await sb(`reservations?id=eq.${encodeURIComponent(id)}&select=id,status,expires_at,voucher_code,paid_at`); const r=rows[0];
    if(!r) return json({error:'Reserva no encontrada'},404);
    return json(r);
  }catch(e){return json({error:e.message},500)}
}

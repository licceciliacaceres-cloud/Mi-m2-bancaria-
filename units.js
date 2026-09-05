import {sb,json,rpc} from './_supabase.js';
export default async function handler(req){
  try{
    if(req.method!=='GET') return json({error:'Método no permitido'},405);
    await rpc('expire_reservations',{});
    const rows=await sb('m2_units?select=id,status,public_name,acquired_at&order=id');
    return json({units:rows});
  }catch(e){return json({error:e.message},500)}
}

import {rpc,json} from './_supabase.js';
export default async function handler(req){
  try{ if(req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`) return json({error:'No autorizado'},401); const released=await rpc('expire_reservations',{}); return json({ok:true,released}); }
  catch(e){return json({error:e.message},500)}
}

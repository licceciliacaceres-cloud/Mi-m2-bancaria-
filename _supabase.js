export function sbConfig(){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return {url,key};
}
export async function sb(path,{method='GET',body,headers={}}={}){
  const {url,key}=sbConfig();
  const r=await fetch(`${url}/rest/v1/${path}`,{
    method,
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...headers},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data=text}
  if(!r.ok) throw new Error(typeof data==='string'?data:(data.message||JSON.stringify(data)));
  return data;
}
export async function rpc(fn,args){
  const {url,key}=sbConfig();
  const r=await fetch(`${url}/rest/v1/rpc/${fn}`,{
    method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)
  });
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data=text}
  if(!r.ok) throw new Error(typeof data==='string'?data:(data.message||JSON.stringify(data)));
  return data;
}
export function json(data,status=200){return {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)}}

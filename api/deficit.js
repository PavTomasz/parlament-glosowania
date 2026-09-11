import { requireAccess } from '../lib/auth.js';
import { deficitSnapshot, normalizeEurostat, eurostatURL } from '../lib/deficit.js';

let cached;
let cachedUntil=0;
export default async function handler(req,res) {
  if (!await requireAccess(req,res)) return;
  if(req.method!=='GET')return res.status(405).json({ok:false});
  const snapshot=await deficitSnapshot();
  if(cached && Date.now()<cachedUntil)return res.status(200).json({ok:true,data:cached});
  try {
    const year=new Date().getUTCFullYear()-1;
    const payload=await Promise.all(['PC_GDP','MIO_NAC'].map(async unit=>{
      const response=await fetch(eurostatURL(unit,year),{signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw new Error('Source unavailable');
      return response.json();
    }));
    const rows=normalizeEurostat(...payload,year);
    if(rows.at(-1).year<snapshot.rows.at(-1).year || rows.length<snapshot.rows.length-1)throw new Error('Incomplete source');
    cached={...snapshot,rows,sourceUpdated:payload.map(p=>p.updated),checkedAt:new Date().toISOString(),sourceStatus:'checked'};
    cachedUntil=Date.now()+3600_000;
    return res.status(200).json({ok:true,data:cached});
  }catch{
    return res.status(200).json({ok:true,data:{...snapshot,sourceStatus:'saved'}});
  }
}

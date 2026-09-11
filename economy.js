import {readFile} from 'node:fs/promises';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false});
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
  const data=JSON.parse(await readFile(new URL('../lib/data/economy.json',import.meta.url),'utf8'));
  return res.status(200).json({ok:true,data});
}

import { readFile } from 'node:fs/promises';

export async function deficitSnapshot() {
  return JSON.parse(await readFile(new URL('./data/deficit-history.json', import.meta.url),'utf8'));
}
function series(json, unit) {
  const expected = {freq:'A',unit,sector:'S13',na_item:'B9',geo:'PL'};
  if (!Array.isArray(json.id) || json.id.at(-1)!=='time' || json.id.length!==6) throw new Error('Unexpected dimensions');
  for (const [key,value] of Object.entries(expected)) {
    const at=json.id.indexOf(key);
    if(at<0 || json.size[at]!==1 || json.dimension[key]?.category?.index?.[value]!==0) throw new Error('Unexpected series');
  }
  const values = new Map();
  for (const [year,index] of Object.entries(json.dimension.time.category.index)) {
    const value=json.value?.[index];
    if (/^\d{4}$/.test(year) && typeof value==='number' && Number.isFinite(value)) values.set(+year,{value,flag:json.status?.[index] || null});
  }
  return values;
}
export function normalizeEurostat(gdpJSON, plnJSON, lastCompleteYear) {
  const gdp=series(gdpJSON,'PC_GDP'), pln=series(plnJSON,'MIO_NAC');
  const rows=[...gdp.keys()].sort((a,b)=>a-b).filter(year=>year<=lastCompleteYear && pln.has(year)).map(year=>({
    year, deficitGDP:-gdp.get(year).value, deficitPLN:+(-pln.get(year).value/1000).toFixed(3),
    flags:[...new Set([gdp.get(year).flag,pln.get(year).flag].filter(Boolean))]
  }));
  if(!rows.length)throw new Error('No comparable observations');
  const end=rows.at(-1).year;
  // Preserve gaps. Never turn missing observations into zeros or connect them.
  return rows.filter(row=>row.year>=end-29);
}
export function eurostatURL(unit, lastYear) {
  const query=new URLSearchParams({geo:'PL',sector:'S13',na_item:'B9',unit,freq:'A',sinceTimePeriod:String(Math.max(1996,lastYear-30)),untilTimePeriod:String(lastYear),lang:'EN'});
  return 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt1?'+query;
}

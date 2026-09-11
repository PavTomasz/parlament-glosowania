import { budgetSnapshot, parseBudgetPage } from '../lib/budget.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ok:false});
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
  const snapshot = await budgetSnapshot();
  const year = new Date().getUTCFullYear();
  try {
    const source = await fetch(`https://www.gov.pl/web/finanse/szacunek-${year}`, {signal:AbortSignal.timeout(8000),headers:{Accept:'text/html'},redirect:'error'});
    if (!source.ok) throw new Error('Source unavailable');
    const parsed = parseBudgetPage(await source.text(), year);
    if(parsed.year*12+parsed.month < snapshot.year*12+snapshot.month)throw new Error('Older reporting period');
    const samePeriod = parsed.year === snapshot.year && parsed.month === snapshot.month;
    const annualLimit = parsed.year === snapshot.year ? snapshot.annualLimit : null;
    const budget = {...parsed, publicationDate:parsed.publicationDate || (samePeriod ? snapshot.publicationDate : null), annualLimit, limitSourceUrl:annualLimit ? snapshot.limitSourceUrl : null};
    return res.status(200).json({ok:true,budget,sourceStatus:'checked',checkedAt:new Date().toISOString()});
  } catch {
    return res.status(200).json({ok:true,budget:snapshot,sourceStatus:'saved',checkedAt:snapshot.verifiedAt});
  }
}

import { load } from 'cheerio';
import { readFile } from 'node:fs/promises';

export async function budgetSnapshot() {
  return JSON.parse(await readFile(new URL('../data/budget.json', import.meta.url), 'utf8'));
}
const months = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
export function parseBudgetPage(html, year) {
  const $ = load(html);
  $('script,style,nav,footer').remove();
  const text = $('body').text().replace(/[\u00a0\u202f]/g,' ').replace(/[\u200b-\u200d]/g,'').replace(/\s+/g,' ');
  const period = text.match(/W okresie styczeń\s*(?:[-–]\s*([a-ząćęłńóśźż]+))?\s*(20\d{2})\s*roku/i);
  if (!period || Number(period[2]) !== year) throw new Error('Missing reporting period');
  const month = period[1] ? months.indexOf(period[1].toLowerCase()) + 1 : 1;
  if (!month) throw new Error('Unknown reporting month');
  function amount(label) {
    const found = text.match(new RegExp(label+'\\s*[-–:]\\s*(-?[0-9][0-9., ]*)\\s*mln','i'));
    if (!found) throw new Error('Missing amount');
    const value = Math.round(Number(found[1].replace(/[. ]/g,'').replace(',','.')) * 1e6);
    if (!Number.isFinite(value)) throw new Error('Invalid amount');
    return value;
  }
  const revenue = amount('dochody');
  const expenditure = amount('wydatki');
  const deficit = /nadwyżka\s*[-–:]/i.test(text) ? -amount('nadwyżka') : amount('deficyt');
  if (revenue < 0 || expenditure < 0 || Math.abs(expenditure-revenue-deficit)>200000) throw new Error('Inconsistent budget figures');
  const filenameDate = text.match(/(20\d{2})([01]\d)([0-3]\d)\s*_?dane/i);
  const publicationDate = filenameDate ? `${filenameDate[1]}-${filenameDate[2]}-${filenameDate[3]}` : null;
  return { year, month, revenue, expenditure, deficit, publicationDate, sourceUrl:`https://www.gov.pl/web/finanse/szacunek-${year}`, estimate:true };
}

// Annual balances are not apportioned between governments by time in office.
export function overlapsYear(period, year) {
  return period.from <= `${year}-12-31` && (!period.to || period.to >= `${year}-01-01`);
}
export function termRows(rows, term, fullYears = false) {
  return rows.filter(row => fullYears
    ? term.from <= `${row.year}-01-01` && (!term.to || term.to >= `${row.year}-12-31`)
    : overlapsYear(term, row.year));
}
export function compareTerm(rows, term) {
  const full = termRows(rows, term, true);
  const first = full[0] || null, last = full.at(-1) || null;
  return {first, last, count:full.length,
    changeGDP:full.length < 2 ? null : +(last.deficitGDP-first.deficitGDP).toFixed(1),
    changePLN:full.length < 2 ? null : +(last.deficitPLN-first.deficitPLN).toFixed(3)};
}
export function governmentsForYear(data, year) {
  if (year > data.politicsThrough) return [];
  return data.governments.filter(g=>overlapsYear(g, year));
}
export function coalitionForYear(government, year, language='pl') {
  const value = government.coalitions.find(c=>year>=c.from && year<=c.to)?.label;
  return typeof value === 'string' ? value : value?.[language] || '—';
}
export function governmentsForTerm(data, term) {
  // Governing parties within the full years used in the numeric comparison.
  const years = termRows(data.rows,term,true).map(row=>row.year);
  return [...new Set(years.flatMap(year=>governmentsForYear(data,year).map(g=>g.name)))];
}

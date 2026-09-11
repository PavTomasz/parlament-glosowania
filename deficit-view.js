import { t,getLanguage } from './i18n.js';
import { overlapsYear,termRows,compareTerm,governmentsForYear,coalitionForYear,governmentsForTerm } from './deficit-model.js';

const escape = value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=(value,digits=1)=>new Intl.NumberFormat(getLanguage()==='pl'?'pl-PL':'en-GB',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const day=value=>new Intl.DateTimeFormat(getLanguage()==='pl'?'pl-PL':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));
const changeText=value=>`${value>0?'+':''}${number(value)} ${t('deficit.shortPP')}`;
const periodLabel=term=>`${term.from.slice(0,4)}–${term.to?term.to.slice(0,4):t('deficit.present')}`;

export function mountDeficit(root,data) {
  let unit='gdp',range=30,termId=null,year=data.rows.at(-1).year,rows=data.rows,observer;
  const allTerms=data.terms.filter(term=>termRows(data.rows,term).length).toReversed();
  const unitText=()=>t(unit==='gdp'?'deficit.gdp':'deficit.pln');
  const metric=row=>unit==='gdp'?row.deficitGDP:row.deficitPLN;
  const amount=row=>`${number(metric(row),unit==='gdp'?1:2)} ${unitText()}`;
  function activeRows() {
    const term=data.terms.find(term=>term.id===termId);
    if(term)return termRows(data.rows,term);
    return data.rows.filter(row=>row.year>data.rows.at(-1).year-range);
  }
  function comparison(term) {
    const result=compareTerm(data.rows,term);
    const delta=result.changeGDP;
    return `<tr><th scope="row"><button class="term-table-button" type="button" data-term="${term.id}" aria-pressed="${term.id===termId}">${escape(t('deficit.term',{term:term.label}))}</button><small>${escape(periodLabel(term))}</small><span class="comparison-governments">${escape(governmentsForTerm(data,term).join(' · '))}</span></th><td>${result.first?`${result.first.year}<strong>${number(result.first.deficitGDP)}%</strong>`:'—'}</td><td>${result.count>1?`${result.last.year}<strong>${number(result.last.deficitGDP)}%</strong>`:'—'}</td><td>${delta!==null?`<strong class="change-value ${delta>0?'is-increase':''}">${escape(changeText(delta))}</strong><small>${escape(t(delta>0?'deficit.increase':delta<0?'deficit.decrease':'deficit.unchanged'))}</small>`:`<small>${escape(t(result.count?'deficit.insufficient':'deficit.noFull'))}</small>`}</td></tr>`;
  }
  function render() {
    rows=activeRows();
    if(!rows.some(row=>row.year===year))year=rows.at(-1).year;
    const selectedTerm=data.terms.find(term=>term.id===termId);
    root.innerHTML=`<header class="deficit-heading"><div class="eyebrow">${t('deficit.eyebrow')}</div><h1>${t('deficit.title')}</h1><p>${t('deficit.subtitle')}</p></header>
      <section class="deficit-chart-section" aria-labelledby="deficitChartTitle">
        <div class="deficit-chart-top"><div><h2 id="deficitChartTitle">${t('deficit.series')}</h2><p>${t('deficit.period',{from:rows[0].year,to:rows.at(-1).year})}</p></div><div class="deficit-controls"><div class="segmented" role="group" aria-label="${t('deficit.range')}">${[10,20,30].map(count=>`<button type="button" data-range="${count}" aria-pressed="${!termId&&range===count}">${t('deficit.years',{count})}</button>`).join('')}</div><div class="segmented" role="group" aria-label="${t('deficit.unit')}">${['gdp','pln'].map(value=>`<button type="button" data-unit="${value}" aria-pressed="${unit===value}">${t(value==='gdp'?'deficit.gdp':'deficit.pln')}</button>`).join('')}</div></div></div>
        <div class="deficit-chart-wrap" data-chart></div>
        <div class="chart-caption"><span>${t('deficit.hint')}</span><label>${t('deficit.selectYear')} <select data-year aria-label="${t('deficit.selectYear')}">${rows.map(row=>`<option value="${row.year}" ${row.year===year?'selected':''}>${row.year}</option>`).join('')}</select></label></div>
        <div class="year-selection" data-selection></div><p class="sr-only" data-announcement aria-live="polite"></p>
        <div class="term-navigation"><span>${t('deficit.terms')}</span><div class="term-buttons" role="group" aria-label="${t('deficit.terms')}"><button type="button" data-term="all" aria-pressed="${!termId}"><strong>${t('deficit.all')}</strong><small>${data.rows[0].year}–${data.rows.at(-1).year}</small></button>${allTerms.map(term=>`<button type="button" data-term="${term.id}" aria-pressed="${term.id===termId}"><strong>${t('deficit.term',{term:term.label})}</strong><small>${escape(periodLabel(term))}</small></button>`).join('')}</div></div>
        ${selectedTerm?termSummary(selectedTerm):''}
        <p class="deficit-scope">${t('deficit.scope')} ${unit==='pln'?t('deficit.nominal'):''}</p>
      </section>
      <section class="deficit-comparisons"><h2>${t('deficit.changeTitle')}</h2><p>${t('deficit.compareNote')}</p><div class="comparison-scroll"><table class="comparison-table"><caption>${t('deficit.comparison')} · ${t('deficit.gdp')}</caption><thead><tr><th>${t('deficit.terms')}</th><th>${t('deficit.from')}</th><th>${t('deficit.to')}</th><th>${t('deficit.change')}</th></tr></thead><tbody>${allTerms.map(comparison).join('')}</tbody></table></div><p class="method-note">${t('deficit.context')}</p></section>
      <details class="deficit-details"><summary>${t('deficit.table')}</summary><div class="comparison-scroll"><table class="annual-table"><thead><tr><th>${t('deficit.year')}</th><th>${t('deficit.pln')}</th><th>${t('deficit.gdp')}</th><th>${t('deficit.primeMinisters')}</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${row.year}</th><td>${number(row.deficitPLN,3)}</td><td>${number(row.deficitGDP)}</td><td>${governmentsForYear(data,row.year).map(g=>`${escape(g.name)} — ${escape(coalitionForYear(g,row.year,getLanguage()))}`).join('<br>')||t('deficit.noData')}${row.flags?.length?`<small>${t('deficit.flag')}: ${escape(row.flags.join(', '))}</small>`:''}</td></tr>`).join('')}</tbody></table></div></details>
      <details class="deficit-details"><summary>${t('deficit.method')}</summary><p>${t('deficit.minus')} ${t('deficit.gap')} ${t('deficit.nominal')}</p><p>${t('deficit.govMethod')}</p><p>${t('deficit.politicalLimit',{year:data.politicsThrough})}</p></details>
      <footer class="deficit-sources"><div><p>${t(data.sourceStatus==='checked'?'deficit.checked':'deficit.saved',{date:day(data.checkedAt)})}</p><p>${t('deficit.updated',{date:day(data.sourceUpdated[0].slice(0,10))})}</p></div><div>${[['sourceUrl','deficit.source'],['termsSource','deficit.termsSource'],['governmentsSource','deficit.politicsSource'],['coalitionsSource','deficit.coalitionsSource']].map(([key,label])=>`<a href="${escape(data[key])}" target="_blank" rel="noopener">${t(label)}</a>`).join('')}</div></footer>`;
    drawChart(); selectYear(year);
    observer?.disconnect();
    if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(()=>drawChart());observer.observe(root.querySelector('[data-chart]'));}
  }
  function termSummary(term) {
    const c=compareTerm(data.rows,term);
    if(c.changeGDP===null)return `<div class="term-summary"><strong>${t('deficit.term',{term:term.label})}</strong><span>${t(c.count?'deficit.insufficient':'deficit.noFull')}</span></div>`;
    return `<div class="term-summary"><strong>${t('deficit.term',{term:term.label})} · ${c.first.year}–${c.last.year}</strong><span>${number(c.first.deficitGDP)}% → ${number(c.last.deficitGDP)}% ${getLanguage()==='pl'?'PKB':'GDP'} <b>${changeText(c.changeGDP)}</b></span><span>${number(c.first.deficitPLN,2)} → ${number(c.last.deficitPLN,2)} ${t('deficit.pln')}</span></div>`;
  }
  function drawChart() {
    const element=root.querySelector('[data-chart]');if(!element)return;
    const width=Math.max(240,element.getBoundingClientRect().width||960),height=300,left=54,right=12,top=32,bottom=42;
    const first=rows[0].year,last=rows.at(-1).year,count=last-first+1;
    const low=Math.min(0,...rows.map(metric)),rawHigh=Math.max(0,...rows.map(metric));
    const step=unit==='gdp'?(rawHigh-low>6?2:1):(rawHigh-low>100?50:rawHigh-low>30?10:5);
    const min=Math.floor(low/step)*step,max=Math.ceil((rawHigh||step)/step)*step;
    const plotHeight=height-top-bottom,plotWidth=width-left-right;
    const y=value=>top+(max-value)/(max-min)*plotHeight;
    const x=value=>left+(value-first+.5)*plotWidth/count;
    const barWidth=Math.max(2,plotWidth/count*.65),zero=y(0);
    const ticks=[];for(let value=min;value<=max+.0001;value+=step)ticks.push(value);
    const tickCount=width<420?4:width<700?6:10;
    const tickEvery=Math.max(1,Math.ceil((count-1)/(tickCount-1)));
    const years=[];for(let value=first;value<=last;value+=tickEvery)years.push(value);
    if(last-years.at(-1)>=tickEvery*.65)years.push(last);
    else if(years.length>1)years[years.length-1]=last;
    const description=t('deficit.chartLabel',{from:first,to:last,unit:unitText()});
    element.innerHTML=`<svg class="deficit-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escape(description)}"><title>${escape(description)}</title><text x="${left}" y="16" class="axis-title">${unitText()}</text>${ticks.map(value=>`<line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}" class="${value===0?'zero-line':'grid-line'}"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end">${number(value,0)}</text>`).join('')}${rows.map(row=>`<rect data-bar-year="${row.year}" x="${x(row.year)-barWidth/2}" y="${Math.min(y(metric(row)),zero)}" width="${barWidth}" height="${Math.max(.7,Math.abs(y(metric(row))-zero))}" rx="1" class="deficit-bar ${row.year===year?'is-selected':''}"><title>${row.year}: ${amount(row)}</title></rect>`).join('')}${years.map(value=>`<text x="${x(value)}" y="${height-19}" text-anchor="${value===first?'start':value===last?'end':'middle'}">${value}</text>`).join('')}<text x="${width-right}" y="${height-2}" text-anchor="end" class="axis-title">${t('deficit.year')}</text><rect data-hit x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="transparent"/></svg>`;
    const hit=element.querySelector('[data-hit]');
    function point(event,commit) {
      const box=element.querySelector('svg').getBoundingClientRect();
      const cursor=(event.clientX-box.left)*width/(box.width||width);
      const candidate=first+Math.floor((cursor-left)/plotWidth*count);
      const row=rows.find(row=>row.year===candidate);if(row)selectYear(row.year,commit);
    }
    hit.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')point(event,false);});
    hit.addEventListener('click',event=>point(event,true));
  }
  function selectYear(value,announce=false) {
    const row=rows.find(row=>row.year===value);if(!row)return;year=value;
    root.querySelector('[data-year]').value=String(year);
    root.querySelectorAll('[data-bar-year]').forEach(bar=>bar.classList.toggle('is-selected',+bar.dataset.barYear===year));
    const governments=governmentsForYear(data,year);
    const terms=data.terms.filter(term=>overlapsYear(term,year)&&year<=data.politicsThrough).map(term=>term.label).join(' / ');
    const selection=root.querySelector('[data-selection]');
    selection.innerHTML=`<div class="selected-value"><span>${year} · ${t(row.deficitGDP<0?'deficit.surplus':'deficit.value')}</span><strong>${number(Math.abs(metric(row)),unit==='gdp'?1:2)} <small>${unitText()}</small></strong><span>${t('deficit.termYear',{terms:terms||'—'})}</span></div><div class="selected-government"><h3>${t('deficit.primeMinisters')}</h3>${governments.length?governments.map(g=>`<div><strong>${escape(g.name)}</strong><span>${escape(coalitionForYear(g,year,getLanguage()))}</span><small>${day(g.from)} – ${g.to?day(g.to):t('deficit.present')}</small></div>`).join(''):`<p>${t('deficit.noData')}</p>`}${governments.length>1?`<p class="transition-note">${t('deficit.changeYear')}</p>`:''}</div>`;
    if(announce)root.querySelector('[data-announcement]').textContent=`${year}: ${amount(row)}. ${governments.map(g=>g.name).join(', ')}`;
  }
  function click(event) {
    const button=event.target.closest('button');if(!button || !root.contains(button))return;
    let key;
    if(button.dataset.unit){unit=button.dataset.unit;key=`[data-unit="${unit}"]`;}
    else if(button.dataset.range){range=+button.dataset.range;termId=null;key=`[data-range="${range}"]`;}
    else if(button.dataset.term){termId=button.dataset.term==='all'?null:+button.dataset.term;range=30;key=`[data-term="${button.dataset.term}"]`;}
    else return;
    render();root.querySelector(key)?.focus({preventScroll:true});
  }
  function change(event){if(event.target.matches('[data-year]'))selectYear(+event.target.value,true);}
  const language=()=>render();
  root.addEventListener('click',click);root.addEventListener('change',change);
  document.addEventListener('parlament:language',language);
  render();
  return ()=>{observer?.disconnect();root.removeEventListener('click',click);root.removeEventListener('change',change);document.removeEventListener('parlament:language',language);};
}

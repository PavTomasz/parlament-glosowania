import {initLanguage,setLanguage,getLanguage,t,months} from './i18n.js';
const $ = selector=>document.querySelector(selector);
let budget=null;
let budgetStatus='saved';
let budgetChecked='2026-09-11';

export function showHome(){
 $('#appMain').hidden=true;$('#deficitMain').hidden=true;$('#welcome').hidden=false;
 document.querySelectorAll('.main-nav a').forEach(a=>a.removeAttribute('aria-current'));
 history.replaceState(null,'','#start');
}
async function route(section){
 $('#mainNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false');
 if(['clubs','stats'].includes(section)){
  $('#noticeTitle').textContent=t(section==='clubs'?'nav.clubs':'nav.stats');$('#sectionNotice').showModal();return;
 }
 $('#welcome').hidden=true;$('#appMain').hidden=section==='economy';$('#deficitMain').hidden=section!=='economy';
 document.querySelectorAll('.main-nav a').forEach(a=>{if(a.dataset.route===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 const indicator=eventIndicator||window.location.hash.split('/')[1]||'deficit';
 history.replaceState(null,'',section==='economy'?`#polska-w-liczbach/${indicator}`:`#${section}`);
 if(section==='economy'){const chart=await import('./economy.js');await chart.openEconomy(indicator);}
 else{const app=await import('./app.js');await app.navigateTo(section);}
}
function money(value,decimals=2){return new Intl.NumberFormat(getLanguage()==='pl'?'pl-PL':'en-GB',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(value/1e9);}
function date(value){return value?new Intl.DateTimeFormat(getLanguage()==='pl'?'pl-PL':'en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)):'';}
function drawBudget(){
 if(!budget)return;
 const lang=getLanguage();
 $('#budgetValue').textContent=money(Math.abs(budget.deficit));$('#budgetUnit').textContent=t('budget.unit');
 $('#budgetHeading').textContent=t(budget.deficit<0?'budget.surplus':'budget.title');
 const period=budget.month===1?months[lang][0]:`${months[lang][0]}–${months[lang][budget.month-1]}`;
 $('#budgetPeriod').textContent=`${period[0].toUpperCase()+period.slice(1)} ${budget.year} · ${t('budget.estimate')}`;
 const hasLimit=Number.isFinite(budget.annualLimit)&&budget.annualLimit>0;
 $('#budgetProgress').hidden=!hasLimit;$('.budget-progress-label').hidden=!hasLimit;
 $('.budget-facts').hidden=!hasLimit;
 if(hasLimit){
  const ratio=budget.deficit/budget.annualLimit*100;
  $('#budgetPercent').textContent=new Intl.NumberFormat(lang,{maximumFractionDigits:1}).format(ratio)+'%';
  $('#budgetProgress').value=Math.max(0,Math.min(100,ratio));$('#budgetProgress').textContent=$('#budgetPercent').textContent;
  $('#budgetLimitLabel').textContent=t('budget.limit',{year:budget.year});
  $('#budgetLimit').textContent=`${money(budget.annualLimit)} ${t('budget.unit')}`;
  $('#budgetRemainingLabel').textContent=t(budget.deficit>budget.annualLimit?'budget.exceeded':'budget.remaining');
  $('#budgetRemaining').textContent=`${money(Math.abs(budget.annualLimit-budget.deficit))} ${t('budget.unit')}`;
 }
 $('#budgetPublication').textContent=budget.publicationDate?t('budget.publication',{date:date(budget.publicationDate)}):'';
 $('#budgetFreshness').textContent=t(budgetStatus==='checked'?'budget.checked':'budget.saved',{date:date(budgetChecked)});
 $('#budgetSource').href=budget.sourceUrl;
 $('#budgetLaw').hidden=!budget.limitSourceUrl;if(budget.limitSourceUrl)$('#budgetLaw').href=budget.limitSourceUrl;
}
async function loadBudget(){
 try{const r=await fetch('/api/budget');const data=await r.json();if(!r.ok||!data.ok)throw new Error();budget=data.budget;budgetStatus=data.sourceStatus;budgetChecked=data.checkedAt;drawBudget();}
 catch{try{const r=await fetch('/data/budget.json');if(r.ok){budget=await r.json();budgetChecked=budget.verifiedAt;drawBudget();}}catch{}}
}
for(const button of document.querySelectorAll('[data-language]'))button.addEventListener('click',()=>setLanguage(button.dataset.language));
let eventIndicator=null;
for(const link of document.querySelectorAll('[data-route]'))link.addEventListener('click',event=>{event.preventDefault();eventIndicator=link.dataset.indicatorLink||null;void route(link.dataset.route).finally(()=>eventIndicator=null);});
for(const link of document.querySelectorAll('[data-home]'))link.addEventListener('click',event=>{event.preventDefault();showHome();});
$('#noticeClose').addEventListener('click',()=>$('#sectionNotice').close());
for(const dialog of [$('#sectionNotice')])dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
$('#menuToggle').addEventListener('click',()=>{const open=$('#mainNav').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#mainNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false');}});
document.addEventListener('parlament:language',drawBudget);
const indicatorStrip=$('#indicatorStrip'),indicatorPrev=$('#indicatorPrev'),indicatorNext=$('#indicatorNext');
let stripDrag=null,stripMoved=false;
function updateStripArrows(){const end=Math.max(0,indicatorStrip.scrollWidth-indicatorStrip.clientWidth);indicatorPrev.disabled=indicatorStrip.scrollLeft<=2;indicatorNext.disabled=indicatorStrip.scrollLeft>=end-2;}
function scrollIndicators(direction){indicatorStrip.scrollBy({left:direction*Math.max(220,indicatorStrip.clientWidth*.72),behavior:'smooth'});}
indicatorPrev.addEventListener('click',()=>scrollIndicators(-1));indicatorNext.addEventListener('click',()=>scrollIndicators(1));indicatorStrip.addEventListener('scroll',updateStripArrows,{passive:true});
indicatorStrip.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;stripDrag={x:event.clientX,left:indicatorStrip.scrollLeft};stripMoved=false;indicatorStrip.classList.add('is-dragging');indicatorStrip.setPointerCapture(event.pointerId);});
indicatorStrip.addEventListener('pointermove',event=>{if(!stripDrag)return;const distance=event.clientX-stripDrag.x;if(Math.abs(distance)>5)stripMoved=true;indicatorStrip.scrollLeft=stripDrag.left-distance;});
function finishStripDrag(){stripDrag=null;indicatorStrip.classList.remove('is-dragging');}
indicatorStrip.addEventListener('pointerup',finishStripDrag);indicatorStrip.addEventListener('pointercancel',finishStripDrag);indicatorStrip.addEventListener('lostpointercapture',finishStripDrag);
indicatorStrip.addEventListener('click',event=>{if(stripMoved){event.preventDefault();event.stopPropagation();stripMoved=false;}},true);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(updateStripArrows).observe(indicatorStrip);
async function loadIndicators(){try{const r=await fetch('/api/economy');const d=await r.json();if(!r.ok||!d.ok)throw new Error();const nav=$('#indicatorStrip'),lang=getLanguage(),format=v=>new Intl.NumberFormat(lang==='pl'?'pl-PL':'en-GB',{maximumFractionDigits:1}).format(v);nav.innerHTML=d.data.series.filter(s=>s.strip).map(s=>{const last=s.rows.at(-1),unit=lang==='pl'?s.unit:s.unitEn;let label=s.label[lang]||s.label.pl,value=`${format(last.value)} ${unit}`,year=last.year;if(s.stripGroup==='energy-fuels'){const fuel=d.data.series.find(item=>item.id==='fuel'),fuelLast=fuel.rows.at(-1);label=t('economy.energyFuel');value=`${t('economy.energyShort')} ${format(last.value)}% · ${t('economy.fuelShort')} ${format(fuelLast.value)}%`;year=Math.min(last.year,fuelLast.year);}return `<button type="button" data-route="economy" data-indicator-link="${s.id}"><span>${label}</span><strong>${value}</strong><small>${year}</small></button>`;}).join('');for(const button of nav.querySelectorAll('[data-route]'))button.addEventListener('click',()=>{eventIndicator=button.dataset.indicatorLink;void route('economy').finally(()=>eventIndicator=null);});requestAnimationFrame(updateStripArrows);}catch{$('.indicator-strip-shell').hidden=true;}}
document.addEventListener('parlament:language',loadIndicators);
void initLanguage();void loadBudget();void loadIndicators();

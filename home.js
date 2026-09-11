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
 $('#welcome').hidden=true;$('#appMain').hidden=section==='deficit';$('#deficitMain').hidden=section!=='deficit';
 document.querySelectorAll('.main-nav a').forEach(a=>{if(a.dataset.route===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 history.replaceState(null,'',section==='deficit'?'#deficyt':`#${section}`);
 if(section==='deficit'){const chart=await import('./deficit.js');await chart.openDeficit();}
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
for(const link of document.querySelectorAll('[data-route]'))link.addEventListener('click',event=>{event.preventDefault();void route(link.dataset.route);});
for(const link of document.querySelectorAll('[data-home]'))link.addEventListener('click',event=>{event.preventDefault();showHome();});
$('#noticeClose').addEventListener('click',()=>$('#sectionNotice').close());
for(const dialog of [$('#sectionNotice')])dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
$('#menuToggle').addEventListener('click',()=>{const open=$('#mainNav').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#mainNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false');}});
document.addEventListener('parlament:language',drawBudget);
void initLanguage();void loadBudget();

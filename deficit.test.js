import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { deficitSnapshot,normalizeEurostat } from '../lib/deficit.js';
import { compareTerm,termRows,governmentsForYear } from '../deficit-model.js';
import { mountDeficit } from '../deficit-view.js';
import { setLanguage } from '../i18n.js';
import { preferredLocale } from '../api/locale.js';
const data=await deficitSnapshot();

test('snapshot has 30 distinct complete years and both verified units',()=>{
  assert.deepEqual(data.rows.map(row=>row.year),Array.from({length:30},(_,i)=>1996+i));
  assert.deepEqual(data.rows.at(-1),{year:2025,deficitGDP:7.3,deficitPLN:283.969,flags:[]});
});
test('term comparisons exclude transition years and never invent a zero change',()=>{
  const ix=data.terms.find(term=>term.id===9),v=data.terms.find(term=>term.id===5);
  assert.deepEqual(termRows(data.rows,ix,true).map(row=>row.year),[2020,2021,2022]);
  assert.equal(compareTerm(data.rows,ix).changeGDP,-3.5);
  assert.equal(compareTerm(data.rows,v).count,1);
  assert.equal(compareTerm(data.rows,v).changeGDP,null);
  assert.deepEqual(governmentsForYear(data,2023).map(g=>g.name),['Mateusz Morawiecki','Donald Tusk']);
  assert.equal(governmentsForYear(data,2026).length,0);
});
test('Eurostat normalization preserves surpluses, rejects wrong units and skips nulls',()=>{
  const source=unit=>({id:['freq','unit','sector','na_item','geo','time'],size:[1,1,1,1,1,3],dimension:Object.fromEntries(Object.entries({freq:'A',unit,sector:'S13',na_item:'B9',geo:'PL'}).map(([key,value])=>[key,{category:{index:{[value]:0}}}]).concat([['time',{category:{index:{2024:0,2025:1,2026:2}}}]])),value:{0:2,1:null,2:-5}});
  const gdp=source('PC_GDP'),pln=source('MIO_NAC');
  assert.deepEqual(normalizeEurostat(gdp,pln,2025),[{year:2024,deficitGDP:-2,deficitPLN:-.002,flags:[]}]);
  assert.throws(()=>normalizeEurostat(gdp,source('MIO_EUR'),2025));
});
test('country defaults to Polish and switches other valid countries to English',()=>{
  assert.equal(preferredLocale(undefined).language,'pl');
  assert.equal(preferredLocale('PL').language,'pl');
  assert.equal(preferredLocale('GB').language,'en');
  assert.equal(preferredLocale('XX').language,'pl');
});
test('chart supports selecting units, terms, transition years and English',()=>{
  const dom=new JSDOM('<main id="test"></main>',{url:'https://example.test/'});
  const originals=Object.fromEntries(['document','CustomEvent','localStorage'].map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{document:dom.window.document,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage});
  const root=document.getElementById('test');let cleanup;
  try{
    cleanup=mountDeficit(root,{...data,sourceStatus:'saved'});
    assert.equal(root.querySelectorAll('[data-bar-year]').length,30);
    root.querySelector('[data-unit="pln"]').click();
    assert.match(root.querySelector('[data-selection]').textContent,/283,97/);
    const select=root.querySelector('[data-year]');select.value='2023';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    assert.match(root.querySelector('[data-selection]').textContent,/Morawiecki/);
    assert.match(root.querySelector('[data-selection]').textContent,/Donald Tusk/);
    root.querySelector('[data-term="9"]').click();
    assert.equal(root.querySelectorAll('[data-bar-year]').length,5);
    assert.match(root.querySelector('.term-summary').textContent,/2020–2022/);
    assert.match(root.querySelector('.term-summary').textContent,/-3,5/);
    setLanguage('en',false);
    assert.match(root.textContent,/Deficit through the years/);
    assert.match(root.querySelector('.term-summary').textContent,/-3.5 pp/);
    root.querySelector('[data-term="5"]').click();
    assert.match(root.querySelector('.term-summary').textContent,/Only one complete year/);
    root.querySelector('[data-range="10"]').click();
    assert.equal(root.querySelectorAll('[data-bar-year]').length,10);
  }finally{
    cleanup?.();setLanguage('pl',false);dom.window.close();
    for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});

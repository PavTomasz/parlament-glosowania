// Regression coverage for the requested edition with login deferred.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('navigation opens voting records and Deficit without auth requests or forms',async()=>{
 const dom=new JSDOM(html,{url:'https://example.test/'});
 const originals=Object.fromEntries(['window','document','history','CustomEvent','localStorage','fetch'].map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,history:dom.window.history,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage});
 const calls=[];
 globalThis.fetch=async input=>{const path=new URL(input,dom.window.location.origin).pathname;calls.push(path);
 if(path==='/api/locale')return Response.json({ok:true,language:'pl'});
 if(path==='/api/budget')return Response.json({ok:true,budget:JSON.parse(await readFile('data/budget.json','utf8')),sourceStatus:'saved',checkedAt:'2026-09-11'});
 if(path==='/api/sejm')return Response.json({ok:true,votes:[],mps:[]});
 if(path==='/api/deficit')return Response.json({ok:true,data:{...JSON.parse(await readFile('lib/data/deficit-history.json','utf8')),sourceStatus:'saved'}});
 if(path==='/api/economy')return Response.json({ok:true,data:JSON.parse(await readFile('lib/data/economy.json','utf8'))});
 throw new Error('Unexpected endpoint: '+path);
 };
 try{
  const bundle=await build({entryPoints:['home.js'],bundle:true,format:'esm',platform:'browser',write:false});
  await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const settle=async(check)=>{for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail(`Navigation did not settle: ${document.getElementById('deficitMain').textContent}`);};
  assert.equal(document.querySelector('#loginPanel'),null);
  assert.equal(document.querySelector('[data-login]'),null);
  assert.equal(document.querySelector('script[src="/auth.js"]'),null);
  document.querySelector('[data-route="sejm"]').click();
  await settle(()=>calls.includes('/api/sejm'));
  assert.equal(document.getElementById('appMain').hidden,false);
  document.querySelector('[data-route="economy"]').click();
  await settle(()=>document.querySelectorAll('[data-point]').length===30);
  assert.equal(document.getElementById('deficitMain').hidden,false);
  assert.equal(document.getElementById('appMain').hidden,true);
  const chart=document.querySelector('[data-chart] svg');chart.getBoundingClientRect=()=>({left:0,width:820});
  chart.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:58}));
  assert.equal(document.querySelector('[data-year]').value,'1996');
  assert.ok(document.getElementById('indicatorPrev'));
  assert.ok(document.getElementById('indicatorNext'));
  assert.ok(!calls.some(path=>/auth|account|supabase/.test(path)));
 }finally{dom.window.close();for(const [key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

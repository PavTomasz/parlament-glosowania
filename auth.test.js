import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import sejm from '../api/sejm.js';
import senat from '../api/senat.js';
import deficit from '../api/deficit.js';
import account from '../api/account.js';
import config from '../api/auth-config.js';
import economy from '../api/economy.js';
import {requestJSON} from '../data-client.js';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
test('Sejm profiles can be requested without an account or Supabase',async()=>{
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));assert.match(String(url),/^https:\/\/api\.sejm\.gov\.pl\//);return Response.json([]);};
 const res=response();await sejm({method:'GET',headers:{},query:{action:'mps'}},res);
 assert.equal(res.code,200);assert.equal(res.body.ok,true);assert.ok(calls.length);
});
test('Senat requests reach data validation without a login gate',async()=>{
 globalThis.fetch=async()=>{throw new Error('Unexpected network');};
 const res=response();await senat({method:'GET',headers:{},query:{action:'detail',url:'invalid'}},res);
 assert.equal(res.code,400);assert.match(res.body.error,/adres/);
});
test('Deficit remains available without accounts when Eurostat is unavailable',async()=>{
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));assert.match(String(url),/^https:\/\/ec\.europa\.eu\/eurostat\//);throw new Error('Offline');};
 const res=response();await deficit({method:'GET',headers:{}},res);
 assert.equal(res.code,200);assert.equal(res.body.data.rows.length,30);assert.equal(res.body.data.sourceStatus,'saved');assert.equal(calls.length,2);
});
test('Poland in numbers exposes eight indicators without login',async()=>{
 const res=response();await economy({method:'GET',headers:{}},res);
 assert.equal(res.code,200);assert.deepEqual(res.body.data.series.map(s=>s.id),['deficit','inflation','gdp','debt','unemployment','minimum-wage','energy','fuel']);
 assert.ok(res.body.data.series.every(s=>s.rows.length>=28));
});
test('deferred account endpoints do not contact providers or write accounts',async()=>{
 globalThis.fetch=async()=>{assert.fail('No identity-provider calls permitted');};
 const a=response(),c=response();await account({method:'POST',body:{accountType:'private'}},a);await config({method:'GET'},c);
 assert.equal(a.code,410);assert.equal(c.body.enabled,false);assert.deepEqual(c.body.providers,[]);
});
test('public data client sends no session and preserves errors and JSON requests',async()=>{
 globalThis.fetch=async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.headers.has('Authorization'),false);assert.equal(options.headers.get('Content-Type'),'application/json');return Response.json({ok:true,answer:'example'});};
 assert.equal((await requestJSON('/api/ai',{method:'POST',body:JSON.stringify({question:'test'})})).answer,'example');
 globalThis.fetch=async()=>Response.json({ok:false,error:'Source unavailable'},{status:503});
 await assert.rejects(requestJSON('/api/sejm'),/Source unavailable/);
});

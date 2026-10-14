import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('public/orbit-data.js','utf8'),service=fs.readFileSync('public/orbit-service.js','utf8');
const ctx={Date,URL,AbortSignal,setTimeout,clearTimeout};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/vendor/satellite.min.js','utf8'),ctx);vm.runInContext(source,ctx);
const O=ctx.OrbitData,S=ctx.satellite;
const reference=JSON.parse(fs.readFileSync('scripts/fixtures/sgp4-vallado.json'));
const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json'));
const legacy=O.parse(reference.name+'\n'+reference.l1+'\n'+reference.l2)[0],modern=O.parse(JSON.stringify([fixture]))[0];
assert.equal(modern.id,100001);assert.equal(O.serialize(modern).l1,undefined);assert(O.valid(JSON.parse(JSON.stringify(O.serialize(modern)))));assert(O.valid(legacy));
for(const object of [legacy,modern])for(const sample of reference.samples){
 const state=S.sgp4(O.satrec(S,object),sample.minutes);
 for(const [i,k]of ['x','y','z'].entries()){assert(Math.abs(state.position[k]-sample.position[i])<0.00002,`${object.id} position ${k}`);assert(Math.abs(state.velocity[k]-sample.velocity[i])<0.00000002)}
}
assert.equal(O.freshness(modern,O.epoch(modern)).level,'recent');assert.equal(O.freshness(modern,O.epoch(modern)+4*86400000).level,'old');
for(const change of [{BSTAR:null},{NORAD_CAT_ID:100001.5},{EPOCH:'2026-02-30T00:00:00Z'},{MEAN_MOTION:''},{INCLINATION:181},{ECCENTRICITY:1},{REF_FRAME:'GCRF'}])assert.equal(O.parse(JSON.stringify([{...fixture,...change}])).length,0);
const newer=O.fromOmm({...fixture,EPOCH:'2000-06-28T18:50:19Z'});assert.equal(O.merge([[newer],[modern]])[0].omm.EPOCH,newer.omm.EPOCH);
// The real worker accepts OMM objects without converting/truncating NORAD IDs to TLE.
let posted;ctx.self={postMessage:m=>{posted=m}};ctx.importScripts=()=>{};
vm.runInContext(fs.readFileSync('public/positions-worker.js','utf8'),ctx);
ctx.self.onmessage({data:{type:'set',token:1,objects:[O.serialize(modern)]}});ctx.self.onmessage({data:{type:'tick',token:1,time:O.epoch(modern)}});
assert.equal(posted.buf.length,3);assert(Array.from(posted.buf).every(Number.isFinite));
vm.runInContext(fs.readFileSync('public/report-insights.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('public/report-engine.js','utf8'),ctx);
const E=ctx.self.ReportEngine,t=O.epoch(modern),p=E.point(S,O.satrec(S,modern),t);
const country={geometry:{type:'Polygon',coordinates:[[[p.lng-3,p.lat-3],[p.lng+3,p.lat-3],[p.lng+3,p.lat+3],[p.lng-3,p.lat+3],[p.lng-3,p.lat-3]]]}};
const scan=await E.scan(S,[modern],country,t,t+60000,10000);assert.equal(scan.total,1);assert.equal(scan.invalid,0);assert.equal(scan.rows[0].id,100001);
await assert.rejects(E.scan(S,[modern],country,t,t+60000,0));
// Successful fetch timestamps survive caching; force does not bypass the source's two-hour policy.
let calls=0,wall=Date.UTC(2026,9,14),status=200;
class Clock extends Date{static now(){return wall}}
const store=new Map(),persist=new Map();
const network={Date:Clock,AbortSignal,fetch:async()=>{calls++;return{status,text:async()=>JSON.stringify([fixture])}},StateStore:{get:async k=>store.get(k),put:async(k,v)=>store.set(k,v)},Privacy:{localGet:k=>persist.get(k),localSet:(k,v)=>persist.set(k,v)}};
vm.createContext(network);vm.runInContext(source,network);vm.runInContext(service,network);
const fallback=async()=>({data:[legacy],derived:false});
const first=await network.OrbitService.fetchGroup('stations',O.parse,fallback,{});assert.equal(first.source,'live');assert.equal(first.data[0].id,100001);
wall+=1000;const cached=await network.OrbitService.fetchGroup('stations',O.parse,fallback,{});assert.equal(cached.source,'cache');assert.equal(calls,1);assert.equal(cached.fetchedAt,first.fetchedAt);
wall+=2*3600000;status=403;const stopped=await network.OrbitService.fetchGroup('stations',O.parse,fallback,{});assert.equal(stopped.source,'cache');assert.equal(calls,2);assert.equal(stopped.fetchedAt,first.fetchedAt);
await network.OrbitService.fetchGroup('weather',O.parse,fallback,{});assert.equal(calls,2,'non-200 must stop further upstream queries');
console.log('PASS: official Vallado reference vectors, six-digit OMM, old TLE compatibility, worker/report scans, freshness and two-hour cache/HTTP-stop policy');

import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('public/report-insights.js','utf8'),c);const I=c.ReportInsights;
const inventory=I.inventory([{epoch:0,provenance:{mode:'live',fetchedAt:0}},{epoch:24*36e5},{epoch:72*36e5,provenance:{mode:'imported'}},{epoch:NaN},{epoch:73*36e5,provenance:{mode:'independent'}}],0,0,{epoch:o=>o.epoch});
assert.equal(inventory.recent,2);assert.equal(inventory.aging,1);assert.equal(inventory.old,1);assert.equal(inventory.unknown,1);assert.equal(inventory.fetched,1);assert.equal(inventory.sources['بيانات مستوردة'],1);assert.equal(I.inventory([{epoch:0}],0,25*36e5,{epoch:o=>o.epoch}).aging,1,'use worst endpoint, not now or midpoint');
const w={start:0,end:100000,result:{total:4,unique:2,invalid:1,rows:[{id:1,name:'A',entry:0,exit:60000,duration:60,clippedStart:true},{id:2,name:'B',entry:30000,exit:90000,duration:60}]}};
const s=I.summary(w);assert.equal(s.unionSeconds,90);assert.equal(s.sumSeconds,120);assert.equal(s.clipped,1);assert.equal(s.peak.count,2);assert.equal(s.missions,0);assert(I.lines(w,0,String,String).some(l=>l.includes('غير متاحة لهذا التقرير المحفوظ')));
assert.equal(I.summary({start:0,end:1000,result:{rows:[]}}).unionSeconds,0);assert(I.notes(w).includes('أول 2 حالة'));
console.log('PASS: report union vs summed duration, freshness endpoints and thresholds, imported/unknown sources, empty and legacy reports');

assert.equal(I.summary({start:0,end:1000,result:{rows:[{id:1,entry:0,exit:1000,duration:1,metadata:{missionKind:'documented'}}]}}).missions,1,'documented individual missions count as sourced mission descriptions');

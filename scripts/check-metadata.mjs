import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base=JSON.parse(fs.readFileSync('public/data/satellite-metadata.json'));
const extra=JSON.parse(fs.readFileSync('public/data/mission-profiles.json'));
const source=fs.readFileSync('public/satellite-metadata.js','utf8');
const context={Intl,URL,module:{exports:{}}};vm.createContext(context);vm.runInContext(source,context);
const api=context.module.exports;api.use(base,extra);
assert.equal(api.get(900).missionKind,'documented');assert(api.get(900).mission.includes('معايرة'));
assert.equal(api.get(900).checked,'2026-10-14');
const kuiper=Object.entries(extra.satellites).find(([,r])=>r.program==='kuiper');assert(kuiper);
assert.equal(api.get(kuiper[0]).missionKind,'program');assert(api.get(kuiper[0]).missionLabel.includes('وصف المنظومة'));
assert(api.get(kuiper[0]).missionNote.includes('لا يؤكد'));
const unknown=Object.keys(base.satellites).find(id=>base.satellites[id].type==='PAY'&&!base.satellites[id].mission&&!extra.satellites[id]);assert(unknown);
assert.equal(api.get(unknown).missionKind,'unknown');assert(api.get(unknown).missionNote.includes('لا تُستنتج'));
assert.equal(api.get(999999).country,'غير متاح');assert.equal(api.get(999999).missionSource,'');
for(const [id,r]of Object.entries(extra.satellites)){
 assert.equal(base.satellites[id].type,'PAY');const m=api.get(id);assert(m.missionSource.startsWith('https://'));assert(m.missionSourceTitle);assert(m.catalogName);assert(m.checked);
}
const debris=Object.keys(base.satellites).find(id=>base.satellites[id].type==='DEB');assert.equal(api.get(debris).missionKind,'object-type');
api.use({satellites:{'1':{mission:'test',missionSource:'javascript:alert(1)'}},owners:{}});assert.equal(api.get(1).missionSource,'');
// Enrichment failure must not hide the original identity catalog.
const fallback={Intl,URL,module:{exports:{}},fetch:async url=>url.includes('mission-profiles')?{ok:false}:{ok:true,json:async()=>base}};
vm.createContext(fallback);vm.runInContext(source,fallback);await fallback.module.exports.load();assert.equal(fallback.module.exports.get(900).country,apiCountry());
function apiCountry(){api.use(base);return api.get(900).country}
console.log(`PASS: ${Object.keys(extra.satellites).length} sourced identities, individual/program distinction, unknown missions, safe sources and offline fallback`);

api.use(base,extra);const ids=new Set(Object.keys(extra.satellites));let compactCount=0;for(const [program,members]of Object.entries(extra.members)){assert(extra.programs[program]);for(const id of members){assert(!ids.has(String(id)));ids.add(String(id));compactCount++;const m=api.get(id),r=base.satellites[id];assert.equal(r.type,'PAY');assert.equal(m.missionKind,'program');assert.equal(m.operatorScope,'program');assert(m.operatorSource.startsWith('https://'));assert(m.checked==='2026-10-16');assert.equal(m.legalOwner,null);assert(m.ownerNote.includes('المالك القانوني'));const prefix=program==='starlink'?'STARLINK-':'ONEWEB-';assert(r.catalog.OBJECT_NAME.startsWith(prefix))}}
assert(compactCount>11000);assert(fs.statSync('public/data/mission-profiles.json').size<180000,'expanded sourced membership must stay compact');assert.equal(api.get(900).operator,'','do not infer an operator from the catalog owner');assert.equal(api.get(900).legalOwner,null);assert.equal(api.get(999999).operator,'');
const member=extra.members.starlink[0];const row=api.inventoryRecords().find(r=>r.id===member);assert.equal(row.operator,'SpaceX');assert.equal(row.ownerCode,base.satellites[member].owner);assert.equal(row.legalOwner,null);const copy={...extra,programs:{...extra.programs,starlink:{...extra.programs.starlink,operatorSource:'https://user:password@example.com'}}};api.use(base,copy);assert.equal(api.get(member).operator,'');console.log('PASS: '+ids.size+' source-backed profiles with compact membership, separate reviewed operator, preserved catalog owner, per-source dates and no inferred legal ownership');

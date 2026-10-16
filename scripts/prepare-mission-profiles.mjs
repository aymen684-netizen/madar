import fs from 'node:fs';
import assert from 'node:assert/strict';
const input=JSON.parse(fs.readFileSync('data/mission-programs.json','utf8'));
const base=JSON.parse(fs.readFileSync('public/data/satellite-metadata.json','utf8'));
const names=new Map();
for(const file of fs.readdirSync('public/data').filter(f=>f.endsWith('.txt'))){
 const lines=fs.readFileSync('public/data/'+file,'utf8').split(/\r?\n/);
 for(let i=1;i<lines.length;i++)if(/^1 \d{5}/.test(lines[i])&&/^2 /.test(lines[i+1]||'')){
  const id=String(Number(lines[i].slice(2,7)));const name=lines[i-1].replace(/^0 /,'').trim();
  if(name&&!/^[12] /.test(name))names.set(id,name);
 }
}
for(const o of JSON.parse(fs.readFileSync('public/data/active-omm.json','utf8')))names.set(String(o.NORAD_CAT_ID),o.OBJECT_NAME);
const satellites={};const programs={},members={};
for(const [key,p]of Object.entries(input.programs)){
 const {pattern,compact,...description}=p;assert(new URL(p.source).protocol==='https:');programs[key]=description;
 for(const [id,name]of names)if(base.satellites[id]?.type==='PAY'&&new RegExp(pattern).test(name)){
  assert(!satellites[id]&&!Object.values(members).some(ids=>ids.includes(Number(id))),`Ambiguous program for ${id}`);if(compact)(members[key]??=[]).push(Number(id));else satellites[id]={name,program:key};
 }
}
for(const [id,p]of Object.entries(input.individuals)){
 assert.equal(names.get(id),p.name,`Identity mismatch for ${id}`);assert.equal(base.satellites[id]?.type,'PAY');
 assert(new URL(p.source).protocol==='https:');satellites[id]={...p,scope:'individual'};
}
fs.writeFileSync('public/data/mission-profiles.json',JSON.stringify({checked:input.checked,identitySnapshot:base.retrieved,programs,satellites,members}));
const ids=[...Object.keys(satellites),...Object.values(members).flat().map(String)];const newlyDescribed=ids.filter(id=>!base.satellites[id].mission).length;
console.log(`Prepared ${ids.length} sourced profiles; ${newlyDescribed} previously lacked a mission description`);

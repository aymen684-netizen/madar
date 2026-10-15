import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const nodes=new Map();
for(const kind of ['report','analysis','observer'])for(const suffix of ['status','download','share'])nodes.set(kind+'-'+suffix,{textContent:'unchanged',href:'blob:test',click(){this.clicks=(this.clicks||0)+1}});
const root={Blob,File,btoa,navigator:{},document:{getElementById:id=>nodes.get(id)||null},StateStore:{put:async()=>{},remove:async()=>{}},location:{hostname:'test'}};root.window=root;
vm.runInNewContext(fs.readFileSync('public/word-delivery.js','utf8'),root);
for(const kind of ['report','analysis','observer']){
 await root.WordDelivery.attach(kind,new Blob(['test']),'test.docx');
 await root.WordDelivery.share(kind);
 assert.match(nodes.get(kind+'-status').textContent,/غير مدعومة/);assert.equal(nodes.get(kind+'-download').clicks,1);
 for(const other of ['report','analysis','observer'].filter(k=>k!==kind))assert.equal(nodes.get(other+'-status').textContent,'unchanged');
 nodes.get(kind+'-status').textContent='unchanged';
 root.navigator.canShare=()=>true;root.navigator.share=async()=>{};
 await root.WordDelivery.share(kind);assert.match(nodes.get(kind+'-status').textContent,/تم فتح/);
 root.navigator.share=async()=>{throw Object.assign(Error(),{name:'AbortError'})};await root.WordDelivery.share(kind);assert.match(nodes.get(kind+'-status').textContent,/أُغلقت/);
 root.navigator.share=async()=>{throw Error('unavailable')};await root.WordDelivery.share(kind);assert.match(nodes.get(kind+'-status').textContent,/تعذّر/);
 let finish;root.navigator.share=()=>new Promise(resolve=>finish=resolve);const pending=root.WordDelivery.share(kind);root.WordDelivery.clear(kind);nodes.get(kind+'-status').textContent='cancelled';finish();await pending;assert.equal(nodes.get(kind+'-status').textContent,'cancelled');
 nodes.get(kind+'-status').textContent='unchanged';root.navigator={};
}
console.log('PASS: report-specific sharing status, native sharing, fallback download, cancellation, errors and no stale status after clearing');

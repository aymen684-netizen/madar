import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base='https://madar.aymen684.workers.dev';
const word=await readFile(new URL('../public/downloads/madar-overview.docx',import.meta.url));
function headers(r){
 assert.match(r.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
 assert.equal(r.headers.get('x-frame-options'),'DENY');
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 assert.match(r.headers.get('permissions-policy')||'',/camera=\(\)/);
 assert.match(r.headers.get('strict-transport-security')||'',/max-age=31536000/);
}
for(const path of ['/', '/privacy.js', '/downloads/madar-overview.docx']){
 const r=await fetch(base+path,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);headers(r);
 if(path.endsWith('.docx'))assert(Buffer.from(await r.arrayBuffer()).equals(word));
 else await r.arrayBuffer();
}
const body=new URLSearchParams({file:word.toString('base64'),name:'madar-overview.docx'});
for(const origin of [base,'https://example.com',null]){
 const r=await fetch(base+'/api/word.docx',{method:'POST',body,headers:origin?{Origin:origin}:{},signal:AbortSignal.timeout(45000)});
 headers(r);assert.equal(r.status,origin===base?200:403);
 if(origin===base){assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-disposition'),/attachment/);assert(Buffer.from(await r.arrayBuffer()).equals(word));}
 else await r.arrayBuffer();
}
const invalid=await fetch(base+'/api/word.docx',{method:'POST',body:new URLSearchParams({file:'AAAA',name:'bad.docx'}),headers:{Origin:base}});
assert.equal(invalid.status,400);headers(invalid);await invalid.arrayBuffer();
const get=await fetch(base+'/api/word.docx');assert.equal(get.status,405);headers(get);await get.arrayBuffer();
const results=[];
// Cloudflare synchronizes local counters asynchronously; allow propagation between requests.
for(let i=0;i<40;i++){
 const r=await fetch(base+'/api/word.docx',{method:'POST',body:new URLSearchParams({file:'AAAA',name:'bad.docx'}),headers:{Origin:base}});
 headers(r);assert([400,429].includes(r.status));results.push(r.status);await r.arrayBuffer();
 if(r.status===429)break;
 await new Promise(resolve=>setTimeout(resolve,500));
}
assert(results.includes(429),'real Cloudflare rate-limit binding must reject excess requests');
console.log('PASS: live Cloudflare headers, exact Word downloads, origin checks, invalid DOCX, method restriction and real rate limit');

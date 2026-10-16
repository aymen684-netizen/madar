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
for(const method of ['GET','POST']){const r=await fetch(base+'/api/word.docx',{method,...(method==='POST'?{body:'privacy probe; no user data'}:{}),signal:AbortSignal.timeout(30000)});headers(r);assert.equal(r.status,410);await r.arrayBuffer()}
const invalid=await fetch(base+'/api/orbits?id=25544');headers(invalid);assert.equal(invalid.status,400);await invalid.arrayBuffer();
console.log('PASS: production security headers, static local Word download, removed upload route and no per-satellite API query');

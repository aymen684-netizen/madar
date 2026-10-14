import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import worker from '../worker/index.js';import {validDocx} from '../worker/docx-validation.js';import {CSP,SECURITY_HEADERS} from '../security/headers.js';
const bytes=fs.readFileSync('public/downloads/madar-overview.docx'),html=fs.readFileSync('public/index.html','utf8');
assert(validDocx(bytes));assert(!validDocx(new Uint8Array([80,75,3,4])));assert(html.includes('content="'+CSP+'"'));assert(!html.includes('fonts.googleapis.com'));assert(!CSP.includes('unsafe-eval'));assert(!/script-src[^;]*unsafe-inline/.test(CSP));
const limiter={limit:async()=>({success:true})},env={WORD_LIMITER:limiter,ASSETS:{fetch:()=>new Response(html)}};
const payload=new URLSearchParams({file:bytes.toString('base64'),name:'report.docx'}).toString();
function req({origin='https://madar.test',body=payload,type='application/x-www-form-urlencoded',headers={},method='POST'}={}){return new Request('https://madar.test/api/word.docx',{method,headers:{...(origin?{origin}:{}),'content-type':type,...headers},...(method==='POST'?{body}: {})})}
assert.equal((await worker.fetch(req({origin:null}),env)).status,403);assert.equal((await worker.fetch(req({origin:'https://evil.test'}),env)).status,403);assert.equal((await worker.fetch(req({type:'text/plain'}),env)).status,415);
assert.equal((await worker.fetch(req(),{WORD_LIMITER:{limit:async()=>({success:false})}})).status,429);assert.equal((await worker.fetch(req(),{})).status,503);
assert.equal((await worker.fetch(req({body:'file=UEsDBA==&name=x.docx'}),env)).status,400);
assert.equal((await worker.fetch(req({headers:{'content-length':'12000001'}}),env)).status,413);
const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(12000001));c.close()}});
const streamed=new Request('https://madar.test/api/word.docx',{method:'POST',headers:{origin:'https://madar.test','content-type':'application/x-www-form-urlencoded'},body:stream,duplex:'half'});assert.equal((await worker.fetch(streamed,env)).status,413);
const duplicate=new URLSearchParams(payload);duplicate.append('file',bytes.toString('base64'));assert.equal((await worker.fetch(req({body:duplicate.toString()}),env)).status,400);
const corrupt=Buffer.from(bytes);const central=corrupt.indexOf(Buffer.from([80,75,1,2]));corrupt.writeUInt32LE(0xffffffff,central+24);assert(!validDocx(corrupt));
const traversal=Buffer.from(bytes);traversal.fill(0x2e,central+46,central+48);traversal[central+48]=47;assert(!validDocx(traversal));
const encrypted=Buffer.from(bytes);encrypted.writeUInt16LE(1,central+8);assert(!validDocx(encrypted));
for(const response of [await worker.fetch(req(),env),await worker.fetch(req({origin:null}),env),await worker.fetch(new Request('https://madar.test/'),env)])for(const [k,v]of Object.entries(SECURITY_HEADERS))assert.equal(response.headers.get(k),v);
// Exercise storage policy with independent application data on the same origin.
const data=new Map([['other-app-data','keep'],['orbit-favorites','old'],['orbit-cache-active','old'],['madar-draft-v1','old']]);
const ls={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size}};
const ctx={window:{localStorage:ls,addEventListener:()=>{},StateStore:{clearAll:async()=>{}}},document:{readyState:'loading',addEventListener:()=>{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/privacy.js','utf8'),ctx);const privacy=ctx.window.Privacy;assert(privacy.persistent());await privacy.setEnabled(false);assert.equal(data.get('other-app-data'),'keep');assert(!data.has('orbit-favorites'));assert(!data.has('madar-draft-v1'));assert(!data.has('orbit-cache-active'));assert(!privacy.persistent());privacy.localSet('orbit-favorites','temporary');assert.equal(privacy.localGet('orbit-favorites'),'temporary');assert(!data.has('orbit-favorites'));
const storeContext={window:{Privacy:privacy},module:{exports:{}}};vm.createContext(storeContext);vm.runInContext(fs.readFileSync('public/state-store.js','utf8'),storeContext);const store=storeContext.module.exports;await store.put('report-result',{private:true});assert((await store.get('report-result')).private);await store.clearAll();assert.equal(await store.get('report-result'),null);
console.log('PASS: CSP, security headers, strict Word validation, streaming limits, origin checks, rate limits and private storage');

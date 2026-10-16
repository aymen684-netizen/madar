import {orbitResponse} from './orbits.js';
import {secure} from '../security/headers.js';
import {validDocx} from './docx-validation.js';
const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document',MAX_BODY=12000000;
function reply(text,status,headers={}){return secure(new Response(text,{status,headers:{'Cache-Control':'no-store',...headers}}))}
async function readBody(request){const declared=request.headers.get('content-length');if(declared&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BODY))throw Error('large');if(!request.body)return '';const reader=request.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw Error('large')}chunks.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
async function word(request,env,url){
 if(request.method!=='POST')return reply('Method not allowed',405,{Allow:'POST'});
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply('Invalid origin',403);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')return reply('Unsupported content type',415);
 if(!env?.WORD_LIMITER)return reply('Download service unavailable',503);
 try{const {success}=await env.WORD_LIMITER.limit({key:'word:'+ (request.headers.get('cf-connecting-ip')||'unknown')});if(!success)return reply('Too many requests',429,{'Retry-After':'60'})}catch{return reply('Download service unavailable',503)}
 let text;try{text=await readBody(request)}catch(e){return reply(e.message==='large'?'Report too large':'Invalid request',e.message==='large'?413:400)}
 const form=new URLSearchParams(text);if(form.getAll('file').length!==1||form.getAll('name').length>1)return reply('Invalid fields',400);
 const encoded=form.get('file')||'',filename=(form.get('name')||'satellite-report.docx').replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,160);
 if(!filename.endsWith('.docx')||!encoded||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length>11184812)return reply('Invalid Word file',400);
 let bytes;try{const raw=atob(encoded);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))}catch{return reply('Invalid data',400)}
 if(!validDocx(bytes))return reply('Invalid document',400);
 return reply(bytes,200,{'Content-Type':DOCX_MIME,'Content-Disposition':'attachment; filename="'+filename+'"'});
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/api/orbits')return secure(await orbitResponse(request,env));if(['/api/word','/api/word.docx'].includes(url.pathname))return word(request,env,url);if(url.pathname.startsWith('/api/'))return reply('Not found',404);if(request.method!=='GET'&&request.method!=='HEAD')return reply('Method not allowed',405,{Allow:'GET, HEAD'});return secure(await env.ASSETS.fetch(request))}};

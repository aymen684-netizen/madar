import {ORBIT_GROUPS} from './orbit-groups.js';
const TTL=7200,MAX=15000000;
function response(body,status=200,headers={}){return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}})}
// Keep large catalogs streaming; the browser validates each OMM record before use.
function boundedJson(body){let size=0,prefix='',tail='',seen=false;return body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>MAX)throw Error('large');if(!seen){prefix+=String.fromCharCode(...chunk.subarray(0,Math.max(0,64-prefix.length)));const t=prefix.trimStart();if(t){if(t[0]!=='[')throw Error('invalid');seen=true}else if(prefix.length>=64)throw Error('invalid')}const end=String.fromCharCode(...chunk.subarray(Math.max(0,chunk.length-64))).trimEnd();if(end)tail=end.slice(-1);controller.enqueue(chunk)},flush(){if(!seen||tail!==']')throw Error('invalid')}}))}
export async function orbitResponse(request,env,{fetcher=fetch,cache=globalThis.caches?.default,now=Date.now}={}){
 const url=new URL(request.url);if(request.method!=='GET')return response({error:'method'},405,{Allow:'GET'});
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return response({error:'origin'},403);
 const entries=[...url.searchParams];if(entries.length!==1)return response({error:'query'},400);const [type,value]=entries[0];if(!(type==='group'&&ORBIT_GROUPS.has(value)||type==='id'&&/^[1-9]\d{0,8}$/.test(value)))return response({error:'query'},400);
 if(!cache||!env?.ORBIT_LIMITER)return response({error:'unavailable'},503);
 const key=new Request(url.origin+'/api/orbits?'+new URLSearchParams({[type]:value})),stopKey=new Request(url.origin+'/api/orbits?internal=source-stop');
 async function fail(error,status,seconds,upstreamStatus){const retryAt=now()+seconds*1000,body={error,retryAt,...(upstreamStatus?{upstreamStatus}:{})};await cache.put(stopKey,response(body,200,{'Cache-Control':'public, max-age='+seconds}));return response(body,status,{'Retry-After':String(seconds),'X-Madar-Retry-At':String(retryAt),...(upstreamStatus?{'X-Madar-Upstream-Status':String(upstreamStatus)}:{})})}
 try{
  const hit=await cache.match(key);if(hit){const fetched=Number(hit.headers.get('X-Madar-Fetched-At'));if(fetched>0&&now()-fetched<TTL*1000){const headers=new Headers(hit.headers);headers.set('Cache-Control','no-store');headers.set('X-Madar-Connection','edge-cache');return new Response(hit.body,{headers})}}
  const stop=await cache.match(stopKey);if(stop){const s=await stop.json();if(s.retryAt>now())return response(s,503,{'Retry-After':String(Math.ceil((s.retryAt-now())/1000)),'X-Madar-Retry-At':String(s.retryAt),'X-Madar-Upstream-Status':String(s.upstreamStatus||0)})}
  const {success}=await env.ORBIT_LIMITER.limit({key:'orbits:'+(request.headers.get('cf-connecting-ip')||'unknown')});if(!success)return response({error:'rate-limit'},429,{'Retry-After':'60'});
  const upstream='https://celestrak.org/NORAD/elements/gp.php?'+new URLSearchParams({[type==='group'?'GROUP':'CATNR']:value,FORMAT:'json'});let r;
  try{r=await fetcher(upstream,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}})}catch{return await fail('network',502,60)}
  if(r.status!==200){await r.body?.cancel();return await fail('upstream-http',503,TTL,r.status)}
  if(Number(r.headers.get('content-length'))>MAX||!r.body){await r.body?.cancel();return await fail('invalid-upstream',502,300)}
  const headers={'Content-Type':'application/json; charset=utf-8','X-Madar-Fetched-At':String(now()),'X-Madar-Connection':'upstream','Cache-Control':'public, max-age='+TTL};
  try{await cache.put(key,new Response(boundedJson(r.body),{headers}))}catch{return await fail('invalid-upstream',502,300)}
  const stored=await cache.match(key);if(!stored)return response({error:'unavailable'},503,{'Retry-After':'60'});const out=new Headers(stored.headers);out.set('Cache-Control','no-store');return new Response(stored.body,{headers:out});
 }catch{return response({error:'unavailable'},503,{'Retry-After':'60'})}
}

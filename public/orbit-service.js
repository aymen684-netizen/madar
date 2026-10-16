(function(root){'use strict';
const INTERVAL=2*3600000,SNAPSHOT='2026-10-13',cache=new Map(),pending=new Map(),connections=new Map();let stop=null;const relay=!!root.location&&/^https?:$/.test(root.location.protocol);
function connection(key){return connections.get(key)||null}
function status(key,value){connections.set(key,{group:key,checkedAt:Date.now(),...value});root.document?.dispatchEvent(new Event('orbit-connection'))}
function mark(data,info){return Object.assign(data.map(o=>({...o,provenance:{...o.provenance,...info,format:o.omm?'OMM JSON':'TLE'}})),{rejected:data.rejected||0})}
async function saved(key){if(cache.has(key))return cache.get(key);try{const r=await root.StateStore?.get('orbit-catalog-v3:'+key);if(r?.version===2&&typeof r.text==='string'&&Number.isFinite(r.fetchedAt)){cache.set(key,r);return r}}catch{}return null}
function errorText(e){return /[\u0600-\u06ff]/.test(e.message||'')?e.message:'تعذّر الاتصال بـCelesTrak؛ لم تصل عناصر جديدة.'}
function stopState(){if(stop)return stop;try{const r=JSON.parse(root.Privacy?.localGet('orbit-cache-service-stop-v3')||'null');if(r?.until>Date.now())stop=r}catch{}return stop}
function stopService(note,until=Date.now()+INTERVAL,details={}){stop={until,note,...details};try{root.Privacy?.localSet('orbit-cache-service-stop-v3',JSON.stringify(stop))}catch{}}
function result(record,mode){const data=OrbitData.parse(record.text,{mode,fetchedAt:record.fetchedAt,group:record.group,transport:record.transport||'direct',revision:record.revision||''});if(!data.length)throw Error('لا توجد عناصر مدارية صالحة');return{data,source:mode,text:record.text,fetchedAt:record.fetchedAt,rejected:data.rejected||0}}
async function request(key,url,{force=false}={}){
 const previous=await saved(key);
 const blocked=stopState();if(blocked?.until>Date.now()){status(key,{state:'blocked',note:blocked.note,retryAt:blocked.until,transport:blocked.transport||(relay?'server':'direct'),upstreamStatus:blocked.upstreamStatus});if(previous)return{...result(previous,'cache'),note:blocked.note};throw Error(blocked.note)}
 if(previous&&Date.now()-previous.fetchedAt<INTERVAL&&(!force||!relay)){const cached=result(previous,'cache');status(key,{state:'cache',transport:previous.transport||'direct',count:cached.data.length,fetchedAt:previous.fetchedAt});return cached}
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{let transport=relay?'server':'direct';try{
  let r;if(relay){transport='server';const params=key.startsWith('CATNR-')?'id='+encodeURIComponent(key.slice(6)):'group='+encodeURIComponent(key);try{r=await fetch('/api/orbits?'+params,{signal:AbortSignal.timeout(20000),redirect:'manual',cache:'no-store'})}catch{transport='direct';r=null}if(r&&(r.status===404||r.status===405||[502,503].includes(r.status)&&r.headers?.get('X-Madar-Error')==='network'&&!Number(r.headers?.get('X-Madar-Upstream-Status')))){transport='direct';r=null;if(previous&&Date.now()-previous.fetchedAt<INTERVAL){const cached=result(previous,'cache');status(key,{state:'cache',transport:previous.transport||'direct',count:cached.data.length,fetchedAt:previous.fetchedAt});return cached}}}if(!r){if(previous&&Date.now()-previous.fetchedAt<INTERVAL){const cached=result(previous,'cache');status(key,{state:'cache',transport:previous.transport||'direct',count:cached.data.length,fetchedAt:previous.fetchedAt});return cached}r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'manual'})}
  if(r.status!==200){const upstream=Number(r.headers?.get('X-Madar-Upstream-Status'))||r.status,note=transport==='server'?'تعذّر الاتصال عبر خادم مدار ('+upstream+'). تُعرض البيانات المحفوظة أو الاحتياطية عند توفرها.':'أوقف طلب البيانات بعد استجابة CelesTrak '+r.status+'؛ ستتاح محاولة جديدة بعد فترة التحديث.',retry=Number(r.headers?.get('X-Madar-Retry-At'))||Date.now()+(transport==='server'?Math.max(60,Number(r.headers?.get('Retry-After'))||60)*1000:INTERVAL);stopService(note,retry,{upstreamStatus:upstream,transport});status(key,{state:'blocked',transport,upstreamStatus:upstream,note,retryAt:retry});throw Error(note)}
  const text=await r.text();if(text.length>30000000)throw Error('استجابة المدار أكبر من الحد المسموح');
  let parsed;try{parsed=OrbitData.parse(JSON.parse(text))}catch{stopService('استجابة CelesTrak غير صالحة؛ أوقف التحديث للتحقق من المصدر.');throw Error('تعذّر قراءة بيانات OMM')}
  if(!parsed.length){stopService('لم يرجع المصدر عناصر مدارية صالحة؛ أوقف التحديث للتحقق.');throw Error('لا توجد عناصر مدارية صالحة')}
  const fetched=transport==='server'?Number(r.headers?.get('X-Madar-Fetched-At')):Date.now();if(!Number.isFinite(fetched)||fetched<=0||fetched>Date.now()+300000||Date.now()-fetched>=INTERVAL)throw Error('وقت جلب البيانات من الخادم غير صالح أو منتهي');const record={version:2,text,fetchedAt:fetched,group:key,transport,revision:r.headers?.get('ETag')||''};cache.set(key,record);
  try{await root.StateStore?.put('orbit-catalog-v3:'+key,record)}catch{}
  const mode=transport==='server'&&r.headers?.get('X-Madar-Connection')==='edge-cache'?'cache':'live';status(key,{state:mode,transport,count:parsed.length,fetchedAt:fetched,revision:record.revision});return result(record,mode);
 }catch(e){if(connection(key)?.state!=='blocked')status(key,{state:'error',transport,note:errorText(e)});if(previous)return{...result(previous,'cache'),note:errorText(e)};throw e}finally{pending.delete(key)}})();
 pending.set(key,task);return task;
}
async function fetchGroup(key,parse,fallback,group,options={}){
 let note='';if(!group?.offline)try{return await request(key,'https://celestrak.org/NORAD/elements/gp.php?GROUP='+encodeURIComponent(key)+'&FORMAT=json',options)}catch(e){note=errorText(e)}
 const f=await fallback(key,parse),mode=f.derived?'derived':'local';
 const data=mark(f.data,{mode,snapshot:f.snapshot||SNAPSHOT,fetchedAt:null,group:key});
 if(key==='intelligence')for(const o of data)if(root.SatMetadata?.get(o.id)?.orbitSource?.includes('Independent'))o.provenance.mode='independent';
 return{data,source:mode,note,fetchedAt:null};
}
async function fetchObject(id){if(!/^\d{1,9}$/.test(String(id))||Number(id)<1)throw Error('رقم NORAD غير صالح');return request('CATNR-'+id,'https://celestrak.org/NORAD/elements/gp.php?CATNR='+id+'&FORMAT=json')}
root.OrbitService={fetchGroup,fetchObject,interval:INTERVAL,connection};
})(typeof window!=='undefined'?window:globalThis);

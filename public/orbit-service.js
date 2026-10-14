(function(root){'use strict';
const INTERVAL=2*3600000,SNAPSHOT='2026-10-13',cache=new Map(),pending=new Map();let stop=null;
function mark(data,info){return Object.assign(data.map(o=>({...o,provenance:{...o.provenance,...info,format:o.omm?'OMM JSON':'TLE'}})),{rejected:data.rejected||0})}
async function saved(key){if(cache.has(key))return cache.get(key);try{const r=await root.StateStore?.get('orbit-catalog-v2:'+key);if(r?.version===2&&typeof r.text==='string'&&Number.isFinite(r.fetchedAt)){cache.set(key,r);return r}}catch{}return null}
function errorText(e){return /[\u0600-\u06ff]/.test(e.message||'')?e.message:'تعذّر الاتصال بـCelesTrak؛ لم تصل عناصر جديدة.'}
function stopState(){if(stop)return stop;try{const r=JSON.parse(root.Privacy?.localGet('orbit-cache-service-stop')||'null');if(r?.until>Date.now())stop=r}catch{}return stop}
function stopService(note){stop={until:Date.now()+INTERVAL,note};try{root.Privacy?.localSet('orbit-cache-service-stop',JSON.stringify(stop))}catch{}}
function result(record,mode){const data=OrbitData.parse(record.text,{mode,fetchedAt:record.fetchedAt,group:record.group});if(!data.length)throw Error('لا توجد عناصر مدارية صالحة');return{data,source:mode,text:record.text,fetchedAt:record.fetchedAt,rejected:data.rejected||0}}
async function request(key,url){
 const previous=await saved(key);if(previous&&Date.now()-previous.fetchedAt<INTERVAL)return result(previous,'cache');
 const blocked=stopState();if(blocked?.until>Date.now()){if(previous)return{...result(previous,'cache'),note:blocked.note};throw Error(blocked.note)}
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{try{
  const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(r.status!==200){const note='أوقف طلب البيانات بعد استجابة CelesTrak '+r.status+'؛ ستتاح محاولة جديدة بعد فترة التحديث.';stopService(note);throw Error(note)}
  const text=await r.text();if(text.length>30000000)throw Error('استجابة المدار أكبر من الحد المسموح');
  let parsed;try{parsed=OrbitData.parse(JSON.parse(text))}catch{stopService('استجابة CelesTrak غير صالحة؛ أوقف التحديث للتحقق من المصدر.');throw Error('تعذّر قراءة بيانات OMM')}
  if(!parsed.length){stopService('لم يرجع المصدر عناصر مدارية صالحة؛ أوقف التحديث للتحقق.');throw Error('لا توجد عناصر مدارية صالحة')}
  const record={version:2,text,fetchedAt:Date.now(),group:key};cache.set(key,record);
  try{await root.StateStore?.put('orbit-catalog-v2:'+key,record)}catch{}
  return result(record,'live');
 }catch(e){if(previous)return{...result(previous,'cache'),note:errorText(e)};throw e}finally{pending.delete(key)}})();
 pending.set(key,task);return task;
}
async function fetchGroup(key,parse,fallback,group){
 let note='';if(!group?.offline)try{return await request(key,'https://celestrak.org/NORAD/elements/gp.php?GROUP='+encodeURIComponent(key)+'&FORMAT=json')}catch(e){note=errorText(e)}
 const f=await fallback(key,parse),mode=f.derived?'derived':'local';
 const data=mark(f.data,{mode,snapshot:SNAPSHOT,fetchedAt:null,group:key});
 if(key==='intelligence')for(const o of data)if(root.SatMetadata?.get(o.id)?.orbitSource?.includes('Independent'))o.provenance.mode='independent';
 return{data,source:mode,note,fetchedAt:null};
}
async function fetchObject(id){if(!/^\d{1,9}$/.test(String(id))||Number(id)<1)throw Error('رقم NORAD غير صالح');return request('CATNR-'+id,'https://celestrak.org/NORAD/elements/gp.php?CATNR='+id+'&FORMAT=json')}
root.OrbitService={fetchGroup,fetchObject,interval:INTERVAL};
})(typeof window!=='undefined'?window:globalThis);

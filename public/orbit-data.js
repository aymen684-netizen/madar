(function(root){'use strict';
const DAY=86400000,keys=new WeakMap();
const numeric=['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
function utc(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(value))return NaN;const t=Date.parse(value.endsWith('Z')?value:value+'Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,19)===value.slice(0,19)?t:NaN}
function fromOmm(value,provenance={}){
 if(!value||typeof value!=='object')throw Error('عنصر OMM غير صالح');
 const id=Number(value.NORAD_CAT_ID);if(!Number.isSafeInteger(id)||id<1||id>999999999)throw Error('رقم NORAD غير صالح');
 for(const [k,expected]of Object.entries({CENTER_NAME:'EARTH',REF_FRAME:'TEME',TIME_SYSTEM:'UTC',MEAN_ELEMENT_THEORY:'SGP4'}))if(value[k]!=null&&value[k]!==expected)throw Error('نظام مرجعي غير مدعوم');
 const epoch=utc(value.EPOCH);if(!Number.isFinite(epoch))throw Error('تاريخ العناصر غير صالح');
 const omm={OBJECT_NAME:String(value.OBJECT_NAME||id).slice(0,160),OBJECT_ID:String(value.OBJECT_ID||'').slice(0,40),NORAD_CAT_ID:id,EPOCH:value.EPOCH.endsWith('Z')?value.EPOCH:value.EPOCH+'Z'};
 for(const key of ['CENTER_NAME','REF_FRAME','TIME_SYSTEM','MEAN_ELEMENT_THEORY','CLASSIFICATION_TYPE'])if(typeof value[key]==='string')omm[key]=value[key].slice(0,32);
 for(const key of ['EPHEMERIS_TYPE','ELEMENT_SET_NO','REV_AT_EPOCH'])if(value[key]!=null&&String(value[key]).trim()!==''&&Number.isSafeInteger(Number(value[key]))&&Number(value[key])>=0)omm[key]=Number(value[key]);
 for(const key of numeric){const input=value[key]??(['MEAN_MOTION_DOT','MEAN_MOTION_DDOT'].includes(key)?0:undefined);if(input==null||typeof input==='string'&&input.trim()===''||!Number.isFinite(Number(input)))throw Error('حقل مداري غير صالح: '+key);omm[key]=Number(input)}
 if(omm.MEAN_MOTION<=0||omm.MEAN_MOTION>25||omm.ECCENTRICITY<0||omm.ECCENTRICITY>=1||omm.INCLINATION<0||omm.INCLINATION>180)throw Error('عناصر مدارية خارج النطاق');
 for(const k of ['RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY'])if(omm[k]<0||omm[k]>=360)throw Error('زاوية مدارية غير صالحة');
 return{id,name:omm.OBJECT_NAME,omm,provenance:{...provenance,format:'OMM JSON'}};
}
function fields(o){
 if(o?.omm)return{motion:Number(o.omm.MEAN_MOTION),ecc:Number(o.omm.ECCENTRICITY),incl:Number(o.omm.INCLINATION),internationalId:o.omm.OBJECT_ID||'غير متاح'};
 const l1=o?.l1||'',l2=o?.l2||'',y=Number(l1.slice(9,11));
 return{motion:Number(l2.slice(52,63)),ecc:Number('0.'+l2.slice(26,33).trim()),incl:Number(l2.slice(8,16)),internationalId:l1.length>=17?(y<57?2000+y:1900+y)+'-'+l1.slice(11,17).trim():'غير متاح'};
}
function epoch(o){if(o?.omm)return utc(o.omm.EPOCH);const l=o?.l1||'',y=Number(l.slice(18,20)),d=Number(l.slice(20,32));return l.length>=32&&d>=1&&d<367?Date.UTC(y<57?2000+y:1900+y,0,1)+(d-1)*DAY:NaN}
function valid(o){try{if(o?.omm)return Number(o.id)===fromOmm(o.omm).id;if(!o||typeof o.l1!=='string'||typeof o.l2!=='string'||!/^1 \d{5}/.test(o.l1)||!/^2 \d{5}/.test(o.l2))return false;const f=fields(o);return Number(o.l1.slice(2,7))===Number(o.id)&&Number(o.l2.slice(2,7))===Number(o.id)&&Number.isFinite(epoch(o))&&f.motion>0&&f.motion<25&&f.ecc>=0&&f.ecc<1&&f.incl>=0&&f.incl<=180}catch{return false}}
function parse(input,provenance={}){
 const data=typeof input==='string'?input.trim():input;if(Array.isArray(data)||typeof data==='object'||typeof data==='string'&&/^[\[{]/.test(data)){
  const rows=typeof data==='string'?JSON.parse(data):data;if(!Array.isArray(rows))throw Error('استجابة OMM ليست قائمة');
  const out=[];for(const row of rows)try{out.push(fromOmm(row,provenance))}catch{}out.rejected=rows.length-out.length;return out;
 }
 if(typeof data!=='string')throw Error('بيانات مدارية غير صالحة');
 const lines=data.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),out=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('1 ')&&lines[i+1]?.startsWith('2 ')){
  const o={name:lines[i-1]?.replace(/^0 /,'')||lines[i].slice(2,7),id:Number(lines[i].slice(2,7)),l1:lines[i],l2:lines[++i],provenance:{...provenance,format:'TLE'}};
  if(valid(o))out.push(o);
 }
 return out;
}
function satrec(S,o){return o.omm?S.json2satrec(o.omm):S.twoline2satrec(o.l1,o.l2)}
function serialize(o){return{id:o.id,name:o.name,...(o.omm?{omm:{...o.omm}}:{l1:o.l1,l2:o.l2}),...(o.provenance?{provenance:{...o.provenance}}:{})}}
function key(o){if(o?.omm){if(!keys.has(o.omm))keys.set(o.omm,JSON.stringify(o.omm));return keys.get(o.omm)}return(o?.l1||'')+'\n'+(o?.l2||'')}
function merge(lists){const map=new Map();for(const o of lists.flat()){const previous=map.get(o.id);if(!previous||epoch(o)>epoch(previous))map.set(o.id,o)}return [...map.values()]}
function snapshotDates(objects){return [...new Set(objects.filter(o=>['local','derived','independent'].includes(o?.provenance?.mode)).map(o=>o.provenance.snapshot).filter(s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s))].sort()}
function sourceLabel(o){if(!o?.provenance?.mode)return 'مصدر السجل غير موثق';return o?.provenance?.mode==='independent'?'رصد علني مستقل McCants':o?.provenance?.mode==='imported'?'بيانات مستوردة':'CelesTrak'}
function freshness(o,time=Date.now()){
 const t=epoch(o),hours=Math.abs(Number(time)-t)/3600000;
 return{epoch:t,hours,level:!Number.isFinite(hours)?'unknown':hours>72?'old':hours>24?'aging':'recent',label:!Number.isFinite(hours)?'تاريخ العناصر غير متاح':hours>72?'العناصر بعيدة زمنيًا عن وقت العرض':hours>24?'تحقّق من عمر العناصر':'العناصر قريبة زمنيًا من وقت العرض'};
}
const api={parse,fromOmm,valid,fields,epoch,satrec,serialize,key,merge,sourceLabel,freshness,snapshotDates};
if(typeof module!=='undefined')module.exports=api;else root.OrbitData=api;
})(typeof window!=='undefined'?window:globalThis);

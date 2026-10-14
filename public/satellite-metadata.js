(function(root){'use strict';
let catalog=null,profiles=null,pending=null;
const names=new Intl.DisplayNames(['ar'],{type:'region'});
const typeLabels={PAY:'حمولة فضائية',DEB:'حطام مداري','R/B':'مرحلة صاروخية',UNK:'نوع غير محدد'};
function safeSource(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:''}catch{return ''}}
function load(){
 if(catalog)return Promise.resolve(catalog);
 if(!pending)pending=Promise.all([
  fetch('data/satellite-metadata.json').then(r=>{if(!r.ok)throw Error('metadata unavailable');return r.json()}),
  fetch('data/mission-profiles.json?v=18').then(r=>{if(!r.ok)throw Error('profiles unavailable');return r.json()}).catch(()=>null)
 ]).then(([base,extra])=>{catalog=base;profiles=extra;return catalog}).catch(e=>{pending=null;throw e});
 return pending;
}
function get(id){
 const key=String(id),r=catalog?.satellites[key],owner=catalog?.owners[r?.owner];
 const profile=profiles?.satellites[key],program=profiles?.programs[profile?.program];
 const detail=profile?.scope==='individual'?profile:program;
 const country=owner?.arabic||(owner?.iso2?names.of(owner.iso2):owner?.name)||'غير متاح';
 const identitySource=/^\d{1,6}$/.test(key)?'https://celestrak.org/satcat/records.php?CATNR='+key:'';
 let mission=r?.mission||'لم يُعثر على وصف موثق للمهمة في المصادر المراجعة',kind=r?.missionKind||'unknown';
 let missionSource=safeSource(r?.missionSource),missionSourceTitle='مصدر وصف المهمة',missionNote='',checked='';
 if(detail&&r?.type==='PAY'){
  mission=detail.mission;kind=profile.scope==='individual'?'documented':'program';
  missionSource=safeSource(detail.source);missionSourceTitle=detail.sourceTitle;checked=profiles.checked;
  missionNote=kind==='program'?'الغرض المنشور للمنظومة، مع ربط العضوية بالاسم ورقم NORAD في الفهرس. لا يؤكد حمولة هذا القمر أو حالته التشغيلية الحالية.':'وصف منشور لهذه المهمة؛ وجود عناصر مدارية لا يثبت استمرار التشغيل.';
 }
 if(r?.type==='DEB'){mission='حطام مداري لا يحمل مهمة تشغيلية';kind='object-type';missionSource=identitySource}
 else if(r?.type==='R/B'){mission='مرحلة صاروخية وليست قمرًا تشغيليًا';kind='object-type';missionSource=identitySource}
 if(kind==='unknown')missionNote='يمكن عرض الهوية والمدار المنشورين حتى عند غياب وصف المهمة. لا تُستنتج مهمة سرية من الاسم أو المدار.';
 const evidenceLabel={documented:'مهمة موثقة',program:'غرض المنظومة موثق',category:'تصنيف عام',unknown:'تفاصيل المهمة غير موثقة','object-type':'نوع الجسم مسجل'}[kind]||'تفاصيل المهمة غير موثقة';
 return {country,ownerCode:r?.owner||'',mission,missionKind:kind,missionLabel:mission+(kind==='category'?' (تصنيف عام)':kind==='program'?' (وصف المنظومة)':''),countrySource:r?identitySource:'',missionSource,missionSourceTitle,missionNote,evidenceLabel,checked,catalogName:profile?.name||'',program:program?.title||'',objectType:typeLabels[r?.type]||'غير متاح',retrieved:catalog?.retrieved||'',launch:r?.launch||'غير متاح',orbitSource:r?.orbitSource||'CelesTrak',ownerIso2:owner?.iso2||''};
}
function use(data,extra=null){catalog=data;profiles=extra;pending=null}
const api={load,get,use};if(typeof module!=='undefined')module.exports=api;else root.SatMetadata=api;
})(typeof window!=='undefined'?window:globalThis);

(function(root){'use strict';
// جميع مجموعات CelesTrak للأقمار الصناعية، مع قاعدة بديلة تُطبَّق على الفهرس النشط عند تعذّر الاتصال.
// local: ملف احتياطي مستقل في data/. match: نمط على اسم القمر. orbit: شرط على العناصر المدارية. meta: شرط على بيانات الفهرس.
const R=s=>new RegExp(s,'i');
const motion=o=>OrbitData.fields(o).motion,ecc=o=>OrbitData.fields(o).ecc,incl=o=>OrbitData.fields(o).incl;
const sections=[
 {title:'مجموعات خاصة',groups:[
  {key:'active',label:'جميع الأقمار النشطة',local:true,all:true},
  {key:'last-30-days',label:'أُطلقت خلال آخر 30 يومًا',none:true},
  {key:'stations',label:'المحطات الفضائية',local:true},
  {key:'visual',label:'الأقمار الساطعة',local:true},
  {key:'analyst',label:'أقمار المحللين غير المصنفة',none:true}]},
 {title:'العسكرية والاستخبارية',groups:[
  {key:'military',label:'العسكرية والاستطلاع العلنية',local:true},
  {key:'intelligence',label:'الاستخبارية الموثقة',local:true,offline:true},
  {key:'radar',label:'معايرة الرادار',match:R('^(CALSPHERE|LCS |SURCAL|RADCAL|DIADEME)')}]},
 {title:'الطقس ورصد الأرض',groups:[
  {key:'weather',label:'الطقس',local:true},
  {key:'resource',label:'مراقبة سطح الأرض والبيئة',match:R('LANDSAT|SENTINEL-2|SENTINEL-3|SENTINEL-5|SPOT|PLEIADES|CARTOSAT|RESOURCESAT|GAOFEN|ZIYUAN|KOMPSAT|WORLDVIEW|GEOEYE|TERRA|AQUA|SUOMI|DEIMOS|KANOPUS|RESURS|SUPERVIEW|JILIN|SKYSAT|FORMOSAT|THEOS|ALSAT|PROBA|HAIYANG|GRUS|PERUSAT|INGENIO|HUANJING|CBERS|OCEANSAT|EOS-0|VNREDSAT|KHALIFASAT|DUBAISAT|NAOS|PRISMA|ENMAP|BLACKSKY|SATELLOGIC|NUSAT|AXELSPACE|GHGSAT|TIANHUI|ZHUHAI|SIWEI|NEUSAR|AEROS|EARTHCARE|\\bSMOS|CRYOSAT|SWOT|PACE|NISAR')},
  {key:'sar',label:'التصوير الراداري SAR',match:R('ICEYE|CAPELLA|UMBRA|RADARSAT|SENTINEL-1|COSMO-SKYMED|CSG-|TERRASAR|TANDEM|PAZ|KOMPSAT-5|KOMPSAT-6|QPS-SAR|STRIX|NOVASAR|RISAT|ALOS-2|ALOS-4|SAOCOM|HONGTU|PIESAT|NISAR|NEUSAR|EOS-04|\\bSAR\\b')},
  {key:'sarsat',label:'البحث والإنقاذ SARSAT',match:R('^NOAA|METOP|GOES|METEOSAT|ELEKTRO|INSAT-3D|LUCH|GSAT0[12]|GALILEO|NAVSTAR|GLONASS')},
  {key:'dmc',label:'رصد الكوارث DMC',match:R('DMC|DEIMOS|ALSAT|NIGERIASAT|BEIJING|TSINGHUA|KAZEOSAT|UK-DMC|TELEOS')},
  {key:'tdrss',label:'نظام تتبع ونقل البيانات TDRSS',match:R('^TDRS')},
  {key:'argos',label:'جمع البيانات ARGOS',match:R('^NOAA|METOP|SARAL|ANGELS|KINEIS|OCEANSAT|CFOSAT|ARGOS')},
  {key:'planet',label:'Planet',match:R('^(FLOCK|SKYSAT|PELICAN|TANAGER|DOVE)')},
  {key:'spire',label:'Spire',match:R('^LEMUR')}]},
 {title:'الاتصالات',groups:[
  {key:'geo',label:'الأقمار النشطة في المدار الثابت GEO',orbit:o=>motion(o)>.99&&motion(o)<1.01&&ecc(o)<.01},
  {key:'intelsat',label:'Intelsat',match:R('^(INTELSAT|IS-|GALAXY|HORIZONS)')},
  {key:'ses',label:'SES',match:R('^(SES|ASTRA|O3B|AMC|NSS|SIRIUS|QUETZSAT|SATMEX|EUTELSAT 113)')},
  {key:'eutelsat',label:'Eutelsat',match:R('^(EUTELSAT|HOTBIRD|HOT BIRD|KA-SAT|KONNECT)')},
  {key:'telesat',label:'Telesat',match:R('^(ANIK|NIMIQ|TELSTAR|LIGHTSPEED)')},
  {key:'starlink',label:'Starlink',local:true},
  {key:'oneweb',label:'OneWeb',match:R('^ONEWEB')},
  {key:'qianfan',label:'Qianfan الصينية',match:R('^QIANFAN')},
  {key:'hulianwang',label:'Hulianwang Digui الصينية',match:R('^HULIANWANG')},
  {key:'kuiper',label:'Amazon Kuiper',match:R('^KUIPER')},
  {key:'iridium-NEXT',label:'Iridium NEXT',match:R('^IRIDIUM')},
  {key:'orbcomm',label:'Orbcomm',match:R('^ORBCOMM')},
  {key:'globalstar',label:'Globalstar',match:R('^GLOBALSTAR')},
  {key:'amateur',label:'راديو الهواة',match:R('OSCAR|^AO-|^FO-|^RS-|^CAS-|^XW-|FUNCUBE|^FOX-|LUSAT|^JAS|^FUJI|^PSAT|GEOSCAN|TEVEL|^ISS \\(ZARYA\\)|^SO-|^IO-|^HO-|^LO-')},
  {key:'satnogs',label:'شبكة SatNOGS',none:true},
  {key:'x-comm',label:'اتصالات تجريبية',none:true},
  {key:'other-comm',label:'اتصالات أخرى',none:true}]},
 {title:'الملاحة',groups:[
  {key:'gnss',label:'جميع أنظمة الملاحة GNSS',match:R('NAVSTAR|GPS |BEIDOU|GALILEO|GSAT0[12]|IRNSS|NVS-|QZS|GLONASS')},
  {key:'gps-ops',label:'الملاحة GPS',local:true},
  {key:'glo-ops',label:'GLONASS الروسية',match:R('GLONASS')},
  {key:'galileo',label:'Galileo الأوروبية',match:R('GALILEO|GSAT0[12]')},
  {key:'beidou',label:'BeiDou الصينية',match:R('^BEIDOU')},
  {key:'sbas',label:'أنظمة التعزيز SBAS',match:R('WAAS|EGNOS|MSAS|SDCM|GAGAN|INMARSAT 4|GALAXY 30|SES-15|EUTELSAT 5 WEST B|ASTRA 5B|LUCH 5|GSAT-15|GSAT-10|ANIK F1R|KOREASAT 116|MTSAT|MICHIBIKI|QZS')}]},
 {title:'العلمية والهندسية',groups:[
  {key:'science',label:'علوم الفضاء والأرض',match:R('^HST|HUBBLE|SWIFT|FERMI|NUSTAR|CHANDRA|TESS|XMM|INTEGRAL|AGILE|NICER|IXPE|^MMS|THEMIS|CLUSTER|GRACE|ICESAT|CALIPSO|CLOUDSAT|SMAP|^OCO|AURA|SORCE|TIMED|^IRIS|HINODE|CHEOPS|EINSTEIN PROBE|SVOM|XRISM|ASTROSAT|INSIGHT|HXMT|DAMPE|TAIJI|^SWARM|CSES|ODIN|AEOLUS|ASO-S|ADITYA|POLARIS|GOLD|ICON|TROPICS|LANDSAT NEXT')},
  {key:'geodetic',label:'الجيوديسيا',match:R('LAGEOS|AJISAI|STARLETTE|STELLA|LARES|ETALON|BLITS|LARETS|GEODYNAMICS|TOPEX|JASON|SENTINEL-6|^GFZ|^BEACON')},
  {key:'engineering',label:'الهندسة والتقنيات',none:true},
  {key:'education',label:'التعليمية',none:true},
  {key:'cubesat',label:'CubeSats',none:true}]}];
const list=sections.flatMap(s=>s.groups),byKey=Object.fromEntries(list.map(g=>[g.key,g]));
const labels=Object.fromEntries(list.map(g=>[g.key,g.label]));
function url(key){return 'https://celestrak.org/NORAD/elements/gp.php?GROUP='+encodeURIComponent(key)+'&FORMAT=json'}
async function activeSnapshot(parse){const [r,s]=await Promise.all([fetch('data/active-omm.json?v=41'),fetch('data/source-snapshot.json?v=41')]);if(!r.ok||!s.ok)throw Error();const data=parse(await r.text()),meta=await s.json();if(!data.length||data.length!==meta.count||!/^\d{4}-\d{2}-\d{2}T/.test(meta.retrievedAt))throw Error();data.snapshot=meta.retrievedAt.slice(0,10);return data}
let activePromise=null;
function activeCatalog(parse){if(!activePromise)activePromise=activeSnapshot(parse).catch(()=>fetch('data/active.txt').then(r=>{if(!r.ok)throw Error();return r.text()}).then(parse)).catch(e=>{activePromise=null;throw e});return activePromise}
// يعيد نصًّا أو مصفوفة كائنات من النسخة الاحتياطية. يرمي خطأ عربيًا عند عدم توفّرها.
async function fallback(key,parse){const g=byKey[key];if(!g)throw Error('نوع غير معروف');if(key==='active')try{const data=await activeSnapshot(parse);return{data,derived:false,snapshot:data.snapshot}}catch{}if(g.local){const r=await fetch('data/'+key+'.txt');if(!r.ok)throw Error();const data=parse(await r.text());if(data.length)return{data,derived:false}}if(g.none||!(g.match||g.orbit||g.meta))throw Error('تعذّر الاتصال بـ CelesTrak لتحميل «'+g.label+'»، ولا توجد له نسخة احتياطية. أعد المحاولة عند توفّر الاتصال.');const all=await activeCatalog(parse);if(g.meta)await root.SatMetadata?.load().catch(()=>null);const data=all.filter(o=>(!g.match||g.match.test(o.name))&&(!g.orbit||g.orbit(o))&&(!g.meta||g.meta(root.SatMetadata?.get(o.id))));if(!data.length)throw Error('لا توجد عناصر احتياطية للنوع: '+g.label);return{data,derived:true,snapshot:all.snapshot||'2026-10-13'}}
// يجلب المجموعة من CelesTrak مباشرة ثم يعود إلى النسخة الاحتياطية.
async function fetchGroup(key,parse,{force=false}={}){const g=byKey[key];if(!g)throw Error('نوع غير معروف');return OrbitService.fetchGroup(key,parse,fallback,g,{force})}
function checkboxes(container){container.replaceChildren();const legend=document.createElement('legend');legend.textContent='اختر نوعًا أو أكثر ('+list.filter(g=>!g.all).length+' نوعًا)';container.append(legend);for(const s of sections){const box=document.createElement('details');box.className='type-section';const sum=document.createElement('summary');sum.textContent=s.title+' · '+s.groups.length;const grid=document.createElement('div');grid.className='type-grid';for(const g of s.groups){if(g.all)continue;const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=g.key;label.append(input,g.label);grid.append(label)}box.append(sum,grid);container.append(box)}}
function options(select,{skip=[]}={}){const current=select.value;select.replaceChildren();for(const s of sections){const og=document.createElement('optgroup');og.label=s.title;for(const g of s.groups){if(skip.includes(g.key))continue;const o=document.createElement('option');o.value=g.key;o.textContent=g.key==='active'?'جميع الأقمار النشطة · دول متعددة':g.label;og.append(o)}if(og.children.length)select.append(og)}if([...select.options].some(o=>o.value===current))select.value=current}
function build(){if(typeof document==='undefined')return;for(const id of ['catalog-types','report-types','analysis-types']){const e=document.getElementById(id);if(e)checkboxes(e)}const group=document.getElementById('group');if(group)options(group)}
root.SatGroups={sections,list,labels,byKey,url,fetchGroup,fallback,build};build();
})(typeof window!=='undefined'?window:globalThis);

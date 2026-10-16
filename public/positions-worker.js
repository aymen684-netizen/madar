importScripts('network-resources.js?v=43','network-policy.js?v=43');
importScripts('vendor/satellite.min.js','orbit-data.js?v=19');
// يحسب مواقع جميع الأقمار في خيط منفصل حتى تبقى الواجهة سلسة مع عشرات الآلاف من الأقمار.
let recs=[],token=0;
self.onmessage=e=>{const m=e.data;if(m.type==='set'){token=m.token;recs=(m.objects||m.tles.map(t=>({l1:t[0],l2:t[1]}))).map(o=>{try{return OrbitData.satrec(satellite,o)}catch{return null}});return}
if(m.type==='tick'){if(m.token!==token)return;const date=new Date(m.time),gmst=satellite.gstime(date),n=recs.length,out=new Float32Array(n*3);
for(let i=0;i<n;i++){const r=recs[i];let lat=NaN,lng=NaN,alt=NaN;if(r){try{const pv=satellite.propagate(r,date);if(pv&&pv.position&&typeof pv.position==='object'){const gd=satellite.eciToGeodetic(pv.position,gmst);if(Number.isFinite(gd.height)&&gd.height>0){lat=gd.latitude*57.29577951308232;lng=gd.longitude*57.29577951308232;alt=gd.height/6371}}}catch{}}out[i*3]=lat;out[i*3+1]=lng;out[i*3+2]=alt}
self.postMessage({type:'positions',token,time:m.time,buf:out},[out.buffer])}};

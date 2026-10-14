(function(root){'use strict';
const VERSION='مدار · تقارير 26';
async function capture(kind,data,parameters){const payload={format:'madar-report-input',schema:1,engine:VERSION,satelliteJs:'6.0.1',kind,parameters:JSON.parse(JSON.stringify(parameters)),objects:data.map(o=>JSON.parse(JSON.stringify(root.OrbitData.serialize(o))))};const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));return{id:'MD-'+root.crypto.randomUUID(),createdAt:Date.now(),sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),payload}}
function text(r){const a=r.archive;return a?'معرّف التقرير '+a.id+'\nإصدار الحساب '+a.payload.engine+(a.payload.satelliteJs?' · satellite.js '+a.payload.satelliteJs:'')+'\nإنشاء UTC '+new Date(a.createdAt).toISOString()+'\nبصمة مدخلات SHA-256 '+a.sha256+'\nاللقطة تحفظ المدارات والمعاملات المستخدمة؛ البصمة تكشف تغيّر الملف ولا توثّق صحة المصدر.':'لا توجد لقطة مدارات أو هوية محفوظة لهذا التقرير القديم؛ أعد الحساب لإنشاء تقرير موثق.'}
root.ReportArchive={capture,text,VERSION};
})(typeof window!=='undefined'?window:globalThis);

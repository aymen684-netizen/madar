importScripts('vendor/satellite.min.js','orbit-data.js?v=19','report-insights.js?v=25','observer-engine.js?v=26');
self.onmessage=async e=>{try{const result=await ObserverEngine.scan(satellite,e.data.objects,e.data.request,p=>self.postMessage({type:'progress',...p}));self.postMessage({type:'done',result})}catch(err){self.postMessage({type:'error',message:err.message})}};

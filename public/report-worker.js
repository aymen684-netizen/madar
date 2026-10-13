importScripts('vendor/satellite.min.js','report-engine.js');
self.onmessage=async e=>{try{const {objects,country,start,end,step,resume}=e.data;const result=await ReportEngine.scan(satellite,objects,country,start,end,step,p=>self.postMessage({type:'progress',...p}),resume);self.postMessage({type:'done',result})}catch(err){self.postMessage({type:'error',message:err.message})}};

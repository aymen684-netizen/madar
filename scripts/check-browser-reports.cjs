const fs=require('fs'),assert=require('assert/strict');
async function checkBrowserReports(page,output){
 const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json'));
 await page.evaluate(async fixture=>{
  pausedAt=new Date(dateNow());paused=true;world?.pauseAnimation();
  const o=OrbitData.fromOmm(fixture);o.name='TEST ONLY · مرور مرجعي';o.provenance={mode:'imported',format:'OMM JSON'};
  const t=OrbitData.epoch(o),rec=OrbitData.satrec(satellite,o),v=satellite.propagate(rec,new Date(t)),g=satellite.eciToGeodetic(v.position,satellite.gstime(new Date(t))),lng=g.longitude*180/Math.PI,lat=g.latitude*180/Math.PI;
  const country={id:'TEST',displayName:'منطقة اختبار حسابية',geometry:{type:'Polygon',coordinates:[[[lng-5,lat-5],[lng+5,lat-5],[lng+5,lat+5],[lng-5,lat+5],[lng-5,lat-5]]]}};
  const scan=(start,end)=>new Promise((resolve,reject)=>{const worker=new Worker('report-worker.js?v=25');worker.onmessage=e=>{if(e.data.type==='done'){worker.terminate();resolve(e.data.result)}else if(e.data.type==='error'){worker.terminate();reject(Error(e.data.message))}};worker.onerror=e=>reject(Error(e.message));worker.postMessage({objects:[OrbitData.serialize(o)],country,start,end,step:10000})});
  const result=await scan(t,t+600000);window.testReport={country,countryName:country.displayName,start:t,end:t+600000,offset:3,zoneLabel:'الرياض UTC+03:00',day:'اختبار',scopeName:'TEST ONLY',step:10,result};
  finishedReport=window.testReport;renderReport(finishedReport);await prepareReportDownload();
  const windows=[{start:t,end:t+600000,day:'اختبار 1',result},{start:t+30000,end:t+630000,day:'اختبار 2',result:await scan(t+30000,t+630000)}];analyticResult={...window.testReport,windows,tolerance:5,purpose:'TEST ONLY',analysis:AnalysisCore.analyze(windows,3,5)};renderAnalysis(analyticResult);await prepareAnalyticWord();
 },fixture);
 assert.equal(await page.locator('#report-summary canvas').count(),2);assert.equal(await page.locator('#analysis-insights canvas').count(),2);
 assert((await page.locator('#report-summary').innerText()).includes('بيانات مستوردة 1'));
 assert((await page.locator('#report-summary').innerText()).includes('مهمة فردية أو وصف منظومة موثق 0 من 1'));
 await page.selectOption('#analysis-visual-period','1');assert((await page.locator('#analysis-insights').innerText()).includes('ضمن 24 ساعة 1'));
 const results=await page.evaluate(async()=>({tracks:testReport.result.rows.map(r=>r.track),quality:testReport.result.quality,report:Array.from(new Uint8Array(await (await StateStore.get('report-word')).blob.arrayBuffer())),analysis:Array.from(new Uint8Array(await (await StateStore.get('analysis-word')).blob.arrayBuffer()))}));
 assert(results.tracks.length>0);assert(results.tracks.every(t=>t.length===61&&t.flat().every(Number.isFinite)));assert.equal(results.quality.recent,1);
 const {validDocx}=await import('../worker/docx-validation.js');for(const kind of ['report','analysis']){const b=Buffer.from(results[kind]);assert(validDocx(b));fs.writeFileSync(output+'/'+kind+'-insights.docx',b)}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.getElementById('report-panel').open=true;document.getElementById('report-summary').scrollIntoView()});await page.screenshot({path:output+'/report-insights-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#report-summary').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.body.scrollWidth),390);await page.screenshot({path:output+'/report-insights-mobile.png'});
 await page.evaluate(()=>{document.getElementById('analysis-panel').open=true;document.getElementById('analysis-insights').scrollIntoView()});await page.screenshot({path:output+'/analysis-insights-mobile.png'});
 // Empty results and antimeridian polygons must remain drawable and honest.
 const special=await page.evaluate(()=>{const w={start:0,end:60000,result:{rows:[],total:0,unique:0,invalid:0}};const c={geometry:{type:'Polygon',coordinates:[[[179,-5],[-179,-5],[-179,5],[179,5],[179,-5]]]}};return ReportInsights.visuals(w,c,0,ReportDocument.stamp).map.length});assert(special>1000);
 await page.setViewportSize({width:1440,height:1000});console.log('PASS: actual worker paths, imported source quality, report/analysis Word with charts, selectable periods, empty/antimeridian maps and mobile layout');
}
module.exports={checkBrowserReports};

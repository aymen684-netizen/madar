const assert=require('assert/strict'),fs=require('fs');
async function checkBrowserOrbits(browser,url,output){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const fixture={...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json','utf8')),EPOCH:new Date().toISOString()};
 let calls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://celestrak.org/**',r=>{calls++;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([fixture])})});
 try{
  await page.goto(url);await page.waitForFunction(()=>objects.length===1&&selected?.id===100001&&selected.rec);
  await page.locator('#list button').first().click();
  assert((await page.locator('#globe-card-id').textContent()).includes('100001'));
  await page.locator('#data-health>summary').click();
  assert((await page.locator('#health-format').textContent()).includes('OMM JSON'));
  assert((await page.locator('#health-retrieved').textContent()).includes('UTC'));
  const fetched=await page.evaluate(()=>selected.provenance.fetchedAt);
  async function visibleCard(){const r=await page.locator('#globe-card').boundingBox(),v=page.viewportSize();assert(r&&r.x>=0&&r.y>=0&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,'satellite card must fit the visible viewport')}
  await visibleCard();await page.screenshot({path:output+'/omm-desktop.png'});
  await page.click('#globe-card-favorite');await page.waitForFunction(async()=>{const r=await StateStore.get('orbit-favorites-v2');return r?.items?.some(o=>o.id===100001)});
  const favorite=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbit-favorites'))[0]);assert.equal(favorite.id,100001);assert.equal(favorite.omm.NORAD_CAT_ID,100001);assert.equal(favorite.l1,undefined);
  await page.reload();await page.waitForFunction(()=>objects.length===1&&selected?.id===100001&&favorites.length===1);
  assert.equal(await page.evaluate(()=>selected.provenance.fetchedAt),fetched);assert.equal(calls,1,'reload must use the saved two-hour cache');
  const result=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('report-worker.js?v=19'),start=+dateNow(),p=position(selected),country={geometry:{type:'Polygon',coordinates:[[[p.lng-5,p.lat-5],[p.lng+5,p.lat-5],[p.lng+5,p.lat+5],[p.lng-5,p.lat+5],[p.lng-5,p.lat-5]]]}};const timeout=setTimeout(()=>{w.terminate();reject(Error('OMM report timed out'))},20000);w.onmessage=e=>{if(e.data.type==='done'){clearTimeout(timeout);w.terminate();resolve(e.data.result)}else if(e.data.type==='error'){clearTimeout(timeout);w.terminate();reject(Error(e.data.message))}};w.onerror=e=>{clearTimeout(timeout);w.terminate();reject(Error(e.message))};w.postMessage({objects:[OrbitData.serialize(selected)],country,start,end:start+60000,step:10000})}));
  assert.equal(result.invalid,0);assert.equal(result.total,1);assert.equal(result.rows[0].id,100001);assert.equal(result.rows[0].provenance.format,'OMM JSON');
  const health=page.locator('#data-health');if(await health.getAttribute('open')!==null)await page.locator('#data-health>summary').click();
  await page.setViewportSize({width:390,height:844});await page.locator('#list button').first().click();await visibleCard();assert.equal(await page.evaluate(()=>document.body.scrollWidth),390);await page.screenshot({path:output+'/omm-mobile.png'});
  await page.keyboard.press('Escape');assert(await page.locator('#globe-card').isHidden());
  assert.deepEqual(errors,[]);console.log('PASS: six-digit OMM in browser, persisted favorites/reload, real report worker, unchanged fetch timestamp, two-hour cache and visible desktop/mobile card');
 }finally{await context.close()}
}
module.exports={checkBrowserOrbits};

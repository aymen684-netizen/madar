const assert=require('assert/strict'),fs=require('fs');
async function checkBrowserGuide(browser,url,output){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 const fixture={...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json','utf8')),EPOCH:new Date().toISOString()};
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://celestrak.org/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([fixture])}));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.MadarGuide&&objects.length===1);
  assert.equal(await page.locator('#guide-panel').getAttribute('open'),null);await page.click('#program-guide');assert.equal(await page.locator('#program-guide').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.guide-term').count(),21);assert((await page.locator('.guide-steps').textContent()).includes('Word'));
  await page.fill('#guide-search','SGP4');assert.equal(await page.locator('.guide-term:visible').count(),1);assert((await page.locator('.guide-term:visible').textContent()).includes('Simplified General Perturbations 4'));
  await page.fill('#guide-search','الرَّادار');assert((await page.locator('.guide-term:visible').textContent()).includes('Synthetic Aperture Radar'));
  await page.fill('#guide-search','<img src=x onerror=alert(1)>');assert(await page.locator('#guide-empty').isVisible());assert.equal(await page.locator('.guide-term:visible').count(),0);
  await page.fill('#guide-search','');assert.equal(await page.locator('.guide-term:visible').count(),21);
  assert((await page.locator('.guide-limits').textContent()).includes('لا يثبت تصوير البلد'));assert((await page.locator('#metrics span[title]').allTextContents()).includes('اللامركزية'));
  await page.evaluate(()=>{pausedAt=new Date(dateNow());paused=true;world?.pauseAnimation()});await page.locator('.guide-terms').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/guide-desktop.png'});
  await context.setOffline(true);await page.setViewportSize({width:390,height:844});await page.fill('#guide-search','UTC');assert.equal(await page.locator('.guide-term:visible').count(),1);await page.locator('#guide-search').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.body.scrollWidth),390);await page.screenshot({path:output+'/guide-mobile.png'});
  await page.click('#guide-close');assert.equal(await page.locator('#guide-panel').getAttribute('open'),null);assert.equal(await page.locator('#program-guide').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement.id),'program-guide');assert.deepEqual(errors,[]);
  console.log('PASS: Arabic guide, 21 expanded definitions, safe bilingual search, offline use, desktop/mobile layout and focus returned on close');
 }finally{await context.close()}
}
module.exports={checkBrowserGuide};

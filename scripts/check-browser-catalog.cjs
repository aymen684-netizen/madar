const assert=require('assert/strict'),fs=require('fs');
async function checkBrowserCatalog(browser,url,output){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json','utf8'));
 const data=[{...fixture,NORAD_CAT_ID:25544,OBJECT_NAME:'ISS (ZARYA)',OBJECT_ID:'1998-067A',EPOCH:new Date().toISOString()},...Array.from({length:300},(_,i)=>({...fixture,NORAD_CAT_ID:100001+i,OBJECT_NAME:'TEST OMM '+(i+1),EPOCH:new Date(Date.now()-5*86400000).toISOString()}))];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://celestrak.org/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}));
 try{
  await page.goto(url);await page.waitForFunction(()=>objects.length===301&&document.querySelectorAll('#list button').length===100);
  assert((await page.locator('#results-summary').textContent()).includes('301'));
  assert(await page.locator('#list-previous').isDisabled());await page.click('#list-next');
  assert((await page.locator('#list button').first().textContent()).includes('100100'));await page.click('#list-next');await page.click('#list-next');assert.equal(await page.locator('#list button').count(),1);assert((await page.locator('#list button').textContent()).includes('100300'));assert(await page.locator('#list-next').isDisabled());
  await page.fill('#search','٢٥٥٤٤');assert.equal(await page.locator('#list button').count(),1);assert((await page.locator('#list button').textContent()).includes('ISS'));assert(await page.locator('#list-pagination').isHidden());
  await page.fill('#search','1998–067A');assert.equal(await page.locator('#list button').count(),1);
  await page.fill('#search','NORAD ١٠٠٢٥٧');assert.equal(await page.locator('#list button').count(),1);assert((await page.locator('#list button').textContent()).includes('TEST OMM 257'));assert((await page.locator('#list .catalog-quality').textContent()).includes('72 ساعة'));assert((await page.locator('#list .catalog-quality').textContent()).includes('غير موثقة'));
  await page.locator('#list button').click();await page.click('#globe-card-favorite');await page.keyboard.press('Escape');await page.click('#saved');assert.equal(await page.locator('#list button').count(),1);
  await page.fill('#search','لا يوجد هذا القمر');assert.equal(await page.locator('#list button').count(),0);assert((await page.locator('#list').textContent()).includes('ضمن متابعتك'));assert.equal(await page.evaluate(()=>selected),null);
  await page.click('#clear-search');assert.equal(await page.locator('#list button').count(),1);await page.click('#all');assert.equal(await page.locator('#list button').count(),100);await page.click('#list-next');await page.screenshot({path:output+'/catalog-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.locator('#results-summary').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.body.scrollWidth),390);await page.screenshot({path:output+'/catalog-mobile.png'});assert.deepEqual(errors,[]);
  console.log('PASS: all 301 results reachable, page reset after Arabic/international search, old/unknown badges, filtered watchlist empty state and mobile width');
 }finally{await context.close()}
}
module.exports={checkBrowserCatalog};

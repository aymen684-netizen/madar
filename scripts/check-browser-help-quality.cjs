const assert=require('node:assert/strict'),fs=require('node:fs');

async function checkBrowserHelpQuality(browser,url,output){
 const evidence=[];
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:3,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[],requests=[];
  const fixture={...JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json','utf8')),EPOCH:new Date().toISOString()};
  await page.route('**/api/orbits?*',r=>r.fulfill({contentType:'application/json',headers:{'X-Madar-Fetched-At':String(Date.now()),'X-Madar-Connection':'upstream'},body:JSON.stringify([fixture])}));
  await page.route('https://celestrak.org/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([fixture])}));
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  try{
   await page.goto(url);await page.waitForFunction(()=>window.RenderQuality&&world&&objects.length===1);await page.evaluate(()=>MadarI18n.ready);
   const sample=async()=>{await page.waitForFunction(()=>{const canvas=world.renderer().domElement,holder=document.getElementById('globe'),ratio=world.renderer().getPixelRatio();return holder.clientWidth>0&&holder.clientHeight>0&&canvas.width===Math.floor(holder.clientWidth*ratio)&&canvas.height===Math.floor(holder.clientHeight*ratio)});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.evaluate(()=>({ratio:world.renderer().getPixelRatio(),width:world.renderer().domElement.width,height:world.renderer().domElement.height,cssWidth:world.width(),cssHeight:world.height(),count:objects.length,position:position(objects[0],new Date('2026-10-16T12:00:00Z'))}))};
   const automatic=await sample();assert.equal(automatic.ratio,mobile?1.5:2);assert.equal(automatic.width,Math.floor(automatic.cssWidth*automatic.ratio));
   await page.click('#shell-nav-help');await page.locator('#security-guide>summary').click();assert(await page.locator('#security-guide .help-cards').isVisible());
   const arabic=await page.locator('#security-guide').innerText();for(const text of ['ليست مشفّرة','CelesTrak','لا يحذف الملفات','عنوان الشبكة','لا تضمن حماية مطلقة'])assert(arabic.includes(text));
   assert.equal(await page.evaluate(()=>document.body.scrollWidth),mobile?390:1440);
   await page.locator('#security-guide').screenshot({path:output+'/security-guide-ar-'+(mobile?'mobile':'desktop')+'.png'});
   await page.locator('[data-security-setting="save-on-device"]').click();assert(await page.locator('#save-on-device').isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),'save-on-device');
   await page.locator('[data-security-setting="public-updates"]').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'public-updates');
   await page.evaluate(()=>MadarI18n.setLanguage('en'));assert(!/[\u0620-\u064a]/.test(await page.locator('#security-guide').innerText()));
   await page.locator('#security-guide').screenshot({path:output+'/security-guide-en-'+(mobile?'mobile':'desktop')+'.png'});
   await page.locator('#performance-panel>summary').click();await page.selectOption('#render-quality','economy');
   assert.equal(await page.evaluate(()=>world.renderer().getPixelRatio()),1);assert((await page.locator('#render-quality-status').textContent()).includes('power saving'));assert(!/[\u0620-\u064a]/.test(await page.locator('#performance-panel').innerText()));
   await page.locator('#performance-panel').screenshot({path:output+'/render-quality-'+(mobile?'mobile':'desktop')+'.png'});
   await page.click('#shell-nav-map');await page.locator('#globe').scrollIntoViewIfNeeded();const economy=await sample();assert.equal(economy.ratio,1);assert.equal(economy.width,Math.floor(economy.cssWidth));assert.deepEqual(economy.position,automatic.position);assert.equal(economy.count,automatic.count);
   await page.reload();await page.waitForFunction(()=>world&&objects.length===1);assert.equal(await page.evaluate(()=>RenderQuality.mode),'economy');assert.equal(await page.evaluate(()=>world.renderer().getPixelRatio()),1);
   await page.click('#shell-nav-help');await page.locator('#performance-panel>summary').click();await page.selectOption('#render-quality','detail');
   await page.click('#shell-nav-map');await page.locator('#globe').scrollIntoViewIfNeeded();const detail=await sample();assert.equal(detail.ratio,2);assert.deepEqual(detail.position,automatic.position);
   await page.evaluate(()=>RenderQuality.setMode('auto'));const settledAutomatic=await sample();assert.equal(settledAutomatic.cssWidth,detail.cssWidth);assert.equal(settledAutomatic.cssHeight,detail.cssHeight);await page.setViewportSize(mobile?{width:1000,height:900}:{width:390,height:844});await page.waitForFunction(expected=>world.renderer().getPixelRatio()===expected,mobile?2:1.5);
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});await page.waitForFunction(expected=>world.renderer().getPixelRatio()===expected,mobile?1.5:2);
   await page.click('#shell-nav-help');await page.locator('#security-guide>summary').click();await context.setOffline(true);await page.locator('[data-security-setting="public-updates"]').click();assert(await page.locator('#public-updates').isVisible());
   assert(!requests.some(u=>/example\.com|analytics|telemetry/.test(u)));assert.deepEqual(errors,[]);
   evidence.push({mobile,deviceScaleFactor:3,automatic:settledAutomatic,economy,detail,pixelReductionVsDetail:1-(settledAutomatic.width*settledAutomatic.height)/(detail.width*detail.height),note:'Drawing-buffer sizes in Chromium emulation; not physical-device frame-rate or battery measurements.'});
  }finally{await context.close()}
 }
 fs.writeFileSync(output+'/render-quality.json',JSON.stringify(evidence,null,2));
 console.log('PASS: bilingual security guide, privacy-setting focus, offline access, high-density mobile rendering bounds, unchanged orbital positions, quality persistence and viewport changes');
}
module.exports={checkBrowserHelpQuality};

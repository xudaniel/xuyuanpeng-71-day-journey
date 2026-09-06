const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-09-06T04:00:00Z')});
await page.goto(process.env.TEST_URL || 'http://localhost:8000');
assert.equal(await page.locator('.row').count(),17);
assert.equal(await page.locator('#dayNo').innerText(),'13');
await page.locator('#expandAll').click();assert.equal(await page.locator('.main[aria-expanded="true"]').count(),17);
await page.locator('#collapseAll').click();assert.equal(await page.locator('.main[aria-expanded="true"]').count(),0);
await page.locator('#stage-0 .main').click();await page.locator('#stage-0 input').check();
assert.equal(await page.locator('#stage-0 .main').getAttribute('aria-expanded'),'true');
await page.reload();assert.equal(await page.locator('#executionPct').innerText(),'6');
await page.locator('#searchInput').fill('no such city');assert.equal(await page.locator('.row').count(),0);assert.equal(await page.locator('#emptyState').isVisible(),true);
await page.locator('#clearFilters').click();await page.locator('#searchInput').fill('2026-09-15');assert.equal(await page.locator('.row').count(),1);
await page.locator('#jumpCurrent').click();assert.equal(await page.locator('.row').count(),17);
const ics=await page.evaluate(()=>calendarContent());assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,17);assert(ics.includes('DTEND;VALUE=DATE:20261104'));assert(ics.split('\r\n').every(x=>Buffer.byteLength(x)<=75));
for(const [date,day,next] of [['2026-08-24T04:00:00Z','—','广州 → 深圳'],['2026-11-03T04:00:00Z','71','无后续行程'],['2026-11-04T04:00:00Z','71','无后续行程']]){
await page.clock.setFixedTime(new Date(date));await page.evaluate(()=>render());assert.equal(await page.locator('#dayNo').innerText(),day);assert.equal(await page.locator('#nextMove').innerText(),next);
}
await page.evaluate(()=>localStorage.setItem('new-vision-itinerary-local-v1','{"invalid":true}'));await page.reload();assert.equal(await page.locator('#executionPct').innerText(),'0');
await page.clock.setFixedTime(new Date('2026-09-06T15:59:59Z'));await page.evaluate(()=>render());assert.equal(await page.locator('#dayNo').innerText(),'13');await page.clock.setFixedTime(new Date('2026-09-06T16:00:01Z'));await page.evaluate(()=>refreshDate());assert.equal(await page.locator('#dayNo').innerText(),'14');
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('new-vision-itinerary-state-v1',JSON.stringify({completed:['2026-09-07'],overrides:{'2026-09-07':{note:'旧版备注',city:'迁移地点'}}}));});
await page.reload();assert.equal(await page.locator('#executionPct').innerText(),'6');assert((await page.locator('#timeline').innerText()).includes('旧版备注'));
await page.locator('#openEditor').click();await page.locator('#editNote').fill('Updated note <script>');await page.locator('#editForm button[type="submit"]').click();await page.reload();assert((await page.locator('#timeline').innerText()).includes('Updated note <script>'));
await page.locator('#backupFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,journey:'xuyuanpeng-71-day-journey',verified:['2026-08-25'],overrides:{'2026-09-07':{note:'Imported conflict'}}}))});
await page.waitForFunction(()=>document.getElementById('executionPct').textContent==='12');assert((await page.locator('#timeline').innerText()).includes('Updated note <script>'));
await page.locator('#backupFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.waitForFunction(()=>document.getElementById('storageNotice').textContent.includes('无法恢复'));
assert.deepEqual(errors,[]);console.log('PASS: 17 stages, persistence, malformed storage, filtering, disclosure accessibility, final day, midnight rollover, calendar, mobile overflow.');
await browser.close();
})();

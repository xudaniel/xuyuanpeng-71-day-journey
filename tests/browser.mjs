import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {webcrypto} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(new URL('..',import.meta.url).pathname);
const password='synthetic-browser-fixture-only';
// Exercise the production unlock handler with synthetic ciphertext. Never decrypt
// the real itinerary or place its plaintext in a test fixture.
const safe=await readFile(resolve(root,'index.html'),'utf8');
const plain=safe.replace('const SHARE_SAFE_BUILD=true','const SHARE_SAFE_BUILD=false');
const salt=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12));
const material=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
const data=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(plain));
const b64=value=>Buffer.from(value).toString('base64');
const gate=(await readFile(resolve(root,'private.html'),'utf8')).replace(/payload='[^']*'/,`payload='${b64(data)}'`).replace(/salt='[^']*'/,`salt='${b64(salt)}'`).replace(/iv='[^']*'/,`iv='${b64(iv)}'`);
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/synthetic-private.html'){res.setHeader('Content-Type','text/html');res.end(gate);return;}
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+'/'))throw new Error('invalid path');
    res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.md':'text/plain'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:375,height:900},timezoneId:'America/Los_Angeles',acceptDownloads:true});
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
const button=name=>page.getByRole('button',{name,exact:true});
const saveDialog=async(name='保存')=>{await page.locator('dialog').getByRole('button',{name,exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});};
const openFixture=async()=>{await page.goto(base+'/synthetic-private.html');await page.locator('#password').fill(password);await button('解锁完整行程').click();await page.locator('#execution-root').waitFor();};
try {
  await page.goto(base+'/synthetic-private.html');await page.locator('#password').fill('wrong');await button('解锁完整行程').click();await page.getByText('密码不正确，请重新输入。',{exact:true}).waitFor();assert.equal(await page.locator('#execution-root').count(),0);
  await openFixture();
  await page.locator('#os-date').fill('2026-09-22');await page.locator('#os-date').dispatchEvent('change');
  await button('新增行动').click();await page.getByLabel('下一步行动',{exact:true}).fill('PRIVATE SENTINEL — prepare agenda');await page.locator('dialog [name=priority]').selectOption('P0');await saveDialog();
  await button('P0 · 1').waitFor();
  const stored=await page.evaluate(()=>localStorage.getItem('journey-execution-encrypted-v1'));assert.ok(stored);assert.ok(!stored.includes('PRIVATE SENTINEL'));assert.ok(!stored.includes(password));
  await page.reload();await page.locator('#password').fill(password);await button('解锁完整行程').click();await page.locator('#execution-root').waitFor();await button('待办与跟进').click();await page.getByRole('heading',{name:'PRIVATE SENTINEL — prepare agenda'}).waitFor();
  await button('会面').click();await page.locator('.os-meetings button').filter({hasText:'腾讯'}).click();
  for(let i=0;i<4;i++)await page.locator(`[name="prep-${i}"]`).selectOption('done');await button('保存准备清单').click();await page.getByRole('heading',{name:'准备度 80% · 4/5'}).waitFor();
  await page.locator('[name="prep-4"]').selectOption('done');await button('保存准备清单').click();await page.getByRole('heading',{name:'准备度 100% · 5/5'}).waitFor();
  await button('标记准备就绪').click();await saveDialog('确认阶段');
  await button('登记实际完成').click();await page.getByLabel('实际完成时间（带时区）').fill(new Date(Date.now()-3600000).toISOString());await saveDialog('确认阶段');
  await page.getByLabel('成果摘要',{exact:true}).fill('Synthetic recorded outcome');await page.getByLabel('对方陈述',{exact:true}).fill('Synthetic statement');await button('保存成果').click();await page.getByText('已加密保存到当前设备。',{exact:true}).waitFor();
  await button('确认成果已记录').click();await saveDialog('确认阶段');
  await button('新增后续行动').click();await page.getByLabel('下一步行动',{exact:true}).fill('Receive slides');await page.getByLabel('负责人',{exact:true}).fill('Traveler');await page.getByLabel('目标截止日期／时间',{exact:true}).fill('2026-09-22');await page.getByLabel('状态',{exact:true}).selectOption('waiting');await page.getByLabel('等待谁',{exact:true}).fill('Synthetic host');await page.getByLabel('等待什么',{exact:true}).fill('Slides');await page.getByLabel('下次跟进日期／时间',{exact:true}).fill('2026-09-22');await saveDialog();
  await button('复核后续行动').click();await saveDialog('确认阶段');
  await button('关闭会面').click();await page.locator('dialog').getByRole('button',{name:'确认阶段',exact:true}).click();await page.locator('dialog .os-error').filter({hasText:'尚有未解决行动'}).waitFor();await page.locator('dialog').getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('.os-record').filter({hasText:'Receive slides'}).getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('状态',{exact:true}).selectOption('completed');await page.getByLabel('交付确认记录／取消原因').fill('Slides received');await saveDialog();await button('关闭会面').click();await saveDialog('确认阶段');
  assert.equal(await page.locator('.os-stages [aria-current]').innerText(),'Closed\n已关闭');
  await page.locator('.os-record').filter({hasText:'Receive slides'}).getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('状态',{exact:true}).selectOption('open');await saveDialog();assert.equal(await page.locator('.os-stages [aria-current]').innerText(),'Follow-up\n跟进中');
  await button('交通住宿').click();await button('新增安排').click();await page.getByLabel('安排名称',{exact:true}).fill('Synthetic train');await page.getByLabel('计划日期',{exact:true}).fill('2026-09-25');await page.getByLabel('确认截止日期／时间',{exact:true}).fill('2026-09-22');await page.getByLabel('下一步',{exact:true}).fill('Confirm train');await saveDialog();
  await page.locator('[name="travel-filter"]').selectOption('all');await page.locator('.os-record').filter({hasText:'Synthetic train'}).getByRole('button',{name:'编辑／确认',exact:true}).click();await page.getByLabel('确认状态',{exact:true}).selectOption('confirmed');await page.getByLabel('确认记录／取消原因').fill('Verified synthetic ticket');await saveDialog();
  assert.ok(await page.locator('.os-record').filter({hasText:'Synthetic train'}).getByText('已确认',{exact:true}).count());
  await button('今日队列').click();
  // Storage failure must keep the form, preserve entered text, and show an error.
  await button('新增行动').click();await page.getByLabel('下一步行动',{exact:true}).fill('Unsaved action');
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='journey-execution-encrypted-v1')throw new Error('Test storage full');return window.originalSetItem.call(this,k,v);};});
  await page.locator('dialog').getByRole('button',{name:'保存',exact:true}).click();await page.locator('dialog .os-error').filter({hasText:'Test storage full'}).waitFor();assert.equal(await page.getByLabel('下一步行动',{exact:true}).inputValue(),'Unsaved action');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;});await saveDialog();
  const backupDownload=page.waitForEvent('download');await button('导出加密备份').click();
  const backup=await backupDownload,backupStream=await backup.createReadStream();let backupText='';for await(const chunk of backupStream)backupText+=chunk;
  assert.ok(!backupText.includes('PRIVATE SENTINEL'));assert.equal(JSON.parse(backupText).version,1);
  await button('新增行动').click();await page.getByLabel('下一步行动',{exact:true}).fill('After backup only');await saveDialog();
  await button('恢复加密备份').click();await page.getByLabel('加密备份文件',{exact:true}).setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backupText)});await page.getByLabel('备份保存时的访问密码',{exact:true}).fill('wrong');await page.locator('dialog [name=replace]').check();
  await page.locator('dialog').getByRole('button',{name:'解密并恢复',exact:true}).click();await page.locator('dialog .os-error').filter({hasText:'原记录未改动'}).waitFor();
  await page.getByLabel('备份保存时的访问密码',{exact:true}).fill(password);await saveDialog('解密并恢复');assert.equal(await page.getByRole('heading',{name:'After backup only',exact:true}).count(),0);
  await page.locator('#os-date').fill('2026-08-24');await page.locator('#os-date').dispatchEvent('change');await page.locator('#execution-root').getByText('行程尚未开始',{exact:true}).waitFor();
  await page.locator('#os-date').fill('2026-11-04');await page.locator('#os-date').dispatchEvent('change');await page.locator('#execution-root').getByText('71 天行程已结束',{exact:true}).waitFor();
  await button('今天').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await mkdir(resolve(root,'test-results'),{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(root,'test-results/execution-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:resolve(root,'test-results/execution-desktop.png'),fullPage:true});
  // Switching the existing full page into safe mode must remove private DOM, not just hide it.
  await page.locator('#privacyToggle').click();await page.waitForFunction(()=>document.getElementById('execution-root')?.childElementCount===0);assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE SENTINEL'));
  await page.goto(base+'/');assert.equal(await page.locator('#execution-root').count(),0);assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE SENTINEL'));
  const publicDownload=page.waitForEvent('download');await page.locator('#exportTodayCalendar').click();const download=await publicDownload;const stream=await download.createReadStream();let calendar='';for await(const chunk of stream)calendar+=chunk;assert.ok(!calendar.includes('PRIVATE SENTINEL'));assert.ok(calendar.includes('BEGIN:VCALENDAR'));
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: unlock, encrypted reload, prep, lifecycle, Waiting For, closure, travel, save failure, mobile, safe mode, public calendar.');
} catch(e) {console.error('Page errors:',errors);console.error((await page.locator('body').innerText()).slice(0,2500));throw e;} finally {await browser.close();await new Promise(r=>server.close(r));}

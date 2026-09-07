import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function calendar(){
 const context=vm.createContext({Date,TextEncoder,dayMs:86400000,shanghaiToday:()=>new Date('2026-09-07T00:00:00Z'),parse:s=>new Date(s+'T00:00:00Z')});
 vm.runInContext(read('itinerary.js')+read('daily-plan.js'),context);
 const app=read('app.js');vm.runInContext(app.slice(app.indexOf('function addDay('),app.indexOf('function calendarContent(')),context);
 const features=read('features.js');vm.runInContext(features.slice(0,features.indexOf("$('planDate').onchange")),context);return date=>vm.runInContext(`dailyCalendarContent('${date}')`,context);
}
test('daily reminders use correct absolute times in China, Japan, and Toronto',()=>{const get=calendar();assert.match(get('2026-09-06'),/DTSTART:20260906T013000Z/);assert.match(get('2026-10-24'),/DTSTART:20261024T093000Z/);assert.match(get('2026-11-03'),/DTSTART:20261104T021500Z/);assert.match(get('2026-10-24'),/TRIGGER:-PT30M/);});
test('unconfirmed appointments remain all-day without invented reminder times',()=>{const get=calendar();assert.match(get('2026-09-07'),/DTSTART;VALUE=DATE:20260907/);assert(!get('2026-09-07').includes('VALARM'));assert.equal(get('2026-08-24'),'');assert(get('2026-09-07').split('\r\n').every(x=>Buffer.byteLength(x)<=75));});
test('Japan revision keeps all 71 dates contiguous and preserves Kyoto storage identity',()=>{
 const ctx=vm.createContext({});vm.runInContext(read('itinerary.js')+read('daily-plan.js'),ctx);
 const rows=vm.runInContext('itinerary',ctx);assert.equal(rows.length,16);
 assert(!rows.some(x=>x.city.includes('箱根')));
 let count=0;for(let i=0;i<rows.length;i++){const x=rows[i];count+=(Date.parse(x.end)-Date.parse(x.start))/86400000+1;if(i)assert.equal(Date.parse(x.start)-Date.parse(rows[i-1].end),86400000);}
 assert.equal(count,71);const tokyo=rows.find(x=>x.start==='2026-10-23'),kyoto=rows.find(x=>x.city==='京都');
 assert.equal(tokyo.end,'2026-10-25');assert.equal(kyoto.start,'2026-10-26');assert.equal(kyoto.end,'2026-10-28');assert.equal(kyoto.key,'2026-10-27');
 assert.equal(vm.runInContext("currentStageData(itinerary.find(x=>x.city==='京都'),{dateLabel:'10月27日—10月28日',note:'keep'}).note",ctx),'keep');
 assert.match(calendar()('2026-10-26'),/DTSTART;VALUE=DATE:20261026/);
 assert.match(calendar()('2026-10-27'),/DTSTART:20261027T090000Z/);
});
test('every offline file exists and shared/auth/API responses bypass caching',()=>{
 const handlers={};const ctx=vm.createContext({URL,Response,self:{location:{origin:'https://journey.example'},registration:{scope:'https://journey.example/'},addEventListener:(type,fn)=>handlers[type]=fn}});vm.runInContext(read('sw.js'),ctx);
 const files=vm.runInContext('FILES',ctx);for(const file of files)if(file!=='./')assert(existsSync(new URL('../'+file.replace(/^\.\//,''),import.meta.url)),file);
 for(const path of ['/api/state','/api/session','/shared.html','/signin-with-chatgpt','/signout-with-chatgpt']){let intercepted=false;handlers.fetch({request:new Request('https://journey.example'+path),respondWith(){intercepted=true;}});assert.equal(intercepted,false,path);}
});

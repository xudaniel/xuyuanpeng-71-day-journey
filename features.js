'use strict';
const publicURL='https://xudaniel.github.io/xuyuanpeng-71-day-journey/';
let selectedPlanDate=shanghaiToday().toISOString().slice(0,10),followToday=true;
function planEvents(date){return dailyPlan[date]||[];}
function renderToday(){
 if(followToday)selectedPlanDate=shanghaiToday().toISOString().slice(0,10);
 $('planDate').value=selectedPlanDate;
 const date=parse(selectedPlanDate),stage=itinerary.find(x=>date>=parse(x.start)&&date<=parse(x.end));
 const events=planEvents(selectedPlanDate),next=itinerary.find(x=>parse(x.start)>date);
 $('planCity').textContent=stage?`${stage.city} · ${stage.summary}`:date<start?'行程尚未开始':'计划行程已结束';
 $('dailyEvents').innerHTML=events.length?events.map(x=>`<article class="daily-event"><time>${escapeHTML(x.time||x.period||'待定')}</time><div><strong>${escapeHTML(x.title)}</strong>${x.note?`<p>${escapeHTML(x.note)}</p>`:''}${x.time?`<p>${x.zone==='Asia/Tokyo'?'日本时间':x.zone==='America/Toronto'?'多伦多时间':'北京时间'}</p>`:''}</div></article>`).join(''):`<p class="small-note">${stage?'当天暂无单独确认的预约时刻。以下为本阶段安排，请与接待人核对。':'可选择行程内的日期查看安排。'}</p>${stage?stage.details.map(x=>`<p class="small-note">${escapeHTML(x)}</p>`).join(''):''}`;
 const addresses=events.filter(x=>x.address);
 $('travelInfo').innerHTML=`<p><strong>住宿</strong><br>${escapeHTML(stageHotels[stage?.start]||'本阶段未列出明确酒店')}</p><p><strong>下一程</strong><br>${next?`${escapeHTML(next.city)} · ${escapeHTML(next.date)}`:'无后续转场'}</p>${addresses.map((x,i)=>`<div class="address-item"><p>${escapeHTML(x.address)}</p><button class="button" data-address="${i}">复制地址</button></div>`).join('')}`;
 $('travelInfo').querySelectorAll('[data-address]').forEach(b=>b.onclick=()=>copyText(addresses[+b.dataset.address].address,'地址已复制。'));
 $('dailyCalendar').disabled=!stage;
 $('reminderNote').textContent=events.some(x=>x.time)?'导入日历后，已确认时刻的活动会附带提前30分钟提醒。':'未确认时刻的安排按全天事件导出，不添加精确时刻提醒。';
}
async function copyText(value,message){try{await navigator.clipboard.writeText(value);announce(message);}catch{announce('复制未成功，请长按或选中内容复制。');}}
function dailyCalendarContent(date){
 const stage=itinerary.find(x=>date>=x.start&&date<=x.end);if(!stage)return '';
 const events=planEvents(date);const list=events.length?events:[{title:stage.summary,note:stage.details.join('\n')}];
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//New Vision//Daily Journey//ZH','CALSCALE:GREGORIAN'];
 list.forEach((event,i)=>{
 lines.push('BEGIN:VEVENT',`UID:daily-${date}-${i}@newvision.travel`,`DTSTAMP:${stamp}`);
 if(event.time){const begin=new Date(`${date}T${event.time}:00${event.offset}`);const finish=event.end?new Date(`${date}T${event.end}:00${event.offset}`):new Date(+begin+30*60000);const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');lines.push(`DTSTART:${utc(begin)}`,`DTEND:${utc(finish)}`);}else{lines.push(`DTSTART;VALUE=DATE:${date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${addDay(date)}`);}
 lines.push(`SUMMARY:${icsEscape(event.title)}`,`DESCRIPTION:${icsEscape([event.note,event.period?'时段：'+event.period:'',!event.time?'具体时刻待确认':''].filter(Boolean).join('\n'))}`,`LOCATION:${icsEscape(event.address||stage.city)}`);
 if(event.time)lines.push('BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY',`DESCRIPTION:${icsEscape(event.title)}`,'END:VALARM');lines.push('END:VEVENT');
 });lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
}
$('planDate').onchange=e=>{if(e.target.value){selectedPlanDate=e.target.value;followToday=false;renderToday();}};
$('returnToday').onclick=()=>{followToday=true;renderToday();};
$('dailyCalendar').onclick=()=>download(dailyCalendarContent(selectedPlanDate),'text/calendar;charset=utf-8',`journey-${selectedPlanDate}.ics`);
new MutationObserver(renderToday).observe($('currentSummary'),{childList:true});
setInterval(()=>{if(followToday)renderToday();},30000);
$('shareApp').onclick=()=>$('shareDialog').showModal();$('closeShare').onclick=()=>$('shareDialog').close();
$('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText(publicURL);$('shareMessage').textContent='公开链接已复制。';}catch{$('shareMessage').textContent=publicURL;}};
$('nativeShare').onclick=async()=>{if(!navigator.share){$('shareMessage').textContent='此浏览器不支持系统分享，请复制链接或保存二维码。';return;}try{await navigator.share({title:'七十一日行程',url:publicURL});}catch(e){if(e.name!=='AbortError')$('shareMessage').textContent='分享未成功，请复制链接。';}};
let installPrompt=null,swRegistration=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('installApp').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else{announce('iPhone：用 Safari 打开，选择「分享 → 添加到主屏幕」。Android：在浏览器菜单中选择「安装应用」或「添加到主屏幕」。');}};
async function connectionStatus(){
 const available='caches' in window && await caches.has('journey-public-v2');
 $('connectionState').textContent=navigator.onLine?(available?'公开行程已可离线查看':'在线 · 正在准备离线行程'):(available?'离线 · 显示已保存的公开行程':'离线 · 尚未保存完整行程');
 $('lastUpdated').textContent='行程资料更新：2026-09-07 · 协作内容需联网登录';
}
window.addEventListener('online',connectionStatus);window.addEventListener('offline',connectionStatus);
$('refreshApp').onclick=()=>{if(swRegistration?.waiting)swRegistration.waiting.postMessage({type:'ACTIVATE_UPDATE'});};
if('serviceWorker' in navigator && location.protocol!=='file:'){
 navigator.serviceWorker.register('./sw.js').then(reg=>{
 swRegistration=reg;if(reg.waiting)$('refreshApp').hidden=false;
 reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',()=>{if(reg.waiting)$('refreshApp').hidden=false;connectionStatus();});});
 navigator.serviceWorker.ready.then(connectionStatus);
 }).catch(()=>{$('connectionState').textContent='当前浏览器未能启用离线功能';});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{connectionStatus();if(swRegistration?.active && $('refreshApp').hidden===false)location.reload();});
}
renderToday();connectionStatus();

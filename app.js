'use strict';
const dayMs = 86400000;
const storeKey = 'new-vision-itinerary-local-v1';
const $ = id => document.getElementById(id);
// UTC is used only for date arithmetic; the itinerary clock is always Beijing.
const parse = value => new Date(`${value}T00:00:00Z`);
const start = parse(itinerary[0].start), end = parse(itinerary.at(-1).end);
const totalDays = Math.round((end - start) / dayMs) + 1;
function shanghaiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
  return parse(`${p.year}-${p.month}-${p.day}`);
}
const fmt = date => new Intl.DateTimeFormat('zh-CN', {timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).format(date);
const assistantKey = 'new-vision-itinerary-state-v1';
const defaults = itinerary.map(x=>({...x,details:[...x.details]}));
let overrides = {};
const validKeys = new Set(itinerary.map(x => x.start));
function sanitizeVerified(value) {
  return Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string' && validKeys.has(x)))] : [];
}
function announce(message) { $('storageNotice').textContent = message; }
function readVerified() {
  try {
    const old = JSON.parse(localStorage.getItem(assistantKey) || '{}');
    overrides = sanitizeOverrides(old?.overrides);
    applyOverrides();
    const saved = localStorage.getItem(storeKey);
    return sanitizeVerified(saved === null ? old?.completed : JSON.parse(saved));
  }
  catch { announce('无法读取已保存的核验记录。您仍可查看行程，并使用备份功能留存进度。'); return []; }
}
function sanitizeOverrides(value) {
  const clean={};
  if(!value || typeof value!=='object' || Array.isArray(value))return clean;
  for(const key of validKeys){
    const item=value[key];if(!item || typeof item!=='object')continue;
    clean[key]={};for(const field of ['dateLabel','city','summary','note'])if(typeof item[field]==='string')clean[key][field]=item[field].slice(0,5000);
  }
  return clean;
}
function applyOverrides(){
  defaults.forEach((base,i)=>{const o=overrides[base.start]||{};itinerary[i]={...base,date:o.dateLabel??base.date,city:o.city??base.city,summary:o.summary??base.summary,details:o.note?[...base.details,'助理备注：'+o.note]:[...base.details]};});
}
function saveVerified() {
  try { localStorage.setItem(storeKey, JSON.stringify([...verified])); localStorage.setItem(assistantKey,JSON.stringify({completed:[...verified],overrides})); return true; }
  catch { announce('浏览器未能保存进度；请下载备份，避免刷新后丢失。'); return false; }
}
const verified = new Set(readVerified());
let filter = 'all', query = '', renderedDate = '';
const expanded = new Map();
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function statusOf(item, today) { return today < parse(item.start) ? 'upcoming' : today > parse(item.end) ? 'completed' : 'current'; }
function journeyState(today) {
  const current = itinerary.findIndex(x => statusOf(x,today) === 'current');
  const next = itinerary.find(x => parse(x.start) > today);
  const day = Math.min(totalDays, Math.max(0, Math.round((today-start)/dayMs)+1));
  return {current, next, day, pct:Math.round(day/totalDays*100), before:today<start, after:today>end};
}
function render() {
  const today = shanghaiToday(), s = journeyState(today), cur = itinerary[s.current];
  renderedDate = today.toISOString();
  $('todayHeader').textContent = '北京时间 · ' + fmt(today);
  $('todayLabel').textContent = fmt(today).replace(/^\d+年/, '');
  $('dayNo').textContent = s.before ? '—' : s.day;
  $('remaining').textContent = totalDays - s.day;
  $('timePct').textContent = s.pct;
  $('progressBar').style.width = s.pct + '%';
  document.querySelector('.bar').setAttribute('aria-valuenow',s.pct);
  $('executionPct').textContent = Math.round(verified.size/itinerary.length*100);
  $('currentCity').textContent = cur ? cur.city : s.before ? '行程尚未开始' : '计划行程已结束';
  $('currentSummary').textContent = cur ? cur.summary : s.before ? itinerary[0].summary : `已核验 ${verified.size} / ${itinerary.length} 个阶段`;
  $('currentDetail').textContent = cur ? cur.details[0] : s.before ? '请核对首段抵达与转场安排' : '请核对各阶段实际执行情况。';
  $('nextMove').textContent = s.next ? s.next.city : '无后续行程';
  $('nextDate').textContent = s.next ? s.next.date : '';
  $('briefFocus').textContent = cur ? cur.summary : s.before ? '行程准备' : '行程复盘';
  $('briefDetail').textContent = cur ? cur.details[0] : s.before ? '核对首段抵达与转场安排' : `已核验 ${verified.size} 个阶段，剩余 ${itinerary.length-verified.size} 个待核验。`;
  const left = cur ? Math.round((parse(cur.end)-today)/dayMs) : 0;
  $('stageRemaining').textContent = cur ? left === 0 ? '今日结束' : `还剩 ${left} 天` : s.before ? '尚未开始' : '计划已结束';
  $('stageWindow').textContent = cur ? `${cur.date} · ${cur.city}` : '—';
  $('nextCountdown').textContent = s.next ? `还有 ${Math.round((parse(s.next.start)-today)/dayMs)} 天` : '无后续转场';
  $('nextBrief').textContent = s.next ? `${s.next.date} · ${s.next.city}` : '已到最后一程';
  $('route').innerHTML = cities.map((c,i) => `<li><b>${String(i+1).padStart(2,'0')}</b>${escapeHTML(c)}</li>`).join('');
  let shown = 0;
  $('timeline').innerHTML = itinerary.map((x,i) => {
    const st = statusOf(x,today), isV = verified.has(x.start);
    if (!(filter === 'all' || filter === 'verified' && isV || filter === st)) return '';
    if (query && ![x.start,x.end,x.date,x.city,x.eyebrow,x.summary,...x.details].join(' ').toLowerCase().includes(query)) return '';
    shown++;
    const open = expanded.get(x.start) ?? st === 'current';
    const label = st === 'completed' ? '已结束' : st === 'current' ? '进行中' : '未开始';
    return `<article id="stage-${i}" class="row ${st} ${isV?'verified':''} ${open?'open':''}"><div class="marker"><span>${isV?'✓':String(i+1).padStart(2,'0')}</span></div><button class="main" type="button" data-start="${x.start}" aria-expanded="${open}" aria-controls="details-${i}"><span class="date">${escapeHTML(x.date)}</span><span class="place"><small>${escapeHTML(x.eyebrow)}</small><span class="place-title">${escapeHTML(x.city)}</span></span><span class="summary">${escapeHTML(x.summary)}</span><span class="badge">${label}${isV?' · 已核验':''}</span><span class="chevron" aria-hidden="true">⌄</span></button><div class="details" id="details-${i}"><div class="details-inner"><ul>${x.details.map(d=>`<li>${escapeHTML(d)}</li>`).join('')}</ul><label class="verify"><input type="checkbox" data-start="${x.start}" ${isV?'checked':''}> 标记为已核验完成</label></div></div></article>`;
  }).join('');
  $('resultCount').textContent = `${shown} / ${itinerary.length} 项`;
  $('emptyState').hidden = shown !== 0;
  document.querySelectorAll('[data-filter]').forEach(b => {
    b.classList.toggle('active',b.dataset.filter === filter);
    b.setAttribute('aria-pressed',b.dataset.filter === filter);
  });
  document.querySelectorAll('.main').forEach(b => b.onclick = () => setOpen(b,b.getAttribute('aria-expanded') !== 'true'));
  document.querySelectorAll('.verify input').forEach(c => c.onchange = () => {
    c.checked ? verified.add(c.dataset.start) : verified.delete(c.dataset.start);
    if (saveVerified()) announce(`已保存：${verified.size} / ${itinerary.length} 个阶段完成核验。`);
    const key = c.dataset.start;
    render();
    document.querySelector(`.verify input[data-start="${key}"]`)?.focus({preventScroll:true});
  });
}
function setOpen(button, open) {
  expanded.set(button.dataset.start,open);
  button.closest('.row').classList.toggle('open',open);
  button.setAttribute('aria-expanded',open);
}
function clearFilters() { filter='all';query='';$('searchInput').value='';render(); }
function download(content,type,name) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function addDay(value) { return new Date(+parse(value)+dayMs).toISOString().slice(0,10).replaceAll('-',''); }
function icsEscape(value) { return value.replaceAll('\\','\\\\').replaceAll(';','\\;').replaceAll(',','\\,').replace(/\r?\n/g,'\\n'); }
// RFC 5545 folds at 75 UTF-8 octets, never in the middle of a Chinese character.
function foldLine(line) {
  let result='',bytes=0;
  for (const char of line) {
    const size=new TextEncoder().encode(char).length;
    if(bytes+size>75){result+='\r\n ';bytes=1;}
    result+=char;bytes+=size;
  }
  return result;
}
function calendarContent() {
  const stamp=new Date().toISOString().replaceAll('-','').replaceAll(':','').replace(/\.\d{3}Z$/,'Z');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//New Vision Investment//71 Day Journey//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  itinerary.forEach(x=>lines.push('BEGIN:VEVENT',`UID:${x.start}@newvision.travel`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${x.start.replaceAll('-','')}`,`DTEND;VALUE=DATE:${addDay(x.end)}`,`SUMMARY:${icsEscape(`${x.city} · ${x.summary}`)}`,`LOCATION:${icsEscape(x.city)}`,`DESCRIPTION:${icsEscape(x.details.join('\n'))}`,'END:VEVENT'));
  lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});
$('searchInput').oninput=e=>{query=e.target.value.trim().toLowerCase();render();};
$('clearFilters').onclick=clearFilters;
$('exportCalendar').onclick=()=>download(calendarContent(),'text/calendar;charset=utf-8','徐远鹏_七十一日行程.ics');
$('expandAll').onclick=()=>document.querySelectorAll('.main').forEach(b=>setOpen(b,true));
$('collapseAll').onclick=()=>document.querySelectorAll('.main').forEach(b=>setOpen(b,false));
$('jumpCurrent').onclick=()=>{
  clearFilters();const s=journeyState(shanghaiToday()),i=s.current>=0?s.current:s.before?0:itinerary.length-1;
  const b=document.querySelector(`#stage-${i} .main`);setOpen(b,true);b.focus({preventScroll:true});b.closest('.row').scrollIntoView({block:'start'});
};
$('backupProgress').onclick=()=>download(JSON.stringify({version:1,journey:'xuyuanpeng-71-day-journey',exportedAt:new Date().toISOString(),verified:[...verified],overrides},null,2),'application/json','journey-progress.json');
$('restoreProgress').onclick=()=>$('backupFile').click();
$('backupFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    if(file.size>100000)throw new Error('文件过大');
    const data=JSON.parse(await file.text());
    if(data.version!==1 || data.journey!=='xuyuanpeng-71-day-journey' || !Array.isArray(data.verified) || data.verified.some(x=>!validKeys.has(x)))throw new Error('格式不匹配');
    sanitizeVerified(data.verified).forEach(key=>verified.add(key));
    overrides={...sanitizeOverrides(data.overrides),...overrides};applyOverrides();
    if(saveVerified())announce('备份已合并到当前进度，原有核验记录已保留。');
    render();
  }catch{announce('无法恢复：请选择本应用导出的有效进度备份文件。');}
  finally{e.target.value='';}
};
window.addEventListener('storage',e=>{if(e.key===storeKey || e.key===assistantKey || e.key===null){verified.clear();readVerified().forEach(x=>verified.add(x));render();}});
function refreshDate(){if(shanghaiToday().toISOString()!==renderedDate)render();}
setInterval(refreshDate,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate();});
render();

function fillEditor(){
  const base=defaults[Number($('editStage').value)],o=overrides[base.start]||{};
  $('editDate').value=o.dateLabel??base.date;$('editCity').value=o.city??base.city;$('editSummary').value=o.summary??base.summary;$('editNote').value=o.note??'';
}
$('editStage').innerHTML=defaults.map((x,i)=>`<option value="${i}">${i+1} · ${escapeHTML(x.date)} · ${escapeHTML(x.city)}</option>`).join('');
$('editStage').onchange=fillEditor;
$('openEditor').onclick=()=>{const i=journeyState(shanghaiToday()).current;$('editStage').value=String(Math.max(0,i));fillEditor();$('editor').showModal();};
$('closeEditor').onclick=()=>$('editor').close();
$('editForm').onsubmit=e=>{
  e.preventDefault();const key=defaults[Number($('editStage').value)].start;
  overrides[key]={dateLabel:$('editDate').value,city:$('editCity').value,summary:$('editSummary').value,note:$('editNote').value};applyOverrides();
  if(saveVerified())announce('行程调整已保存到此设备。');render();$('editor').close();
};
$('resetStage').onclick=()=>{delete overrides[defaults[Number($('editStage').value)].start];applyOverrides();if(saveVerified())announce('本阶段内容已恢复为原始安排。');fillEditor();render();};

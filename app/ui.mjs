import * as M from './model.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={open:'待开始',active:'进行中',waiting:'等待反馈',completed:'已完成',canceled:'已取消',unknown:'未核验',pending:'待确认',confirmed:'已确认'};
const stageNames={Planned:'计划',Prepared:'准备就绪',Completed:'已完成',Notes:'已记成果','Follow-up':'跟进中',Closed:'已关闭'};
const kindNames={meeting:'会面',visit:'参访',trip:'行程',task:'任务'};
const uuid=prefix=>prefix+'-'+crypto.randomUUID();
const options=(items,value)=>items.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('');
const field=(label,name,value='',type='text',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const area=(label,name,value='',extra='')=>`<label class="wide">${esc(label)}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
const select=(label,name,items,value)=>`<label>${esc(label)}<select name="${name}" aria-label="${esc(label)}">${options(items,value)}</select></label>`;
const button=(label,action,id='',extra='')=>`<button type="button" data-command="${action}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;
const priorities=[['P0','P0 · 今天必须做'],['P1','P1 · 今天应该做'],['P2','P2 · 可选']];
const statuses=M.ACTION_STATES.map(s=>[s,names[s]]);
const dateHelp='<p class="os-help wide">目标／跟进日期可填 YYYY-MM-DD；定时截止请填带时区的时间，例如 2026-09-22T14:00+08:00。自然日按北京时间。</p>';
export function mount(vault, context) {
  let state=vault.state ? M.migrateState(vault.state) : M.initialState(context.itinerary), date=context.getDate() || M.today(), tab='today', filter='all', busy=false, activeId='', message='', lastToday=M.today(), search='';
  const drafts=new Map();
  const root=document.createElement('section'); root.id='execution-root'; root.className='os'; root.setAttribute('aria-label','七十一日执行中心');
  (document.getElementById('todayView') || document.querySelector('main') || document.body).prepend(root);
  const style=document.createElement('link'); style.rel='stylesheet'; style.href=new URL('./execution.css',import.meta.url).href; document.head.append(style);
  const privacy=()=>context.isPrivate();
  const activeMeeting=()=>state.meetings.find(m=>m.id===activeId);
  const announce=text=>{message=text;const node=root.querySelector('#os-status');if(node)node.textContent=text;};
  function recordForm(title,kind,id,fields,submit='保存') {
    return `<dialog id="os-dialog" aria-labelledby="os-dialog-title"><form data-form="${kind}" data-id="${esc(id)}"><div class="os-dialog-head"><h3 id="os-dialog-title">${esc(title)}</h3>${button('关闭','dismiss','','aria-label="关闭编辑"')}</div><div class="os-fields">${fields}</div><p class="os-error" role="alert"></p><div class="os-tools"><button class="os-primary" type="submit">${submit}</button>${button('取消','dismiss')}</div></form></dialog>`;
  }
  function showDialog(html) {
    root.querySelector('dialog')?.remove(); root.insertAdjacentHTML('beforeend',html);
    const dialog=root.querySelector('dialog'); dialog.showModal();
  }
  function actionEditor(id, meetingId='') {
    const a=state.actions.find(a=>a.id===id) || {id:uuid('action'),title:'',priority:'P1',status:'open',date:meetingId?'':date,kind:meetingId?'followup':'task',meetingId};
    if(a.travelId && a.id==='confirm-'+a.travelId) return travelEditor(a.travelId);
    showDialog(recordForm(a.title?'编辑行动':'新增行动','action',a.id,
      field('下一步行动','title',a.title,'text','required maxlength="500"')+
      select('优先级','priority',priorities,a.priority)+
      select('状态','status',statuses,a.status)+select('类型','kind',[['task','日常待办'],['followup','后续跟进']],a.kind)+
      field('安排日期','date',a.date,'date')+field('目标截止日期／时间','due',a.due)+field('负责人','owner',a.owner)+
      field('相关人物／公司','person',a.person)+field('相关城市','city',a.city)+field('行程阶段','itineraryStage',a.itineraryStage)+field('沟通渠道','channel',a.channel)+
      select('关联会面','meetingId',[['','无关联'],...state.meetings.map(m=>[m.id,m.title])],a.meetingId)+
      select('关联交通／住宿','travelId',[['','无关联'],...state.travel.map(t=>[t.id,t.title])],a.travelId)+
      field('等待谁','waitingOn',a.waitingOn)+field('等待什么','expected',a.expected)+field('下次跟进日期／时间','checkIn',a.checkIn)+
      field('发出请求日期','requestedAt',a.requestedAt,'date')+field('最近联系／跟进日期','lastContact',a.lastContact,'date')+field('无回复提醒天数（可留空）','staleDays',a.staleDays,'number','min="1" max="365" step="1"')+
      `<div class="wide os-tools"><span>快速安排目标日期</span>${[['0','今天'],['1','明天'],['3','三天后'],['7','一周后']].map(([n,label])=>button(label,'quick-due',n)).join('')}</div>`+
      area('备注／跟进目标','notes',a.notes)+area('交付确认记录／取消原因','evidence',a.evidence)+dateHelp));
  }
  function meetingEditor(id) {
    const m=state.meetings.find(m=>m.id===id) || M.newMeeting(uuid('meeting'),{date});
    if(m.travelId)return travelEditor(m.travelId);
    if(m.sourceActionId)return actionEditor(m.sourceActionId);
    showDialog(recordForm(m.title?'编辑会面安排':'新增会面','meeting',m.id,
      select('活动类型','kind',Object.entries(kindNames).filter(([k])=>m.title?k===(m.kind||'meeting'):k!=='trip'),m.kind||'meeting')+
      field('会面名称','title',m.title,'text','required')+field('城市','city',m.city)+field('计划日期（未知可留空）','date',m.date,'date')+
      field('计划时间（未知可留空）','time',m.time,'time')+select('当地时区','zone',[['Asia/Shanghai','北京时间'],['Asia/Tokyo','日本时间'],['Asia/Hong_Kong','香港时间'],['America/Toronto','多伦多时间']],m.zone)+
      select('准备与成果提醒优先级','priority',priorities,m.priority||'P1')+
      field('地点','location',m.location)+field('接待／联系人','contact',m.contact)+field('行程阶段','itineraryStage',m.itineraryStage)));
  }
  function travelEditor(id) {
    const t=state.travel.find(t=>t.id===id) || {id:uuid('travel'),date,status:'unknown',priority:'P1',type:'transport',zone:'Asia/Shanghai'};
    showDialog(recordForm(t.title?'编辑交通／住宿':'新增交通／住宿','travel',t.id,
      field('安排名称','title',t.title,'text','required')+select('类型','type',[['transport','交通'],['stay','住宿']],t.type)+
      field('计划日期','date',t.date,'date','required')+field('确切时间（含时区，可留空）','scheduledAt',t.scheduledAt)+
      select('显示时区','zone',[['Asia/Shanghai','北京时间'],['Asia/Tokyo','日本时间'],['Asia/Hong_Kong','香港时间'],['America/Toronto','多伦多时间']],t.zone)+
      select('确认状态','status',['unknown','pending','confirmed','canceled'].map(s=>[s,names[s]]),t.status)+
      field('确认截止日期／时间','due',t.due)+field('下一步','nextAction',t.nextAction)+select('优先级','priority',priorities,t.priority)+area('确认记录／取消原因','reference',t.reference)+
      '<p class="os-help wide">行程只表示计划，未核验不代表已预订。首次导入的转场与住宿日期是阶段起点，请按实际安排核对。</p>'+dateHelp));
  }
  function meetingDetail(m) {
    const score=M.prepScore(m), actions=state.actions.filter(a=>a.meetingId===m.id||(m.travelId&&a.travelId===m.travelId)), blockers=M.closureBlockers(state,m);
    const next=M.STAGES[M.STAGES.indexOf(m.stage)+1];
    return `<article class="os-detail"><div class="os-heading"><div><p class="os-eyebrow">${kindNames[m.kind||'meeting']}记录</p><h3>${esc(m.title)}</h3></div>${button('修改安排','meeting-edit',m.id)}</div>
      <p>${esc(m.date||m.window||'日期待定')} · ${esc(m.time||'时间待定')} · ${esc(m.zone)} · ${esc(m.city)}</p>
      <p>地点：${esc(m.location||'待核对')} · 接待：${esc(m.contact||'待核对')}</p>
      ${M.needsVerification(m,date)?'<p class="os-warning">Needs Verification · 计划时间已过，请核对实际发生情况。</p>':''}
      ${m.travelId?readinessSummary(state.travel.find(t=>t.id===m.travelId),'travel'):['meeting','visit'].includes(m.kind||'meeting')?readinessSummary(m,'meeting'):''}
      <ol class="os-stages">${M.STAGES.map(s=>`<li ${s===m.stage?'aria-current="step"':''}>${s}<small>${stageNames[s]}</small></li>`).join('')}</ol>
      ${m.actualAt?`<p>${M.STAGES.indexOf(m.stage)>=2?'已登记实际完成':'历史完成登记（已更正，以当前阶段为准）'}：${esc(m.actualAt)}（计划日期单独保留）</p>`:''}
      ${m.doc?`<p><a href="docs/visits/${esc(m.doc)}.md" target="_blank" rel="noopener">准备卡</a> · <a href="docs/outcomes/${esc(m.doc)}.md" target="_blank" rel="noopener">原成果模板</a></p>`:''}
      <form data-form="prep" data-id="${esc(m.id)}"><h4>准备度 ${score.percent===null?'无适用准备项目':score.percent+'%'} · ${score.done}/${score.total}</h4>
      ${m.prep.map((p,i)=>`<div class="os-prep-row">${select(p.title,'prep-'+i,[['todo','待准备'],['done','已完成'],['na','不适用']],p.status)}${field('材料备注／不适用原因','note-'+i,p.note)}</div>`).join('')}
      <label class="os-check"><input type="checkbox" name="readiness" ${m.readiness?'checked':''}> 所有项目不适用时，我已确认准备就绪</label><p class="os-error" role="alert"></p><button type="submit">保存准备清单</button></form>
      ${M.STAGES.indexOf(m.stage)>=2?`<form data-form="notes" data-id="${esc(m.id)}"><h4>成果记录</h4><div class="os-fields">${area('成果摘要','summary',m.notes.summary,'required')+area('对方陈述','statements',m.notes.statements)+area('现场观察','observations',m.notes.observations)+area('个人判断','judgments',m.notes.judgments)+area('材料／出处','references',m.notes.references)}</div><p class="os-error" role="alert"></p><button type="submit">保存成果</button></form>`:''}
      <h4>后续行动 · ${blockers.length} 项未解决</h4>${actions.map(actionCard).join('')||'<p class="os-empty">尚无后续行动，不会从问题草稿自动创建。</p>'}
      ${m.stage==='Completed'?'<p class="os-warning">这次活动需要跟进吗？可以现在安排下一步；保存成果后，复核后续行动或明确填写无需跟进。</p>':''}
      <div class="os-tools">${button('新增后续行动','followup-new',m.id)}${next?button(next==='Prepared'?'标记准备就绪':next==='Completed'?'登记实际完成':next==='Notes'?'确认成果已记录':next==='Follow-up'?'复核后续行动':'关闭会面','advance',m.id,next==='Prepared'&&!score.ready?'disabled':''):button('重新打开会面','reopen-meeting',m.id)}${m.stage==='Planned'?button('补录已发生会面','occurred',m.id):button('更正阶段','correct-stage',m.id)}</div>
      ${m.stage==='Follow-up'&&blockers.length?`<p class="os-warning">关闭前请解决：${blockers.map(a=>esc(a.title)).join('、')}</p>`:''}
      ${m.noFollowup?`<p>无需跟进：${esc(m.noFollowup)}</p>`:''}
      <details><summary>操作记录（${m.history.length}）</summary><ul>${m.history.map(h=>`<li>${esc(h.at)} · ${esc(h.from)} → ${esc(h.to)} · ${esc(h.reason)}</li>`).join('')}</ul></details></article>`;
  }
  function actionCard(a) {
    const t=M.timing(a,date), meeting=state.meetings.find(m=>m.id===a.meetingId);
    return `<article class="os-record"><div><span class="os-badge ${a.priority}">${esc(a.priority)}</span> <span>${esc(names[a.status])}</span>${M.isOpen(a)&&t.targetLate?' <span class="os-alert">目标逾期</span>':''}${M.isOpen(a)&&t.checkLate?' <span class="os-alert">跟进逾期</span>':''}${t.stale?' <span class="os-alert">等待回复超时</span>':''}<h4>${esc(a.title)}</h4><p>${esc(a.owner||'未指定负责人')} · 安排 ${esc(a.date||'未排期')} · 目标 ${esc(a.due||'未设置')}</p>${a.person?`<p>相关人物／公司：${esc(a.person)} · ${esc(a.channel||'渠道未设置')}</p>`:''}${a.status==='waiting'?`<p>等待 ${esc(a.waitingOn)}：${esc(a.expected)} · 下次跟进 ${esc(a.checkIn)}</p>`:''}${a.notes?`<p>${esc(a.notes)}</p>`:''}${a.evidence?`<p>记录：${esc(a.evidence)}</p>`:''}${meeting?button('会面：'+meeting.title,'meeting-open',meeting.id):''}</div>${button('编辑','action-edit',a.id)}${!a.meetingId&&!a.travelId?button(a.lifecycleId?'查看执行流程':'启用执行流程','action-lifecycle',a.id):''}<details><summary>行动历史</summary><ul>${(a.history||[]).map(h=>`<li>${esc(h.at)} · ${esc(names[h.to]||h.to)} · ${esc(h.reason)}</li>`).join('')}</ul></details></article>`;
  }
  function travelCard(t) {
    const travelDate=M.deadlineDay(t.scheduledAt)||t.date, late=M.overdue(t.due,date);
    const scheduled=t.scheduledAt?new Intl.DateTimeFormat('zh-CN',{timeZone:t.zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(t.scheduledAt))+' · '+t.zone:t.date+' · 未设具体时间';
    return `<article class="os-record"><div><span class="os-badge">${esc(names[t.status])}</span>${late&&['unknown','pending'].includes(t.status)?' <span class="os-alert">确认逾期</span>':''}<h4>${esc(t.title)}</h4><p>${esc(scheduled)}</p><p>确认截止：${esc(t.due||'未设置')} · ${esc(t.priority)}</p><p>下一步：${esc(t.nextAction||'无')}</p>${travelDate<date&&['unknown','pending'].includes(t.status)?'<p class="os-warning">计划日期已过，需人工复核</p>':''}${t.reference?`<p>记录：${esc(t.reference)}</p>`:''}${t.confirmedAt?`<p>最近确认：${esc(t.confirmedAt)}</p>`:''}${readinessSummary(t,'travel')}</div>${button('编辑／确认','travel-edit',t.id)}${button(t.lifecycleId?'查看执行流程':'启用执行流程','travel-lifecycle',t.id)}</article>`;
  }
  function readinessSummary(record,type) {
    const score=M.readinessScore(record,type);
    return `<div class="os-readiness"><strong>就绪信息 ${score.ready?'READY':score.percent===null?'无适用项目':score.percent+'%'} · ${score.done}/${score.total}</strong><p>${score.missing.length?'尚缺：'+esc(score.missing.join('、')):'资料已齐备；准备清单仍需本人复核。'}</p>${button('更新就绪信息',type==='travel'?'travel-readiness':'meeting-readiness',record.id)}</div>`;
  }
  function readinessEditor(id,type) {
    const record=state[type==='travel'?'travel':'meetings'].find(r=>r.id===id),data=record.readinessData||{};
    const specs=type==='travel'?M.TRAVEL_READINESS:M.MEETING_READINESS;
    const derived=type==='travel'?{departure:record.scheduledAt,ticket:record.type==='transport'?names[record.status]:undefined,hotel:record.type==='stay'?names[record.status]:undefined}:{contact:record.contact};
    const fields=specs.map(([key,title,critical])=>`<fieldset class="wide"><legend>${esc(title)}${critical?' · 关键':''}</legend>${key in derived && derived[key]!==undefined?`<p>来自安排记录：${esc(derived[key]||'尚未设置')}（请在修改安排中更新）</p>`:key.endsWith('Confirmed')?`<label class="os-check"><input type="checkbox" name="${key}" ${data[key]?'checked':''}> ${esc(title)}</label>`:field('内容／核验记录','ready-'+key,data[key])}<label class="os-check"><input type="checkbox" name="${key}NA" ${data[key+'NA']?'checked':''}> 此项不适用</label>${field('不适用原因','reason-'+key,data[key+'Reason'])}</fieldset>`).join('');
    showDialog(recordForm('就绪信息 · '+record.title,type==='travel'?'travel-readiness':'meeting-readiness',id,'<p class="os-help wide">信息齐备不等于准备已复核。关键缺项在 24 小时内显示 P0 预警，72 小时内显示 P1 预警；行动原优先级保留。时间未定时按日期起点提前提醒。</p>'+fields));
  }
  function filteredActions() {
    return state.actions.filter(a=>!search||[a.title,a.person,a.waitingOn,a.owner,a.notes].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))).filter(a=>{
      const timing=M.timing(a,date),open=M.isOpen(a);
      if(filter==='waiting')return open&&a.status==='waiting';
      if(filter==='followups')return open&&a.kind==='followup'&&(timing.due||timing.late||timing.stale);
      if(['P0','P1','P2'].includes(filter))return open&&a.priority===filter;
      if(filter==='due')return open&&timing.due;
      if(filter==='overdue')return open&&timing.late;
      if(filter==='upcoming')return open&&!timing.due&&!timing.late&&((a.date||'')>date||(M.deadlineDay(a.status==='waiting'?a.checkIn:a.due)||'')>date);
      if(filter==='undated')return open&&!a.date&&!a.due&&!(a.status==='waiting'&&a.checkIn);
      if(filter==='resolved')return !open;
      return open;
    }).sort((a,b)=>a.priority.localeCompare(b.priority)||Number(M.timing(b,date).late)-Number(M.timing(a,date).late)||M.deadlineInstant(a.due)-M.deadlineInstant(b.due));
  }
  function render() {
    if(!privacy()){drafts.clear();root.replaceChildren();root.hidden=true;return;} root.hidden=false;
    const d=M.dashboard(state,date), day=Math.floor((Date.parse(date)-Date.parse('2026-08-25'))/86400000)+1;
    const dayLabel=day<1?'行程尚未开始':day>71?'71 天行程已结束':`第 ${day} / 71 天`;
    const city=context.itinerary.find(s=>s.start<=date&&s.end>=date)?.city||'';
    root.innerHTML=`<div class="os-heading"><div><p class="os-eyebrow">71-DAY OPERATING SYSTEM</p><h2>每日执行</h2><p>${esc(dayLabel)}${city?' · '+esc(city):''}</p></div>${button('锁定','lock')}</div>
      <p class="os-help">记录加密保存在当前设备，不会自动同步。公开分享版不显示个人行动。</p>
      <div class="os-date">${button('←','previous','','aria-label="执行日期前一天"')}<label>执行日期 · 北京时间<input id="os-date" type="date" value="${date}"></label>${button('→','next','','aria-label="执行日期后一天"')}${button('今天','today-date')}</div>
      <div class="os-stats">${['P0','P1','P2'].map(p=>button(p+' · '+d.rows.filter(a=>a.priority===p).length,'priority',p)).join('')}${button('逾期 · '+d.overdue.length,'overdue')}${button('Waiting For · '+d.waiting.length,'waiting')}${button('跟进到期 · '+d.followups.length,'followups')}${button('准备缺项 · '+d.prep.length,'prep')}${button('交通未确认 · '+d.travel.length,'travel-alerts')}${button('就绪预警 · '+d.warnings.length,'readiness-alerts')}${button('待核验 · '+d.verification.length,'verification')}</div>
      <div class="os-next"><span>下一场会面</span><strong>${d.next?esc(d.next.title)+' · '+esc(d.next.time||'时间待定'):'暂无后续会面'}</strong>${d.next?`<p>${esc(d.next.date)} · ${esc(d.next.zone)} · 准备度 ${M.prepScore(d.next).percent===null?'无适用准备项目':M.prepScore(d.next).percent+'%'}${M.prepScore(d.next).missing.length?' · 尚缺 '+esc(M.prepScore(d.next).missing.join('、')):''}</p>${button('查看准备','meeting-open',d.next.id)}`:''}</div>
      ${d.warnings[0]?`<div class="os-warning-panel"><span class="os-badge ${d.warnings[0].priority}">${d.warnings[0].priority} 就绪预警</span><strong>${esc(d.warnings[0].title)}</strong><p>尚缺：${esc(d.warnings[0].score.missing.join('、'))}</p>${button('检查准备',d.warnings[0].type==='travel'?'travel-show':'meeting-open',d.warnings[0].recordId)}</div>`:''}
      <nav class="os-tabs" aria-label="执行工具">${[['today','今日队列'],['actions','待办与跟进'],['meetings','会面与活动'],['travel','交通住宿'],['people','人物历史']].map(([id,label])=>button(label,'tab',id,`aria-pressed="${tab===id}"`)).join('')}</nav>
      <p id="os-status" role="status" aria-live="polite">${esc(message)}</p><div id="os-content"></div>
      <div class="os-backup">${button('导出加密备份','backup')}${button('恢复加密备份','restore')}<span>备份仍需保存时的访问密码解锁。</span></div>`;
    const content=root.querySelector('#os-content');
    if(tab==='today') {
      const rows=filter.startsWith('P')?d.rows.filter(a=>a.priority===filter):filter==='overdue'?d.overdue:filter==='readiness'?d.rows.filter(r=>r.warning):filter==='verification'?d.rows.filter(r=>r.badges.some(b=>b.includes('Needs Verification'))):d.rows;
      content.innerHTML=`<div class="os-heading"><h3>${filter.startsWith('P')?esc(filter)+' 行动':filter==='overdue'?'逾期行动':filter==='readiness'?'就绪预警':filter==='verification'?'待核验活动':'需要行动'} · ${rows.length}</h3>${button('新增行动','action-new')}</div>${filter!=='all'?button('全部今日行动','all-today'):''}`+
        (rows.map(r=>`<article class="os-record"><div><span class="os-badge ${r.priority}">${esc(r.priority)}</span>${r.late?' <span class="os-alert">'+(r.badges.some(b=>b.includes('Needs Verification'))?'待核验':'逾期')+'</span>':''}<h4>${esc(r.title)}</h4><p>${r.badges.map(esc).join(' · ')}</p>${r.warning?`<p>尚缺：${esc(r.warning.score.missing.join('、'))}（预警不会改写行动优先级）</p>`:''}${r.due?`<p>截止 ${esc(r.due)}</p>`:''}</div>${button('处理',r.rowKind==='meeting'?'meeting-open':r.rowKind==='travel'?'travel-show':'action-edit',r.rowKind==='meeting'?r.meetingId:r.rowKind==='travel'?r.travelId:r.id)}</article>`).join('')||'<p class="os-empty">当前日期没有需要处理的行动。可新增行动，或查看会面与交通安排。</p>');
    }
    if(tab==='actions') content.innerHTML=`<div class="os-heading"><h3>待办与跟进</h3>${button('新增行动','action-new')}</div>`+field('搜索人物／公司／内容','os-search',search)+select('查看范围','action-filter',[['all','全部未解决'],['P0','P0'],['P1','P1'],['P2','P2'],['waiting','Waiting For'],['followups','到期后续跟进'],['due','今日到期'],['overdue','逾期'],['upcoming','未来'],['undated','未排期'],['resolved','已完成／取消']],filter)+filteredActions().map(actionCard).join('')+(filteredActions().length?'':'<p class="os-empty">这个范围内没有行动。</p>');
    if(tab==='meetings') {
      const ms=state.meetings.filter(m=>!search||[m.title,m.contact,m.city,m.notes.summary].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))).filter(m=>filter.startsWith('stage:')?m.stage===filter.slice(6):filter==='verification'?d.verification.includes(m):filter==='prep'?d.prep.includes(m):filter==='undated'?!m.date:filter==='upcoming'?['Planned','Prepared'].includes(m.stage)&&(!m.date||M.meetingDay(m)>=date):true).sort((a,b)=>(M.meetingDay(a)||'9999').localeCompare(M.meetingDay(b)||'9999')||(a.time||'99').localeCompare(b.time||'99'));
      content.innerHTML=`<div class="os-heading"><h3>会面与活动</h3>${button('新增会面','meeting-new')}</div>`+field('搜索活动／成果／联系人','os-search',search)+select('查看范围','meeting-filter',[['all','全部活动'],['prep','当日准备缺项'],['upcoming','即将到来（含时间待定）'],['undated','日期待定'],['verification','Needs Verification · 待核验'],...M.STAGES.map(stage=>['stage:'+stage,stage==='Closed'?'Closed · 已关闭档案':stage+' · '+stageNames[stage]])],filter)+`<div class="os-meetings">${ms.map(m=>`<button type="button" data-command="meeting-open" data-id="${esc(m.id)}" aria-pressed="${m.id===activeId}"><b>${esc(m.title)}</b><span>${esc(m.date||'日期待定')} · ${esc(m.time||'时间待定')}</span><small>${esc(kindNames[m.kind||'meeting'])} · ${esc(m.stage)} · 准备 ${M.prepScore(m).percent??'—'}%</small></button>`).join('')||'<p class="os-empty">没有匹配会面。</p>'}</div>`+(activeMeeting()&&ms.includes(activeMeeting())?meetingDetail(activeMeeting()):'<p class="os-empty">选择一场会面，查看准备、成果及后续行动。</p>');
    }
    if(tab==='travel') {
      const ts=state.travel.filter(t=>{const day=M.deadlineDay(t.scheduledAt)||t.date,unresolved=['unknown','pending'].includes(t.status);return filter.startsWith('record:')?t.id===filter.slice(7):filter==='alerts'?d.travel.includes(t):filter==='upcoming'?unresolved&&day>=date&&day<M.addDays(date,7):filter==='past'?unresolved&&day<date:filter==='resolved'?!unresolved:true;}).sort((a,b)=>(M.deadlineDay(a.scheduledAt)||a.date).localeCompare(M.deadlineDay(b.scheduledAt)||b.date));
      content.innerHTML=`<div class="os-heading"><h3>交通与住宿</h3>${button('新增安排','travel-new')}</div>`+select('查看范围','travel-filter',[...(filter.startsWith('record:')?[[filter,'当前安排']]:[]),['upcoming','未来七天未确认'],['alerts','当日与到期提醒'],['past','过去日期待核验'],['all','全部'],['resolved','已确认／取消']],filter)+ts.map(travelCard).join('')+(ts.length?'':'<p class="os-empty">这个范围内没有安排。</p>');
    }
    if(tab==='people') {
      const matches=value=>!!search&&String(value||'').toLowerCase().includes(search.toLowerCase());
      const meetings=state.meetings.filter(m=>matches(m.contact));
      const actions=state.actions.filter(a=>matches(a.person)||matches(a.waitingOn)||meetings.some(m=>m.id===a.meetingId));
      content.innerHTML='<h3>人物与往来历史</h3>'+field('搜索人物／公司','os-search',search)+(search?`<h4>会面与活动 · ${meetings.length}</h4>${meetings.map(m=>`<p>${esc(m.date||'日期待定')} · ${esc(m.stage)} ${button(m.title,'meeting-open',m.id)}</p>`).join('')}<h4>行动与跟进 · ${actions.length}</h4>${actions.map(actionCard).join('')}`:'<p class="os-empty">输入人物或公司名称，查看所有阶段的会面和跟进，包括已完成与已关闭记录。</p>');
    }
    // Keep unsaved prep/notes drafts when another card is saved or tabs change.
    root.querySelectorAll('form[data-form]').forEach(form=>{
      const draft=drafts.get(form.dataset.form+':'+form.dataset.id);if(!draft)return;
      for(const input of form.elements){if(!input.name)continue;if(input.type==='checkbox')input.checked=draft[input.name]==='on';else if(input.name in draft)input.value=draft[input.name];}
    });
  }
  async function commit(mutator,form) {
    if(busy)return; busy=true;root.setAttribute('aria-busy','true');const buttons=[...root.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
    try {
      const next=structuredClone(state);mutator(next);next.revision++;await vault.save(next);state=next;if(form)drafts.delete(form.dataset.form+':'+form.dataset.id);message='已加密保存到当前设备。';root.querySelector('dialog')?.close();render();
    } catch(e) { const error=form?.querySelector('.os-error');if(error)error.textContent=e.message;announce('保存失败：'+e.message+' 当前输入尚未保存。'); }
    finally {busy=false;root.removeAttribute('aria-busy');buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}
  }
  function stepDialog(m,target,correction=false) {
    showDialog(recordForm('推进会面 · '+target,'transition',m.id,
      (correction?select('更正到','target',M.STAGES.slice(0,M.STAGES.indexOf(m.stage)).map(s=>[s,s]),target):`<input type="hidden" name="target" value="${esc(target)}">`)+
      (target==='Completed'||correction?field('实际完成时间（带时区）','actualAt',m.actualAt||''):'')+
      (target==='Follow-up'?area('若无需跟进，请说明原因','noFollowup',m.noFollowup):'')+
      area('补录／更正原因（正常推进可留空）','reason')+`<p class="os-help wide">${target==='Closed'?'关闭前会检查所有关联行动，包括等待反馈。':target==='Notes'?'请先在成果记录中保存摘要。':'日期经过不会自动完成会面。'}</p>`,'确认阶段'));
  }
  root.addEventListener('click',async event=>{
    const b=event.target.closest('[data-command]');if(!b||busy)return;
    const cmd=b.dataset.command,id=b.dataset.id;
    if(cmd==='quick-due'){root.querySelector('dialog [name=due]').value=M.addDays(date,Number(id));return;}
    if(cmd==='travel-readiness'||cmd==='meeting-readiness')return readinessEditor(id,cmd==='travel-readiness'?'travel':'meeting');
    if(cmd==='travel-show'){search='';tab='travel';filter='record:'+id;render();return;}
    if(cmd==='readiness-alerts'||cmd==='verification'){tab='today';filter=cmd==='verification'?'verification':'readiness';render();return;}
    if(cmd==='action-lifecycle'||cmd==='travel-lifecycle'){
      const collection=cmd==='action-lifecycle'?'actions':'travel',source=state[collection].find(r=>r.id===id);
      if(source.lifecycleId){activeId=source.lifecycleId;tab='meetings';filter='all';search='';render();return;}
      return commit(s=>{activeId=M.enableLifecycle(s,collection,id).id;tab='meetings';filter='all';search='';});
    }
    if(cmd==='dismiss'){root.querySelector('dialog')?.close();return;}
    if(cmd==='lock'){location.reload();return;}
    if(cmd==='tab'){search='';tab=id;filter=id==='travel'?'upcoming':'all';render();return;}
    if(['previous','next','today-date'].includes(cmd)){date=cmd==='today-date'?M.today():M.addDays(date,cmd==='previous'?-1:1);context.setDate(date);filter='all';render();return;}
    if(cmd==='priority'||cmd==='overdue'||cmd==='all-today'){tab='today';filter=cmd==='priority'?id:cmd==='overdue'?'overdue':'all';render();return;}
    if(cmd==='waiting'||cmd==='followups'){tab='actions';filter=cmd;render();return;}
    if(cmd==='prep'){tab='meetings';filter='prep';activeId=M.dashboard(state,date).prep[0]?.id||'';render();return;}
    if(cmd==='travel-alerts'){tab='travel';filter='alerts';render();return;}
    if(cmd==='action-new'||cmd==='action-edit')return actionEditor(cmd==='action-new'?'':id);
    if(cmd==='followup-new')return actionEditor('',id);
    if(cmd==='meeting-new'||cmd==='meeting-edit')return meetingEditor(cmd==='meeting-new'?'':id);
    if(cmd==='travel-new'||cmd==='travel-edit')return travelEditor(cmd==='travel-new'?'':id);
    if(cmd==='meeting-open'){search='';activeId=id;tab='meetings';filter='all';render();root.querySelector('.os-detail')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(['advance','occurred','reopen-meeting','correct-stage'].includes(cmd)) {
      const m=state.meetings.find(m=>m.id===id);activeId=id;
      return stepDialog(m,cmd==='occurred'?'Completed':cmd==='reopen-meeting'?'Follow-up':cmd==='correct-stage'?'Planned':M.STAGES[M.STAGES.indexOf(m.stage)+1],cmd==='correct-stage');
    }
    if(cmd==='backup') {
      if(!vault.exportEncrypted())await commit(()=>{});
      const data=vault.exportEncrypted();if(!data)return;
      const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='71-day-encrypted-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(cmd==='restore')showDialog(recordForm('恢复加密备份','restore','',field('加密备份文件','backup','','file','required accept="application/json,.json"')+field('备份保存时的访问密码','backupPassword','','password','required autocomplete="off"')+'<label class="os-check wide"><input type="checkbox" name="replace" required> 我确认用备份替换当前执行记录（可先导出当前备份）。</label>','解密并恢复'));
  });
  root.addEventListener('change',event=>{
    if(event.target.name==='os-search'){search=event.target.value.trim();render();return;}
    if(event.target.id==='os-date'){date=event.target.value||M.today();context.setDate(date);render();return;}
    if(['action-filter','meeting-filter','travel-filter'].includes(event.target.name)){filter=event.target.value;render();}
  });
  const rememberDraft=event=>{const form=event.target.closest('form[data-form]');if(form&&!form.closest('dialog'))drafts.set(form.dataset.form+':'+form.dataset.id,Object.fromEntries(new FormData(form)));};
  root.addEventListener('input',rememberDraft);root.addEventListener('change',rememberDraft);
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();
    const data=Object.fromEntries(new FormData(form)),id=form.dataset.id,kind=form.dataset.form;
    if(kind==='restore') {
      try {const saved=await vault.readBackup(await data.backup.text(),data.backupPassword);await commit(s=>{Object.assign(s,M.migrateState(saved));},form);}catch(e){form.querySelector('.os-error').textContent='备份无法解锁或格式有误，原记录未改动。';}return;
    }
    await commit(s=>{
      if(kind==='action'){if(data.meetingId)data.kind='followup';M.putAction(s,{...data,id});}
      if(kind==='meeting'){M.putMeeting(s,{...data,id});activeId=id;tab='meetings';}
      if(kind==='travel')M.putTravel(s,{...data,id});
      if(kind==='notes')M.saveNotes(s,id,data);
      if(kind==='prep')M.setPrep(s,id,M.prepTitles(s.meetings.find(m=>m.id===id).kind).map((title,i)=>({title,status:data['prep-'+i],note:data['note-'+i]})),data.readiness==='on');
      if(kind==='travel-readiness'||kind==='meeting-readiness') {
        const collection=kind==='travel-readiness'?'travel':'meetings',specs=collection==='travel'?M.TRAVEL_READINESS:M.MEETING_READINESS;
        const values={};for(const [key] of specs){values[key]=key.endsWith('Confirmed')?data[key]==='on':data['ready-'+key];values[key+'NA']=data[key+'NA']==='on';values[key+'Reason']=data['reason-'+key];}
        M.saveReadiness(s,collection,id,values);
      }
      if(kind==='transition')M.transition(s,id,data.target,data);
    },form);
  });
  // Existing itinerary navigation remains the date authority within its 71-day window.
  context.subscribe(()=>{if(!privacy()){render();return;}const next=context.getDate();if(next && next!==date){date=next;if(!root.querySelector('dialog[open]'))render();}});
  const privacyObserver=new MutationObserver(()=>{if(!privacy()||root.hidden)render();});
  privacyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  root.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});root.addEventListener('touchend',e=>e.stopPropagation(),{passive:true});
  const timer=setInterval(()=>{
    if(busy||!privacy()||document.hidden||root.querySelector('dialog[open]')||root.contains(document.activeElement))return;
    const current=M.today();if(current!==lastToday&&date===lastToday){date=current;context.setDate(date);}lastToday=current;render();
  },60000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);drafts.clear();root.replaceChildren();state=null;});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  render();
}

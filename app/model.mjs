// Execution records are independent of elapsed itinerary progress.
export const STAGES = ['Planned', 'Prepared', 'Completed', 'Notes', 'Follow-up', 'Closed'];
export const PREP = ['明确会面目标', '复核背景资料', '选定交流问题', '核对议程与所需材料', '复核地点及交通安排'];
export const prepTitles = kind => kind==='trip' ? ['复核行程目的', '复核出发与抵达安排', '核对票务及住宿', '核对证件与所需材料', '复核当地交通与接待'] : kind==='task' ? ['明确完成目标', '复核背景与输入', '确定执行步骤', '核对所需材料', '复核依赖与时间安排'] : PREP;
export const ACTION_STATES = ['open', 'active', 'waiting', 'completed', 'canceled'];
export const ACTIVITY_KINDS = ['meeting', 'visit', 'trip', 'task'];
// Completeness is separate from the explicitly reviewed preparation checklist.
export const MEETING_READINESS = [
  ['dateConfirmed','日期已确认',true], ['timeConfirmed','时间已确认',true],
  ['locationConfirmed','地点／会议链接已确认',true], ['contact','联系人',true],
  ['objective','会面目标'], ['research','背景资料'], ['question1','关键问题 1'],
  ['question2','关键问题 2'], ['question3','关键问题 3'], ['documents','相关材料'],
  ['followupObjective','跟进目标']
];
export const TRAVEL_READINESS = [
  ['ticket','交通票务已确认',true], ['departure','出发时间',true],
  ['terminal','出发航站楼／车站',true], ['arrival','抵达信息'],
  ['hotel','住宿已确认',true], ['localTransport','当地交通'],
  ['documents','护照／签证要求已核对',true], ['host','联系人／接待'], ['calendar','日历事项']
];
export const isOpen = a => !['completed', 'canceled'].includes(a.status);
export const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
export const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const required = (value, message) => { if (!String(value || '').trim()) throw new Error(message); };
const member = (value, choices) => { if (!choices.includes(value)) throw new Error('无效状态'); };
export function validateDate(value) {
  if (!value) return;
  const parsed=Date.parse(value+'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10) !== value) throw new Error('请输入有效日期');
}
export function validateDeadline(value) {
  if (!value) return;
  if (value.length === 10) return validateDate(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('定时日期必须包含时区，例如 2026-09-22T14:00+08:00');
  validateDate(value.slice(0,10));
}
export const deadlineDay = value => !value ? '' : value.length === 10 ? value : today(new Date(value));
export const deadlineInstant = value => !value ? Infinity : Date.parse(value.length===10 ? value+'T23:59:59.999+08:00' : value);
export const overdue = (value, date, now = new Date()) => !!value && (value.length === 10 ? value < date : Date.parse(value) < (date === today(now) ? +now : Date.parse(date+'T23:59:59.999+08:00')));
export function timing(a, date, now = new Date()) {
  const targetLate = overdue(a.due, date, now), checkLate = a.status === 'waiting' && overdue(a.checkIn, date, now);
  const reminder = a.status === 'waiting' ? a.checkIn : a.due;
  const lastContact=a.lastContact || a.requestedAt;
  const stale=a.status==='waiting' && Number(a.staleDays)>0 && !!lastContact && addDays(lastContact,Number(a.staleDays))<=date;
  return {targetLate, checkLate, stale, late:!!(targetLate || checkLate), due:deadlineDay(reminder) === date || deadlineDay(a.due) === date};
}
export function prepScore(m) {
  const applicable = m.prep.filter(p => p.status !== 'na');
  const done = applicable.filter(p => p.status === 'done').length;
  return {done, total:applicable.length, percent:applicable.length ? Math.round(done/applicable.length*100) : null, ready:applicable.length ? done === applicable.length : !!m.readiness, missing:applicable.filter(p => p.status !== 'done').map(p => p.title)};
}
export const newMeeting = (id, data = {}) => ({id, kind:'meeting', title:'', city:'', date:'', time:'', zone:'Asia/Shanghai', location:'', contact:'', priority:'P1', stage:'Planned', prep:prepTitles(data.kind).map(title => ({title, status:'todo', note:''})), readiness:false, readinessData:{}, notes:{summary:'', statements:'', observations:'', judgments:'', references:''}, history:[], ...data});
export function initialState(itinerary = []) {
  const meetings = [
    ['bateng','备腾教育','上海','','2026-09-07—10，具体日期待核对'],
    ['drama','抓马文娱','上海','','2026-09-07—10，具体日期待核对'],
    ['yadea','雅迪','无锡','2026-09-11',''],
    ['tencent','腾讯','深圳','2026-09-22',''],
    ['huagai','华盖南方','深圳','','2026-10-08—16，具体日期待核对']
  ].map(([id,title,city,date,window]) => newMeeting('meeting-'+id, {title,city,date,window,doc:id}));
  // Stage starts are review anchors, not inferred bookings or confirmed departures.
  const travel = itinerary.flatMap((stage, i) => {
    const base = {date:stage.start, scheduledAt:'', zone:/东京|京都/.test(stage.city)?'Asia/Tokyo':'Asia/Shanghai', status:'unknown', due:'', reference:'', history:[], stageKey:stage.key||stage.start};
    return [{...base,id:'travel-'+base.stageKey,title:`${stage.city} · 转场安排待核对`,type:'transport',nextAction:'核对交通安排',priority:'P1'}, ...(stage.end > stage.start ? [{...base,id:'stay-'+base.stageKey,title:`${stage.city} · 住宿安排待核对`,type:'stay',nextAction:'核对住宿安排',priority:'P1'}] : [])];
  });
  return migrateState({version:1, revision:0, actions:[], meetings, travel});
}
export function migrateState(state) {
  const s=structuredClone(state);
  s.meetings.forEach(m=>{m.kind ||= 'meeting';m.readinessData ||= {};});
  s.travel.forEach(t=>{if(!t.lifecycleId)enableLifecycle(s,'travel',t.id);});
  return s;
}
function history(record, from, to, reason, now) {
  record.history ||= [];
  record.history.push({from, to, reason, at:now.toISOString()});
}
function reopenMeeting(s, id, reason, now) {
  const m = s.meetings.find(m => m.id === id);
  if (m?.stage === 'Closed') { history(m,'Closed','Follow-up',reason,now); m.stage='Follow-up'; }
}
export function putAction(s, input, now = new Date()) {
  const old = s.actions.find(a => a.id === input.id);
  const a = {...old, ...input};
  required(a.id,'缺少行动编号'); required(a.title,'请填写下一步行动');
  member(a.priority,['P0','P1','P2']); member(a.status,ACTION_STATES);
  validateDate(a.date); validateDeadline(a.due); validateDeadline(a.checkIn);
  validateDate(a.requestedAt); validateDate(a.lastContact);
  if(a.staleDays && (!Number.isInteger(Number(a.staleDays)) || Number(a.staleDays)<1 || Number(a.staleDays)>365)) throw new Error('无回复天数应为 1 到 365');
  if (a.meetingId && !s.meetings.some(m=>m.id===a.meetingId)) throw new Error('关联会面不存在');
  if (a.travelId && !s.travel.some(t=>t.id===a.travelId)) throw new Error('关联交通记录不存在');
  if (a.status === 'waiting') { required(a.waitingOn,'请填写等待谁'); required(a.expected,'请填写等待什么'); required(a.checkIn,'请填写下次跟进日期'); }
  if (a.kind === 'followup' && ['open','active','waiting'].includes(a.status)) required(a.owner,'请填写负责人');
  if (a.status === 'completed') required(a.evidence,'请填写交付或确认记录');
  if (a.status === 'canceled') required(a.evidence,'请填写取消原因');
  // A dedicated confirmation action must be resolved through its travel record.
  if (a.travelId && a.id === 'confirm-'+a.travelId && ['completed','canceled'].includes(a.status) && isOpen(old || {status:'open'})) throw new Error('请在交通卡确认或取消安排，以保持状态一致');
  a.history = structuredClone(old?.history || []);
  history(a,old?.status || 'new',a.status, a.evidence || '更新行动',now);
  if (old) s.actions[s.actions.indexOf(old)] = a; else s.actions.push(a);
  if (isOpen(a) && a.meetingId) reopenMeeting(s,a.meetingId,'关联行动新增或重新打开',now);
  if(isOpen(a) && a.travelId) {
    const travel=s.travel.find(t=>t.id===a.travelId);
    if(travel?.lifecycleId)reopenMeeting(s,travel.lifecycleId,'关联行程行动新增或重新打开',now);
  }
  if(a.lifecycleId) {
    const activity=s.meetings.find(m=>m.id===a.lifecycleId);
    if(!activity) throw new Error('关联活动不存在');
    activity.title=a.title;activity.date=a.date || deadlineDay(a.due);activity.priority=a.priority;
    if(isOpen(a)) reopenMeeting(s,a.lifecycleId,'原待办重新打开',now);
  }
  return a;
}
export function putMeeting(s, input, now = new Date()) {
  const old = s.meetings.find(m=>m.id===input.id);
  const m = old || newMeeting(input.id);
  required(input.title,'请填写会面名称'); validateDate(input.date);
  member(input.priority || 'P1',['P0','P1','P2']);m.priority=input.priority || 'P1';
  if (input.time && (!input.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))) throw new Error('请填写日期及有效时间');
  new Intl.DateTimeFormat('en',{timeZone:input.zone || 'Asia/Shanghai'});
  const kind=input.kind || m.kind || 'meeting'; member(kind,ACTIVITY_KINDS);
  if(kind!==(m.kind||'meeting') && old) throw new Error('已有活动的类型不可更改，请保留其准备和执行记录');
  m.kind=kind;if(!old)m.prep=prepTitles(kind).map(title=>({title,status:'todo',note:''}));
  if(old && ['date','time','location'].some(k=>input[k]!==old[k])) m.readinessData={...m.readinessData,dateConfirmed:false,timeConfirmed:false,locationConfirmed:false};
  for (const k of ['title','city','date','time','zone','location','contact','itineraryStage']) m[k]=input[k] || '';
  if (!old) s.meetings.push(m);
  history(m,m.stage,m.stage,'更新会面安排',now);
  return m;
}
export function setPrep(s, id, items, readiness, now = new Date()) {
  const m=s.meetings.find(m=>m.id===id);
  if (!m || items.length !== PREP.length) throw new Error('准备清单不完整');
  items.forEach(p=> { member(p.status,['todo','done','na']); if(p.status==='na') required(p.note,'不适用项目须填写原因'); });
  m.prep=items.map((p,i)=>({...p,title:prepTitles(m.kind)[i]})); m.readiness=!!readiness;
  if (m.stage==='Prepared' && !prepScore(m).ready) { history(m,'Prepared','Planned','准备项目重新打开',now); m.stage='Planned'; }
}
export const closureBlockers=(s,m)=>s.actions.filter(a=>(a.meetingId===m.id || a.id===m.sourceActionId || (m.travelId && a.travelId===m.travelId)) && isOpen(a));
export function transition(s, id, target, input = {}, now = new Date()) {
  const m=s.meetings.find(m=>m.id===id); if (!m) throw new Error('会面不存在');
  member(target,STAGES);
  const from=m.stage, forward=STAGES.indexOf(target)===STAGES.indexOf(from)+1;
  const exception=from==='Planned' && target==='Completed';
  const correction=STAGES.indexOf(target)<STAGES.indexOf(from);
  if (!forward && !exception && !correction) throw new Error('请按会面流程推进');
  if (exception || correction) required(input.reason,'请填写补录或更正原因');
  if (target==='Prepared' && !prepScore(m).ready) throw new Error('请完成所有适用准备项目');
  if (target==='Completed') { required(input.actualAt,'请填写实际完成时间及其时区'); validateDeadline(input.actualAt); if(input.actualAt.length===10) throw new Error('实际完成记录需要时间与时区'); if(Date.parse(input.actualAt)>+now) throw new Error('实际完成时间不能晚于现在'); }
  if (target==='Notes') required(m.notes.summary,'请先保存成果摘要');
  if (target==='Follow-up' && forward) {
    const actions=s.actions.filter(a=>a.meetingId===id);
    if (!actions.length) required(input.noFollowup,'请创建后续行动，或填写无需跟进的原因');
    actions.filter(isOpen).forEach(a=>{ required(a.owner,'跟进行动需要负责人'); required(a.due,'跟进行动需要目标日期'); });
    m.noFollowup=actions.length ? '' : input.noFollowup;
  }
  if (target==='Closed') {
    const blockers=closureBlockers(s,m);
    if(blockers.length) throw new Error('尚有未解决行动：'+blockers.map(a=>a.title).join('、'));
    if(m.travelId && s.travel.some(t=>t.id===m.travelId&&['unknown','pending'].includes(t.status))) throw new Error('行程安排尚未确认，请先核对预订或记录取消原因');
    if (!s.actions.some(a=>a.meetingId===id) && !m.noFollowup) throw new Error('请先记录无需跟进的原因');
  }
  if(target==='Completed') m.actualAt=input.actualAt;
  if(m.sourceActionId && (target==='Completed' || target==='Planned' || target==='Prepared')) {
    const source=s.actions.find(a=>a.id===m.sourceActionId);
    if(source){const previous=source.status;source.status=target==='Completed'?'completed':'open';if(target==='Completed')source.evidence='实际完成：'+input.actualAt;history(source,previous,source.status,'活动阶段同步',now);}
  }
  history(m,from,target,input.reason || input.noFollowup || '用户确认',now); m.stage=target;
}
export function saveNotes(s,id,notes,now=new Date()) {
  const m=s.meetings.find(m=>m.id===id); required(notes.summary,'请填写成果摘要');
  if (STAGES.indexOf(m.stage)<2) throw new Error('请先登记实际完成');
  m.notes={...m.notes,...notes}; history(m,m.stage,m.stage,'保存成果记录',now);
}
export function putTravel(s,input,now=new Date()) {
  const old=s.travel.find(t=>t.id===input.id), t={...old,...input};
  required(t.title,'请填写交通或住宿名称'); required(t.date,'请填写计划日期'); validateDate(t.date); validateDeadline(t.due); validateDeadline(t.scheduledAt);
  member(t.type,['transport','stay']); member(t.status,['unknown','pending','confirmed','canceled']); member(t.priority,['P0','P1','P2']);
  new Intl.DateTimeFormat('en',{timeZone:t.zone || 'Asia/Shanghai'});
  if(t.scheduledAt && t.scheduledAt.length===10) throw new Error('定时安排需要时间和时区');
  if(['confirmed','canceled'].includes(t.status)) required(t.reference,t.status==='confirmed'?'请填写确认记录':'请填写取消原因');
  else required(t.nextAction,'请填写下一步');
  t.history=structuredClone(old?.history || []); history(t,old?.status||'new',t.status,t.reference||'更新安排',now);
  if(t.status==='confirmed' && old?.status!=='confirmed') t.confirmedAt=now.toISOString();
  if(old) s.travel[s.travel.indexOf(old)]=t; else s.travel.push(t);
  const id='confirm-'+t.id, a=s.actions.find(a=>a.id===id);
  const updated={...a,id,title:t.nextAction || '核对安排',kind:'travel',travelId:t.id,date:deadlineDay(t.scheduledAt)||t.date,due:t.due,priority:t.priority,status:t.status==='confirmed'?'completed':t.status==='canceled'?'canceled':(a?.status==='active'?'active':'open'),evidence:t.reference,history:structuredClone(a?.history||[])};
  history(updated,a?.status||'new',updated.status,t.reference||'更新交通确认行动',now);
  if(a) s.actions[s.actions.indexOf(a)]=updated; else s.actions.push(updated);
  if(!t.lifecycleId)enableLifecycle(s,'travel',t.id,now);
  if(t.lifecycleId) {
    const activity=s.meetings.find(m=>m.id===t.lifecycleId);
    if(activity){activity.title=t.title;activity.date=deadlineDay(t.scheduledAt)||t.date;activity.time=t.scheduledAt?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(t.scheduledAt)):'';activity.zone='Asia/Shanghai';activity.priority=t.priority;}
    if(isOpen(updated))reopenMeeting(s,t.lifecycleId,'行程确认行动重新打开',now);
  }
  return t;
}
export function enableLifecycle(s, collection, id, now=new Date()) {
  member(collection,['actions','travel']);
  const source=s[collection].find(r=>r.id===id);if(!source)throw new Error('原记录不存在');
  if(source.lifecycleId)return s.meetings.find(m=>m.id===source.lifecycleId);
  if(collection==='actions' && source.meetingId) throw new Error('后续行动使用所关联活动的流程');
  const activity=newMeeting('activity-'+id,{kind:collection==='travel'?'trip':'task',title:source.title,date:collection==='travel'?(deadlineDay(source.scheduledAt)||source.date):(source.date||deadlineDay(source.due)),time:collection==='travel'&&source.scheduledAt?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(source.scheduledAt)):'',priority:source.priority,...(collection==='travel'?{travelId:id}:{sourceActionId:id})});
  source.lifecycleId=activity.id;s.meetings.push(activity);history(activity,'new','Planned','启用执行流程，不推定已完成',now);return activity;
}
export function saveReadiness(s, collection, id, data, now=new Date()) {
  member(collection,['meetings','travel']);const record=s[collection].find(r=>r.id===id);if(!record)throw new Error('记录不存在');
  const specs=collection==='travel'?TRAVEL_READINESS:MEETING_READINESS;
  const clean={};
  for(const [key] of specs) {
    clean[key]=typeof data[key]==='boolean'?data[key]:String(data[key]||'').trim();
    if(data[key+'NA']){required(data[key+'Reason'],'不适用项目须填写原因');clean[key+'NA']=true;clean[key+'Reason']=String(data[key+'Reason']).trim();}
  }
  record.readinessData=clean;history(record,record.stage||record.status,record.stage||record.status,'更新就绪信息',now);
}
export function readinessScore(record, type='meeting') {
  const data=record.readinessData||{},specs=type==='travel'?TRAVEL_READINESS:MEETING_READINESS;
  const values=type==='travel'?{
    ...data,ticket:record.type==='transport'?record.status==='confirmed':data.ticket,
    hotel:record.type==='stay'?record.status==='confirmed':data.hotel,departure:record.scheduledAt
  }:{...data,dateConfirmed:!!record.date&&data.dateConfirmed,timeConfirmed:!!record.time&&data.timeConfirmed,locationConfirmed:!!record.location&&data.locationConfirmed,contact:record.contact};
  const applicable=specs.filter(([key])=>!data[key+'NA']);
  const missing=applicable.filter(([key])=>!values[key]);
  const done=applicable.length-missing.length;
  return {done,total:applicable.length,percent:applicable.length?Math.round(done/applicable.length*100):null,ready:applicable.length>0&&missing.length===0,missing:missing.map(([,label])=>label),critical:missing.filter(([, ,critical])=>critical).map(([,label])=>label)};
}
export function readinessWarnings(s,date=today(),now=new Date()) {
  const start=date===today(now)?+now:Date.parse(date+'T00:00+08:00');
  const records=[...s.meetings.filter(m=>['Planned','Prepared'].includes(m.stage)&&['meeting','visit'].includes(m.kind||'meeting')).map(m=>({record:m,type:'meeting',instant:meetingInstant(m),date:meetingDay(m)})),...s.travel.filter(t=>t.status!=='canceled' && !s.meetings.some(m=>m.id===t.lifecycleId&&STAGES.indexOf(m.stage)>=2)).map(t=>({record:t,type:'travel',instant:t.scheduledAt?Date.parse(t.scheduledAt):null,date:t.date}))];
  return records.flatMap(({record,type,instant,date:recordDate})=>{
    if(!recordDate)return [];
    // Unknown times use the start of the date as a conservative preparation boundary,
    // while keeping the time unknown in the UI and preserving the entire current day.
    const earliest=instant??Date.parse(recordDate+'T00:00+08:00');
    if(instant!==null?instant<start:recordDate<date)return [];
    const hours=Math.max(0,(earliest-start)/3600000),score=readinessScore(record,type);
    if(hours>72||!score.missing.length)return [];
    return [{id:'ready-'+record.id,recordId:record.id,type,title:record.title,score,hours,instant:earliest,priority:hours<=24&&score.critical.length?'P0':'P1'}];
  }).sort((a,b)=>a.instant-b.instant||a.id.localeCompare(b.id));
}
export function needsVerification(m,date=today(),now=new Date()) {
  return ['Planned','Prepared'].includes(m.stage) && !!m.date && (m.time?meetingInstant(m)<(date===today(now)?+now:Date.parse(date+'T00:00+08:00')):m.date<date);
}
export function meetingInstant(m) {
  if (!m.date || !m.time) return null;
  // Convert an IANA wall time to an instant without depending on device timezone.
  const wall=Date.parse(m.date+'T'+m.time+':00Z'); let instant=wall;
  for(let i=0;i<3;i++) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:m.zone || 'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
    const rendered=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    instant += wall-rendered;
  }
  return instant;
}
export const meetingDay = m => m.time && m.date ? today(new Date(meetingInstant(m))) : m.date;
export function dashboard(s,date=today(),now=new Date()) {
  const actions=s.actions.filter(isOpen);
  const reminders=actions.filter(a=>a.date===date || timing(a,date,now).due || timing(a,date,now).late || timing(a,date,now).stale);
  const actionableMeetings=s.meetings.filter(m=>m.stage!=='Closed' && !s.travel.some(t=>t.id===m.travelId&&t.status==='canceled'));
  const prep=actionableMeetings.filter(m=>['Planned','Prepared'].includes(m.stage) && meetingDay(m)===date && !prepScore(m).ready);
  const notes=actionableMeetings.filter(m=>['Completed','Notes'].includes(m.stage));
  const verification=actionableMeetings.filter(m=>needsVerification(m,date,now));
  const closure=actionableMeetings.filter(m=>m.stage==='Follow-up'&&!closureBlockers(s,m).length);
  const travel=s.travel.filter(t=>['unknown','pending'].includes(t.status) && ((deadlineDay(t.scheduledAt)||t.date)===date || deadlineDay(t.due)===date || overdue(t.due,date,now)));
  const warnings=readinessWarnings(s,date,now);
  const byKey=new Map();
  function add(row) {
    const key=row.travelId&&(row.rowKind==='travel'||row.id==='confirm-'+row.travelId)?'travel:'+row.travelId:row.activityId?'activity:'+row.activityId:'action:'+row.id;
    const old=byKey.get(key);
    if(old){old.badges=[...new Set([...old.badges,...row.badges])];old.late=!!(old.late||row.late);old.priority=[old.priority,row.priority].sort()[0];if(row.warning)old.warning=row.warning;if(row.rowKind==='travel')old.rowKind='travel';}
    else byKey.set(key,row);
  }
  reminders.forEach(a=>add({...a,rowKind:a.lifecycleId?'meeting':'action',activityId:a.lifecycleId,meetingId:a.lifecycleId||a.meetingId,late:timing(a,date,now).late,badges:[...(a.status==='waiting'?['Waiting For']:[]),...(a.kind==='followup'?['后续跟进']:[]),...(timing(a,date,now).stale?['等待回复超时']:[])]}));
  function activityRow(m,badge,late=false) {
    add({id:m.sourceActionId||'activity-'+m.id,title:m.title,priority:m.priority||'P1',date:meetingDay(m),rowKind:m.travelId?'travel':'meeting',travelId:m.travelId,meetingId:m.id,activityId:m.id,badges:[badge],late});
  }
  prep.forEach(m=>activityRow(m,'准备缺项'));
  notes.forEach(m=>activityRow(m,m.stage==='Completed'?'补记成果':'复核下一步'));
  verification.forEach(m=>activityRow(m,'Needs Verification · 待核验',true));
  closure.forEach(m=>activityRow(m,'后续行动已解决，可确认关闭'));
  travel.forEach(t=>add({id:'confirm-'+t.id,title:t.title,priority:t.priority,travelId:t.id,rowKind:'travel',due:t.due,late:overdue(t.due,date,now),badges:['交通未确认']}));
  warnings.forEach(w=>add({id:w.id,title:w.title,priority:w.priority,rowKind:w.type==='travel'?'travel':'meeting',travelId:w.type==='travel'?w.recordId:undefined,meetingId:w.type==='meeting'?w.recordId:undefined,activityId:w.type==='meeting'?w.recordId:undefined,badges:['就绪预警'],warning:w}));
  const rows=[...byKey.values()];
  rows.sort((a,b)=>a.priority.localeCompare(b.priority)||Number(!!b.late)-Number(!!a.late)||deadlineInstant(a.due)-deadlineInstant(b.due)||a.id.localeCompare(b.id));
  const next=actionableMeetings.filter(m=>['meeting','visit'].includes(m.kind||'meeting') && ['Planned','Prepared'].includes(m.stage) && m.date && (m.time ? meetingInstant(m)>=(date===today(now)?+now:Date.parse(date+'T00:00+08:00')) : m.date>=date)).sort((a,b)=>(meetingDay(a)||'9999').localeCompare(meetingDay(b)||'9999')||(meetingInstant(a)??Infinity)-(meetingInstant(b)??Infinity))[0];
  return {rows,prep,notes,travel,next,warnings,verification,waiting:actions.filter(a=>a.status==='waiting'),followups:actions.filter(a=>a.kind==='followup' && (timing(a,date,now).due||timing(a,date,now).late||timing(a,date,now).stale)),overdue:rows.filter(a=>a.late)};
}
export function validateState(s) {
  if(s?.version!==1 || !Number.isInteger(s.revision) || !['actions','meetings','travel'].every(k=>Array.isArray(s[k]))) throw new Error('记录格式不受支持，请保留原备份');
  for(const collection of [s.actions,s.meetings,s.travel]) {
    const ids=new Set(); for(const r of collection) { required(r.id,'记录缺少编号'); if(ids.has(r.id)) throw new Error('记录编号重复'); ids.add(r.id); }
  }
  s.actions.forEach(a=>{required(a.title,'行动缺少标题');member(a.status,ACTION_STATES);member(a.priority,['P0','P1','P2']);validateDate(a.date);validateDeadline(a.due);validateDeadline(a.checkIn);if(a.meetingId&&!s.meetings.some(m=>m.id===a.meetingId))throw new Error('会面关联无效');if(a.lifecycleId&&!s.meetings.some(m=>m.id===a.lifecycleId&&m.sourceActionId===a.id))throw new Error('任务流程关联无效');if(a.travelId&&!s.travel.some(t=>t.id===a.travelId))throw new Error('交通关联无效');validateDate(a.requestedAt);validateDate(a.lastContact);});
  s.meetings.forEach(m=>{member(m.stage,STAGES);member(m.kind||'meeting',ACTIVITY_KINDS);if(m.travelId&&!s.travel.some(t=>t.id===m.travelId&&t.lifecycleId===m.id))throw new Error('行程流程关联无效');if(m.sourceActionId&&!s.actions.some(a=>a.id===m.sourceActionId&&a.lifecycleId===m.id))throw new Error('任务流程关联无效');validateDate(m.date);if(!Array.isArray(m.prep)||m.prep.length!==PREP.length||!m.notes||!Array.isArray(m.history))throw new Error('会面记录不完整');m.prep.forEach(p=>member(p.status,['todo','done','na']));});
  s.travel.forEach(t=>{if(t.lifecycleId&&!s.meetings.some(m=>m.id===t.lifecycleId&&m.travelId===t.id))throw new Error('行程流程关联无效');member(t.status,['unknown','pending','confirmed','canceled']);validateDate(t.date);validateDeadline(t.due);validateDeadline(t.scheduledAt);});
  return s;
}

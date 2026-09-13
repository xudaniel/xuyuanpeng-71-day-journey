// Execution records are independent of elapsed itinerary progress.
export const STAGES = ['Planned', 'Prepared', 'Completed', 'Notes', 'Follow-up', 'Closed'];
export const PREP = ['明确会面目标', '复核背景资料', '选定交流问题', '核对议程与所需材料', '复核地点及交通安排'];
export const ACTION_STATES = ['open', 'active', 'waiting', 'completed', 'canceled'];
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
  return {targetLate, checkLate, late:!!(targetLate || checkLate), due:deadlineDay(reminder) === date};
}
export function prepScore(m) {
  const applicable = m.prep.filter(p => p.status !== 'na');
  const done = applicable.filter(p => p.status === 'done').length;
  return {done, total:applicable.length, percent:applicable.length ? Math.round(done/applicable.length*100) : null, ready:applicable.length ? done === applicable.length : !!m.readiness, missing:applicable.filter(p => p.status !== 'done').map(p => p.title)};
}
export const newMeeting = (id, data = {}) => ({id, title:'', city:'', date:'', time:'', zone:'Asia/Shanghai', location:'', contact:'', priority:'P1', stage:'Planned', prep:PREP.map(title => ({title, status:'todo', note:''})), readiness:false, notes:{summary:'', statements:'', observations:'', judgments:'', references:''}, history:[], ...data});
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
  return {version:1, revision:0, actions:[], meetings, travel};
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
  return a;
}
export function putMeeting(s, input, now = new Date()) {
  const old = s.meetings.find(m=>m.id===input.id);
  const m = old || newMeeting(input.id);
  required(input.title,'请填写会面名称'); validateDate(input.date);
  member(input.priority || 'P1',['P0','P1','P2']);m.priority=input.priority || 'P1';
  if (input.time && (!input.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))) throw new Error('请填写日期及有效时间');
  new Intl.DateTimeFormat('en',{timeZone:input.zone || 'Asia/Shanghai'});
  for (const k of ['title','city','date','time','zone','location','contact']) m[k]=input[k] || '';
  if (!old) s.meetings.push(m);
  history(m,m.stage,m.stage,'更新会面安排',now);
  return m;
}
export function setPrep(s, id, items, readiness, now = new Date()) {
  const m=s.meetings.find(m=>m.id===id);
  if (!m || items.length !== PREP.length) throw new Error('准备清单不完整');
  items.forEach(p=> { member(p.status,['todo','done','na']); if(p.status==='na') required(p.note,'不适用项目须填写原因'); });
  m.prep=items.map((p,i)=>({...p,title:PREP[i]})); m.readiness=!!readiness;
  if (m.stage==='Prepared' && !prepScore(m).ready) { history(m,'Prepared','Planned','准备项目重新打开',now); m.stage='Planned'; }
}
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
    const blockers=s.actions.filter(a=>a.meetingId===id && isOpen(a));
    if(blockers.length) throw new Error('尚有未解决行动：'+blockers.map(a=>a.title).join('、'));
    if (!s.actions.some(a=>a.meetingId===id) && !m.noFollowup) throw new Error('请先记录无需跟进的原因');
  }
  if(target==='Completed') m.actualAt=input.actualAt;
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
  return t;
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
  const reminders=actions.filter(a=>a.date===date || timing(a,date,now).due || timing(a,date,now).late);
  const actionableMeetings=s.meetings.filter(m=>m.stage!=='Closed');
  const prep=actionableMeetings.filter(m=>['Planned','Prepared'].includes(m.stage) && meetingDay(m)===date && !prepScore(m).ready);
  const notes=actionableMeetings.filter(m=>['Completed','Notes'].includes(m.stage));
  const travel=s.travel.filter(t=>['unknown','pending'].includes(t.status) && ((deadlineDay(t.scheduledAt)||t.date)===date || deadlineDay(t.due)===date || overdue(t.due,date,now)));
  const rows=[...reminders.map(a=>({...a,rowKind:'action',late:timing(a,date,now).late})),...prep.map(m=>({id:'prep-'+m.id,title:'准备：'+m.title,priority:m.priority||'P1',date:meetingDay(m),rowKind:'meeting',meetingId:m.id})),...notes.map(m=>({id:'notes-'+m.id,title:(m.stage==='Completed'?'补记成果：':'复核下一步：')+m.title,priority:m.priority||'P1',rowKind:'meeting',meetingId:m.id}))];
  travel.filter(t=>!rows.some(a=>a.travelId===t.id)).forEach(t=>rows.push({id:'confirm-'+t.id,title:t.nextAction,priority:t.priority,travelId:t.id,rowKind:'travel',due:t.due,late:overdue(t.due,date,now)}));
  rows.sort((a,b)=>a.priority.localeCompare(b.priority)||Number(!!b.late)-Number(!!a.late)||deadlineInstant(a.due)-deadlineInstant(b.due)||a.id.localeCompare(b.id));
  const next=actionableMeetings.filter(m=>['Planned','Prepared'].includes(m.stage) && m.date && (m.time ? meetingInstant(m)>=(date===today(now)?+now:Date.parse(date+'T00:00+08:00')) : m.date>=date)).sort((a,b)=>(meetingDay(a)||'9999').localeCompare(meetingDay(b)||'9999')||(meetingInstant(a)??Infinity)-(meetingInstant(b)??Infinity))[0];
  return {rows,prep,notes,travel,next,waiting:actions.filter(a=>a.status==='waiting'),followups:actions.filter(a=>a.kind==='followup' && (timing(a,date,now).due||timing(a,date,now).late)),overdue:rows.filter(a=>a.late)};
}
export function validateState(s) {
  if(s?.version!==1 || !Number.isInteger(s.revision) || !['actions','meetings','travel'].every(k=>Array.isArray(s[k]))) throw new Error('记录格式不受支持，请保留原备份');
  for(const collection of [s.actions,s.meetings,s.travel]) {
    const ids=new Set(); for(const r of collection) { required(r.id,'记录缺少编号'); if(ids.has(r.id)) throw new Error('记录编号重复'); ids.add(r.id); }
  }
  s.actions.forEach(a=>{required(a.title,'行动缺少标题');member(a.status,ACTION_STATES);member(a.priority,['P0','P1','P2']);validateDate(a.date);validateDeadline(a.due);validateDeadline(a.checkIn);if(a.meetingId&&!s.meetings.some(m=>m.id===a.meetingId))throw new Error('会面关联无效');});
  s.meetings.forEach(m=>{member(m.stage,STAGES);validateDate(m.date);if(!Array.isArray(m.prep)||m.prep.length!==PREP.length||!m.notes||!Array.isArray(m.history))throw new Error('会面记录不完整');m.prep.forEach(p=>member(p.status,['todo','done','na']));});
  s.travel.forEach(t=>{member(t.status,['unknown','pending','confirmed','canceled']);validateDate(t.date);validateDeadline(t.due);validateDeadline(t.scheduledAt);});
  return s;
}

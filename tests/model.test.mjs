import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../app/model.mjs';
const now=new Date('2026-09-22T10:00:00+08:00');
const blank=()=>({version:1,revision:0,actions:[],meetings:[],travel:[]});
const action=(id,extra={})=>({id,title:id,priority:'P1',status:'open',...extra});
function meetingState(){const s=blank();s.meetings.push(M.newMeeting('m',{title:'Synthetic meeting',date:'2026-09-22',time:'14:00'}));return s;}
test('daily priority queue includes due/overdue and counts one waiting follow-up once',()=>{
  const s=meetingState();
  M.putAction(s,action('urgent',{priority:'P0',date:'2026-09-22'}),now);
  M.putAction(s,action('late',{priority:'P1',due:'2026-09-21'}),now);
  M.putAction(s,action('wait',{kind:'followup',meetingId:'m',owner:'Me',status:'waiting',due:'2026-09-23',waitingOn:'Team',expected:'Material',checkIn:'2026-09-22'}),now);
  M.putAction(s,action('future',{due:'2026-09-24'}),now);
  M.putAction(s,action('undated'),now);
  let d=M.dashboard(s,'2026-09-22',now);
  const taskRows=d.rows.filter(r=>r.rowKind==='action');assert.equal(taskRows[0].id,'urgent');assert.equal(taskRows[1].id,'late');assert.equal(d.rows.filter(r=>r.id==='wait').length,1);
  assert.equal(d.waiting.length,1);assert.equal(d.followups.length,1);assert.equal(d.overdue.length,1);assert.equal(d.next.id,'m');
  assert.ok(!d.rows.some(r=>['future','undated'].includes(r.id)));
  M.putAction(s,{...s.actions.find(a=>a.id==='wait'),checkIn:'2026-09-25'},now);
  assert.equal(M.dashboard(s,'2026-09-22',now).followups.length,0);
});
test('date-only deadlines, timed offsets, and original waiting deadlines are distinct',()=>{
  assert.equal(M.overdue('2026-09-22','2026-09-22',now),false);
  assert.equal(M.overdue('2026-09-21','2026-09-22',now),true);
  assert.equal(M.overdue('2026-09-22T09:00+08:00','2026-09-22',now),true);
  assert.equal(M.overdue('2026-09-22T10:01+08:00','2026-09-22',now),false);
  assert.equal(M.deadlineDay('2026-09-23T00:30+09:00'),'2026-09-22');
  const t=M.timing({status:'waiting',due:'2026-09-21',checkIn:'2026-09-24'},'2026-09-22',now);
  assert.equal(t.targetLate,true);assert.equal(t.checkLate,false);assert.equal(t.late,true);
  assert.equal(M.overdue('','2026-09-22',now),false);
});
test('action evidence, Waiting For fields and completion are enforced',()=>{
  const s=blank();assert.throws(()=>M.putAction(s,action('a',{status:'waiting'}),now),/等待谁/);
  assert.throws(()=>M.putAction(s,action('a',{status:'completed'}),now),/确认/);
  assert.throws(()=>M.putAction(s,action('a',{due:'not a date'}),now),/日期|时区/);
  M.putAction(s,action('a',{due:'2026-09-21'}),now);
  M.putAction(s,{...s.actions[0],status:'completed',evidence:'Delivered'},now);
  assert.equal(M.dashboard(s,'2026-09-22',now).rows.length,0);
  M.putAction(s,{...s.actions[0],status:'open'},now);
  assert.equal(s.actions.length,1);assert.equal(M.dashboard(s,'2026-09-22',now).rows.length,1);
});
test('prep calculations and invalidated readiness preserve actual completion',()=>{
  const s=meetingState(),m=s.meetings[0];
  const p=m.prep.map((p,i)=>({...p,status:i===4?'todo':'done'}));M.setPrep(s,'m',p,false,now);
  assert.equal(M.prepScore(m).percent,80);assert.equal(M.prepScore(m).missing.length,1);
  assert.throws(()=>M.transition(s,'m','Prepared',{},now),/准备/);
  p[4].status='done';M.setPrep(s,'m',p,false,now);M.transition(s,'m','Prepared',{},now);
  p[4].status='todo';M.setPrep(s,'m',p,false,now);assert.equal(m.stage,'Planned');
  M.transition(s,'m','Completed',{actualAt:'2026-09-22T09:00+08:00',reason:'Late entry'},now);
  M.setPrep(s,'m',p,false,now);assert.equal(m.stage,'Completed');
  const allNA=p.map(p=>({...p,status:'na',note:'Not applicable'}));M.setPrep(s,'m',allNA,false,now);
  assert.equal(M.prepScore(m).percent,null);assert.equal(M.prepScore(m).ready,false);
  M.setPrep(s,'m',allNA,true,now);assert.equal(M.prepScore(m).ready,true);
  allNA[0].note='';assert.throws(()=>M.setPrep(s,'m',allNA,true,now),/原因/);
});
test('full lifecycle blocks closure, preserves records and reopens on action changes',()=>{
  const s=meetingState(),m=s.meetings[0];
  M.setPrep(s,'m',m.prep.map(p=>({...p,status:'done'})),false,now);M.transition(s,'m','Prepared',{},now);
  M.transition(s,'m','Completed',{actualAt:'2026-09-22T09:00+08:00'},now);
  assert.throws(()=>M.transition(s,'m','Notes',{},now),/成果/);
  M.saveNotes(s,'m',{summary:'Actual outcome',statements:'Statement',observations:'Observation',judgments:'Judgment'},now);M.transition(s,'m','Notes',{},now);
  M.putAction(s,action('f1',{kind:'followup',meetingId:'m',owner:'Me',due:'2026-09-23'}),now);
  M.putAction(s,action('f2',{kind:'followup',meetingId:'m',owner:'Me',due:'2026-09-23',status:'waiting',waitingOn:'Team',expected:'Slides',checkIn:'2026-09-23'}),now);
  M.transition(s,'m','Follow-up',{},now);assert.throws(()=>M.transition(s,'m','Closed',{},now),/f1、f2/);
  for(const a of [...s.actions])M.putAction(s,{...a,status:'completed',evidence:'Received'},now);
  assert.equal(m.stage,'Follow-up');M.transition(s,'m','Closed',{},now);
  M.putAction(s,{...s.actions[0],status:'open'},now);assert.equal(m.stage,'Follow-up');assert.equal(m.notes.summary,'Actual outcome');assert.equal(s.actions.length,2);
});
test('no-follow-up and unprepared occurrence require explicit records',()=>{
  const s=meetingState();assert.throws(()=>M.transition(s,'m','Completed',{actualAt:'2026-09-22T09:00+08:00'},now),/原因/);
  assert.throws(()=>M.transition(s,'m','Completed',{reason:'late',actualAt:'2026-09-23T09:00+08:00'},now),/不能晚于现在/);
  M.transition(s,'m','Completed',{reason:'Late entry',actualAt:'2026-09-22T09:00+08:00'},now);
  M.saveNotes(s,'m',{summary:'Recorded'},now);M.transition(s,'m','Notes',{},now);
  assert.throws(()=>M.transition(s,'m','Follow-up',{},now),/无需跟进/);
  M.transition(s,'m','Follow-up',{noFollowup:'Informational visit'},now);M.transition(s,'m','Closed',{},now);
  M.transition(s,'m','Follow-up',{reason:'Reopened'},now);assert.equal(s.meetings[0].stage,'Follow-up');
});
test('travel stays Unknown until confirmed; confirmation actions are stable and atomic',()=>{
  const s=blank();let t={id:'t',title:'Synthetic train',type:'transport',date:'2026-09-25',scheduledAt:'2026-09-25T10:00+09:00',zone:'Asia/Tokyo',status:'unknown',due:'2026-09-22',nextAction:'Confirm ticket',priority:'P0'};
  M.putTravel(s,t,now);assert.equal(s.actions.length,1);assert.equal(M.dashboard(s,'2026-09-22',now).travel.length,1);assert.equal(M.dashboard(s,'2026-09-22',now).rows.length,1);
  assert.throws(()=>M.putAction(s,{...s.actions[0],status:'completed',evidence:'Done'},now),/交通卡/);
  assert.throws(()=>M.putTravel(s,{...t,status:'confirmed'},now),/确认记录/);
  t=M.putTravel(s,{...t,status:'confirmed',reference:'Verified ticket'},now);assert.equal(s.actions[0].status,'completed');assert.equal(M.dashboard(s,'2026-09-22',now).travel.length,0);
  M.putTravel(s,{...t,status:'pending',reference:''},now);assert.equal(s.actions.length,1);assert.equal(s.actions[0].status,'open');
  M.putTravel(s,{...t,status:'canceled',reference:'Route changed'},now);assert.equal(s.actions[0].status,'canceled');
});
test('seed data never claims execution or bookings and does not invent uncertain meeting dates',()=>{
  const s=M.initialState([{start:'2026-09-07',end:'2026-09-10',city:'上海'}]);
  assert.ok(s.meetings.every(m=>m.stage==='Planned'));assert.ok(s.travel.every(t=>t.status==='unknown'));assert.equal(s.actions.length,0);
  assert.equal(s.meetings.find(m=>m.doc==='bateng').date,'');assert.equal(s.meetings.find(m=>m.doc==='tencent').date,'2026-09-22');
  assert.equal(M.validateState(s),s);
});
test('meeting times use their IANA zone, not device timezone',()=>{
  assert.equal(M.meetingInstant({date:'2026-09-22',time:'14:00',zone:'Asia/Shanghai'}),Date.parse('2026-09-22T06:00Z'));
  assert.equal(M.meetingDay({date:'2026-09-23',time:'00:30',zone:'Asia/Tokyo'}),'2026-09-22');
  assert.equal(M.meetingInstant({date:'2026-09-22',time:'14:00',zone:'America/Toronto'}),Date.parse('2026-09-22T18:00Z'));
});

test('24/72 hour readiness warnings have exact boundaries and do not rewrite priorities',()=>{
  const s=meetingState(),m=s.meetings[0];
  const at=hours=>{const instant=new Date(+now+hours*3600000);m.date=M.today(instant);m.time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant);};
  at(24);assert.equal(M.readinessWarnings(s,'2026-09-22',now)[0].priority,'P0');
  at(24+1/60);assert.equal(M.readinessWarnings(s,'2026-09-22',now)[0].priority,'P1');
  at(72);assert.equal(M.readinessWarnings(s,'2026-09-22',now)[0].priority,'P1');
  at(72+1/60);assert.equal(M.readinessWarnings(s,'2026-09-22',now).length,0);
  at(-1);assert.equal(M.readinessWarnings(s,'2026-09-22',now).length,0);
  at(2);M.dashboard(s,'2026-09-22',now);assert.equal(m.priority,'P1');
  m.time='';assert.equal(M.readinessWarnings(s,'2026-09-22',now)[0].priority,'P0');
  m.date='';assert.equal(M.readinessWarnings(s,'2026-09-22',now).length,0);
});
test('information completeness never substitutes for explicit preparation review',()=>{
  const s=meetingState(),m=s.meetings[0];m.location='Room';m.contact='Host';
  const data=Object.fromEntries(M.MEETING_READINESS.map(([key])=>[key,key.endsWith('Confirmed')?true:'Reviewed information']));
  M.saveReadiness(s,'meetings','m',data,now);
  assert.equal(M.readinessScore(m).percent,100);assert.equal(M.prepScore(m).percent,0);
  assert.throws(()=>M.transition(s,'m','Prepared',{},now),/准备/);
  assert.equal(M.readinessWarnings(s,'2026-09-22',now).length,0);
  M.putMeeting(s,{...m,location:'Changed venue'},now);
  assert.ok(M.readinessScore(m).critical.includes('地点／会议链接已确认'));
  assert.throws(()=>M.saveReadiness(s,'meetings','m',{objectiveNA:true},now),/原因/);
});
test('travel readiness uses confirmation evidence and stored timing, with explicit N/A rules',()=>{
  const s=blank();const t=M.putTravel(s,{id:'t',title:'Train',type:'transport',date:'2026-09-22',scheduledAt:'2026-09-22T15:00+08:00',zone:'Asia/Shanghai',status:'unknown',due:'',nextAction:'Book',priority:'P2'},now);
  M.saveReadiness(s,'travel','t',Object.fromEntries(M.TRAVEL_READINESS.map(([key])=>[key,'Information'])),now);
  assert.deepEqual(M.readinessScore(t,'travel').missing,['交通票务已确认']);
  const confirmed=M.putTravel(s,{...t,status:'confirmed',reference:'Ticket receipt'},now);
  assert.equal(M.readinessScore(confirmed,'travel').ready,true);
  M.saveReadiness(s,'travel','t',{terminalNA:true,terminalReason:'Door-to-door transfer'},now);
  assert.equal(M.readinessScore(confirmed,'travel').total,8);
  assert.ok(!M.readinessScore(confirmed,'travel').missing.includes('出发航站楼／车站'));
});
test('readiness, preparation and travel alerts share one row; independent tasks remain separate',()=>{
  const s=meetingState();let d=M.dashboard(s,'2026-09-22',now);
  assert.equal(d.rows.length,1);assert.ok(d.rows[0].badges.includes('准备缺项'));assert.ok(d.rows[0].badges.includes('就绪预警'));
  M.putTravel(s,{id:'t',title:'Train',type:'transport',date:'2026-09-22',zone:'Asia/Shanghai',status:'unknown',due:'2026-09-21',nextAction:'Book',priority:'P2'},now);
  M.putAction(s,action('pack',{travelId:'t',date:'2026-09-22'}),now);
  d=M.dashboard(s,'2026-09-22',now);
  assert.equal(d.rows.filter(r=>r.id==='pack').length,1);
  assert.equal(d.rows.filter(r=>r.travelId==='t'&&r.id!=='pack').length,1);
  assert.equal(s.travel[0].priority,'P2');assert.equal(s.actions.find(a=>a.id==='confirm-t').priority,'P2');
});
test('stale waiting reminders and original deadline surface independently of a later check-in',()=>{
  const s=blank();M.putAction(s,action('w',{status:'waiting',waitingOn:'Host',expected:'Reply',due:'2026-09-22',checkIn:'2026-09-30',requestedAt:'2026-09-15',staleDays:'3'}),now);
  assert.equal(M.dashboard(s,'2026-09-22',now).rows.length,1);
  assert.equal(M.timing(s.actions[0],'2026-09-22',now).due,true);
  assert.equal(M.timing(s.actions[0],'2026-09-22',now).stale,true);
  M.putAction(s,{...s.actions[0],due:'',lastContact:'2026-09-22'},now);
  assert.equal(M.dashboard(s,'2026-09-22',now).rows.length,0);
  assert.throws(()=>M.putAction(s,{...s.actions[0],staleDays:'1.5'},now),/天数/);
});
test('elapsed activities require verification without fabricating completion or notes',()=>{
  const s=meetingState(),m=s.meetings[0];m.date='2026-09-21';
  const d=M.dashboard(s,'2026-09-22',now);assert.equal(d.verification.length,1);assert.equal(d.rows.length,1);
  assert.equal(m.stage,'Planned');assert.equal(m.actualAt,undefined);assert.equal(m.history.length,0);
  M.transition(s,'m','Completed',{actualAt:'2026-09-21T14:00+08:00',reason:'Verified'},now);
  assert.equal(M.dashboard(s,'2026-09-22',now).verification.length,0);assert.equal(M.dashboard(s,'2026-09-22',now).notes.length,1);
});
test('task lifecycle preserves one source task and reopens on source or follow-up changes',()=>{
  const s=blank();M.putAction(s,action('a',{date:'2026-09-22'}),now);
  const m=M.enableLifecycle(s,'actions','a',now);
  assert.equal(M.enableLifecycle(s,'actions','a',now).id,m.id);assert.equal(s.meetings.length,1);
  assert.equal(M.dashboard(s,'2026-09-22',now).rows.length,1);
  M.transition(s,m.id,'Completed',{actualAt:'2026-09-22T09:00+08:00',reason:'Recorded'},now);
  assert.equal(s.actions[0].status,'completed');
  M.saveNotes(s,m.id,{summary:'Task result'},now);M.transition(s,m.id,'Notes',{},now);
  M.transition(s,m.id,'Follow-up',{noFollowup:'No obligations'},now);M.transition(s,m.id,'Closed',{},now);
  M.putAction(s,{...s.actions[0],status:'open'},now);assert.equal(m.stage,'Follow-up');
  assert.throws(()=>M.transition(s,m.id,'Closed',{},now),/未解决/);
  M.putAction(s,{...s.actions[0],status:'completed',evidence:'Resolved'},now);M.transition(s,m.id,'Closed',{},now);
  assert.equal(m.notes.summary,'Task result');assert.equal(s.actions.length,1);M.validateState(s);
});
test('travel lifecycle retains actual completion separately from booking confirmation and blocks unfinished bookings',()=>{
  const s=blank();const t=M.putTravel(s,{id:'t',title:'Train',type:'transport',date:'2026-09-22',zone:'Asia/Shanghai',status:'unknown',due:'',nextAction:'Book',priority:'P1'},now);
  const m=s.meetings.find(m=>m.id===t.lifecycleId);assert.equal(m.stage,'Planned');
  M.transition(s,m.id,'Completed',{actualAt:'2026-09-22T09:00+08:00',reason:'Actual travel'},now);
  assert.equal(t.status,'unknown');M.saveNotes(s,m.id,{summary:'Arrived'},now);M.transition(s,m.id,'Notes',{},now);
  M.transition(s,m.id,'Follow-up',{noFollowup:'No further follow-up'},now);
  assert.throws(()=>M.transition(s,m.id,'Closed',{},now),/未解决/);
  M.putTravel(s,{...t,status:'confirmed',reference:'Confirmed receipt'},now);M.transition(s,m.id,'Closed',{},now);
  assert.equal(M.readinessWarnings(s,'2026-09-22',now).length,0);M.validateState(s);
});
test('existing encrypted schema migrates idempotently and never infers travel execution',()=>{
  const old=blank();old.travel.push({id:'t',title:'Old travel',type:'transport',date:'2026-09-01',status:'confirmed',priority:'P1'});
  const s=M.migrateState(old);assert.equal(s.meetings.length,1);assert.equal(s.meetings[0].stage,'Planned');
  assert.equal(M.migrateState(s).meetings.length,1);assert.equal(old.meetings.length,0);M.validateState(s);
});

test('reopening travel confirmation or adding travel work reopens a closed lifecycle',()=>{
  const s=blank();let t=M.putTravel(s,{id:'t',title:'Train',type:'transport',date:'2026-09-22',zone:'Asia/Shanghai',status:'confirmed',reference:'Receipt',due:'',nextAction:'Book',priority:'P1'},now);
  const m=s.meetings.find(m=>m.id===t.lifecycleId);
  M.transition(s,m.id,'Completed',{actualAt:'2026-09-22T09:00+08:00',reason:'Actual travel'},now);M.saveNotes(s,m.id,{summary:'Arrived'},now);M.transition(s,m.id,'Notes',{},now);M.transition(s,m.id,'Follow-up',{noFollowup:'Resolved'},now);M.transition(s,m.id,'Closed',{},now);
  t=M.putTravel(s,{...t,status:'pending'},now);assert.equal(m.stage,'Follow-up');
  t=M.putTravel(s,{...t,status:'confirmed'},now);M.transition(s,m.id,'Closed',{},now);
  M.putAction(s,action('receipt',{travelId:'t'}),now);assert.equal(m.stage,'Follow-up');assert.equal(m.notes.summary,'Arrived');
});
test('unmodified imported travel cannot close with unknown booking status',()=>{
  const s=M.initialState([{start:'2026-09-21',end:'2026-09-21',city:'Synthetic city'}]);const t=s.travel[0],m=s.meetings.find(m=>m.id===t.lifecycleId);
  M.transition(s,m.id,'Completed',{actualAt:'2026-09-21T09:00+08:00',reason:'Actual travel'},now);M.saveNotes(s,m.id,{summary:'Arrived'},now);M.transition(s,m.id,'Notes',{},now);M.transition(s,m.id,'Follow-up',{noFollowup:'No follow-up'},now);
  assert.throws(()=>M.transition(s,m.id,'Closed',{},now),/尚未确认/);
});

test('dashboard sample derives two P0, three P1, one overdue and a 14:00 next meeting from records',()=>{
  const s=meetingState(),m=s.meetings[0];m.location='Room';m.contact='Host';
  M.setPrep(s,m.id,m.prep.map(p=>({...p,status:'done'})),false,now);
  M.saveReadiness(s,'meetings',m.id,Object.fromEntries(M.MEETING_READINESS.map(([key])=>[key,key.endsWith('Confirmed')?true:'Information'])),now);
  for(let i=0;i<5;i++)M.putAction(s,action('sample-'+i,{priority:i<2?'P0':'P1',date:'2026-09-22',due:i===2?'2026-09-21':''}),now);
  const d=M.dashboard(s,'2026-09-22',now);assert.equal(d.rows.length,5);assert.equal(d.rows.filter(a=>a.priority==='P0').length,2);assert.equal(d.rows.filter(a=>a.priority==='P1').length,3);assert.equal(d.overdue.length,1);assert.equal(d.next.time,'14:00');
});

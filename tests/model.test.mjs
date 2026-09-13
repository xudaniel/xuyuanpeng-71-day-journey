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
  assert.equal(d.rows[0].id,'urgent');assert.equal(d.rows[1].id,'late');assert.equal(d.rows.filter(r=>r.id==='wait').length,1);
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

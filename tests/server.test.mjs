import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAPI} from '../server/worker.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(x=>x.endsWith('.sql')))db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 function statement(sql,values=[]){return {
 bind(...args){return statement(sql,args);},
 async first(){return db.prepare(sql).get(...values)||null;},
 async all(){return {results:db.prepare(sql).all(...values)};},
 async run(){return db.prepare(sql).run(...values);}
 };}
 const DB={prepare:statement};
 const env={DB,JOURNEY_OWNER_EMAIL:'owner@example.com',JOURNEY_ORIGIN:'https://journey.example'};
 const data={city:'上海',dateLabel:'9月7日',summary:'会面',note:'Private note',verified:false};
 async function call(path,options={}){const {email='owner@example.com',id='owner-id',method='GET',payload,origin='https://journey.example'}=options;const headers={'Content-Type':'application/json','X-Journey-Request':'1',Origin:origin};if(email){headers['oai-authenticated-user-email']=email;headers['oai-authenticated-user-id']=id;}return handleAPI(new Request('https://journey.example'+path,{method,headers,...(payload?{body:JSON.stringify(payload)}:{})}),env);}
 return {call,data,db};
}
test('anonymous and unapproved visitors cannot read or write private data',async()=>{const {call,data}=fixture();assert.equal((await call('/api/state',{email:null})).status,401);assert.equal((await call('/api/state',{email:'stranger@example.com'})).status,403);assert.equal((await call('/api/stage',{email:'stranger@example.com',method:'POST',payload:{stage:'2026-09-07',expectedRevision:0,data}})).status,403);});
test('owner grants editor access, edits sync, revoked access fails',async()=>{const {call,data}=fixture();assert.equal((await call('/api/members',{method:'POST',payload:{email:'assistant@example.com'}})).status,200);assert.equal((await call('/api/stage',{email:'assistant@example.com',id:'assistant-id',method:'POST',payload:{stage:'2026-09-07',expectedRevision:0,data}})).status,200);const state=await (await call('/api/state')).json();assert.equal(state.stages[0].data.note,'Private note');assert.equal(state.stages[0].actor_id,'assistant-id');assert.equal((await call('/api/members',{email:'assistant@example.com'})).status,403);await call('/api/members',{method:'DELETE',payload:{email:'assistant@example.com'}});assert.equal((await call('/api/state',{email:'assistant@example.com'})).status,403);});
test('stale revisions cannot overwrite newer edits; undo preserves history',async()=>{const {call,data}=fixture();const write=(version,note)=>call('/api/stage',{method:'POST',payload:{stage:'2026-09-07',expectedRevision:version,data:{...data,note}}});assert.equal((await write(0,'first')).status,200);assert.equal((await write(0,'stale')).status,409);assert.equal((await write(1,'second')).status,200);const undo=await call('/api/stage',{method:'POST',payload:{stage:'2026-09-07',expectedRevision:2,restoreRevision:1}});assert.equal(undo.status,200);assert.equal((await undo.json()).stage.data.note,'first');const history=await (await call('/api/history?stage=2026-09-07')).json();assert.equal(history.history.length,3);assert.equal(history.history[1].data.note,'second');});
test('cross-origin writes and malformed input are rejected',async()=>{const {call,data}=fixture();assert.equal((await call('/api/stage',{method:'POST',origin:'https://attacker.example',payload:{stage:'2026-09-07',expectedRevision:0,data}})).status,403);for(const payload of [{stage:'invalid',expectedRevision:0,data},{stage:'2026-09-07',expectedRevision:0,data:{...data,note:'x'.repeat(5001)}},{stage:'2026-09-07',expectedRevision:-1,data}])assert.equal((await call('/api/stage',{method:'POST',payload})).status,400);});
test('responses do not permit private caching',async()=>{const {call}=fixture();const response=await call('/api/state');assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);});

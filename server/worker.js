import {publicAssets} from './assets.generated.js';
const STAGES=new Set(['2026-08-25','2026-09-06','2026-09-07','2026-09-11','2026-09-12','2026-09-13','2026-09-15','2026-09-21','2026-09-30','2026-10-05','2026-10-08','2026-10-17','2026-10-23','2026-10-25','2026-10-27','2026-10-29','2026-11-03']);
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});}
async function identity(request,env){
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.toLowerCase();
 if(!id||!email)return null;
 const owner=env.JOURNEY_OWNER_EMAIL?.toLowerCase();
 const role=owner&&email===owner?'owner':await env.DB.prepare('SELECT email FROM members WHERE email = ?').bind(email).first()?'editor':'visitor';
 return {id,email,role};
}
function validateData(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const limits={city:200,dateLabel:200,summary:1000,note:5000};const out={};
 for(const [key,max] of Object.entries(limits)){if(typeof data[key]!=='string'||data[key].length>max)return null;out[key]=data[key];}
 if(!out.city.trim()||!out.summary.trim()||!out.dateLabel.trim()||typeof data.verified!=='boolean')return null;
 out.verified=data.verified;return out;
}
async function body(request){if(Number(request.headers.get('content-length'))>20000)throw new Error('large');const raw=await request.text();if(raw.length>20000)throw new Error('large');return JSON.parse(raw);}
const revisionRow=row=>({...row,data:JSON.parse(row.data)});
export async function handleAPI(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!env.DB||!env.JOURNEY_OWNER_EMAIL)return json({error:'共享空间尚未配置完成'},503);
 if(!['GET','POST','DELETE'].includes(request.method))return json({error:'不支持的方法'},405);
 const user=await identity(request,env);
 if(path==='/api/session'&&request.method==='GET')return json({user,signIn:'/signin-with-chatgpt?return_to=%2Fshared.html'});
 if(!user)return json({error:'请先登录'},401);
 if(user.role==='visitor')return json({error:'请让行程所有者将您的登录邮箱加入协作名单'},403);
 if(request.method!=='GET'){
  const origin=env.JOURNEY_ORIGIN||url.origin;
  if(request.headers.get('Origin')!==origin||request.headers.get('X-Journey-Request')!=='1'||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请求来源不受信任'},403);
 }
 if(path==='/api/state'&&request.method==='GET'){
  const {results}=await env.DB.prepare('SELECT r.* FROM revisions r WHERE r.revision = (SELECT MAX(s.revision) FROM revisions s WHERE s.stage = r.stage)').all();
  return json({stages:results.map(revisionRow)});
 }
 if(path==='/api/history'&&request.method==='GET'){
  const stage=url.searchParams.get('stage');if(!STAGES.has(stage))return json({error:'无效阶段'},400);
  const {results}=await env.DB.prepare('SELECT * FROM revisions WHERE stage = ? ORDER BY revision DESC LIMIT 50').bind(stage).all();return json({history:results.map(revisionRow)});
 }
 if(path==='/api/stage'&&request.method==='POST'){
  let input;try{input=await body(request);}catch{return json({error:'无效内容或内容过长'},400);}
  if(!STAGES.has(input.stage)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)return json({error:'无效阶段或版本'},400);
  let data=validateData(input.data),action='update';
  if(input.restoreRevision!==undefined){
   if(!Number.isSafeInteger(input.restoreRevision)||input.restoreRevision<1)return json({error:'无效历史版本'},400);
   const old=await env.DB.prepare('SELECT data FROM revisions WHERE stage = ? AND revision = ?').bind(input.stage,input.restoreRevision).first();
   if(!old)return json({error:'历史版本不存在'},404);data=validateData(JSON.parse(old.data));action=`restore:${input.restoreRevision}`;
  }
  if(!data)return json({error:'请填写地点、日期显示、核心安排与有效备注'},400);
  const row=await env.DB.prepare('INSERT INTO revisions (id, stage, revision, data, actor_id, actor_email, created_at, action) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT MAX(revision) FROM revisions WHERE stage = ?), 0) = ? RETURNING *').bind(crypto.randomUUID(),input.stage,input.expectedRevision+1,JSON.stringify(data),user.id,user.email,new Date().toISOString(),action,input.stage,input.expectedRevision).first();
  return row?json({stage:revisionRow(row)}):json({error:'该阶段已被其他设备更新。您的输入已保留，请先查看最新版本。'},409);
 }
 if(path==='/api/members'){
  if(user.role!=='owner')return json({error:'只有行程所有者可以管理协作者'},403);
  if(request.method==='GET'){const {results}=await env.DB.prepare('SELECT email, created_at FROM members ORDER BY email').all();return json({members:results});}
  let input;try{input=await body(request);}catch{return json({error:'无效邮箱'},400);}
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||email===env.JOURNEY_OWNER_EMAIL.toLowerCase())return json({error:'请输入协作者的有效邮箱'},400);
  if(request.method==='POST')await env.DB.prepare('INSERT OR IGNORE INTO members (email, added_by, created_at) VALUES (?, ?, ?)').bind(email,user.id,new Date().toISOString()).run();
  else await env.DB.prepare('DELETE FROM members WHERE email = ?').bind(email).run();
  return json({ok:true});
 }
 return json({error:'未找到接口'},404);
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/')){try{return await handleAPI(request,env);}catch(error){console.error('Journey API failed',error?.name);return json({error:'暂时无法保存，请保留输入并稍后重试'},500);}}
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1),asset=publicAssets[name];
 if(!asset)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':name==='shared.html'?'private, no-store':'no-cache','X-Content-Type-Options':'nosniff'}});
}};

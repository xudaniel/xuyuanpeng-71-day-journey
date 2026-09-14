const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),publicGate=fs.readFileSync(root+'/index.html','utf8'),gate=fs.readFileSync(root+'/private.html','utf8');
const envelope=JSON.parse(publicGate.match(/<script id="sharePayload" type="application\/json">([\s\S]*?)<\/script>/)[1]);
if(!process.env.PUBLIC_SHARE_PASSWORD)throw Error('Set PUBLIC_SHARE_PASSWORD to test the encrypted public itinerary.');
const data=Buffer.from(envelope.payload,'base64');
const decipher=crypto.createDecipheriv('aes-256-gcm',crypto.pbkdf2Sync(process.env.PUBLIC_SHARE_PASSWORD,Buffer.from(envelope.salt,'base64'),envelope.iterations,32,'sha256'),Buffer.from(envelope.iv,'base64'));
decipher.setAuthTag(data.subarray(-16));
const publicHtml=Buffer.concat([decipher.update(data.subarray(0,-16)),decipher.final()]).toString('utf8');
const parse=html=>JSON.parse(html.match(/const itinerary\s*=\s*(\[[\s\S]*?\n\s*\]);/)[1]);
const revised=parse(publicHtml);
const script=gate.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(){
 const s=revised.find(s=>s.start==='2026-09-13');
 const stages=[...revised.filter(s=>s.end<'2026-09-13'),
 {...s,end:'2026-09-29',details:['保留深圳内部会面资料','9月30日从深圳前往江西抚州']},
 {...s,start:'2026-09-30',end:'2026-10-04',city:'抚州',details:['取消的私人安排']},
 {...s,start:'2026-10-05',end:'2026-10-07',city:'南京',details:['取消的私人安排']},
 {...s,start:'2026-10-08',end:'2026-10-16',details:['保留十月深圳内部会面资料','10月17日前往香港']},
 {...s,start:'2026-10-17',end:'2026-10-22',city:'香港',details:['取消的香港会面']},
 ...revised.filter(s=>s.start>='2026-10-23')];
 return publicHtml.replace(/const itinerary\s*=\s*\[[\s\S]*?\n\s*\];/,()=>`const itinerary = ${JSON.stringify(stages,null,2)};`);
}
test('71 days have one stage each; all 40 pre-Japan days are Shenzhen',()=>{
 let n=0;for(let d=new Date('2026-08-25T12:00Z');d<=new Date('2026-11-03T12:00Z');d.setUTCDate(d.getUTCDate()+1)){
 const date=d.toISOString().slice(0,10),found=revised.filter(s=>s.start<=date&&s.end>=date);assert.equal(found.length,1,date);
 if(date>='2026-09-13'&&date<'2026-10-23')assert.equal(found[0].city,'深圳',date);n++;
 }assert.equal(n,71);assert.equal(revised.length,10);
 assert.equal(revised.find(s=>s.start==='2026-10-23').city,'东京／東京');
 assert.equal(JSON.parse(publicHtml.match(/const cities=(\[[^\n]+\]);/)[1]).length,12);
});
test('existing password flow decrypts, revises and then renders without losing unaffected details',async()=>{
 const plain=fixture(),password='test-only-password',salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),iterations=310000;
 const cipher=crypto.createCipheriv('aes-256-gcm',crypto.pbkdf2Sync(password,salt,iterations,32,'sha256'),iv);
 const payload=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]).toString('base64');
 const source=script.replace(/const payload='[^']+',salt='[^']+',iv='[^']+',iterations=\d+/,`const payload='${payload}',salt='${salt.toString('base64')}',iv='${iv.toString('base64')}',iterations=${iterations}`);
 let handler,written;const controls={login:{addEventListener:(type,fn)=>handler=fn},unlock:{},status:{},password:{value:password,select(){}}};
 const context={crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,setTimeout,document:{getElementById:id=>controls[id],open(){},write:html=>written=html,close(){}}};
 vm.createContext(context);vm.runInContext(source,context);await handler({preventDefault(){}});
 assert.ok(written,'decrypted HTML rendered');const old=parse(plain),now=parse(written);
 assert.deepEqual(now.filter(s=>s.end<'2026-09-13'),old.filter(s=>s.end<'2026-09-13'));
 assert.deepEqual(now.filter(s=>s.start>='2026-10-23'),old.filter(s=>s.start>='2026-10-23'));
 const sz=now.find(s=>s.start==='2026-09-13');assert.ok(sz.details.includes('保留深圳内部会面资料'));assert.ok(sz.details.includes('保留十月深圳内部会面资料'));
 assert.ok(!JSON.stringify(sz).match(/抚州|香港|南京/));assert.equal(context.reviseItinerarySeptember14(written),written);
 assert.throws(()=>context.reviseItinerarySeptember14('<html>unsupported</html>'),/route revision/);
 written=undefined;controls.password.value='wrong';await handler({preventDefault(){}});assert.equal(written,undefined);assert.match(controls.status.textContent,/密码不正确/);
});

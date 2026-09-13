import test from 'node:test';
import assert from 'node:assert/strict';
import {openVault,STORAGE_KEY} from '../app/vault.mjs';
import {initialState} from '../app/model.mjs';
const memory=()=>{let value=null;return {getItem:()=>value,setItem:(key,v)=>{assert.equal(key,STORAGE_KEY);value=v;}};};
test('encrypted records survive unlock, use fresh IVs, and reject wrong passwords/tampering',async()=>{
  const storage=memory(),vault=await openVault('synthetic-password',storage),s=initialState();s.meetings[0].notes.summary='PRIVATE SENTINEL';
  await vault.save(s);const first=storage.getItem();assert.ok(!first.includes('PRIVATE SENTINEL'));assert.ok(!first.includes('synthetic-password'));
  await vault.save(s);assert.notEqual(first,storage.getItem());
  assert.equal((await openVault('synthetic-password',storage)).state.meetings[0].notes.summary,'PRIVATE SENTINEL');
  await assert.rejects(openVault('incorrect-password',storage));
  const bad=JSON.parse(storage.getItem());bad.data='AAAA'+bad.data.slice(4);storage.setItem(STORAGE_KEY,JSON.stringify(bad));await assert.rejects(openVault('synthetic-password',storage));
});
test('storage failures and stale-tab saves do not claim success or overwrite records',async()=>{
  const storage=memory(),a=await openVault('synthetic-password',storage);await a.save(initialState());
  const b=await openVault('synthetic-password',storage);await a.save({...initialState(),revision:1});const before=storage.getItem();
  await assert.rejects(b.save(initialState()),/另一窗口/);assert.equal(storage.getItem(),before);
  const failing={getItem:()=>null,setItem:()=>{throw new Error('quota exceeded');}};
  const c=await openVault('synthetic-password',failing);await assert.rejects(c.save(initialState()),/quota/);assert.equal(c.exportEncrypted(),null);
});
test('encrypted backup restore supports an original backup password',async()=>{
  const storage=memory(),a=await openVault('old synthetic password',storage);await a.save(initialState());
  const other=await openVault('new synthetic password',memory());const restored=await other.readBackup(a.exportEncrypted(),'old synthetic password');await other.save(restored);assert.equal(restored.version,1);
  await assert.rejects(other.readBackup(a.exportEncrypted(),'wrong'));
});

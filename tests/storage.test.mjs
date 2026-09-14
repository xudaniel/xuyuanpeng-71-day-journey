import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptJson,decryptJson} from '../app/storage.mjs';
test('encrypted backup round trips and wrong password fails',async()=>{
  const value={schemaVersion:1,secret:'hello'};
  const envelope=await encryptJson(value,'correct horse battery staple');
  assert.doesNotMatch(JSON.stringify(envelope),/hello/);
  assert.deepEqual(await decryptJson(envelope,'correct horse battery staple'),value);
  await assert.rejects(()=>decryptJson(envelope,'wrong'),/密码不正确|损坏/);
});
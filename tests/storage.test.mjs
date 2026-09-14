import test from "node:test";
import assert from "node:assert/strict";
import { encryptJson, decryptJson } from "../app/storage.mjs";
test("encrypted backup round trips and wrong password fails", async () => {
  const value = { schemaVersion: 1, secret: "hello" };
  const envelope = await encryptJson(value, "correct horse battery staple");
  assert.doesNotMatch(JSON.stringify(envelope), /hello/);
  assert.deepEqual(
    await decryptJson(envelope, "correct horse battery staple"),
    value,
  );
  await assert.rejects(() => decryptJson(envelope, "wrong"), /密码不正确|损坏/);
});
import { EncryptedStore } from "../app/storage.mjs";
import { defaultState } from "../app/core.mjs";

test("save failure is transactional; another window cannot overwrite a newer encrypted snapshot", async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) || null,
    setItem: (k, v) => memory.set(k, v),
  };
  const first = new EncryptedStore("test");
  await first.unlock("test-password");
  const other = new EncryptedStore("test");
  await other.unlock("test-password");
  const next = structuredClone(first.state);
  next.revision = 1;
  next.actions.push({
    id: "a",
    title: "Private synthetic action",
    status: "open",
    priority: "P1",
  });
  await first.save(next);
  await assert.rejects(
    () => other.save({ ...other.state, revision: 2 }),
    /其他窗口/,
  );
  assert.doesNotMatch(memory.get("test"), /Private synthetic action/);
  const before = structuredClone(first.state);
  localStorage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  await assert.rejects(() => first.save({ ...next, revision: 3 }), /Quota/);
  assert.deepEqual(first.state, before);
});

test("legacy vaults and encrypted backups migrate in memory while preserving device encryption format", async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) || null,
    setItem: (k, v) => memory.set(k, v),
  };
  const old = defaultState();
  old.travel.push({ id: "legacy", title: "Old train", date: "2026-09-01" });
  memory.set("legacy", JSON.stringify(await encryptJson(old, "old-password")));
  const store = new EncryptedStore("legacy");
  const { state } = await store.unlock("old-password");
  assert.equal(state.travel[0].stage, "Planned");
  assert.equal(state.travel[0].status, "unknown");
  const backup = await store.makeBackup();
  assert.equal(backup.format, "71day-encrypted-v1");
  const preview = await store.previewBackup(backup, "old-password");
  await store.restore(preview.incoming);
  assert.equal(store.state.travel[0].id, "legacy");
  assert.equal(store.state.travel.length, 1);
});

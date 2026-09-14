import { defaultState, countsForBackup, SCHEMA_VERSION } from "./core.mjs";
import { migrateState } from "./execution.mjs";
const enc = new TextEncoder(),
  dec = new TextDecoder();
const b64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

async function derive(password, salt, iterations = 310000) {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(value, password, meta = {}) {
  if (!password) throw new Error("需要密码。");
  const salt = random(16),
    iv = random(12),
    iterations = 310000,
    key = await derive(password, salt, iterations);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(JSON.stringify(value)),
    ),
  );
  return {
    format: "71day-encrypted-v1",
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    iterations,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(cipher),
    ...meta,
  };
}

export async function decryptJson(envelope, password) {
  if (envelope?.format !== "71day-encrypted-v1")
    throw new Error("无法识别的备份格式。");
  const key = await derive(
    password,
    unb64(envelope.salt),
    envelope.iterations || 310000,
  );
  try {
    return JSON.parse(
      dec.decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64(envelope.iv) },
          key,
          unb64(envelope.ciphertext),
        ),
      ),
    );
  } catch {
    throw new Error("密码不正确或备份已损坏。");
  }
}

export class EncryptedStore {
  constructor(key = "71day-os-state-v1") {
    this.key = key;
    this.password = null;
    this.state = null;
    this.raw = null;
  }
  async unlock(password) {
    const raw = localStorage.getItem(this.key);
    this.raw = raw;
    if (!raw) {
      this.password = password;
      this.state = defaultState();
      await this.save(this.state);
      return { created: true, state: this.state };
    }
    const decrypted = await decryptJson(JSON.parse(raw), password);
    this.password = password;
    this.state = migrateState(decrypted);
    return { created: false, state: structuredClone(this.state) };
  }
  async save(state) {
    if (!this.password) throw new Error("尚未解锁。");
    const snapshot = migrateState(state),
      expected = this.raw;
    if (localStorage.getItem(this.key) !== expected)
      throw new Error("其他窗口已更新，请重新解锁后再保存。");
    const raw = JSON.stringify(
      await encryptJson(snapshot, this.password, { kind: "device-state" }),
    );
    if (localStorage.getItem(this.key) !== expected)
      throw new Error("其他窗口已更新，请重新解锁后再保存。");
    localStorage.setItem(this.key, raw);
    this.raw = raw;
    this.state = snapshot;
    return structuredClone(snapshot);
  }
  lock() {
    this.password = null;
    this.state = null;
    this.raw = null;
  }
  async makeBackup() {
    if (!this.state || !this.password) throw new Error("尚未解锁。");
    return encryptJson(this.state, this.password, {
      kind: "portable-backup",
      counts: countsForBackup(this.state),
      revision: this.state.revision || 0,
    });
  }
  async previewBackup(envelope, password) {
    const incoming = migrateState(await decryptJson(envelope, password));
    return {
      incoming,
      envelope,
      counts: countsForBackup(incoming),
      revision: incoming.revision || 0,
      updatedAt: incoming.updatedAt || envelope.createdAt,
    };
  }
  async restore(incoming) {
    if (!this.password) throw new Error("尚未解锁。");
    if ((incoming.schemaVersion || 0) > SCHEMA_VERSION)
      throw new Error("这个备份来自更新版本，当前页面无法安全恢复。");
    return this.save(migrateState(incoming));
  }
}

export function downloadEnvelope(
  envelope,
  filename = "71-day-backup.enc.json",
) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

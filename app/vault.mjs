import {validateState} from './model.mjs';
export const STORAGE_KEY='journey-execution-encrypted-v1';
const encode=a=>btoa(Array.from(a,b=>String.fromCharCode(b)).join(''));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const aad=new TextEncoder().encode(STORAGE_KEY);
export async function openVault(password, storage=localStorage) {
  // Derive a separate key from the itinerary encryption key; never store the password.
  let raw=storage.getItem(STORAGE_KEY), envelope=raw ? JSON.parse(raw) : null;
  if(envelope && envelope.version!==1) throw new Error('本机加密记录版本不受支持');
  const salt=envelope ? decode(envelope.salt) : crypto.getRandomValues(new Uint8Array(16));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  async function decrypt(value) {
    if(value.version!==1 || value.salt!==encode(salt)) throw new Error('备份密钥不匹配');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData:aad},key,decode(value.data));
    return validateState(JSON.parse(new TextDecoder().decode(plain)));
  }
  const state=envelope ? await decrypt(envelope) : null;
  let pending=Promise.resolve();
  return {
    state,
    async save(next) {
      // Both same-tab writes and cross-tab writes serialize; stale tabs cannot overwrite.
      const write=async()=>{
        if(storage.getItem(STORAGE_KEY)!==raw) throw new Error('另一窗口已更新记录。请重新解锁后再编辑。');
        validateState(next);
        const iv=crypto.getRandomValues(new Uint8Array(12));
        const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(JSON.stringify(next)));
        if(storage.getItem(STORAGE_KEY)!==raw) throw new Error('另一窗口已更新记录。请重新解锁。');
        const serialized=JSON.stringify({version:1,salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(data))});
        storage.setItem(STORAGE_KEY,serialized); raw=serialized;
      };
      const execute=()=>globalThis.navigator?.locks ? navigator.locks.request(STORAGE_KEY,write) : write();
      const result=pending.then(execute); pending=result.catch(()=>{}); await result;
    },
    exportEncrypted:()=>raw,
    async readBackup(text, backupPassword) {
      const memory={getItem:()=>text};
      return (await openVault(backupPassword,memory)).state;
    }
  };
}

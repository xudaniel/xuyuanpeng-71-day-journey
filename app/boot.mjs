import {openVault} from './vault.mjs';
import {mount} from './ui.mjs';

export async function prepareExecution(password) {
  let vault;
  try { vault=await openVault(password); }
  catch { throw new Error('行程密码已验证，但本机执行记录无法读取。可能是密码已更换、记录损坏或存储被禁用。原记录未覆盖；请使用原密码及加密备份恢复。'); }
  return context=>mount(vault,context);
}

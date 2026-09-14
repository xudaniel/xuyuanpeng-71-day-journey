const form = document.getElementById('shareLogin');
const field = document.getElementById('sharePassword');
const button = document.getElementById('shareUnlock');
const status = document.getElementById('shareStatus');
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = '正在解锁…';
  try {
    const envelope = JSON.parse(document.getElementById('sharePayload').textContent);
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(field.value), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(envelope.salt), iterations: envelope.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv) }, key, bytes(envelope.payload));
    field.value = '';
    document.open();
    document.write(new TextDecoder().decode(plain));
    document.close();
  } catch {
    status.textContent = '密码不正确，请重新输入。';
    button.disabled = false;
    field.select();
  }
});

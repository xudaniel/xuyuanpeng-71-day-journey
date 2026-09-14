// PUBLIC_SHARE_PASSWORD is supplied by the maintainer, never saved in source.
// encrypt: reads HTML from stdin, writes the password page to stdout.
// decrypt: reads the password page from stdin, writes its HTML to stdout.
import { webcrypto } from 'node:crypto';
const password = process.env.PUBLIC_SHARE_PASSWORD;
if (!password) throw new Error('Set PUBLIC_SHARE_PASSWORD before running this tool.');
let input = '';
for await (const chunk of process.stdin) input += chunk;
const encode = bytes => Buffer.from(bytes).toString('base64');
const decode = value => Buffer.from(value, 'base64');
const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const decrypt = process.argv[2] === 'decrypt';
if (!decrypt && process.argv[2] !== 'encrypt') throw new Error('Use encrypt or decrypt.');
const envelope = decrypt
  ? JSON.parse(input.match(/<script id="sharePayload" type="application\/json">([\s\S]*?)<\/script>/)[1])
  : { salt: encode(webcrypto.getRandomValues(new Uint8Array(16))), iv: encode(webcrypto.getRandomValues(new Uint8Array(12))), iterations: 310000 };
const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: decode(envelope.salt), iterations: envelope.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [decrypt ? 'decrypt' : 'encrypt']);
if (decrypt) {
  process.stdout.write(new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv) }, key, decode(envelope.payload))));
} else {
  envelope.payload = encode(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: decode(envelope.iv) }, key, new TextEncoder().encode(input)));
  process.stdout.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>七十一日行程｜公开版登录</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#f4f2ed;color:#161615;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{width:100%;max-width:420px;padding:32px 24px;background:#fcfbf8;border:1px solid #d4d0c7}small{color:#6d6a64;letter-spacing:.15em}h1{font-family:"Songti SC",serif;font-size:30px;margin:18px 0}p{color:#6d6a64;line-height:1.65;font-size:15px}label{display:block;margin-top:24px;font-size:15px}input,button{width:100%;min-height:48px;font:inherit;border:1px solid #161615;border-radius:0}input{margin:9px 0 16px;padding:12px;background:white}button{background:#161615;color:#fcfbf8;cursor:pointer}button:disabled{opacity:.55}input:focus-visible,button:focus-visible{outline:3px solid #8f8065;outline-offset:3px}#shareStatus{min-height:25px;margin-bottom:0}
  </style>
</head>
<body>
  <main>
    <small>七十一日行程 · 安全分享版</small>
    <h1>请输入访问密码</h1>
    <p>输入密码，查看公开版行程。</p>
    <form id="shareLogin">
      <label for="sharePassword">访问密码</label>
      <input id="sharePassword" type="password" autocomplete="current-password" required aria-describedby="shareStatus">
      <button id="shareUnlock" type="submit">解锁公开行程</button>
    </form>
    <p id="shareStatus" role="status" aria-live="polite"></p>
    <noscript><p>请启用 JavaScript 后输入密码。</p></noscript>
  </main>
  <script id="sharePayload" type="application/json">${JSON.stringify(envelope)}</script>
  <script type="module" src="app/share-gate.mjs"></script>
</body>
</html>
`);
}

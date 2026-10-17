import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';
import dns from 'node:dns';
import backend from '../server.js';

function frontend(storage = {}) {
  const elements = new Map();
  const element = () => ({ value: '', textContent: '保存资源', dataset: {}, isConnected: true,
    listeners: {}, disabled: false, attributes: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelector(selector) { return get(selector); }, focus() {}, scrollIntoView() {},
    requestSubmit() { this.submissions = (this.submissions || 0) + 1; }
  });
  const get = key => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); };
  let launches = 0;
  const timers = [];
  const context = vm.createContext({ console, URL, AbortController, Date,
    setTimeout: fn => { timers.push(fn); return timers.length; },
    localStorage: { getItem: key => storage[key] || null, setItem: (k, v) => { storage[k] = v; }, removeItem: k => { delete storage[k]; } },
    navigator: { clipboard: {} },
    document: { querySelector: get, querySelectorAll: () => [], getElementById: () => null,
      addEventListener() {}, documentElement: get('html'), body: { ...element(), appendChild() {}, removeChild() {} },
      createElement: () => ({ click() { launches++; } }) },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }),
      setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
      setInterval() {}, clearInterval() {}, addEventListener() {}, innerWidth: 390 },
    fetch: async () => ({ ok: true, json: async () => ({ status: 'ok' }) })
  });
  vm.runInContext(fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  return { context, get, timers, launches: () => launches, run: code => vm.runInContext(code, context) };
}

test('frontend rejects lookalike domains and executable/credential URLs', () => {
  const ui = frontend();
  assert.equal(ui.run('classifyPlatform("https://youtube.com.evil.example/watch")'), '通用网页');
  assert.equal(ui.run('classifyPlatform("https://examplex.com")'), '通用网页');
  assert.equal(ui.run('safeHttpUrl("javascript:alert(1)")'), '');
  assert.equal(ui.run('safeHttpUrl("https://user:secret@example.com")'), '');
});

test('malformed persisted history and denied storage do not break initialization', () => {
  for (const value of ['null', '{}', '[null, {"url":"javascript:1","title":"bad"}]']) {
    const ui = frontend({ 'muse-matrix-history': value });
    assert.equal(ui.run('getHistory().length'), 0);
  }
  const denied = new Proxy({}, { get() { throw new Error('storage denied'); }, set() { throw new Error('quota exceeded'); } });
  const ui = frontend(denied);
  ui.run('saveHistory({url:"https://example.com",title:"A",platform:"通用网页",tags:[]})');
  assert.equal(ui.run('getHistory().length'), 1);
  assert.equal(ui.run('storagePersistent'), false);
});

test('one resource launches once even through different buttons; unsafe URLs never launch', () => {
  const ui = frontend();
  ui.run('downloadTrack("https://example.com/a.mp4", "A", "mp4", submitButton)');
  assert.equal(ui.get('button[type="submit"]').disabled, true);
  assert.equal(ui.get('button[type="submit"]').attributes['aria-busy'], 'true');
  ui.run('downloadTrack("https://example.com/a.mp4", "A", "mp4")');
  ui.run('downloadTrack("javascript:alert(1)", "A")');
  assert.equal(ui.launches(), 1);
});

test('opening an expired history card requests fresh media rather than showing saved CDN URLs', () => {
  const ui = frontend({ 'muse-matrix-history': JSON.stringify([{ url: 'https://example.com/a.mp4', title: 'Old', timestamp: 1 }]) });
  ui.get('#historyList').listeners.click({ target: { closest: selector => selector === '.history-card' ? { dataset: { url: 'https://example.com/a.mp4' } } : null } });
  assert.equal(ui.get('#parser').submissions, 1);
});

test('notes flush synchronously when switching cards', () => {
  const ui = frontend();
  ui.run('saveHistory({url:"https://example.com",title:"A",platform:"通用网页",tags:[]}); renderResult({url:"https://example.com",title:"A",platform:{name:"通用网页"},items:[]})');
  ui.get('#cardNote').value = 'A note before leaving';
  ui.get('#cardTags').value = 'design';
  ui.get('#cardNote').listeners.input();
  ui.run('flushPendingNotes()');
  assert.equal(ui.run('getHistory()[0].note'), 'A note before leaving');
});

test('duplicate form submission does not issue another parse request', async () => {
  const ui = frontend();
  ui.get('#mediaUrl').value = 'https://example.com/a.mp4';
  let requests = 0, resolve;
  ui.context.fetch = () => { requests++; return new Promise(r => { resolve = r; }); };
  const handler = ui.get('#parser').listeners.submit;
  const first = handler({ preventDefault() {} });
  await handler({ preventDefault() {} });
  assert.equal(requests, 1);
  resolve({ ok: true, json: async () => ({url: 'https://example.com/a.mp4', title:'A', platform:{name:'直接媒体链接'}, items:[]}) });
  await first;
  assert.equal(ui.get('button[type="submit"]').disabled, false);
});

test('range validation and IPv6 normalization block malformed or internal addresses', () => {
  for (const range of ['bytes=-', 'bytes=-0', 'bytes=10-2', 'bytes=9007199254740992-']) assert.equal(backend.isValidRangeHeader(range), false);
  for (const range of ['bytes=-64', 'bytes=0-0', 'bytes=1024-']) assert.equal(backend.isValidRangeHeader(range), true);
  for (const ip of ['0:0:0:0:0:0:0:1', '0:0:0:0:0:ffff:7f00:1', 'fc00:0:0:0:0:0:0:1']) assert.equal(backend.isPrivateIp(ip), true);
  assert.throws(() => backend.parseHttpUrl('https://user:secret@example.com'), /凭据/);
});

test('media streaming respects a slow destination and fails instead of completing an oversized file', async () => {
  let received = 0, produced = 0, maxAhead = 0;
  const limiter = backend.createDownloadLimiter(8 * 1024 * 1024);
  function* chunks() { for (let i = 0; i < 512; i++) { produced += 8192; maxAhead = Math.max(maxAhead, produced - received); yield Buffer.alloc(8192); } }
  await pipeline(Readable.from(chunks()), limiter,
    new Writable({ highWaterMark:8192, write(chunk, _encoding, callback) { received += chunk.length; setTimeout(callback, 1); } }));
  assert.equal(received, 4194304);
  assert.ok(maxAhead < 262144, `slow consumer buffered ${maxAhead} bytes`);
  await assert.rejects(pipeline(Readable.from([Buffer.alloc(20)]), backend.createDownloadLimiter(10), new Writable({write(c,e,cb){cb();}})), /size limit/);
});

test('HTTP download forwards Range and validators, preserves 206 and 416', async () => {
  const originalGet = https.get;
  const originalLookup = dns.promises.lookup;
  let upstreamStatus = 206, captured;
  dns.promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  https.get = (_url, options, callback) => {
    captured = options.headers;
    const body = upstreamStatus === 206 ? Buffer.from('0000ftypisom') : Buffer.alloc(0);
    const remote = Readable.from([body]);
    remote.statusCode = upstreamStatus;
    remote.headers = { 'content-type':'video/mp4', 'content-length':String(body.length), 'content-range':upstreamStatus === 206 ? 'bytes 0-11/545375451' : 'bytes */545375451', etag:'"test"', 'accept-ranges':'bytes' };
    const req = new Readable({read(){}});
    process.nextTick(() => callback(remote));
    return req;
  };
  await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${backend.server.address().port}/api/download?url=${encodeURIComponent('https://v.douyinvod.com/a.mp4')}&filename=a.mp4`;
    let res = await fetch(endpoint, { headers: { Range:'bytes=0-11', 'If-Range':'"test"' } });
    assert.equal(res.status, 206);
    assert.equal(captured.Range, 'bytes=0-11');
    assert.equal(captured['If-Range'], '"test"');
    assert.equal(res.headers.get('etag'), '"test"');
    assert.match(res.headers.get('content-range'), /545375451/);
    assert.equal(await res.text(), '0000ftypisom');
    upstreamStatus = 416;
    res = await fetch(endpoint, {headers:{Range:'bytes=999999999-'}});
    assert.equal(res.status, 416);
    assert.equal(res.headers.get('content-range'), 'bytes */545375451');
    await res.text();
  } finally {
    https.get = originalGet;
    dns.promises.lookup = originalLookup;
    await new Promise(resolve => backend.server.close(resolve));
  }
});

test('an initial TikTok save uses an open byte range required by its CDN',async()=>{
 const originalGet=https.get,originalLookup=dns.promises.lookup;let captured;
 dns.promises.lookup=async()=>[{address:'93.184.216.34',family:4}];
 https.get=(_url,options,callback)=>{captured=options.headers;const remote=Readable.from([Buffer.from('0000ftypisom')]);remote.statusCode=206;remote.headers={'content-type':'video/mp4','content-length':'12','content-range':'bytes 0-11/12'};const req=new Readable({read(){}});process.nextTick(()=>callback(remote));return req};
 await new Promise(resolve=>backend.server.listen(0,'127.0.0.1',resolve));
 try{const r=await fetch(`http://127.0.0.1:${backend.server.address().port}/api/download?url=${encodeURIComponent('https://v16-notes.tiktokcdn-us.com/a.mp4')}`);assert.equal(r.status,206);assert.equal(captured.Range,'bytes=0-');assert.equal(await r.text(),'0000ftypisom');}finally{https.get=originalGet;dns.promises.lookup=originalLookup;await new Promise(resolve=>backend.server.close(resolve));}
});

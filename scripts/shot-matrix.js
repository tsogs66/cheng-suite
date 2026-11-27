/**
 * Capture the shell at the review sizes. Phone and tablet shots use an
 * Android user agent because headless Chrome's pointer is fine, and the
 * phone test requires a coarse pointer or a phone user agent.
 *
 * Run: node scripts/shot-matrix.js [baseUrl]
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const base = process.argv[2] || 'http://127.0.0.1:8091';
const outDir = '/opt/cursor/artifacts';
const chrome = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('Chrome not found');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const shots = [
  { file: 'aio-1366x768.png', w: 1366, h: 768, ua: DESK, url: base + '/' },
  { file: 'aio-1920x1080.png', w: 1920, h: 1080, ua: DESK, url: base + '/' },
  { file: 'aio-360x800.png', w: 360, h: 800, ua: PHONE, url: base + '/' },
  { file: 'aio-430x932.png', w: 430, h: 932, ua: PHONE, url: base + '/' },
  { file: 'aio-tablet-800x1280.png', w: 800, h: 1280, ua: PHONE, url: base + '/' },
  { file: 'aio-tablet-1280x800.png', w: 1280, h: 800, ua: PHONE, url: base + '/' },
];

function waitHttp(url, tries) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      http.get(url, (res) => { res.resume(); resolve(); }).on('error', () => {
        if (n <= 0) reject(new Error('devtools not up'));
        else setTimeout(() => tick(n - 1), 150);
      });
    };
    tick(tries);
  });
}

(async () => {
  const userData = fs.mkdtempSync('/tmp/cheng-shot-');
  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    '--user-data-dir=' + userData,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stderr.on('data', (b) => { log += b.toString(); });
  proc.stdout.on('data', (b) => { log += b.toString(); });
  const devtools = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no devtools\n' + log)), 15000);
    const scan = () => {
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); return; }
      setTimeout(scan, 80);
    };
    scan();
  });
  const httpBase = devtools.replace('ws://', 'http://').replace(/\/devtools\/.*/, '');
  await waitHttp(httpBase + '/json/list', 40);
  const list = await new Promise((resolve, reject) => {
    http.get(httpBase + '/json/list', (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let id = 0;
  function send(method, params) {
    const msgId = ++id;
    return new Promise((resolve, reject) => {
      const onMsg = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.id !== msgId) return;
        ws.removeEventListener('message', onMsg);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result || {});
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
    });
  }
  await send('Page.enable');
  await send('Page.navigate', { url: base + '/' });
  await new Promise((r) => setTimeout(r, 600));
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const stores = ['meta','entries','receipts','documents','abstracts','printHistory','voyageLegs','voyageLegParts','orbEntries','deletedBackup','dbSnapshots','dbSnapshotParts','syncLog','syncPieces'];
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('noonReportDB', 11);
        req.onupgradeneeded = () => {
          const d = req.result;
          stores.forEach((name) => {
            if (d.objectStoreNames.contains(name)) return;
            if (name === 'meta') d.createObjectStore(name, { keyPath: 'key' });
            else if (name === 'deletedBackup') d.createObjectStore(name, { keyPath: 'trashId' });
            else d.createObjectStore(name, { keyPath: 'id' });
          });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const setup = {
        voyageNumber: '42', condition: 'L', imoNo: '9123456',
        departPort: 'SINGAPORE', arrivePort: 'ROTTERDAM', voyageDistance: 8420,
        pitch: 7.2, mcrRpm: 89, mcrKw: 12240, propLawExp: 3,
        initDateTime: '2026-11-20T00:00',
        fuelTanks: [
          { id: 'vlsfo', name: 'VLSFO', unit: 'MT', capacity: 1800 },
          { id: 'lsmgo', name: 'LSMGO', unit: 'MT', capacity: 280 },
          { id: 'mdo', name: 'MDO', unit: 'MT', capacity: 160 }
        ],
        rob: { vlsfo: 1420, lsmgo: 210, mdo: 90 },
        capacity: { vlsfo: 1800, lsmgo: 280, mdo: 160 }
      };
      const entry = {
        id: 'e1', vesselId: 'harbour-key', voyageNumber: '42',
        datetime: '2026-11-24T12:00', distanceShip: 980, speedShip: 12.4,
        rpm: 78, slip: 4.2, kwEst: 8600, mcrPct: 62,
        weather: { windDir: 'NE', windBft: 5, windKnots: 22, seaState: 4 }
      };
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta','entries'], 'readwrite');
        const meta = tx.objectStore('meta');
        meta.put({ key: 'vessels', value: [{ id: 'harbour-key', name: 'MV HARBOUR KEY', slug: 'harbour-key' }] });
        meta.put({ key: 'activeVesselId', value: 'harbour-key' });
        meta.put({ key: 'setup:harbour-key', value: setup });
        tx.objectStore('entries').put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      try { localStorage.removeItem('chengAioResume'); } catch (e) {}
      return 'seeded';
    })()`,
    awaitPromise: true,
  });
  for (const shot of shots) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: shot.w,
      height: shot.h,
      deviceScaleFactor: 1,
      mobile: shot.ua === PHONE,
    });
    await send('Emulation.setUserAgentOverride', { userAgent: shot.ua });
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url: shot.url });
    await new Promise((r) => setTimeout(r, 700));
    await send('Runtime.evaluate', {
      expression: 'try{localStorage.removeItem("chengAioResume")}catch(e){}',
    });
    await send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 1800));
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const dest = path.join(outDir, shot.file);
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    console.log(shot.file, fs.statSync(dest).size);
  }
  ws.close();
  proc.kill('SIGTERM');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

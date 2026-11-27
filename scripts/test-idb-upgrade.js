/**
 * Open noonReportDB the way an already-installed ChEng AIO would, write a
 * record at version 11, open it again, and read the same record back.
 * Skips (exit 0) when Chrome is not installed, so CI without a browser still
 * passes. The source-level guarantees live in test-data-upgrade.js.
 *
 * Run: node scripts/test-idb-upgrade.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const chrome = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => {
  try { return fs.existsSync(p); } catch (e) { return false; }
});

if (!chrome) {
  console.log('idb upgrade: skipped (no Chrome)');
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheng-idb-'));
const html = `<!DOCTYPE html><meta charset="utf-8"><title>idb</title><script>
const STORES = ['meta','entries','receipts','documents','abstracts','printHistory','voyageLegs','voyageLegParts','orbEntries','deletedBackup','dbSnapshots','dbSnapshotParts','syncLog','syncPieces'];
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('noonReportDB', 11);
    req.onupgradeneeded = () => {
      const d = req.result;
      STORES.forEach((name) => {
        if (!d.objectStoreNames.contains(name)) {
          if (name === 'voyageLegParts') {
            const s = d.createObjectStore(name, { keyPath: 'id' });
            s.createIndex('legId', 'legId', { unique: false });
          } else if (name === 'dbSnapshotParts') {
            const s = d.createObjectStore(name, { keyPath: 'id' });
            s.createIndex('snapId', 'snapId', { unique: false });
          } else if (name === 'syncPieces') {
            const s = d.createObjectStore(name, { keyPath: 'id' });
            s.createIndex('group', 'group', { unique: false });
          } else if (name === 'deletedBackup') {
            d.createObjectStore(name, { keyPath: 'trashId' });
          } else if (name === 'meta') {
            d.createObjectStore(name, { keyPath: 'key' });
          } else {
            d.createObjectStore(name, { keyPath: 'id' });
          }
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function putMeta(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: 'activeVesselId', value: value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function readMeta(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get('activeVesselId');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
(async () => {
  const first = await openDb();
  await putMeta(first, 'mv-harbour-key');
  const names = Array.from(first.objectStoreNames);
  first.close();
  const second = await openDb();
  const row = await readMeta(second);
  const still = Array.from(second.objectStoreNames);
  document.title = (row && row.value === 'mv-harbour-key' && still.join(',') === names.join(','))
    ? 'IDB_OK ' + row.value
    : 'IDB_BAD';
})().catch((e) => { document.title = 'IDB_BAD ' + (e && e.message); });
</script>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

function waitFor(url, tries) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (n <= 0) reject(new Error('chrome debug port did not open'));
        else setTimeout(() => tick(n - 1), 200);
      });
    };
    tick(tries);
  });
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=' + dir,
    '--remote-debugging-port=0',
    'http://127.0.0.1:' + port + '/',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stderr.on('data', (b) => { log += b.toString(); });
  proc.stdout.on('data', (b) => { log += b.toString(); });
  const devtools = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no devtools port\n' + log)), 15000);
    const scan = () => {
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); return; }
      setTimeout(scan, 100);
    };
    scan();
  });
  const httpBase = devtools.replace('ws://', 'http://').replace(/\/devtools\/.*/, '');
  await waitFor(httpBase + '/json/list', 30);
  const list = await new Promise((resolve, reject) => {
    http.get(httpBase + '/json/list', (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let id = 0;
  function send(method, params) {
    const msgId = ++id;
    return new Promise((resolve) => {
      const onMsg = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', onMsg);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  let title = '';
  for (let i = 0; i < 40; i++) {
    const result = await send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    });
    title = result && result.result && result.result.value || '';
    if (title.startsWith('IDB_')) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  ws.close();
  proc.kill('SIGTERM');
  server.close();
  if (title !== 'IDB_OK mv-harbour-key') {
    console.error('idb upgrade failed:', title);
    process.exit(1);
  }
  console.log('idb upgrade: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

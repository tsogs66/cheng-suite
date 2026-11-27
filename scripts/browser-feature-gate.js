#!/usr/bin/env node
'use strict';
/* Walk every shell page and every visible button, then check that a log
   entry shows on ROB, the noon form, and Reports. Skips when Chrome is
   absent. Original button actions are not rewritten; a click that throws
   is a failure. */
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chrome = ['/usr/bin/google-chrome', '/usr/local/bin/google-chrome', '/usr/bin/chromium'].find((p) => {
  try { return fs.existsSync(p); } catch (e) { return false; }
});
if (!chrome) {
  console.log('feature gate: skipped (no Chrome)');
  process.exit(0);
}

let pw;
try { pw = require('playwright-core'); } catch (e) {
  console.log('feature gate: skipped (no playwright-core)');
  process.exit(0);
}

const ENT = JSON.stringify({
  sku: 'cheng-aio', email: 'gate@test.local', master: true, addons: ['master'],
  graceUntil: '2027-12-31T00:00:00.000Z', expiresAt: '2027-12-31T00:00:00.000Z',
});
const PORT = Number(process.env.GATE_PORT || 8123);
const root = path.join(__dirname, '..');
const fails = [];
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL'), name, detail || '');
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
}

function waitListen() {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      http.get('http://127.0.0.1:' + PORT + '/', (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (n <= 0) reject(new Error('suite did not listen'));
          else setTimeout(() => tick(n - 1), 200);
        });
    };
    tick(40);
  });
}

(async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      CHENG_PRO_DATA_DIR: path.join(root, '.gate-data'),
      TMS_DATA_DIR: path.join(root, '.gate-data'),
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (b) => { log += b.toString(); });
  server.stderr.on('data', (b) => { log += b.toString(); });
  try {
    await waitListen();
  } catch (e) {
    console.error(log.slice(-500));
    server.kill('SIGTERM');
    throw e;
  }

  const browser = await pw.chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript((raw) => {
    try {
      localStorage.setItem('chengAioLicenseEntitlement', raw);
      localStorage.setItem('chengAioLicenseEntitlementFb', raw);
    } catch (e) { /* a sandboxed print preview has no storage */ }
    window.print = function () { window.__printed = (window.__printed || 0) + 1; };
    window.confirm = function () { return false; };
    window.prompt = function () { return null; };
    window.alert = function (m) { window.__alerts = (window.__alerts || []).concat(String(m)); };
  }, ENT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err && err.message || err)));

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const shell = await page.evaluate(() => document.documentElement.className);
  if (!/aio-shell-nav|aio-suite/.test(shell)) {
    throw new Error('not the suite shell: ' + shell);
  }
  await page.waitForSelector('#sidebar .nav-item', { timeout: 15000 });

  const nav = await page.evaluate(() => {
    const seen = new Set();
    return [...document.querySelectorAll('#sidebar .nav-item')].map((el) => {
      const key = (el.dataset.module || '') + ':' + (el.dataset.page || '');
      if (seen.has(key)) return null;
      seen.add(key);
      return { key, label: (el.textContent || '').replace(/\s+/g, ' ').trim(), module: el.dataset.module || '', page: el.dataset.page || '' };
    }).filter(Boolean);
  });
  check('sidebar lists the menu', nav.length >= 40, String(nav.length));

  const buttonReport = [];
  for (const item of nav) {
    errors.length = 0;
    const before = errors.length;
    await page.evaluate((it) => {
      const el = [...document.querySelectorAll('#sidebar .nav-item')].find((n) =>
        (n.dataset.module || '') === it.module && (n.dataset.page || '') === it.page);
      if (el) el.click();
    }, item);
    const expect = {
      'home:': /vessel|home|voyage progress/i,
      'voyage:summary': /summary|voyage/i,
      'voyage:entry': /log entry|previous entry|new entry/i,
      'voyage:rob': /survey beside the log|remaining|\bROB\b/i,
      'voyage:reports': /report/i,
      'tanks:dashboard': /tank/i,
      'tanks:fuel-report': /sounding|monitoring|tank/i,
      'tanks:report': /voyage report|tank condition/i,
      'tanks:vcf-wcf': /VCF/,
      'tanks:iso8217': /ISO 8217|distillate/i,
      'voyage:shipsetup': /sync|ship details|live sync/i,
      'voyage:trends': /trend/i,
      'bunkerplan:': /consumption|voyage leg|distance/i,
      'bunkeringplan:': /bunker/i,
      'eca:': /ECA|changeover/i,
      'eorb:': /ORB|oil record/i,
      'performance:': /performance|engine/i,
      'spares:': /spare|requisition/i,
      'notes:': /note/i,
      'ce-rob:': /reconcil/i,
      'ce-alerts:': /alert/i,
      'ce-summary:': /superintendent|voyage summary/i,
      'ce-inspect:': /inspection|PSC|vetting/i,
    };
    const rule = expect[item.key];
    let view = { text: '', src: '' };
    for (let n = 0; n < 30; n++) {
      if (n === 8 || n === 16) {
        await page.evaluate((it) => {
          const el = [...document.querySelectorAll('#sidebar .nav-item')].find((node) =>
            (node.dataset.module || '') === it.module && (node.dataset.page || '') === it.page);
          if (el) el.click();
        }, item);
      }
      await page.waitForTimeout(400);
      view = await page.evaluate(() => {
        const host = document.getElementById('aioPageHost') || document.getElementById('main') || document.body;
        const frame = host.querySelector('.aio-embed-wrap:not(.aio-background-save) iframe');
        let text = '';
        try {
          if (frame && frame.contentDocument && frame.contentDocument.body) {
            text = frame.contentDocument.body.innerText || '';
          }
        } catch (e) { text = ''; }
        if (!text || /^Loading…?$/.test(text.trim())) text = (document.getElementById('main') || host).innerText || '';
        text = text.replace(/\s+/g, ' ').trim();
        return { text: text.slice(0, 4000), src: frame ? (frame.getAttribute('src') || '') : '' };
      });
      const ready = view.text.length > 40 && !/^Loading…?$/.test(view.text) && !/^[🔍−+% 0-9.]+$/.test(view.text);
      if (ready && (!rule || rule.test(view.text))) break;
    }
    const opened = view.text.length > 20 && !/^Loading…?$/.test(view.text);
    const marked = !rule || rule.test(view.text);
    check(item.label + ' opens', opened && marked && errors.length === before, (errors.slice(before).join('; ') || view.text.slice(0, 90)));

    const clicked = await page.evaluate(async () => {
      const host = document.getElementById('aioPageHost') || document.getElementById('main') || document.body;
      const frame = host.querySelector('.aio-embed-wrap:not(.aio-background-save) iframe');
      const root = (frame && frame.contentDocument && frame.contentDocument.body) || host;
      const nodes = [...root.querySelectorAll('button, [role="button"]')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (el.disabled) return false;
        const t = (el.textContent || el.getAttribute('aria-label') || el.id || '').replace(/\s+/g, ' ').trim();
        if (/delete|remove|clear|reset|wipe|uninstall|drop |save|import|export|sync|upload|print|load vessel/i.test(t)) return false;
        if (el.id === 'btnLoadVesselData') return false;
        return true;
      }).slice(0, 24);
      const out = [];
      for (const el of nodes) {
        const name = ((el.id ? '#' + el.id + ' ' : '') + (el.textContent || el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim().slice(0, 60);
        const start = (window.__alerts || []).length;
        try { el.click(); out.push({ name, ok: true }); }
        catch (e) { out.push({ name, ok: false, err: String(e && e.message || e) }); }
        await new Promise((r) => setTimeout(r, 40));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const cancel = [...document.querySelectorAll('button')].find((b) => /cancel|close/i.test(b.textContent || '') && b.getBoundingClientRect().width > 2);
        if (cancel && (window.__alerts || []).length === start) { /* leave a real alert alone */ }
      }
      return out;
    });
    const bad = clicked.filter((c) => !c.ok);
    buttonReport.push({ label: item.label, buttons: clicked.length, bad: bad.length });
    check(item.label + ' buttons', bad.length === 0, bad.map((b) => b.name + ' ' + b.err).join('; ') || (clicked.length + ' clicked'));
    if (errors.length > before) {
      check(item.label + ' stays quiet', false, errors.slice(before).join('; '));
    }
  }

  /* Cross-page: a log entry must show on the noon form, ROB, and Reports. */
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#sidebar .nav-item')].find((n) => n.dataset.module === 'voyage' && n.dataset.page === 'entry');
    if (el) el.click();
  });
  await page.waitForTimeout(1200);
  const frame = page.frames().filter((f) => /voyage_manager\.html/.test(f.url())).pop();
  if (!frame) {
    check('voyage frame', false, 'no voyage iframe');
  } else {
    await frame.waitForFunction(() => typeof switchTab === 'function', { timeout: 20000 }).catch(() => {});
    const saved = await frame.evaluate(async () => {
      if (typeof switchTab === 'function') switchTab('entry');
      const dt = document.getElementById('in_datetime');
      const me = document.getElementById('me_meter');
      const ge = document.getElementById('ge_meter');
      const blr = document.getElementById('blr_meter');
      const op = document.getElementById('in_operation');
      if (!dt || !me || !ge || !blr) {
        return { ok: false, reason: 'log form missing', has: { dt: !!dt, me: !!me, ge: !!ge, blr: !!blr } };
      }
      dt.value = '2026-11-20T12:00';
      me.value = '1000';
      ge.value = '400';
      blr.value = '80';
      if (op && op.options && op.options.length) op.selectedIndex = 0;
      let err = '';
      const before = (typeof state !== 'undefined' && state.entries) ? state.entries.length : 0;
      try {
        const btn = document.getElementById('btnAdd');
        if (!btn) return { ok: false, reason: 'Add Entry button missing' };
        btn.click();
      } catch (e) {
        err = String(e && e.message || e);
      }
      let count = before;
      let listed = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        count = (typeof state !== 'undefined' && state.entries) ? state.entries.length : -1;
        const sel = document.getElementById('robAsOfSelect');
        listed = !!(sel && [...sel.options].some((o) => /2026/.test(o.textContent || '')));
        if (count > before && listed) break;
      }
      return { ok: count > before && listed, err, count, listed, stamp: dt.value };
    });
    check('log entry saves', saved.ok && saved.count > 0 && !(saved.alerts || []).length, JSON.stringify(saved));

    const chain = await frame.evaluate(() => {
      const stamp = '2026-11-20';
      if (typeof switchTab === 'function') switchTab('rob');
      const sel = document.getElementById('robAsOfSelect');
      const optText = sel ? [...sel.options].map((o) => o.textContent || '').join(' ') : '';
      const rob = optText + ' ' + ((document.getElementById('page-rob') || document.body).innerText || '');
      if (typeof switchTab === 'function') switchTab('reports');
      const reports = (document.getElementById('page-reports') || document.body).innerText || '';
      if (typeof switchTab === 'function') switchTab('entry');
      const noon = (document.getElementById('in_datetime') || {}).value || '';
      const list = (document.body.innerText || '');
      return {
        robHasEntry: /2026|Nov|HFO|LSFO/.test(rob) && !/No entries yet/.test(rob),
        reportsHasStamp: reports.includes(stamp) || reports.includes('20 Nov') || reports.includes('Nov 20'),
        noonKeepsStamp: noon.indexOf(stamp) === 0 || list.includes(stamp),
        robSample: rob.replace(/\s+/g, ' ').slice(0, 120),
        reportSample: reports.replace(/\s+/g, ' ').slice(0, 120),
      };
    });
    check('ROB shows the log', chain.robHasEntry, chain.robSample);
    check('Reports shows the log', chain.reportsHasStamp, chain.reportSample);
    check('Noon form keeps the stamp', chain.noonKeepsStamp, chain.noonKeepsStamp ? '' : 'stamp left the form');
  }

  console.log('pages', nav.length, 'button clicks', buttonReport.reduce((n, r) => n + r.buttons, 0));
  await browser.close();
  server.kill('SIGTERM');
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('feature gate ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

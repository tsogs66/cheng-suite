#!/usr/bin/env node
'use strict';
/* Browser checks for the v0.3.383 device bugs. Needs the suite on :8094
   and playwright-core. Not part of npm test (CI has no browser). */
const { chromium } = require('playwright-core');
const ENT = JSON.stringify({
  sku: 'cheng-aio', email: 'audit@test.local', master: true, addons: ['master'],
  graceUntil: '2027-12-31T00:00:00.000Z', expiresAt: '2027-12-31T00:00:00.000Z',
});
const fails = [];
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL'), name, detail || '');
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript((raw) => {
    localStorage.setItem('chengAioLicenseEntitlement', raw);
    localStorage.setItem('chengAioLicenseEntitlementFb', raw);
  }, ENT);
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8094/', { waitUntil: 'domcontentloaded' });
  const boot = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] || {}).type);
  await page.waitForTimeout(6000);
  const later = await page.evaluate(() => (performance.getEntriesByType('navigation') || []).map((n) => n.type));
  check('no reload over 6s on Home', later.length === 1 && later[0] === 'navigate' && boot === 'navigate', JSON.stringify(later));

  const voyage = await ctx.newPage();
  await voyage.goto('http://127.0.0.1:8094/voyage/voyage_manager.html?chengaio=1&page=entry', { waitUntil: 'domcontentloaded' });
  await voyage.waitForTimeout(800);
  const flow = await voyage.evaluate(() => {
    const splash = document.querySelector('.loading-splash');
    if (splash) splash.style.display = 'none';
    if (typeof setLogMetersRevealed === 'function') setLogMetersRevealed(true);
    if (typeof openFmQuickDialog === 'function') openFmQuickDialog();
    const box = document.querySelector('#fmQuickOverlay input');
    if (box) { box.value = '123456'; box.dispatchEvent(new Event('input', { bubbles: true })); }
    if (typeof acceptFmQuickDialog === 'function') acceptFmQuickDialog();
    const body = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement);
    const scroller = document.scrollingElement;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + 400;
    const moved = scroller.scrollTop > before || scroller.scrollHeight <= scroller.clientHeight + 4;
    return {
      overflow: body.overflow + '/' + html.overflow,
      keyboard: document.documentElement.classList.contains('keyboard-open'),
      overlay: !!(document.getElementById('fmQuickOverlay') && document.getElementById('fmQuickOverlay').classList.contains('open')),
      moved,
      scrollH: scroller.scrollHeight,
      clientH: scroller.clientHeight,
    };
  });
  check('flowmeter close releases scroll', flow.moved && !flow.overlay && !flow.keyboard, JSON.stringify(flow));

  const zoom = await voyage.evaluate(() => {
    if (!window.ChengUiZoom) return { missing: true };
    ChengUiZoom.set(1.25);
    const up = document.documentElement.style.zoom;
    ChengUiZoom.set(1);
    return { up, back: document.documentElement.style.zoom || '1' };
  });
  check('zoom control returns to 100%', zoom.up === '1.25' && (zoom.back === '1' || zoom.back === ''), JSON.stringify(zoom));

  const views = [
    [1366, 768, false, 'windows'],
    [390, 844, true, 'phone'],
    [800, 1280, true, 'tablet-portrait'],
    [1280, 800, true, 'tablet-landscape'],
  ];
  for (const [w, h, touch, name] of views) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 500 });
    await c.addInitScript((raw) => {
      localStorage.setItem('chengAioLicenseEntitlement', raw);
      localStorage.setItem('chengAioLicenseEntitlementFb', raw);
    }, ENT);
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:8094/tanks/?chengaio=1&page=fuel-report', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('table.fr-sheet', { timeout: 15000 }).catch(() => {});
    const m = await p.evaluate(() => ({
      bottom: getComputedStyle(document.querySelector('.bottom-nav') || document.body).display,
      top: document.documentElement.classList.contains('use-top-tabs') || document.documentElement.classList.contains('tc-top-nav'),
      overflow: getComputedStyle(document.body).overflowY,
    }));
    const windows = name === 'windows';
    check(name + ' chrome', windows ? m.top : true, JSON.stringify(m));
    await p.close();
    await c.close();
  }
  await browser.close();
  if (fails.length) { console.error(fails); process.exit(1); }
  console.log('browser session matrix ok');
})().catch((e) => { console.error(e); process.exit(1); });

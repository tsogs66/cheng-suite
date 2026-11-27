/**
 * The shell, Voyage and Tank boot scripts share one predicate.
 * Run: node scripts/test-nav-mode.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'apps/web/js/nav-mode.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'apps/web/js/shell.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
const voyage = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
const voyageIndex = fs.readFileSync(path.join(root, 'modules/voyage/www/index.html'), 'utf8');
const tank = fs.readFileSync(path.join(root, 'modules/tanks/public/index.html'), 'utf8');

assert.strictEqual(voyage, voyageIndex, 'Voyage index.html must stay a byte copy of voyage_manager.html');
assert.match(shell, /ChengNav\.wantsBottomNav\(/);
assert.match(index, /src="\/js\/nav-mode\.js"/);
assert.match(index, /ChengNav\.apply\(/);
assert.match(voyage, /src="\/js\/nav-mode\.js"/);
assert.match(voyage, /ChengNav\.apply\(/);
assert.match(tank, /src="\/js\/nav-mode\.js"/);
assert.match(tank, /ChengNav\.apply\(/);

function boot(src) {
  return src.slice(0, 8000).replace(/\/\*[\s\S]*?\*\//g, '');
}
for (const [name, src] of [['shell inline', boot(index)], ['voyage', boot(voyage)], ['tank', boot(tank)], ['nav-mode', boot(nav)]]) {
  assert.doesNotMatch(src, /Math\.min\(\s*(vw|w|window\.innerWidth|screen)/, name + ' still classifies by the short side');
  assert.doesNotMatch(src, /screen\.(width|height)/, name + ' still reads screen size');
  assert.doesNotMatch(src, /innerHeight\s*<=\s*900/, name + ' still uses a height cutoff');
}

assert.match(index, /data-touch="noon"/);
assert.match(index, /data-touch="soundings"/);
assert.match(index, /data-page="entry"/);
assert.match(index, /data-page="fuel-report"/);
assert.match(fs.readFileSync(path.join(root, 'apps/web/js/modules/home.js'), 'utf8'), /id="homePanes"/);
assert.match(fs.readFileSync(path.join(root, 'apps/web/css/shell.css'), 'utf8'), /html\.phone-panes #homePanes/);
assert.match(index, /aio-shell-nav/);
assert.match(voyage, /html\.chengaio-embed[\s\S]{0,400}\.bottom-nav/);
assert.match(fs.readFileSync(path.join(root, 'modules/tanks/public/css/app.css'), 'utf8'), /html\.chengaio-embed \.sidebar/);
assert.match(fs.readFileSync(path.join(root, 'modules/voyage/www/noon-steps.js'), 'utf8'), /When/);
assert.match(fs.readFileSync(path.join(root, 'modules/tanks/public/js/fuel-report.js'), 'utf8'), /sounding-cards/);
assert.match(fs.readFileSync(path.join(root, 'apps/web/css/station.css'), 'utf8'), /html\.station/);

const ChengNav = require(path.join(root, 'apps/web/js/nav-mode.js'));
function at(w, h, extra) {
  return ChengNav.wantsBottomNav(Object.assign({
    innerWidth: w,
    innerHeight: h,
    matchMedia: (q) => ({ matches: !!(extra && extra.coarse) && /coarse/.test(q) }),
    navigator: { userAgent: (extra && extra.ua) || 'Mozilla/5.0 (Windows NT 10.0)' },
  }, extra || {}));
}
assert.strictEqual(at(1366, 768), false);
assert.strictEqual(at(1920, 1080, { coarse: true }), false);
assert.strictEqual(at(360, 800, { coarse: true }), true);
assert.strictEqual(at(430, 932, { coarse: true }), true);
assert.strictEqual(at(800, 1280, { coarse: true }), true);
assert.strictEqual(at(1280, 800, { coarse: true }), true);
assert.strictEqual(at(844, 390, { coarse: true }), true);
assert.strictEqual(ChengNav.wantsPhonePanes({
  innerWidth: 360, innerHeight: 800,
  matchMedia: () => ({ matches: true }),
  navigator: { userAgent: 'Windows' },
}), true);
assert.strictEqual(ChengNav.wantsPhonePanes({
  innerWidth: 800, innerHeight: 1280,
  matchMedia: () => ({ matches: true }),
  navigator: { userAgent: 'Windows' },
}), false);
assert.strictEqual(ChengNav.wantsShortLandscape({
  innerWidth: 800, innerHeight: 360,
  matchMedia: () => ({ matches: true }),
  navigator: { userAgent: 'Windows' },
}), true);

console.log('nav mode: ok');

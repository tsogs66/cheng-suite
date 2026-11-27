#!/usr/bin/env node
'use strict';
/* Vessel library is the same control on every screen, and the sidebar
   order matches the dashboard the chief asked for. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'apps/web/js/modules/backup.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'apps/web/css/shell.css'), 'utf8');

const nav = html.slice(html.indexOf('id="mainNav"'), html.indexOf('id="sidebarFooter"'));
const mods = [...nav.matchAll(/data-module="([^"]+)"/g)].map((m) => m[1]);
const primary = [
  'home', 'voyage', 'tanks', 'bunkerplan', 'bunkeringplan', 'eca', 'eorb',
  'performance', 'spares', 'notes', 'vessel', 'backup', 'license', 'about',
];
assert.deepStrictEqual(mods.slice(0, primary.length), primary);
const voyagePages = ['summary', 'entry', 'rob', 'consumption', 'voyageabstract', 'rangetotals', 'trends', 'receipts', 'reports', 'reference', 'guide', 'shipsetup', 'voyagesetup', 'setup'];
const tankPages = ['dashboard', 'fuel-report', 'fuel', 'lube', 'misc', 'water', 'add-tank', 'calibration', 'bunker-after', 'bunker-summary', 'sounding-card', 'report', 'vcf-wcf', 'iso8217', 'settings', 'about'];
for (const page of voyagePages) assert.ok(nav.includes('data-module="voyage" data-page="' + page + '"'), 'sidebar voyage ' + page);
for (const page of tankPages) assert.ok(nav.includes('data-module="tanks" data-page="' + page + '"'), 'sidebar tanks ' + page);
assert.ok(mods.indexOf('notes') === mods.indexOf('vessel') - 1, 'Notes sits above Vessel Setup');
assert.ok(mods.indexOf('spares') === mods.indexOf('performance') + 1, 'Spares sits below Performance');
assert.ok(nav.includes('Backup &amp; Sync'), 'sidebar names the page Backup & Sync');
assert.ok(!/>\s*Backup\s*</.test(nav), 'sidebar does not keep the short Backup label');

const more = html.slice(html.indexOf('id="bnMoreSheet"'), html.indexOf('id="aioReturnFabs"'));
assert.ok(more.includes('Backup &amp; Sync'), 'phone More sheet uses the same name');
const moreMods = [...more.matchAll(/data-module="([^"]+)"/g)].map((m) => m[1]);
for (const id of mods) {
  assert.ok(moreMods.includes(id), 'More sheet includes every Windows item: ' + id);
}
assert.ok(more.includes('data-page="entry"'), 'Noon report is in More');
assert.ok(more.includes('data-page="fuel-report"'), 'Soundings are in More');
for (const page of voyagePages) {
  if (page === 'entry') continue;
  assert.ok(more.includes('data-module="voyage" data-page="' + page + '"'), 'More voyage ' + page);
}
for (const page of tankPages) {
  assert.ok(more.includes('data-module="tanks" data-page="' + page + '"'), 'More tanks ' + page);
}
const moreItems = more.match(/<button type="button" class="bn-more-item"[\s\S]*?<\/button>/g) || [];
assert.ok(moreItems.length > 14, 'More sheet lists the module pages');
for (const item of moreItems) assert.ok(item.includes('<svg'), 'every More item has an icon');
const moreKeys = moreItems.map((item) => {
  const mod = (item.match(/data-module="([^"]+)"/) || [])[1] || '';
  const page = (item.match(/data-page="([^"]+)"/) || [])[1] || '';
  return mod + ':' + page;
});
assert.strictEqual(new Set(moreKeys).size, moreKeys.length, 'More sheet has no duplicate links');

assert.ok(backup.includes("title: 'Backup & Sync'"));
assert.ok(backup.includes('class="backup-lib-row"'));
assert.ok(backup.includes('const pullId = (voySrc && voySrc.vesselId) || (tankSrc && tankSrc.vesselId)'));
assert.ok(backup.includes('data-voy-pull="${esc(pullId)}"'));
assert.ok(backup.includes('data-voy-mode="${esc(pullId)}"'));
assert.ok(!backup.includes('data-voy-pull="${esc(voySrc.vesselId)}"'), 'Pull voyage is not limited to a Voyage-register row');

assert.ok(css.includes('.backup-lib-row'));
assert.ok(/\.backup-lib-row\s*\{[^}]*align-items:\s*start/.test(css));
assert.ok(css.includes('@media (max-width: 1180px)') && css.includes('.backup-lib-row { grid-template-columns: minmax(0, 1fr); }'));

console.log('library nav ok');

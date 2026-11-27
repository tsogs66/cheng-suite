#!/usr/bin/env node
'use strict';
/* Chief-engineer features: reconciliation, versions, inspection, alerts,
   backup checksums, and the superintendent workbook. Calculations the v1
   parity test covers are not touched here. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const Ce = require(path.join(root, 'apps/web/js/ce-logic.js'));
const Plan = require(path.join(root, 'modules/voyage/www/consumption-plan.js'));

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

assert.strictEqual(Ce.normGrade('VLSFO'), Plan.normGrade('VLSFO'));
assert.strictEqual(Ce.normGrade('MGO'), Plan.normGrade('MGO'));
assert.strictEqual(Ce.normGrade('ULSMGO'), Plan.normGrade('ULSMGO'));

const rules = Ce.rulesFrom(null);
assert.strictEqual(rules.tolerancePct, 1);
assert.strictEqual(rules.overfillPct, 85);
assert.strictEqual(rules.consBandPct, 15);
assert.strictEqual(Ce.rulesFrom({ tolerancePct: 2 }).tolerancePct, 2);

/* Percent only. 0.4% of 100 is inside 1%. 2% is not. */
const close = Ce.reconcileGrade({ grade: 'LSFO', noonMt: 100, soundedMt: 100.4 }, 1);
assert.strictEqual(close.status, 'ok');
const out = Ce.reconcileGrade({ grade: 'VLSFO', noonMt: 100, soundedMt: 102 }, 1);
assert.strictEqual(out.grade, 'LSFO');
assert.strictEqual(out.status, 'warn');
assert.strictEqual(out.deltaMt, 2);

const rows = Ce.buildRecon({
  vesselId: 'mv',
  date: '2026-11-27',
  entries: [{ id: 'n1', ceRob: { VLSFO: 100, LSMGO: 40 } }],
  grades: [{ id: 'lsfo', actualMT: 102, logbookMT: 100 }, { id: 'lsmgo', actualMT: 40.1, logbookMT: 40 }],
  bdn: [{ bdnNumber: 'BDN-9', grade: 'LSFO', quantityMT: 50 }],
  orbEntries: [{ kind: 'bunker', grade: 'LSFO', mt: 50 }],
}, 1);
const lsfo = rows.find((r) => r.grade === 'LSFO');
assert.strictEqual(lsfo.status, 'warn');
assert.strictEqual(lsfo.bdnMt, 50);
assert.strictEqual(lsfo.orbMt, 50);
assert.strictEqual(rows.find((r) => r.grade === 'LSMGO').status, 'ok');

const prev = { id: 'e1', vesselId: 'mv', submittedAt: '2026-11-01T00:00:00Z', rob: { LSFO: 100 }, chEng: '' };
const next = { id: 'e1', vesselId: 'mv', submittedAt: '2026-11-01T00:00:00Z', rob: { LSFO: 90 } };
const edited = Ce.versionSubmittedEdit(prev, next, {
  actor: 'Ada Chief', now: '2026-11-27T12:00:00Z', newId: 'e2', reason: 'Sounding correction',
});
assert.strictEqual(edited.archived.id, 'e1');
assert.strictEqual(edited.archived.hidden, true);
assert.strictEqual(edited.archived.rob.LSFO, 100);
assert.strictEqual(edited.archived.supersededBy, 'e2');
assert.strictEqual(edited.current.id, 'e2');
assert.strictEqual(edited.current.rob.LSFO, 90);
assert.strictEqual(edited.current.submittedAt, null);
assert.strictEqual(edited.current.supersedes, 'e1');
assert.strictEqual(edited.audit.actor, 'Ada Chief');
assert.strictEqual(edited.audit.before.rob.LSFO, 100);
assert.strictEqual(edited.audit.after.rob.LSFO, 90);
assert.strictEqual(Ce.versionSubmittedEdit(prev, prev, { actor: 'Ada Chief' }).changed, false);

const unnamed = Ce.versionSubmittedEdit(prev, next, { actor: '', newId: 'e3' });
assert.strictEqual(unnamed.needsName, true);
assert.strictEqual(unnamed.audit.needsName, true);
const named = Ce.assignAuditActor(unnamed.audit, 'Ada Chief');
assert.strictEqual(named.actor, 'Ada Chief');
assert.strictEqual(named.needsName, false);

const emptyScan = Ce.scanInspection({ orbEntries: [], receipts: [], bdn: [], now: '2026-11-27T12:00:00Z' });
assert.deepStrictEqual(emptyScan.findings, []);

const noSludge = Ce.scanInspection({
  now: '2026-11-27T12:00:00Z',
  orbEntries: [{ code: 'D', date: '2026-11-26', lines: ['bilge pumped'] }],
  bdn: [{ bdnNumber: 'BDN-1', grade: 'LSFO', quantityMT: 100 }],
  receipts: [],
});
assert.ok(noSludge.findings.some((f) => /C\.11/.test(f.item)));
assert.ok(noSludge.findings.some((f) => /BDN-1/.test(f.item)));
assert.ok(!noSludge.findings.some((f) => /voluntary/i.test(f.item)));
assert.ok(noSludge.hints.length === 0 || noSludge.hints.every((h) => h.level === 'hint'));

const matched = Ce.scanInspection({
  now: '2026-11-27T12:00:00Z',
  orbEntries: [{ code: 'C', date: '2026-11-26', selectedItems: ['11.1', '11.2', '11.3'] }],
  bdn: [{ bdnNumber: 'BDN-1' }],
  receipts: [{ id: 'r1', note: 'BDN-1' }],
  sludge: [{ name: 'Sludge port', orbM3: 2.0, soundedM3: 2.5 }],
});
assert.ok(!matched.findings.some((f) => /C\.11/.test(f.item)));
assert.ok(!matched.findings.some((f) => /BDN-1/.test(f.item)));
assert.ok(matched.findings.some((f) => /Sludge port/.test(f.item)));

const quiet = Ce.limitAlerts({ fillPct: 80, overfillPct: 85, ecaAt: '2026-11-28T12:00:00Z', now: '2026-11-27T12:00:00Z', noonGrade: 'LSFO', todayMtPerDay: 20, profileMtPerDay: 20 });
assert.deepStrictEqual(quiet, []);
const loud = Ce.limitAlerts({ fillPct: 90, overfillPct: 85, ecaAt: '2026-11-27T12:30:00Z', now: '2026-11-27T12:00:00Z', noonGrade: 'VLSFO', todayMtPerDay: 30, profileMtPerDay: 20, consBandPct: 15 });
assert.ok(loud.some((a) => a.id === 'overfill'));
assert.ok(loud.some((a) => a.id === 'eca'));
assert.ok(loud.some((a) => a.id === 'consumption'));
const distillate = Ce.limitAlerts({ ecaAt: '2026-11-27T12:30:00Z', now: '2026-11-27T12:00:00Z', noonGrade: 'LSMGO' });
assert.ok(!distillate.some((a) => a.id === 'eca'));
const tooEarly = Ce.limitAlerts({ ecaAt: '2026-11-27T14:30:00Z', now: '2026-11-27T12:00:00Z', noonGrade: 'LSFO' });
assert.ok(!tooEarly.some((a) => a.id === 'eca'));

(async () => {
  const suite = {
    format: 'cheng-aio-suite-v1',
    voyage: { stores: { entries: [{ id: 'e1' }], orbEntries: [] } },
    tank: { vessels: { mv: { tanks: { fuel: [{ id: 't1' }] }, readings: {}, bunkerSummary: { bdnNumber: 'BDN-1' } } } },
  };
  const old = JSON.parse(JSON.stringify(suite));
  const verdictOld = await Ce.checkSuite(old);
  assert.strictEqual(verdictOld.ok, true);
  assert.ok(/no integrity block|before checksums/i.test(verdictOld.warning));

  await Ce.attachSuiteChecksums(suite);
  assert.strictEqual(suite.checksums.entries.count, 1);
  const good = await Ce.checkSuite(suite);
  assert.strictEqual(good.ok, true);

  suite.checksums.entries.sha256 = suite.checksums.entries.sha256.replace(/./, (c) => (c === 'a' ? 'b' : 'a'));
  const bad = await Ce.checkSuite(suite);
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.failed.indexOf('entries') >= 0);

  const sheet = Ce.superintendentSheet({
    vsActual: { rows: [{ grade: 'LSFO', planned: 10, actual: 12, diff: 2 }] },
    recon: [Ce.reconcileGrade({ grade: 'LSFO', noonMt: 100, soundedMt: 102 }, 1)],
    bunker: [{ grade: 'LSFO', plannedMt: 50, actualMt: 48 }],
  });
  const table = Ce.sheetRows(sheet);
  assert.strictEqual(table[0][0], 'Section');
  assert.strictEqual(table[1][1], 'LSFO');
  assert.strictEqual(table[1][2], 10);
  assert.strictEqual(table[1][3], 12);
  const xlsx = Ce.buildXlsx(table);
  assert.strictEqual(xlsx[0], 0x50);
  assert.strictEqual(xlsx[1], 0x4b);
  const text = Buffer.from(xlsx).toString('utf8');
  assert.ok(text.includes('LSFO'));
  assert.ok(text.includes('Consumption vs plan'));
  assert.ok(text.includes('sheet1.xml'));

  const voyage = read('modules/voyage/www/voyage_manager.html');
  assert.match(voyage, /indexedDB\.open\('noonReportDB',\s*12\)/);
  assert.match(voyage, /objectStoreNames\.contains\('robRecon'\)/);
  assert.match(voyage, /objectStoreNames\.contains\('auditLog'\)/);
  assert.match(voyage, /objectStoreNames\.contains\('voyageBriefs'\)/);
  assert.doesNotMatch(voyage, /deleteObjectStore/);
  assert.match(voyage, /setAttribute\('inputmode', 'decimal'\)/);
  assert.match(voyage, /Draft saved/);

  const index = read('modules/voyage/www/index.html');
  assert.strictEqual(index, voyage);

  const fuel = read('modules/tanks/public/js/fuel-report.js');
  assert.match(fuel, /id="fr-submit"/);
  assert.match(fuel, /id="frDraftLine"/);
  assert.match(fuel, /inputmode', 'decimal'/);
  assert.doesNotMatch(fuel.slice(fuel.indexOf('function printSectionTable'), fuel.indexOf('function printConditionSection')), /fr-submit/);

  const ceUi = read('apps/web/js/modules/ce.js');
  assert.doesNotMatch(ceUi, /(^|[^.\w])prompt\s*\(/);
  assert.match(ceUi, /Chief Engineer/);
  assert.match(ceUi, /data-label="Noon"/);
  assert.match(ceUi, /data-label="Sounded"/);
  assert.match(ceUi, /ce-card-wide/);
  const ceCss = read('apps/web/css/ce.css');
  assert.match(ceCss, /@media \(max-width: 599px\), \(max-height: 500px\) and \(orientation: landscape\)/);
  assert.match(ceCss, /\.ce-badge \{ display: none; \}/);
  assert.match(ceCss, /td\.ce-card-wide \{ grid-column: 1 \/ -1; \}/);

  const backup = read('apps/web/js/modules/backup.js');
  assert.match(backup, /checkSuite/);
  assert.match(backup, /attachSuiteChecksums/);

  console.log('ce features ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
'use strict';
/* Every print builder against the v1 snapshot in history/cheng-pro.
   Allowed difference: the annex "In use" column.
   Log and sounding cards keep four black corner marks so a photo can be lined up. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const hist = path.join(root, 'history/cheng-pro');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function readHist(rel) {
  return fs.readFileSync(path.join(hist, rel), 'utf8');
}

function funcs(src) {
  const out = new Map();
  const re = /function\s+(?:async\s+)?([A-Za-z0-9_]*[Pp]rint[A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const rest = src.slice(m.index);
    const nxt = rest.slice(30).search(/\nfunction |\n  function |\n    function /);
    const body = rest.slice(0, nxt > 0 ? nxt + 30 : Math.min(rest.length, 20000));
    if (!out.has(name) || body.length > out.get(name).length) out.set(name, body);
  }
  return out;
}

function norm(s) {
  return s
    .replace(/\s*<th>In use<\/th>/g, '')
    .replace(/\s*<td>\$\{r\.inUse \? 'YES' : ''\}<\/td>/g, '')
    .replace(/\s*<i class="pr-card-mark[\s\S]*?<\/i>/g, '')
    .replace(/\.pr-card-mark\{[^}]*\}/g, '')
    .replace(/\.pr-card-t[lr]\{[^}]*\}[^\n]*/g, '')
    .replace(/\n\s*position:relative;\n/g, '\n')
    .replace(/\/\* keep the rule off the corner marks[\s\S]*?\*\/\n/g, '')
    .replace(/\s*box-sizing:border-box; padding-left:6mm; padding-right:6mm;/g, '')
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n');
}

const PAIRS = [
  ['noon / voyage reports', 'modules/voyage/www/voyage_manager.html'],
  ['tank condition', 'modules/tanks/public/js/fuel-report.js'],
  ['bunkering plan / after / summary', 'modules/tanks/public/js/bunkering-report.js'],
  ['consumption plan', 'modules/tanks/public/js/bunker-consumption.js'],
  ['sounding card', 'modules/tanks/public/js/tank-sounding-card.js'],
];

/* One check per sheet the office prints. The name is the user-facing printout. */
const SHEETS = [
  ['Noon to noon', 'modules/voyage/www/voyage_manager.html', 'printNoonToNoon'],
  ['Noon batch', 'modules/voyage/www/voyage_manager.html', 'printNoonToNoonBatch'],
  ['Supplementary / voyage report', 'modules/voyage/www/voyage_manager.html', 'printSupplementaryReport'],
  ['Voyage summary / superintendent', 'modules/voyage/www/voyage_manager.html', 'printVoyageSummary'],
  ['Log entry text', 'modules/voyage/www/voyage_manager.html', 'printReportText'],
  ['Log entry data card', 'modules/voyage/www/voyage_manager.html', 'printLogEntryDataRecord'],
  ['Flowmeter record', 'modules/voyage/www/voyage_manager.html', 'printFlowmeterRecord'],
  ['ROB sheet', 'modules/voyage/www/voyage_manager.html', 'printRobPageSheet'],
  ['ROB snapshot', 'modules/voyage/www/voyage_manager.html', 'printRobSnapshot'],
  ['Departure / arrival ROB', 'modules/voyage/www/voyage_manager.html', 'printDepArrRobSheet'],
  ['Range totals', 'modules/voyage/www/voyage_manager.html', 'printRangeTotalsSheet'],
  ['Passage / handover pack', 'modules/voyage/www/voyage_manager.html', 'printHandoverPack'],
  ['ECA changeover plan', 'modules/voyage/www/voyage_manager.html', 'printChangeoverPlan'],
  ['ECA section', 'modules/voyage/www/voyage_manager.html', 'printEcaSection'],
  ['Coating / EU plan', 'modules/voyage/www/voyage_manager.html', 'printCoEuPlan'],
  ['e-ORB / ORB', 'modules/voyage/www/voyage_manager.html', 'printOrbEntries'],
  ['Spares requisition', 'modules/voyage/www/voyage_manager.html', 'printRequisitionSummary'],
  ['Weather on the noon', 'modules/voyage/www/voyage_manager.html', 'printWeatherSection'],
  ['Noon voyage averages', 'modules/voyage/www/voyage_manager.html', 'printNoonVoyageAveragesSection'],
  ['Main engine cylinders', 'modules/voyage/www/voyage_manager.html', 'printMeCylinderSection'],
  ['Turbo / others', 'modules/voyage/www/voyage_manager.html', 'printTurboOthersSection'],
  ['Soundings on the noon', 'modules/voyage/www/voyage_manager.html', 'printSoundingsSection'],
  ['Tank condition page', 'modules/tanks/public/js/fuel-report.js', 'printConditionPage'],
  ['Tank condition section', 'modules/tanks/public/js/fuel-report.js', 'printConditionSection'],
  ['Tank condition table', 'modules/tanks/public/js/fuel-report.js', 'printSectionTable'],
  ['Tank condition masthead', 'modules/tanks/public/js/fuel-report.js', 'printMasthead'],
  ['Tank annex', 'modules/tanks/public/js/fuel-report.js', 'printAnnexPage'],
  ['Tank summary page', 'modules/tanks/public/js/fuel-report.js', 'printSummaryPage'],
  ['Tank calculation page', 'modules/tanks/public/js/fuel-report.js', 'printCalculationPage'],
  ['Tank formula page', 'modules/tanks/public/js/fuel-report.js', 'printFormulaPage'],
  ['Sounding card', 'modules/tanks/public/js/tank-sounding-card.js', 'printBlank'],
  ['Sounding card document', 'modules/tanks/public/js/tank-sounding-card.js', 'buildPrintDocument'],
];

const cache = new Map();
function pair(rel) {
  if (!cache.has(rel)) {
    cache.set(rel, { now: funcs(read(rel)), old: funcs(readHist(rel)) });
  }
  return cache.get(rel);
}

for (const [label, rel] of PAIRS) {
  const { now, old } = pair(rel);
  const names = [...new Set([...now.keys(), ...old.keys()])].sort();
  for (const name of names) {
    assert.ok(old.has(name), label + ' ' + name + ' is new and has no v1 print');
    assert.ok(now.has(name), label + ' ' + name + ' is missing from v2');
    assert.strictEqual(norm(now.get(name)), norm(old.get(name)), label + ' ' + name + ' print markup drifted from v1');
  }
  console.log(label + ': ' + names.length + ' print builders match v1');
}

for (const [label, rel, name] of SHEETS) {
  const { now, old } = pair(rel);
  assert.ok(now.has(name) && old.has(name), label + ' (' + name + ') is not in both trees');
  assert.strictEqual(norm(now.get(name)), norm(old.get(name)), label + ' does not match v1');
  console.log('printout ' + label + ': match');
}

const voyage = read('modules/voyage/www/voyage_manager.html');
const card = read('modules/tanks/public/js/tank-sounding-card.js');
['tl', 'tr', 'bl', 'br'].forEach((corner) => {
  assert.ok(voyage.includes('data-card-mark="' + corner + '"'), 'log card mark ' + corner);
  assert.ok(card.includes('data-card-mark="' + corner + '"'), 'sounding card mark ' + corner);
});
assert.ok(voyage.includes('.pr-card-mark{') && card.includes('.pr-card-mark{'), 'corner marks are printed black squares');
assert.ok(!read('modules/tanks/public/js/fuel-report.js').includes('<th>In use</th>'), 'annex print does not restore the In use column');
assert.strictEqual(voyage, read('modules/voyage/www/index.html'), 'voyage print copies stay identical');

const ce = read('apps/web/js/modules/ce.js');
assert.ok(ce.includes('Does not print a new form'), 'ROB recon, alerts, and pre-inspection do not invent a print');

console.log('print parity ok');

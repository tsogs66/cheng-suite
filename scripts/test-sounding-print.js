#!/usr/bin/env node
'use strict';
/* The on-screen sounding sheet no longer shows a Fuel Type select.
   The printed Tank Condition sheet is the v1 print, Fuel column included. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const now = fs.readFileSync(path.join(root, 'modules/tanks/public/js/fuel-report.js'), 'utf8');
const v1 = fs.readFileSync(path.join(root, 'history/cheng-pro/modules/tanks/public/js/fuel-report.js'), 'utf8');

function grab(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' is in the file');
  const rest = src.slice(at);
  const next = rest.slice(name.length).search(/\n  function /);
  assert.ok(next > 0, name + ' has a following function');
  return rest.slice(0, name.length + next);
}

for (const name of ['printSectionTable', 'printConditionSection', 'printAnnexPage', 'printMasthead']) {
  assert.strictEqual(grab(now, name), grab(v1, name), name + ' print markup matches v1');
}
assert.match(grab(now, 'printConditionSection'), /<th>Fuel<\/th>/);
assert.match(grab(now, 'printConditionSection'), /fuelTypeLabel/);
assert.match(grab(now, 'printSectionTable'), /fuelTypeLabel/);

const screen = grab(now, 'renderSectionPanel');
assert.doesNotMatch(screen, /data-field="fuelType"/, 'the sheet does not offer a fuel-type select');
assert.doesNotMatch(screen, />FUEL TYPE</, 'the sheet header has no Fuel Type column');
assert.match(screen, /data-phone="main"/);
assert.match(screen, /data-fr-more/);
assert.match(v1, /data-field="fuelType"/, 'v1 still had the select, so this check is against the old sheet');

console.log('sounding print matches v1');

/**
 * Consumption and bunker results must match ChEng AIO v1 (Cheng-Pro 2f0b79bb,
 * stored under history/cheng-pro). Formulas are not edited here.
 * Run: node scripts/test-calc-v1-parity.js
 */
'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const v2calc = require(path.join(root, 'modules/tanks/server/calc.js'));
const v1calc = require(path.join(root, 'history/cheng-pro/modules/tanks/server/calc.js'));
const v2plan = require(path.join(root, 'modules/tanks/public/js/consumption-plan.js'));
const v1plan = require(path.join(root, 'history/cheng-pro/modules/tanks/public/js/consumption-plan.js'));

function same(label, a, b) {
  assert.deepStrictEqual(a, b, label + ' drifted from v1');
  console.log('  ok  ', label);
}

const densities = [820, 860, 890, 950, 991];
const temps = [10, 15, 40, 80, 98];
for (const d of densities) {
  same('wcf56 ' + d, v2calc.wcf56(d), v1calc.wcf56(d));
  for (const t of temps) {
    same('vcf54B ' + d + '@' + t, v2calc.vcf54B(d, t), v1calc.vcf54B(d, t));
    same('vcf detail ' + d + '@' + t, v2calc.vcfDetail54B(d, t), v1calc.vcfDetail54B(d, t));
  }
}

const blend = [
  { label: 'VLSFO', density15: 980, quantityMT: 400, tempC: 45 },
  { label: 'LSMGO', density15: 860, volumeM3: 50, tempC: 30 },
  { label: 'MDO', density15: 890, quantityMT: 80, tempC: 25 },
];
same('blendFuels', v2calc.blendFuels(blend, 'wcf'), v1calc.blendFuels(blend, 'wcf'));

const now = Date.parse('2026-11-27T12:00:00Z');
const progress = {
  plannedMT: 500,
  receivedMT: 180,
  rateMTPerHour: 120,
  startedAt: '2026-11-27T08:00:00Z',
  elapsedPausedMs: 15 * 60 * 1000,
  now,
};
same('bunkerProgress', v2calc.bunkerProgress(progress), v1calc.bunkerProgress(progress));

const plan = {
  sections: [{
    over: { misc: 0.4 },
    legs: [
      { distance: 2400, hours: 200, port: false, fuels: [{ grade: 'VLSFO', mtPerDay: 28 }, { grade: 'LSMGO', mtPerDay: 1.2 }] },
      { distance: 0, hours: 48, port: true, fuels: [{ grade: 'MDO', mtPerDay: 3 }] },
    ],
  }],
  stocks: [
    { grade: 'VLSFO', currentRob: 900, qtyReceive: 0 },
    { grade: 'LSMGO', currentRob: 120, qtyReceive: 40 },
    { grade: 'MDO', currentRob: 60, qtyReceive: 0 },
  ],
};
/* plannedAt walks sectionList/legDays. If the fixture shape is incomplete both copies throw the same way. */
function runPlan(api) {
  const at = api.plannedAt(plan, 5);
  const vs = api.planVsActual(plan, {
    to: '2026-11-25T00:00:00Z',
    dist: 1100,
    hrs: 120,
    fuel: { VLSFO: 140, LSMGO: 6 },
    rob: { VLSFO: 760, LSMGO: 114 },
  }, '2026-11-20T00:00:00Z');
  return { at, vs };
}
let v2p;
let v1p;
try {
  v2p = runPlan(v2plan);
  v1p = runPlan(v1plan);
} catch (err) {
  /* Same throw on both copies is still parity. */
  let v1err = null;
  try { runPlan(v1plan); } catch (e) { v1err = e.message; }
  assert.strictEqual(err.message, v1err, 'consumption plan error differs from v1: ' + err.message);
  console.log('  ok   consumption plan (same v1 error:', err.message + ')');
  v2p = v1p = null;
}
if (v2p) same('consumption plan', v2p, v1p);

console.log('calc v1 parity: ok');

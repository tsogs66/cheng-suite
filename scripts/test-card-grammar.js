/* Dates, times, fresh-water pairs, Empty, and the checks after a read. */
'use strict';
const assert = require('assert');
const G = require('../apps/web/js/card-grammar.js');
let pass = 0, failed = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

check('09.00 and 0900H and 08:00 are the same time', () => {
  assert.strictEqual(G.canonTime('09.00'), '09:00');
  assert.strictEqual(G.canonTime('0900H'), '09:00');
  assert.strictEqual(G.canonTime('0900 H'), '09:00');
  assert.strictEqual(G.canonTime('08:00'), '08:00');
  assert.strictEqual(G.canonTime('1400H'), '14:00');
  assert.strictEqual(G.canonTime('12.00'), '12:00');
});
check('17-11-2026, 17/11/26, 17 NOV 2026 and NOV 17 2026 are one date', () => {
  assert.strictEqual(G.canonDate('17-11-2026'), '17/11/2026');
  assert.strictEqual(G.canonDate('17/11/26'), '17/11/2026');
  assert.strictEqual(G.canonDate('17 NOV 2026'), '17/11/2026');
  assert.strictEqual(G.canonDate('17 NOVEMBER 2026'), '17/11/2026');
  assert.strictEqual(G.canonDate('NOV 17 2026'), '17/11/2026');
  assert.strictEqual(G.canonDate('13 NOVEMBER 2026'), '13/11/2026');
  assert.strictEqual(G.canonDate('13 NOVEMBER 126'), '13/11/2026');
  assert.strictEqual(G.canonDate('17 NOV 26'), '17/11/2026');
});
check('a 2-digit exhaust reading is reranked to the 3-digit figure in range', () => {
  assert.strictEqual(G.rerank('exh:5', ['28', '280']), '280');
  assert.strictEqual(G.rerank('exh:5', ['580']), '580');
  assert.strictEqual(G.rerank('rack:4', ['57']), '57');
});
check('a date and a time on one line stay together', () => {
  assert.strictEqual(G.canonDateTime('17 - 11 - 2026 12.00'), '17/11/2026 12:00');
  assert.strictEqual(G.canonDateTime('17/11/2026 1200H'), '17/11/2026 12:00');
});
check('112/111 and 112/111 = 223', () => {
  assert.strictEqual(G.canonPair('112/111'), '112/111');
  assert.strictEqual(G.canonPair('112 / 111'), '112/111');
  assert.strictEqual(G.canonPair('112/111=223'), '112/111=223');
  assert.strictEqual(G.canonPair('112/111 = 223'), '112/111=223');
});
check('Empty on a sounding is 0', () => {
  assert.strictEqual(G.apply('number', '4312', { emptyWord: true }), '0');
  assert.strictEqual(G.apply('number', '350', {}), '350');
});
check('a sounding above the tank, a counter that fell, and a ROB jump are flagged', () => {
  const flags = G.crossCheck({ 'cm:3': '2500', 'fm:me': '100', bilgeRob: '20' }, { previous: { 'fm:me': '4981210', bilgeRob: '13.9' }, maxSoundingCm: 2000, robJump: 5 });
  assert.ok(flags.some((f) => f.kind === 'sounding'));
  assert.ok(flags.some((f) => f.kind === 'counter'));
  assert.ok(flags.some((f) => f.kind === 'rob'));
  assert.strictEqual(G.crossCheck({ 'cm:3': '350', 'fm:me': '4981210' }, { previous: { 'fm:me': '4000000' } }).length, 0);
});

console.log(`\n${pass} passed${failed ? ', ' + failed + ' FAILED' : ''}`);
process.exit(failed ? 1 : 0);

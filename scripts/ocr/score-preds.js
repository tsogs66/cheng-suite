/* Score a predictions JSON (manifest rows plus pred) with the same grammar as the card test. */
'use strict';
const fs = require('fs');
const G = require('../../apps/web/js/card-grammar.js');

const preds = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

function groupOf(key) {
  if (/^datetime$|^date$/.test(key)) return 'date';
  if (key === 'time') return 'time';
  if (key === 'fwRob') return 'pair';
  if (/^fm:|hrs$|svc$|rpm$/.test(key)) return 'counter';
  if (/Temp|temp:|exh:|press|Press|bilge|sludge|fwd|aft|trim|sea$|^er$|rack:|kw$|scav|acIn|acOut|pump|dist|windBft/.test(key)) return 'decimal';
  if (/^cm:/.test(key)) return 'sounding';
  return 'other';
}
function kindOf(key) {
  if (key === 'fwRob') return 'pair';
  if (key === 'datetime') return 'datetime';
  if (key === 'date') return 'date';
  if (key === 'time') return 'time';
  if (/^fm:|hrs$|svc$|rpm$/.test(key)) return 'int';
  return 'number';
}
function canon(key, value) {
  const t = kindOf(key);
  if (value == null) value = '';
  if (t === 'number' && value === '') return '';
  let v = String(value);
  if (/^cm:/.test(key) && /^empty$/i.test(v.trim())) v = '0';
  return G.apply(t, v, {});
}

const groups = {};
let ok = 0, n = 0;
preds.forEach((r) => {
  const want = canon(r.key, r.text);
  const have = canon(r.key, r.pred);
  const g = groupOf(r.key);
  if (!groups[g]) groups[g] = { ok: 0, n: 0 };
  groups[g].n++; n++;
  if (want === have) { groups[g].ok++; ok++; }
});
Object.keys(groups).sort().forEach((k) => {
  const t = groups[k];
  console.log(k.padEnd(10), (t.ok / t.n * 100).toFixed(1) + '%', t.ok + '/' + t.n);
});
console.log('overall', (ok / n * 100).toFixed(1) + '%', ok + '/' + n);

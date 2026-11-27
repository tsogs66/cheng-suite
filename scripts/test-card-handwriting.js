/**
 * Held-out handwritten cards. The score uses only the photos listed as test in the gold file,
 * which includes cards photographed on their side. Training crops must not come from those photos.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const R = require('../apps/web/js/card-reader.js');
const D = require('../apps/web/js/digit-reader.js');
const G = require('../apps/web/js/card-grammar.js');
global.ChengDigitReader = D;
global.ChengCardGrammar = G;
const netPath = process.env.DIGIT_NET || path.join(__dirname, '../apps/web/vendor/ocr/digit-net.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(netPath, 'utf8'), sandbox);
global.CHENG_DIGIT_NET = sandbox.window.CHENG_DIGIT_NET;
D.setNet(sandbox.window.CHENG_DIGIT_NET);

const gold = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/card-gold.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/card-layouts.json'), 'utf8'));
const photoDir = process.env.CARD_PHOTOS || path.join(__dirname, 'fixtures/card-photos');

function loadJpeg(file) {
  const py = spawnSync('python3', ['-c', `
from PIL import Image, ImageOps
import sys
im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGBA')
im.thumbnail((1800, 1800))
w, h = im.size
sys.stdout.buffer.write(w.to_bytes(4, 'little') + h.to_bytes(4, 'little') + im.tobytes())
`, file], { maxBuffer: 40 * 1024 * 1024 });
  if (py.status) throw new Error(py.stderr.toString() || 'decode failed');
  const buf = py.stdout;
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  return { width: w, height: h, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, w * h * 4) };
}

function groupOf(key, kind) {
  if (kind === 'box') return 'method';
  if (/^datetime$|^date$/.test(key)) return 'date';
  if (key === 'time') return 'time';
  if (key === 'fwRob') return 'pair';
  if (/^fm:|hrs$|svc$|rpm$/.test(key)) return 'counter';
  if (/Temp|temp:|exh:|press|Press|bilge|sludge|fwd|aft|trim|sea$|^er$|rack:|kw$|scav|acIn|acOut|pump|dist|windBft/.test(key)) return 'decimal';
  if (/^cm:/.test(key)) return 'sounding';
  return 'other';
}

function canon(kind, key, value) {
  const t = key === 'fwRob' ? 'pair' : key === 'datetime' ? 'datetime' : key === 'date' ? 'date' : key === 'time' ? 'time' : 'number';
  if (value == null) value = '';
  if (t === 'number' && value === '') return '';
  return G.apply(t, value, {});
}

async function readCard(file, kind) {
  const image = loadJpeg(file);
  const photo = { image: image, upscaled: 1 };
  const layout = layouts[kind];
  const corners = R.findCorners(photo, layout);
  if (!corners) return null;
  const res = await R.readWithCorners(photo, corners, layout);
  const fields = {};
  (res.rows || []).forEach((r) => { fields[r.key] = r.text || ''; });
  const boxes = {};
  (res.boxes || []).forEach((b) => { boxes[b.key] = b.dark > 0.18; });
  return { fields, boxes, turn: res.turn };
}

function scoreCard(rec, got) {
  const groups = {};
  function add(group, ok) {
    if (!groups[group]) groups[group] = { ok: 0, n: 0 };
    groups[group].n++;
    if (ok) groups[group].ok++;
  }
  const unsure = new Set(rec.unsure || []);
  Object.keys(rec.fields).forEach((key) => {
    if (unsure.has(key)) return;
    if (/^(operation|windDir|seaState)$/.test(key)) return;
    const kind = rec.kind === 'log' && key === 'datetime' ? 'datetime' : rec.kind === 'sounding' && key === 'date' ? 'date' : rec.kind === 'sounding' && key === 'time' ? 'time' : 'number';
    const want = canon(kind, key, rec.fields[key]);
    const have = canon(kind, key, got && got.fields[key]);
    add(groupOf(key), want === have);
  });
  Object.keys(rec.boxes || {}).forEach((key) => {
    if (unsure.has(key)) return;
    add('method', !!rec.boxes[key] === !!(got && got.boxes[key]));
  });
  return groups;
}

function merge(into, g) {
  Object.keys(g).forEach((k) => {
    if (!into[k]) into[k] = { ok: 0, n: 0 };
    into[k].ok += g[k].ok;
    into[k].n += g[k].n;
  });
}

async function main() {
  const only = new Set(gold.test);
  const totals = {};
  let cards = 0, missed = 0;
  for (const name of gold.test) {
    const rec = gold.cards[name];
    const file = path.join(photoDir, name);
    if (!fs.existsSync(file)) { console.log('MISSING', name); missed++; continue; }
    const got = await readCard(file, rec.kind);
    if (!got) { console.log('NO CORNERS', name.slice(0, 8), 'rotated', rec.rotated); missed++; continue; }
    const g = scoreCard(rec, got);
    merge(totals, g);
    const n = Object.values(g).reduce((s, x) => s + x.n, 0);
    const ok = Object.values(g).reduce((s, x) => s + x.ok, 0);
    console.log(name.slice(0, 8), rec.kind, rec.rotated ? 'rot' : 'up', 'turn', got.turn, (ok / n * 100).toFixed(0) + '%');
    cards++;
  }
  console.log('---');
  let ok = 0, n = 0;
  Object.keys(totals).sort().forEach((k) => {
    const t = totals[k];
    ok += t.ok; n += t.n;
    console.log(k.padEnd(10), (t.ok / t.n * 100).toFixed(1) + '%', t.ok + '/' + t.n);
  });
  const all = n ? ok / n : 0;
  console.log('overall', (all * 100).toFixed(1) + '%', ok + '/' + n, 'cards', cards, 'missed', missed);
  if (process.env.SAVE) fs.writeFileSync(process.env.SAVE, JSON.stringify({ totals, all, cards, missed }, null, 2));
  /* gates: the held-out set must clear these. They sit above the v0.3.385 reader. */
  const gate = { decimal: 0.70, counter: 0.60, sounding: 0.75, method: 0.80, overall: 0.70 };
  if (process.env.GATE) {
    let bad = false;
    Object.keys(gate).forEach((k) => {
      const t = k === 'overall' ? { ok, n } : totals[k];
      const p = t && t.n ? t.ok / t.n : 0;
      if (p + 1e-9 < gate[k]) { console.log('GATE', k, (p * 100).toFixed(1) + '% < ' + (gate[k] * 100) + '%'); bad = true; }
    });
    if (missed > 1) bad = true;
    if (bad) process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

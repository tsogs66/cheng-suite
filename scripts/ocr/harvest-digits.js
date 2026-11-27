/* Cut digits from the training photos only, where the cut matches the gold digit-for-digit. Held-out photos are skipped. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');
const R = require('../../apps/web/js/card-reader.js');
const D = require('../../apps/web/js/digit-reader.js');
global.ChengDigitReader = D;
const sb = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../apps/web/vendor/ocr/digit-net.js'), 'utf8'), sb);
global.CHENG_DIGIT_NET = sb.window.CHENG_DIGIT_NET;
D.setNet(sb.window.CHENG_DIGIT_NET);

const gold = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/card-gold.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/card-layouts.json'), 'utf8'));
const dir = path.join(__dirname, '../fixtures/card-photos');
const held = new Set(gold.test);

function loadJpeg(file) {
  const py = spawnSync('python3', ['-c', `
from PIL import Image, ImageOps
import sys
im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGBA')
im.thumbnail((1600, 1600))
w, h = im.size
sys.stdout.buffer.write(w.to_bytes(4, 'little') + h.to_bytes(4, 'little') + im.tobytes())
`, file], { maxBuffer: 30 * 1024 * 1024 });
  if (py.status) return null;
  const buf = py.stdout;
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  return { width: w, height: h, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, w * h * 4) };
}

function inkOf(prep) {
  const n = prep.image.width * prep.image.height;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = prep.image.data[i * 4] < 128 ? 1 : 0;
  return ink;
}

(async function () {
  const out = [];
  const names = Object.keys(gold.cards).filter((n) => !held.has(n));
  for (const name of names) {
    const rec = gold.cards[name];
    const image = loadJpeg(path.join(dir, name));
    if (!image) continue;
    const photo = { image, upscaled: 1 };
    const layout = layouts[rec.kind];
    const corners = R.findCorners(photo, layout);
    if (!corners) continue;
    const res = await R.readWithCorners(photo, corners, layout);
    const lay = res.layout;
    let kept = 0;
    lay.fields.forEach((f) => {
      if (f.type === 'text' || f.type === 'date' || f.type === 'datetime' || f.type === 'time') return;
      const want = String(rec.fields[f.key] == null ? '' : rec.fields[f.key]);
      const chars = want.replace(/[^0-9.\-\/]/g, '');
      if (!/[0-9]/.test(chars)) return;
      const prep = R.prepareField(res.card, f.rect, f.tbl >= 0 ? 4 : 3, f.grow, f.tbl >= 0, null);
      const ink = inkOf(prep);
      const parts = D.segmentNumber(ink, prep.image.width, prep.image.height, chars.indexOf('/') >= 0, { dateSep: chars.indexOf('-') >= 0 });
      const got = parts.map((p) => p.kind === 'digit' ? '?' : p.kind === 'dot' ? '.' : p.kind === 'minus' ? '-' : p.kind === 'slash' ? '/' : '').join('');
      const goldChars = chars.split('');
      if (parts.length !== goldChars.length) return;
      parts.forEach((p, i) => {
        const ch = goldChars[i];
        if (p.kind === 'digit' && /[0-9]/.test(ch) && p.img) out.push({ l: ch, img: Array.from(p.img) });
        else if ((ch === '.' && p.kind === 'dot') || (ch === '-' && p.kind === 'minus') || (ch === '/' && p.kind === 'slash')) {
          /* punctuation is stored as a box crop later; skip glyphs without an image */
        }
      });
      if (got.replace(/\?/g, '') === '' ) kept++;
    });
    console.log(name.slice(0, 8), 'crops', out.length);
  }
  fs.writeFileSync('/tmp/digit-crops.json', JSON.stringify(out));
  console.log('total', out.length);
})();

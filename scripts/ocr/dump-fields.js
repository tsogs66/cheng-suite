/* Straighten every card and save each field crop plus its gold text. Test photos are marked split=test. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../../apps/web/js/card-reader.js');
const D = require('../../apps/web/js/digit-reader.js');
global.ChengDigitReader = D;

const gold = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/card-gold.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/card-layouts.json'), 'utf8'));
const photoDir = path.join(__dirname, '../fixtures/card-photos');
const outDir = process.env.FIELD_DIR || '/tmp/card-fields';
const held = new Set(gold.test);
fs.mkdirSync(outDir, { recursive: true });

function loadJpeg(file) {
  const py = spawnSync('python3', ['-c', `
from PIL import Image, ImageOps
import sys
im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGBA')
im.thumbnail((1800, 1800))
w, h = im.size
sys.stdout.buffer.write(w.to_bytes(4, 'little') + h.to_bytes(4, 'little') + im.tobytes())
`, file], { maxBuffer: 40 * 1024 * 1024 });
  if (py.status) throw new Error(py.stderr.toString());
  const buf = py.stdout;
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  return { width: w, height: h, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, w * h * 4) };
}

function cropGray(card, rect) {
  const W = card.width, H = card.height;
  let x0 = Math.max(0, Math.floor(rect.x * W));
  let y0 = Math.max(0, Math.floor(rect.y * H));
  let x1 = Math.min(W, Math.ceil((rect.x + rect.w) * W));
  let y1 = Math.min(H, Math.ceil((rect.y + rect.h) * H));
  const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
  const g = Buffer.alloc(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = ((y0 + y) * W + (x0 + x)) * 4;
      g[y * cw + x] = Math.round(card.data[p] * 0.299 + card.data[p + 1] * 0.587 + card.data[p + 2] * 0.114);
    }
  }
  return { w: cw, h: ch, g };
}

(async function () {
  const rows = [];
  for (const name of Object.keys(gold.cards)) {
    const rec = gold.cards[name];
    const image = loadJpeg(path.join(photoDir, name));
    const photo = { image, upscaled: 1 };
    const layout = layouts[rec.kind];
    const corners = R.findCorners(photo, layout);
    if (!corners) { console.log('no corners', name.slice(0, 8)); continue; }
    const res = await R.readWithCorners(photo, corners, layout);
    const id = name.slice(0, 8);
    const dir = path.join(outDir, held.has(name) ? 'test' : 'train', id);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of res.layout.fields) {
      if (f.type === 'text') continue;
      const text = rec.fields[f.key];
      if (text == null) continue;
      if ((rec.unsure || []).includes(f.key)) continue;
      const c = cropGray(res.card, f.rect);
      const safe = f.key.replace(/[^a-z0-9]+/gi, '_');
      const pgm = path.join(dir, safe + '.pgm');
      fs.writeFileSync(pgm, Buffer.concat([Buffer.from('P5\n' + c.w + ' ' + c.h + '\n255\n'), c.g]));
      rows.push({ split: held.has(name) ? 'test' : 'train', file: name, key: f.key, type: f.type, kind: rec.kind, text: String(text), path: pgm });
    }
    console.log(id, held.has(name) ? 'test' : 'train', rows.length);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(rows));
  console.log('fields', rows.length);
})();

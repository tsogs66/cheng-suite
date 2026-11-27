/* Read one card photo with the offline reader. Usage: node scripts/ocr/read-photo.js <jpg> <log|sounding> */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const R = require('../../apps/web/js/card-reader.js');
const D = require('../../apps/web/js/digit-reader.js');
const G = require('../../apps/web/js/card-grammar.js');
global.ChengDigitReader = D;
global.ChengCardGrammar = G;
const netSrc = fs.readFileSync(path.join(__dirname, '../../apps/web/vendor/ocr/digit-net.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(netSrc, sandbox);
D.setNet(sandbox.window.CHENG_DIGIT_NET);

function loadJpeg(file) {
  const py = spawnSync('python3', ['-c', `
from PIL import Image
import sys
im = Image.open(sys.argv[1])
from PIL import ImageOps
im = ImageOps.exif_transpose(im).convert('RGBA')
im.thumbnail((2000, 2000))
w, h = im.size
sys.stdout.buffer.write(w.to_bytes(4, 'little') + h.to_bytes(4, 'little') + im.tobytes())
`, file], { maxBuffer: 40 * 1024 * 1024 });
  if (py.status) throw new Error(py.stderr.toString());
  const buf = py.stdout;
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  return { width: w, height: h, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, w * h * 4) };
}

async function main() {
  const file = process.argv[2];
  const kind = process.argv[3] || 'log';
  const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/card-layouts.json'), 'utf8'));
  const layout = layouts[kind];
  const image = loadJpeg(file);
  const photo = { image: image, upscaled: 1 };
  const corners = R.findCorners(photo, layout);
  if (!corners) { console.log('NO CORNERS'); process.exit(2); }
  for (let r = 0; r < 4; r++) {
    const c = R.straighten(photo, R.turnCorners(corners, r), layout);
    if (c) {
      const lay = R.alignToPrintedLines(c, layout);
      console.log('rot', r, 'up', R.uprightScore(c).toFixed(3), 'align', R.alignScore(lay).toFixed(1), 'tables', lay.alignedTables);
    }
    if (c && process.env.DUMP) {
      const hdr = Buffer.from('P6\n' + c.width + ' ' + c.height + '\n255\n');
      const rgb = Buffer.alloc(c.width * c.height * 3);
      for (let i = 0; i < c.width * c.height; i++) { rgb[i * 3] = c.data[i * 4]; rgb[i * 3 + 1] = c.data[i * 4 + 1]; rgb[i * 3 + 2] = c.data[i * 4 + 2]; }
      fs.writeFileSync('/tmp/rot-' + r + '.ppm', Buffer.concat([hdr, rgb]));
    }
  }
  const res = await R.readWithCorners(photo, corners, layout);
  console.log('turn', res.turn, 'title', res.titleScore);
  const card = res.card;
  if (card) {
    const hdr = Buffer.from('P6\n' + card.width + ' ' + card.height + '\n255\n');
    const rgb = Buffer.alloc(card.width * card.height * 3);
    for (let i = 0; i < card.width * card.height; i++) { rgb[i * 3] = card.data[i * 4]; rgb[i * 3 + 1] = card.data[i * 4 + 1]; rgb[i * 3 + 2] = card.data[i * 4 + 2]; }
    fs.writeFileSync('/tmp/card-straight.ppm', Buffer.concat([hdr, rgb]));
  }
  res.rows.forEach((r) => { if (r.text) console.log(r.key + '\t' + r.text + '\t' + r.conf); });
  const boxes = (res.boxes || []).filter((b) => b.dark > 0.18);
  console.log('ticked', boxes.map((b) => b.key).join(' '));
}
main().catch((e) => { console.error(e); process.exit(1); });

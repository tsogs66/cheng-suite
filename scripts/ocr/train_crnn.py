#!/usr/bin/env python3
"""Field-level CRNN+CTC for the ship's handwritten cards.

Glyphs come from EMNIST digits and letters, plus the training photos' own digit crops.
Real field crops (training split only) are mixed in with the same augmentation the ship
sees: blue or black ink, an underline, a few degrees of rotation, blur, perspective and
uneven light. Held-out photos are never read here.
"""
import gzip
import json
import random
import struct
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

CHARS = '0123456789.-/: ABCDEFGHIJKLMNOPQRSTUVWXYZ'
BLANK = 0
ST = {c: i + 1 for i, c in enumerate(CHARS)}
NCLASS = len(CHARS) + 1
H = 32
DEVICE = 'cpu'
ROOT = Path('/tmp/emnist/gzip')
MANIFEST = Path('/tmp/card-fields/manifest.json')
CROPS = Path('/tmp/digit-crops.json')
OUT = Path('/workspace/apps/web/vendor/ocr/field-rec.onnx')


def load_idx_images(path):
    raw = gzip.open(path, 'rb').read()
    _, n, r, c = struct.unpack('>IIII', raw[:16])
    return np.frombuffer(raw[16:], dtype=np.uint8).reshape(n, r, c).copy()


def load_idx_labels(path):
    raw = gzip.open(path, 'rb').read()
    _, n = struct.unpack('>II', raw[:8])
    return np.frombuffer(raw[8:], dtype=np.uint8).copy()


def orient_emnist(img):
    # EMNIST is stored transposed relative to MNIST. This puts the glyph upright, ink = 255.
    return np.fliplr(np.rot90(img, -1))


class Glyphs:
    def __init__(self):
        self.pool = {c: [] for c in CHARS if c != ' '}
        dig = load_idx_images(ROOT / 'emnist-digits-train-images-idx3-ubyte.gz')
        dlab = load_idx_labels(ROOT / 'emnist-digits-train-labels-idx1-ubyte.gz')
        for im, lab in zip(dig[::4], dlab[::4]):  # ~60k/4
            ch = str(int(lab))
            if len(self.pool[ch]) < 400:
                self.pool[ch].append(orient_emnist(im))
        let = load_idx_images(ROOT / 'emnist-letters-train-images-idx3-ubyte.gz')
        llab = load_idx_labels(ROOT / 'emnist-letters-train-labels-idx1-ubyte.gz')
        for im, lab in zip(let[::3], llab[::3]):
            ch = chr(ord('A') + int(lab) - 1)
            if ch in self.pool and len(self.pool[ch]) < 250:
                self.pool[ch].append(orient_emnist(im))
        if CROPS.exists():
            for s in json.loads(CROPS.read_text()):
                ch = s['l']
                if ch in self.pool and len(self.pool[ch]) < 800:
                    arr = np.array(s['img'], dtype=np.float32).reshape(28, 28)
                    self.pool[ch].append((arr * 255).astype(np.uint8))
        self._synth_marks()
        for c, v in self.pool.items():
            if not v:
                raise SystemExit('no glyphs for ' + repr(c))

    def _synth_marks(self):
        for _ in range(80):
            dot = np.zeros((28, 28), np.uint8)
            r = np.random.randint(2, 4)
            cy, cx = np.random.randint(16, 22), np.random.randint(10, 18)
            yy, xx = np.ogrid[:28, :28]
            dot[(yy - cy) ** 2 + (xx - cx) ** 2 <= r * r] = 255
            self.pool['.'].append(dot)
            dash = np.zeros((28, 28), np.uint8)
            y = np.random.randint(12, 16)
            x0 = np.random.randint(4, 8)
            dash[y:y + np.random.randint(2, 4), x0:x0 + np.random.randint(12, 18)] = 255
            self.pool['-'].append(dash)
            slash = np.zeros((28, 28), np.uint8)
            for t in range(28):
                x = 22 - int(14 * t / 27) + np.random.randint(-1, 2)
                slash[t, max(0, x - 1):min(28, x + 2)] = 255
            self.pool['/'].append(slash)
            colon = np.zeros((28, 28), np.uint8)
            colon[8:12, 12:16] = 255
            colon[18:22, 12:16] = 255
            self.pool[':'].append(colon)

    def get(self, ch, rng):
        return self.pool[ch][int(rng.integers(0, len(self.pool[ch])))]


GLYPHS = None


def render_string(text, rng):
    text = text.upper()
    glyphs = []
    for ch in text:
        if ch == ' ':
            glyphs.append(np.zeros((28, int(rng.integers(8, 16))), np.uint8))
            continue
        if ch not in ST:
            continue
        g = GLYPHS.get(ch, rng)
        # trim whitespace
        ys, xs = np.where(g > 30)
        if len(xs) == 0:
            continue
        g = g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        th = int(rng.integers(18, 30))
        tw = max(1, int(g.shape[1] * th / max(1, g.shape[0])))
        im = Image.fromarray(g).resize((tw, th), Image.Resampling.BILINEAR)
        glyphs.append(np.asarray(im))
    if not glyphs:
        return np.full((H, 16), 255, np.uint8), ''
    gap = int(rng.integers(0, 3))
    h = max(g.shape[0] for g in glyphs) + 8
    w = sum(g.shape[1] for g in glyphs) + gap * (len(glyphs) - 1) + 8
    canvas = np.full((h, w), 255, np.uint8)
    x = 4
    baseline = h - 4
    for g in glyphs:
        y = baseline - g.shape[0]
        canvas[y:y + g.shape[0], x:x + g.shape[1]] = np.minimum(canvas[y:y + g.shape[0], x:x + g.shape[1]], 255 - g)
        x += g.shape[1] + gap
    return canvas, ''.join(ch for ch in text if ch in ST)


def rand_text(rng):
    k = int(rng.integers(0, 10))
    if k == 0:
        return f'{int(rng.integers(30, 80))}'
    if k == 1:
        return f'{int(rng.integers(150, 450))}'
    if k == 2:
        n = int(rng.integers(4, 11))
        return ''.join(str(int(rng.integers(0, 10))) for _ in range(n))
    if k == 3:
        a = rng.choice([13.9, 13.92, 13.927, 16.6, 16.55, 16.555, 1.5, 3.1, 3.4, 0.16, 0.53, 14.45])
        return str(a)
    if k == 4:
        day, mon, year = 17, 'NOV', rng.choice(['2026', '26'])
        forms = [
            f'{day} {mon} {year}', f'{day} NOVEMBER {year}', f'{mon} {day} {year}',
            f'{day}-11-{year}', f'{day}/11/{year}', f'13 NOVEMBER {year}', f'13 NOV {year}',
            f'NOV 13 {year}',
        ]
        return rng.choice(forms)
    if k == 5:
        hh, mm = rng.choice([(9, 0), (8, 0), (12, 0), (14, 0)])
        return rng.choice([f'{hh:02d}{mm:02d}H', f'{hh:02d}.{mm:02d}', f'{hh:02d}:{mm:02d}', f'{hh:02d}{mm:02d}'])
    if k == 6:
        return rng.choice(['112/111', '112/111=223', '12/111'])
    if k == 7:
        return 'EMPTY'
    if k == 8:
        return f'{int(rng.integers(0, 500))}'
    return f'{int(rng.integers(10, 99))}'


def augment(img, rng, underline=True):
    im = Image.fromarray(img).convert('L')
    # slight rotation and perspective
    ang = float(rng.uniform(-3, 3))
    im = im.rotate(ang, resample=Image.Resampling.BILINEAR, fillcolor=255, expand=False)
    w, h = im.size
    jitter = int(max(1, 0.04 * w))
    # four-point perspective-ish affine
    coeffs = (
        1 + float(rng.uniform(-0.04, 0.04)), float(rng.uniform(-0.05, 0.05)), float(rng.uniform(-2, 2)),
        float(rng.uniform(-0.02, 0.02)), 1 + float(rng.uniform(-0.04, 0.04)), float(rng.uniform(-2, 2)),
    )
    im = im.transform(im.size, Image.Transform.AFFINE, coeffs, resample=Image.Resampling.BILINEAR, fillcolor=255)
    if rng.random() < 0.7:
        im = im.filter(ImageFilter.GaussianBlur(radius=float(rng.uniform(0, 0.8))))
    arr = np.asarray(im).astype(np.float32)
    # uneven light
    yy = np.linspace(float(rng.uniform(0.75, 1.05)), float(rng.uniform(0.75, 1.05)), arr.shape[0])[:, None]
    xx = np.linspace(float(rng.uniform(0.8, 1.1)), float(rng.uniform(0.8, 1.1)), arr.shape[1])[None, :]
    arr = np.clip(arr * yy * xx, 0, 255)
    if underline and rng.random() < 0.55:
        y = arr.shape[0] - int(rng.integers(1, 3))
        arr[max(0, y - 1):y + 1, :] = float(rng.integers(0, 40))
    # blue/black ink: keep luminance; a blue cast is dropped when we read gray
    if rng.random() < 0.5:
        ink = arr < 180
        arr = arr.copy()
        arr[ink] = np.clip(arr[ink] * float(rng.uniform(0.7, 1.0)), 0, 255)
    return arr.astype(np.uint8)


def to_model(arr):
    im = Image.fromarray(arr).convert('L')
    w, h = im.size
    nh = H
    nw = max(16, int(round(w * nh / max(1, h))))
    nw = min(nw, 384)
    # width must stay divisible enough for 4 pools: pad to multiple of 4
    if nw % 4:
        nw += 4 - (nw % 4)
    im = im.resize((nw, nh), Image.Resampling.BILINEAR)
    x = np.asarray(im).astype(np.float32)
    x = 1.0 - x / 255.0  # ink = 1
    return x


def encode(text):
    ids = [ST[c] for c in text.upper() if c in ST]
    return ids


class CRNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(inplace=True), nn.MaxPool2d(2, 2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(inplace=True), nn.MaxPool2d(2, 2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(inplace=True), nn.MaxPool2d((2, 1), (2, 1)),
            nn.Conv2d(128, 128, 3, padding=1), nn.ReLU(inplace=True), nn.MaxPool2d((2, 1), (2, 1)),
            nn.Conv2d(128, 256, 3, padding=1), nn.ReLU(inplace=True), nn.MaxPool2d((2, 1), (2, 1)),
        )
        self.rnn = nn.LSTM(256, 96, num_layers=1, bidirectional=True, batch_first=True)
        self.fc = nn.Linear(192, NCLASS)
        nn.init.zeros_(self.fc.bias)
        self.fc.bias.data[0] = -3

    def forward(self, x):
        # x N,1,H,W
        f = self.cnn(x)
        f = f.squeeze(2).permute(0, 2, 1)  # N, T, C
        y, _ = self.rnn(f)
        return self.fc(y)


def load_real():
    rows = json.loads(MANIFEST.read_text())
    written = json.loads(Path('/workspace/scripts/ocr/written-dates.json').read_text()) if Path('/workspace/scripts/ocr/written-dates.json').exists() else {}
    out = []
    for r in rows:
        if r['split'] != 'train':
            continue
        key = r['file'][:8] + ':' + r['key']
        text = written.get(key, r['text'])
        text = str(text).upper()
        if text == '':
            out.append((r['path'], ''))
            continue
        if any(c not in ST and c != ' ' for c in text):
            text = ''.join(c for c in text if c in ST or c == ' ')
        text = text.strip()
        if not text:
            continue
        out.append((r['path'], text))
    return out


def sample_batch(real, rng, batch=24):
    xs, ys = [], []
    for _ in range(batch):
        if real and rng.random() < 0.55:
            path, text = real[int(rng.integers(0, len(real)))]
            arr = np.asarray(Image.open(path).convert('L'))
            arr = augment(arr, rng, underline=False)
        else:
            text = rand_text(rng)
            img, text = render_string(text, rng)
            arr = augment(img, rng, underline=True)
        x = to_model(arr)
        ids = encode(text)
        # CTC needs room for the label
        if x.shape[1] // 4 < max(2, len(ids) + 1):
            pad = (len(ids) + 2) * 4 - x.shape[1]
            x = np.pad(x, ((0, 0), (0, max(0, pad))))
        xs.append(x)
        ys.append(ids)
    tw = max(t.shape[1] for t in xs)
    if tw % 4:
        tw += 4 - tw % 4
    batch_x = np.zeros((len(xs), 1, H, tw), np.float32)
    for i, t in enumerate(xs):
        batch_x[i, 0, :, :t.shape[1]] = t
    return torch.from_numpy(batch_x), ys


def main():
    global GLYPHS
    print('loading glyphs', flush=True)
    GLYPHS = Glyphs()
    real = load_real()
    print('real crops', len(real), 'classes', NCLASS, flush=True)
    # a preview so a bad EMNIST orientation is obvious
    rng = np.random.default_rng(1)
    prev, txt = render_string('17 NOV 2026 1200H', rng)
    Image.fromarray(prev).save('/tmp/crnn-preview.png')
    print('preview', txt, prev.shape, flush=True)

    model = CRNN()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    ctc = nn.CTCLoss(blank=BLANK, zero_infinity=True)
    model.train()
    steps = int(__import__('os').environ.get('STEPS', '800'))
    for step in range(1, steps + 1):
        # short synthetic strings first, so CTC learns to separate repeated digits
        use_real = real if step > 400 else []
        xb, ys = sample_batch(use_real, rng, 16)
        logits = model(xb)  # N,T,C
        logp = logits.log_softmax(2).permute(1, 0, 2)  # T,N,C
        Tlen = logp.shape[0]
        flat, lens = [], []
        for y in ys:
            if len(y) >= Tlen:
                y = y[: max(0, Tlen - 1)]
            flat.extend(y)
            lens.append(len(y))
        if not any(lens):
            continue
        tgt = torch.tensor(flat, dtype=torch.long)
        in_len = torch.full((xb.shape[0],), Tlen, dtype=torch.long)
        tar_len = torch.tensor(lens, dtype=torch.long)
        frames = []
        for y, Tlen in zip(ys, [Tlen] * xb.shape[0]):
            seq = []
            for c in y:
                seq.extend([c, c, BLANK])
            if not seq:
                seq = [BLANK]
            rep = max(1, Tlen // len(seq))
            fr = []
            for s in seq:
                fr.extend([s] * rep)
            fr = (fr + [BLANK] * Tlen)[:Tlen]
            frames.append(fr)
        target = torch.tensor(frames, dtype=torch.long)
        loss = torch.nn.functional.cross_entropy(logits.reshape(-1, NCLASS), target.reshape(-1))
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 5)
        opt.step()
        if step % 100 == 0 or step == 1:
            model.eval()
            with torch.no_grad():
                probe, ptxt = render_string('13.927', rng)
                px = torch.from_numpy(to_model(probe)[None, None])
                if px.shape[-1] % 4:
                    px = torch.nn.functional.pad(px, (0, 4 - px.shape[-1] % 4))
                pid = model(px).argmax(-1)[0].tolist()
            prev = -1
            got = []
            probs = model(px).softmax(-1)[0]
            for ti, k in enumerate(pid):
                choice = k
                if k == 0:
                    alt = int(probs[ti, 1:].argmax()) + 1
                    if float(probs[ti, alt]) > 0.15:
                        choice = alt
                if choice != prev and choice != 0:
                    got.append(CHARS[choice - 1])
                prev = choice
            model.train()
            print(f'step {step} loss {float(loss.detach()):.3f} probe {ptxt!r}->{"".join(got)!r}', flush=True)
    model.eval()
    dummy = torch.zeros(1, 1, H, 128)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model, dummy, str(OUT),
        input_names=['image'], output_names=['logits'],
        dynamic_axes={'image': {0: 'n', 3: 'w'}, 'logits': {0: 'n', 1: 't'}},
        opset_version=17, dynamo=False,
    )
    print('wrote', OUT, OUT.stat().st_size, flush=True)
    # dynamic int8
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic
    qpath = OUT.with_name('field-rec-int8.onnx')
    quantize_dynamic(str(OUT), str(qpath), weight_type=QuantType.QInt8)
    print('int8', qpath, qpath.stat().st_size, flush=True)


if __name__ == '__main__':
    main()

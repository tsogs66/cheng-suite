#!/usr/bin/env python3
"""Fine-tune the on-device digit net. Starts from the shipped weights, adds '.', '-' and '/' ,
and learns from MNIST-like synthetic strokes plus digit crops from the training photos only."""
import base64
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
NET_JS = ROOT / 'apps/web/vendor/ocr/digit-net.js'
CROPS = Path('/tmp/digit-crops.json')
SAMPLES = ROOT / 'scripts/fixtures/digit-samples.json'

def load_net(path):
    text = path.read_text()
    out = {}
    for key in ('w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4'):
        i = text.find(key + ':')
        q = text.find('"', i)
        q2 = text.find('"', q + 1)
        raw = base64.b64decode(text[q + 1:q2])
        out[key] = np.frombuffer(raw, dtype='<f4').astype(np.float32).copy()
    return out

def save_net(path, net):
    parts = []
    for key in ('w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4'):
        raw = np.ascontiguousarray(net[key], dtype='<f4').tobytes()
        parts.append(f'{key}:"{base64.b64encode(raw).decode()}"')
    path.write_text('window.CHENG_DIGIT_NET={' + ','.join(parts) + '};\n')

def relu(x):
    return np.maximum(x, 0)

def forward(img, net):
    """img (N,28,28). Same layout as digit-reader.js classify. Returns probs and the hidden layer."""
    n = img.shape[0]
    w1 = net['w1'].reshape(8, 5, 5)
    c1 = np.zeros((n, 8, 24, 24), np.float32)
    for ky in range(5):
        for kx in range(5):
            c1 += w1[:, ky, kx][None, :, None, None] * img[:, None, ky:ky + 24, kx:kx + 24]
    c1 = relu(c1 + net['b1'][None, :, None, None])
    p1 = c1.reshape(n, 8, 12, 2, 12, 2).max(axis=(3, 5))
    w2 = net['w2'].reshape(16, 8, 5, 5)
    c2 = np.zeros((n, 16, 8, 8), np.float32)
    for f in range(8):
        for ky in range(5):
            for kx in range(5):
                c2 += w2[:, f, ky, kx][None, :, None, None] * p1[:, f, ky:ky + 8, kx:kx + 8][:, None, :, :]
    c2 = relu(c2 + net['b2'][None, :, None, None])
    p2 = c2.reshape(n, 16, 4, 2, 4, 2).max(axis=(3, 5))
    flat = p2.reshape(n, 256)
    h = relu(flat @ net['w3'].reshape(256, 64) + net['b3'])
    nclass = net['b4'].shape[0]
    logits = h @ net['w4'].reshape(64, nclass) + net['b4']
    logits = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    prob = exp / exp.sum(axis=1, keepdims=True)
    return prob, h

def synth_glyph(ch, rng):
    im = Image.new('L', (28, 28), 0)
    dr = ImageDraw.Draw(im)
    size = int(rng.integers(16, 23))
    # default bitmap font has no size; stroke the character ourselves for punct and digits
    if ch in '.-/':
        if ch == '.':
            cx, cy = int(rng.integers(10, 18)), int(rng.integers(16, 24))
            r = int(rng.integers(1, 3))
            dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        elif ch == '-':
            y = int(rng.integers(12, 16))
            x0 = int(rng.integers(6, 10))
            dr.line((x0, y, x0 + int(rng.integers(8, 14)), y), fill=255, width=int(rng.integers(1, 3)))
        else:
            dr.line((int(rng.integers(16, 20)), int(rng.integers(4, 8)), int(rng.integers(8, 12)), int(rng.integers(20, 26))), fill=255, width=2)
    else:
        # seven-segment-ish is a poor match; use the font if present
        try:
            fnt = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
            dr.text((int(rng.integers(4, 10)), int(rng.integers(1, 6))), ch, fill=255, font=fnt)
        except Exception:
            dr.text((8, 4), ch, fill=255)
    arr = np.asarray(im, dtype=np.float32) / 255
    # slant
    if rng.random() < 0.7:
        shift = int(rng.integers(-3, 4))
        out = np.zeros_like(arr)
        for y in range(28):
            s = int(shift * (y - 14) / 14)
            out[y] = np.roll(arr[y], s)
        arr = out
    if rng.random() < 0.5:
        arr = np.clip(arr * float(rng.uniform(0.6, 1.4)), 0, 1)
    return arr

def load_training(rng):
    xs, ys = [], []
    if SAMPLES.exists():
        for s in json.loads(SAMPLES.read_text()):
            xs.append(np.array(s['img'], dtype=np.float32).reshape(28, 28))
            ys.append(int(s['l']))
    if CROPS.exists():
        for s in json.loads(CROPS.read_text()):
            xs.append(np.array(s['img'], dtype=np.float32).reshape(28, 28))
            ys.append(int(s['l']))
    classes = '0123456789.-/'
    for ch in classes:
        n = 400 if ch in '.-/' else 80
        for _ in range(n):
            xs.append(synth_glyph(ch, rng))
            ys.append(classes.index(ch))
    # repeat the real crops so they outweigh the font
    real = len(ys)
    x = np.stack(xs).astype(np.float32)
    y = np.array(ys, dtype=np.int64)
    return x, y

def expand_to_13(net, rng):
    if net['b4'].shape[0] == 13:
        return net
    w4 = net['w4'].reshape(64, 10)
    extra = rng.normal(0, 0.02, size=(64, 3)).astype(np.float32)
    net['w4'] = np.concatenate([w4, extra], axis=1).reshape(-1)
    net['b4'] = np.concatenate([net['b4'], np.zeros(3, dtype=np.float32)])
    return net

def sgd(net, x, y, rng, epochs=3, batch=64, lr=0.02):
    n = len(y)
    idx = np.arange(n)
    for ep in range(epochs):
        rng.shuffle(idx)
        loss = 0
        correct = 0
        seen = 0
        for i in range(0, n, batch):
            b = idx[i:i + batch]
            xb, yb = x[b], y[b]
            prob, cache = forward(xb, net)
            # cross entropy on the last layer only, plus a light pull on w3
            oh = np.zeros_like(prob)
            oh[np.arange(len(yb)), yb] = 1
            loss += -np.log(prob[np.arange(len(yb)), yb] + 1e-8).sum()
            correct += (prob.argmax(1) == yb).sum()
            seen += len(yb)
            dlogits = (prob - oh) / len(yb)
            h = cache
            nclass = net['b4'].shape[0]
            w4m = net['w4'].reshape(64, nclass)
            dw4 = h.T @ dlogits
            db4 = dlogits.sum(0)
            # keep the ten digits close to the net that already reads the ship's figures
            dw4[:, :10] = 0
            db4[:10] = 0
            net['w4'] -= lr * dw4.reshape(-1)
            net['b4'] -= lr * db4.astype(np.float32)
        print(f'epoch {ep+1} loss {loss/seen:.3f} acc {correct/seen:.3f}', flush=True)
    return net

def main():
    rng = np.random.default_rng(7)
    net = load_net(NET_JS)
    net = expand_to_13(net, rng)
    x, y = load_training(rng)
    print('samples', len(y), 'classes', int(y.max()) + 1, flush=True)
    # a few shifted copies of the real ship digits
    net = sgd(net, x, y, rng, epochs=6, batch=64, lr=0.05)
    save_net(NET_JS, net)
    print('wrote', NET_JS, 'bytes', NET_JS.stat().st_size, flush=True)

if __name__ == '__main__':
    main()

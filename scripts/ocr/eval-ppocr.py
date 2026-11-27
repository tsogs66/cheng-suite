#!/usr/bin/env python3
"""Greedy-decode PP-OCRv4 English mobile rec on dumped field crops."""
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

DICT = Path('/tmp/ppocr/en_dict.txt').read_text(encoding='utf-8').splitlines()
# last line may be a space stored as empty after split; keep a real space if the file ends with a blank line
chars = []
raw = Path('/tmp/ppocr/en_dict.txt').read_bytes()
# one character per line, including a possible trailing space line
text = raw.decode('utf-8')
for line in text.split('\n'):
    if line == '' and chars and chars[-1] != ' ':
        # a blank line is a space character, except a final newline
        chars.append(' ')
    elif line != '':
        chars.append(line[0] if len(line) == 1 else line)
if text.endswith('\n') and chars and chars[-1] == ' ':
    chars.pop()

sess = ort.InferenceSession('/tmp/ppocr/en_PP-OCRv4_rec_mobile.onnx', providers=['CPUExecutionProvider'])
inp_name = sess.get_inputs()[0].name


def decode(probs):
    # probs T x C
    idx = probs.argmax(axis=1)
    out = []
    prev = -1
    for i in idx:
        i = int(i)
        if i != prev and i != 0:
            if 1 <= i <= len(chars):
                out.append(chars[i - 1])
        prev = i
    return ''.join(out)


def prep(path, height=48):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    new_w = max(8, int(round(height * w / max(1, h))))
    new_w = min(new_w, 480)
    im = im.resize((new_w, height), Image.Resampling.BILINEAR)
    arr = np.asarray(im).astype(np.float32)
    arr = (arr / 255.0 - 0.5) / 0.5
    arr = arr.transpose(2, 0, 1)[None]
    return arr


def main():
    manifest = json.loads(Path(sys.argv[1]).read_text())
    only = sys.argv[2] if len(sys.argv) > 2 else 'test'
    rows = [r for r in manifest if r['split'] == only]
    preds = []
    for i, r in enumerate(rows):
        x = prep(r['path'])
        y = sess.run(None, {inp_name: x})[0][0]
        text = decode(y)
        preds.append({**r, 'pred': text})
        if i % 100 == 0:
            print(i, r['key'], repr(text), 'gold', r['text'], flush=True)
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('/tmp/ppocr-preds.json')
    out.write_text(json.dumps(preds))
    print('wrote', len(preds), out)


if __name__ == '__main__':
    main()

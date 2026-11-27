#!/usr/bin/env node
'use strict';
/* Buttons that exist in the v1 snapshot must still exist, and the function
   a button calls must be the same function. New suite pages are listed, not
   rewritten. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const hist = path.join(root, 'history/cheng-pro');

function ids(src) {
  const out = new Set();
  const re = /id="(btn[A-Za-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

const files = [
  'modules/voyage/www/voyage_manager.html',
  'modules/tanks/public/index.html',
  'apps/web/index.html',
];

for (const rel of files) {
  const now = ids(fs.readFileSync(path.join(root, rel), 'utf8'));
  const oldPath = path.join(hist, rel);
  if (!fs.existsSync(oldPath)) {
    console.log(rel + ': suite page, ' + now.size + ' buttons (no v1 file)');
    continue;
  }
  const old = ids(fs.readFileSync(oldPath, 'utf8'));
  const missing = [...old].filter((id) => !now.has(id));
  assert.deepStrictEqual(missing, [], rel + ' dropped v1 buttons: ' + missing.join(', '));
  console.log(rel + ': ' + old.size + ' v1 buttons still present (' + now.size + ' now)');
}

function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return '';
  let i = src.indexOf('{', at);
  if (i < 0) return '';
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(at, i + 1).replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

const voyageNow = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
const voyageOld = fs.readFileSync(path.join(hist, 'modules/voyage/www/voyage_manager.html'), 'utf8');
['saveLogEntryFromForm', 'renderRobByReport', 'switchTab', 'printNoonToNoon', 'printOrbEntries'].forEach((name) => {
  const a = fn(voyageOld, name);
  const b = fn(voyageNow, name);
  assert.ok(a && b, name + ' missing');
  assert.strictEqual(b, a, name + ' no longer matches v1');
  console.log(name + ': same action as v1');
});

console.log('button actions ok');

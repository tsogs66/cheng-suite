#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const pages = fs.readFileSync(path.join(root, 'apps/web/css/station-pages.css'), 'utf8');
const voyage = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'modules/voyage/www/index.html'), 'utf8');

assert.strictEqual(voyage, index, 'voyage copies stay identical');
assert.ok(pages.includes('html.station:has(.app-shell)'), 'only Tank Chief locks the page scroller');
assert.ok(!/html\.station,\s*html\.station body \{ height: 100%; overflow: hidden; \}/.test(pages),
  'Voyage and the suite shell are not overflow-locked');
assert.ok(pages.includes('width: 100%'), 'the sounding sheet can fill the window');
assert.ok(pages.includes('min-width: 7.5em'), 'the method box fits ULLAGE');
assert.ok(!pages.includes('top: 100px'), 'titles are not pushed over the first tanks');
assert.ok(voyage.includes("showToast('Open a voyage summary before printing')"), 'a closed summary says why it did not print');
assert.ok(voyage.includes("classList.contains('chengaio-embed')) return"), 'an embedded Voyage frame does not install a worker');
assert.ok(!voyage.includes('if (reg.waiting) reg.waiting.postMessage'), 'a waiting worker is not activated on every load');
assert.ok(voyage.includes('data-card-mark="tl"') && voyage.includes('.pr-card-mark{'), 'log card keeps the four corner marks the scanner finds');
assert.ok(/const keyboardOpen = !!\(vv && layoutH > 0 && \(layoutH - visH\) > 100\)/.test(voyage),
  'only a shorter visual viewport counts as the keyboard');
assert.ok(voyage.includes("classList.remove('keyboard-open')"), 'closing the flowmeter box clears the keyboard lock');

console.log('session guards ok');

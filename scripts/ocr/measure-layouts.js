/* Measure the printed log card and sounding card the same way the reader does, and write scripts/fixtures/card-layouts.json. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '../..');
const outDir = path.join(root, 'scripts/fixtures');
fs.mkdirSync(outDir, { recursive: true });

function extractBetween(src, startMarker, endMarker, from) {
  const i = src.indexOf(startMarker, from || 0);
  if (i < 0) throw new Error('missing ' + startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('missing end ' + endMarker);
  return src.slice(i, j + endMarker.length);
}

const voy = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');
const fitStart = voy.indexOf('function fitLogEntryDataRoot');
const fitEnd = voy.indexOf('\nfunction printLogEntryDataRecord', fitStart);
const fitFn = voy.slice(fitStart, fitEnd);
const style = extractBetween(voy, '<style>', '</style>', voy.indexOf('function buildLogEntryDataPrintDocument'));

const tanks = [
  'NO.1 H.F.O. TK (P)', 'NO.1 H.F.O. TK (S)', 'NO.2 H.F.O. TK (P)', 'NO.2 H.F.O. TK (S)', 'NO.3 H.F.O. TK (P)',
  'H.F.O. SETTLING TK', 'H.F.O. SERVICE TK', 'LS H.F.O. SERVICE TK', 'LS H.F.O. SETTLING TK', 'H.F.O. OVERFLOW TK',
  'M.D.O. TK (P)', 'M.D.O. TK (S)', 'M.D.O. SERVICE TK', 'M.D.O. SETTLING TK', 'M.G.O. STORAGE TK (S)',
  'M.G.O. SERVICE TK', 'NO.3 H.F.O. TK (S)'
];

function led(label, key, type) {
  const wide = key === 'datetime' ? ' pr-led-wide' : '';
  return `<div class="pr-led-field${wide}"><span class="pr-led-lbl">${label}</span><span class="pr-led-line" data-card-field="${key}" data-card-type="${type || 'number'}" data-card-label="${label}" data-card-grow="up"></span></div>`;
}
function mini(label, key, type) {
  if (!label) return '<div class="pr-led-mini pr-led-spacer"></div>';
  return `<div class="pr-led-mini"><span class="pr-led-lbl">${label}</span><span class="pr-led-line" data-card-field="${key}" data-card-type="${type || 'number'}" data-card-label="${label}" data-card-grow="up"></span></div>`;
}
function cell(key, label, group) {
  return `<td class="pr-led-write" data-card-field="${key}" data-card-type="number" data-card-label="${label}" data-card-group="${group}"></td>`;
}

const cylHead = [1, 2, 3, 4, 5, 6].map((i) => `<th>C${i}</th>`).join('');
const racks = [1, 2, 3, 4, 5, 6].map((i) => cell('rack:' + i, 'Cyl ' + i + ' pump rack', 'Main engine cylinders')).join('');
const exhs = [1, 2, 3, 4, 5, 6].map((i) => cell('exh:' + i, 'Cyl ' + i + ' exhaust °C', 'Main engine cylinders')).join('');
const geRows = [1, 2, 3].map((i) => `<tr><td class="pr-led-rowlbl">A/E ${i}</td>${cell('ge:' + i + ':svc', 'In service (h)', 'Auxiliary engine ' + i)}${cell('ge:' + i + ':hrs', 'Run hrs', 'Auxiliary engine ' + i)}${cell('ge:' + i + ':kw', 'Avg kW', 'Auxiliary engine ' + i)}</tr>`).join('');

const logInner = `<div class="pr-led-inner">
  <i class="pr-card-mark pr-card-tl" data-card-mark="tl"></i><i class="pr-card-mark pr-card-tr" data-card-mark="tr"></i>
  <i class="pr-card-mark pr-card-bl" data-card-mark="bl"></i><i class="pr-card-mark pr-card-br" data-card-mark="br"></i>
  <div class="pr-led-title">LOG ENTRY DATA CARD</div>
  <div class="pr-led-sub">Voyage Chief - M/V FLAG EVI</div>
  <div class="pr-led-body">
    <div class="pr-led-sec">Watch / operation</div>
    <div class="pr-led-grid3">
      ${led('Date / Time', 'datetime', 'datetime')}
      ${led('Operation', 'operation', 'text')}
      ${led('Distance ship (nm)', 'dist')}
    </div>
    <div class="pr-led-grid3" style="margin-top:1mm">
      ${mini('Wind Dir', 'windDir', 'text')}
      ${mini('Wind state', 'windBft')}
      ${mini('Sea state', 'seaState', 'text')}
    </div>
    <div class="pr-led-grid3" style="margin-top:1mm">
      ${mini('E/R °C', 'erTemp')}
      ${mini('S/T °C', 'stTemp')}
      ${mini('S/W °C', 'seaTemp')}
    </div>
    <div class="pr-led-sec">Flowmeters &amp; counters</div>
    <table class="pr-led-table pr-led-fm-table pr-led-fm-io">
      <thead><tr><th>Meter / counter</th><th>Inlet</th><th>Outlet</th></tr></thead>
      <tbody>
        <tr><td class="pr-led-rowlbl">M/E <span class="pr-led-unit">(L)</span></td><td class="pr-led-write" colspan="2" data-card-field="fm:me" data-card-type="int" data-card-label="M/E" data-card-group="Flowmeters"></td></tr>
        <tr><td class="pr-led-rowlbl">G/E <span class="pr-led-unit">(L)</span></td><td class="pr-led-write" data-card-field="fm:ge:in" data-card-type="int" data-card-label="G/E inlet" data-card-group="Flowmeters"></td><td class="pr-led-write" data-card-field="fm:ge:out" data-card-type="int" data-card-label="G/E outlet" data-card-group="Flowmeters"></td></tr>
        <tr><td class="pr-led-rowlbl">Boiler <span class="pr-led-unit">(L)</span></td><td class="pr-led-write" colspan="2" data-card-field="fm:blr" data-card-type="int" data-card-label="Boiler" data-card-group="Flowmeters"></td></tr>
        <tr><td class="pr-led-rowlbl">Cylinder Oil <span class="pr-led-unit">(L)</span></td><td class="pr-led-write" colspan="2" data-card-field="fm:cyl" data-card-type="int" data-card-label="Cylinder Oil" data-card-group="Flowmeters"></td></tr>
        <tr><td class="pr-led-rowlbl">Rev. Counter</td><td class="pr-led-write" colspan="2" data-card-field="fm:rev" data-card-type="int" data-card-label="Rev. Counter" data-card-group="Flowmeters"></td></tr>
        <tr><td class="pr-led-rowlbl">FW Generator <span class="pr-led-unit">(m³)</span></td><td class="pr-led-write" colspan="2" data-card-field="fm:fw" data-card-type="number" data-card-label="FW Generator" data-card-group="Flowmeters"></td></tr>
      </tbody>
    </table>
    <div class="pr-led-sec">Main engine — cylinders</div>
    <table class="pr-led-table"><thead><tr><th></th>${cylHead}</tr></thead><tbody>
      <tr><td class="pr-led-rowlbl">Rack</td>${racks}</tr>
      <tr><td class="pr-led-rowlbl">Exh °C</td>${exhs}</tr>
    </tbody></table>
    <div class="pr-led-two">
      <div>
        <div class="pr-led-sec">Main engine — turbocharger</div>
        <table class="pr-led-table"><thead><tr><th></th><th>In °C</th><th>Out °C</th><th>RPM</th></tr></thead><tbody>
          <tr><td class="pr-led-rowlbl">T/C 1</td>${cell('t:1:in', 'T/C 1 in °C', 'Turbochargers')}${cell('t:1:out', 'T/C 1 out °C', 'Turbochargers')}${cell('t:1:rpm', 'T/C 1 RPM', 'Turbochargers')}</tr>
        </tbody></table>
        <div class="pr-led-sec">Main engine — scav / cooler / fuel</div>
        <div class="pr-led-grid2">
          ${mini('Scav temp', 'scavTemp')}${mini('Scav press', 'scavPress')}
          ${mini('AC in °C', 'acIn')}${mini('AC out °C', 'acOut')}
          ${mini('Press diff', 'pressDiff')}${mini('')}
          ${mini('Fuel temp', 'fuelTemp')}${mini('Pump mark', 'pumpMark')}
          ${mini('ME LO temp', 'meLoTemp')}${mini('ME LO press', 'meLoPress')}
        </div>
      </div>
      <div>
        <div class="pr-led-sec">Auxiliaries — hrs / load</div>
        <table class="pr-led-table"><thead><tr><th></th><th>In svc</th><th>Run hrs</th><th>Avg kW</th></tr></thead><tbody>
          ${geRows}
          <tr><td class="pr-led-rowlbl">Boiler</td><td class="pr-led-write"></td>${cell('blr:hrs', 'Run hrs', 'Boiler')}${cell('blr:kw', 'Avg kW', 'Boiler')}</tr>
          <tr><td class="pr-led-rowlbl">Incinerator</td><td class="pr-led-write"></td>${cell('inc:hrs', 'Run hrs', 'Incinerator')}${cell('inc:kw', 'Avg kW', 'Incinerator')}</tr>
        </tbody></table>
        <div class="pr-led-sec">Tanks — ROB</div>
        <div class="pr-led-grid2">${mini('Bilge ROB m³', 'bilgeRob')}${mini('Sludge ROB m³', 'sludgeRob')}</div>
        <div class="pr-led-grid1" style="margin-top:1mm">${led('FW ROB m³', 'fwRob', 'pair')}</div>
      </div>
    </div>
  </div>
  <div class="pr-led-remarks"><span class="pr-led-lbl">Remarks</span><div class="pr-led-remarks-box"></div></div>
  <div class="pr-led-foot">M/V FLAG EVI — Golden Union Shipping Co. S.A. — ts0gs</div>
</div>`;

const tsc = fs.readFileSync(path.join(root, 'modules/tanks/public/js/tank-sounding-card.js'), 'utf8');
const tStyleStart = tsc.indexOf('<style>');
const tStyleEnd = tsc.indexOf('</style>', tStyleStart);
const tStyle = tsc.slice(tStyleStart, tStyleEnd + 8);
const fitS = tsc.indexOf('function fitTankSoundingRoot');
const fitE = tsc.indexOf('\n  function buildPrintDocument', fitS);
let tankFit = tsc.slice(fitS, fitE);
const tick = tankFit.indexOf('\n`;');
if (tick > 0) tankFit = tankFit.slice(0, tick);
tankFit = tankFit.replace(/\n  /g, '\n');

const tankRows = tanks.map((name, i) => `<tr><td class="pr-tsc-tank">${name}</td><td class="pr-tsc-method-cell">
  <label class="pr-tsc-chk"><span class="pr-tsc-box" data-card-box="ullage:${i}" data-card-label="Ullage" data-card-group="${name}"></span> Ullage</label>
  <label class="pr-tsc-chk"><span class="pr-tsc-box" data-card-box="depth:${i}" data-card-label="Depth" data-card-group="${name}"></span> Depth</label>
  </td><td class="pr-tsc-cm" data-card-field="cm:${i}" data-card-type="number" data-card-label="Sounding (cm)" data-card-group="${name}"></td>
  <td class="pr-tsc-temp" data-card-field="temp:${i}" data-card-type="number" data-card-label="Temp (°C)" data-card-group="${name}"></td></tr>`).join('');

const tankInner = `<div class="pr-tsc-inner" style="--tsc-rows:17">
  <i class="pr-card-mark pr-card-tl" data-card-mark="tl"></i><i class="pr-card-mark pr-card-tr" data-card-mark="tr"></i>
  <i class="pr-card-mark pr-card-bl" data-card-mark="bl"></i><i class="pr-card-mark pr-card-br" data-card-mark="br"></i>
  <div class="pr-tsc-title">TANK SOUNDING CARD</div>
  <div class="pr-tsc-sub">Tank Chief - M/V FLAG EVI</div>
  <div class="pr-tsc-body"><div class="pr-tsc-meta">
    <div class="pr-tsc-grid2">
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">Date</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="date" data-card-type="date" data-card-label="Date"></span></div>
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">Time</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="time" data-card-type="time" data-card-label="Time"></span></div>
    </div>
    <div class="pr-tsc-grid3">
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">Forward Draft</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="fwd" data-card-type="number" data-card-label="Forward draft"></span></div>
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">Aft Draft</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="aft" data-card-type="number" data-card-label="Aft draft"></span></div>
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">Trim</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="trim" data-card-type="number" data-card-label="Trim"></span></div>
    </div>
    <div class="pr-tsc-grid2">
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">Sea Temp (°C)</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="sea" data-card-type="number" data-card-label="Sea temp (°C)"></span></div>
      <div class="pr-tsc-field"><span class="pr-tsc-lbl">E/R Temp (°C)</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="er" data-card-type="number" data-card-label="E/R temp (°C)"></span></div>
    </div>
  </div>
  <div class="pr-tsc-table-wrap"><table class="pr-tsc-table"><thead><tr><th>Tank</th><th>Method</th><th>Sounding (cm)</th><th>Temp (°C)</th></tr></thead><tbody>${tankRows}</tbody></table></div>
  </div>
  <div class="pr-tsc-by"><span class="pr-tsc-lbl">Sounded by</span><span class="pr-tsc-line" data-card-grow="up" data-card-field="by" data-card-type="text" data-card-label="Sounded by"></span></div>
  <div class="pr-tsc-foot">M/V FLAG EVI — Golden Union Shipping Co. S.A. — ts0gs</div>
</div>`;

const screenLock = `@media screen{ html,body{background:#fff !important;padding:0 !important;margin:0 !important;width:297mm !important;height:210mm !important;max-width:297mm !important;max-height:210mm !important;overflow:hidden !important;} }`;

function page(kind, css, inner, fit, selector) {
  const copyClass = kind === 'log' ? 'pr-led' : 'pr-tsc';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${css.replace('</style>', screenLock + '</style>')}</head><body>
<div class="${copyClass}-page"><div class="${copyClass}-copy"><div class="${copyClass}-page-inner">${inner}</div></div><div class="${copyClass}-copy"><div class="${copyClass}-page-inner">${inner}</div></div></div>
<script>
${fit}
try { ${kind === 'log' ? 'fitLogEntryDataRoot' : 'fitTankSoundingRoot'}(document); } catch (e) { document.title = 'FITERR ' + e.message; }
function rel(card, el){ var cr = card.getBoundingClientRect(); var r = el.getBoundingClientRect(); return { x:(r.left-cr.left)/cr.width, y:(r.top-cr.top)/cr.height, w:r.width/cr.width, h:r.height/cr.height }; }
var card = document.querySelector('${selector}');
var cr = card.getBoundingClientRect();
var marks = {};
card.querySelectorAll('[data-card-mark]').forEach(function(el){ var r = rel(card, el); marks[el.getAttribute('data-card-mark')] = { x:r.x+r.w/2, y:r.y+r.h/2 }; });
var tableEls = Array.prototype.slice.call(card.querySelectorAll('table'));
var tables = tableEls.map(function(t){
  var tr = rel(card, t), ys = [], xs = [];
  t.querySelectorAll('tr').forEach(function(row){ var r = rel(card, row); ys.push(r.y); ys.push(r.y+r.h); });
  t.querySelectorAll('td,th').forEach(function(c){ var r = rel(card, c); xs.push(r.x); xs.push(r.x+r.w); });
  var uniq = function(a){ a.sort(function(p,q){return p-q;}); var o=[]; a.forEach(function(v){ if(!o.length || v-o[o.length-1]>0.003) o.push(v); }); return o; };
  return { x:tr.x, y:tr.y, w:tr.w, h:tr.h, ys:uniq(ys), xs:uniq(xs) };
});
var fields = [];
card.querySelectorAll('[data-card-field]').forEach(function(el){
  var rc = rel(card, el);
  if (el.tagName === 'TD') rc = { x:rc.x+rc.w*0.04, y:rc.y+rc.h*0.1, w:rc.w*0.92, h:rc.h*0.8 };
  else if (el.getAttribute('data-card-grow') === 'up') rc = { x:rc.x, y:rc.y-rc.h*0.8, w:rc.w, h:rc.h*1.8 };
  var t = el.closest ? el.closest('table') : null;
  fields.push({ key:el.getAttribute('data-card-field'), type:el.getAttribute('data-card-type')||'number', label:el.getAttribute('data-card-label')||'', group:el.getAttribute('data-card-group')||'', rect:rc, grow:el.getAttribute('data-card-grow')==='up', tbl:t?tableEls.indexOf(t):-1 });
});
var boxes = [];
card.querySelectorAll('[data-card-box]').forEach(function(el){
  var t = el.closest ? el.closest('table') : null;
  boxes.push({ key:el.getAttribute('data-card-box'), label:el.getAttribute('data-card-label')||'', group:el.getAttribute('data-card-group')||'', rect:rel(card, el), tbl:t?tableEls.indexOf(t):-1 });
});
var titleEl = card.querySelector('.pr-led-title, .pr-tsc-title');
var title = titleEl ? { text:(titleEl.textContent||'').trim(), rect:rel(card, titleEl) } : null;
var payload = { aspect: cr.width/cr.height, marks:marks, fields:fields, boxes:boxes, tables:tables, title:title };
document.documentElement.setAttribute('data-layout', JSON.stringify(payload));
</script></body></html>`;
}

function measure(kind, html) {
  const file = path.join('/tmp', 'card-layout-' + kind + '.html');
  fs.writeFileSync(file, html);
  const run = spawnSync('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--virtual-time-budget=2500', '--dump-dom', 'file://' + file
  ], { encoding: 'utf8', timeout: 20000, maxBuffer: 20 * 1024 * 1024, killSignal: 'SIGKILL' });
  const dom = (run.stdout || '') + '';
  const m = dom.match(/data-layout="([^"]*)"/);
  if (!m) throw new Error(kind + ' layout not measured:\n' + dom.slice(0, 500));
  const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return JSON.parse(json);
}

const log = measure('log', page('log', style, logInner, fitFn, '.pr-led-copy .pr-led-inner'));
const sounding = measure('sounding', page('sounding', tStyle, tankInner, tankFit, '.pr-tsc-copy .pr-tsc-inner'));
const layouts = { log: log, sounding: sounding };
fs.writeFileSync(path.join(outDir, 'card-layouts.json'), JSON.stringify(layouts));
console.log('log fields', log.fields.length, 'aspect', log.aspect.toFixed(3), 'tables', log.tables.length);
console.log('sounding fields', sounding.fields.length, 'boxes', sounding.boxes.length, 'aspect', sounding.aspect.toFixed(3));

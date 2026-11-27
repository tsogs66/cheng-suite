/**
 * Phone portrait Noon / log entry: four steps (When, Meters, Oil & water, Review).
 * Tablet and Windows keep every section visible. Fields are not cloned, so the
 * existing save path still reads the same inputs. IndexedDB is untouched.
 */
(function () {
  'use strict';

  var STEPS = [
    { id: 'when', label: 'When' },
    { id: 'meters', label: 'Meters' },
    { id: 'oil', label: 'Oil & water' },
    { id: 'review', label: 'Review' },
  ];
  var index = 0;
  var bar = null;

  function on() {
    return document.documentElement.classList.contains('noon-steps');
  }

  if (!document.getElementById('noonStepStyle')) {
    var style = document.createElement('style');
    style.id = 'noonStepStyle';
    style.textContent = [
      '.noon-step-off{display:none !important;}',
      '#logMetersDeferred.noon-force-show{display:block !important;}',
      '#voyageSummaryPanel.noon-force-show{display:block !important;}',
      '.noon-step-bar{display:flex;flex-wrap:wrap;gap:6px;position:sticky;top:0;z-index:20;padding:8px;background:var(--panel-solid,#122238);}',
      '.noon-step-bar button{min-height:44px;flex:1 1 auto;}',
      '.noon-step-bar button.on{outline:2px solid var(--brass,#c99a53);}',
      'html:not(.noon-steps) .noon-step-bar{display:none !important;}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function show(el, yes) {
    if (!el) return;
    if (yes) el.classList.remove('noon-step-off');
    else el.classList.add('noon-step-off');
  }

  function paint() {
    var page = document.getElementById('page-entry');
    if (!page) return;
    var active = on() && page.style.display !== 'none' && !page.hidden;
    if (bar) bar.hidden = !active;
    if (!active) {
      page.querySelectorAll('.noon-step-off').forEach(function (el) {
        el.classList.remove('noon-step-off');
      });
      var forced = document.getElementById('voyageSummaryPanel');
      if (forced) forced.classList.remove('noon-force-show');
      var meters = document.getElementById('logMetersDeferred');
      if (meters) meters.classList.remove('noon-force-show');
      return;
    }
    var step = STEPS[index].id;
    var summary = document.getElementById('voyageSummaryPanel');
    if (summary && (step === 'oil' || step === 'review')) summary.classList.add('noon-force-show');
    else if (summary) summary.classList.remove('noon-force-show');
    var meters = document.getElementById('logMetersDeferred');
    if (meters && step === 'meters') meters.classList.add('noon-force-show');
    else if (meters) meters.classList.remove('noon-force-show');

    show(page.querySelector(':scope > .panel'), step === 'when');
    show(document.getElementById('lastEntryPanel'), step === 'when');
    show(document.getElementById('logEntryFormPanel'), step === 'when' || step === 'meters');
    show(document.querySelector('#logEntryFormPanel .log-meta-row'), step === 'when');
    show(document.getElementById('logEntryTitle'), step === 'when');
    show(document.getElementById('voyageSummaryPanel'), step === 'oil' || step === 'review');

    ['vsReferenceBlock', 'vsRunBlock', 'vsErTankBox', 'vsSeaReportBlock', 'vsEcaBlock', 'vsMeTotalsBlock', 'vsTopActions'].forEach(function (id) {
      show(document.getElementById(id), step === 'review');
    });
    show(document.getElementById('vsFuelConsMiscFwRow'), step === 'oil');
    var oilHeads = page.querySelectorAll('#voyageSummaryPanel > h3');
    oilHeads.forEach(function (h) {
      var text = h.textContent || '';
      var oil = /Fuel Cons|R\.O\.B|ROB/i.test(text);
      show(h, oil ? step === 'oil' : step === 'review');
    });
    show(document.getElementById('vsRemarksPanel'), step === 'review');
    show(document.getElementById('vsPhotoPanel'), step === 'review');
    show(document.getElementById('vsBottomActions'), step === 'review' || step === 'oil');

    if (bar) {
      bar.querySelectorAll('[data-noon-step]').forEach(function (btn) {
        var here = btn.getAttribute('data-noon-step') === step;
        btn.classList.toggle('on', here);
        btn.setAttribute('aria-current', here ? 'step' : 'false');
      });
      var next = bar.querySelector('[data-noon-go]');
      if (next) next.textContent = index === STEPS.length - 1 ? 'Save' : 'Next';
    }
  }

  function ensureBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'noonStepBar';
    bar.className = 'noon-step-bar';
    bar.hidden = true;
    bar.innerHTML = STEPS.map(function (s, i) {
      return '<button type="button" data-noon-step="' + s.id + '">' + (i + 1) + ' ' + s.label + '</button>';
    }).join('') + '<button type="button" class="primary" data-noon-go="1">Next</button>';
    var page = document.getElementById('page-entry');
    if (page && page.parentNode) page.parentNode.insertBefore(bar, page);
    bar.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-noon-step')) {
        index = STEPS.findIndex(function (s) { return s.id === t.getAttribute('data-noon-step'); });
        if (index < 0) index = 0;
        paint();
        return;
      }
      if (t.getAttribute('data-noon-go')) {
        if (index < STEPS.length - 1) {
          index += 1;
          paint();
        } else {
          var save = document.getElementById('btnSaveVoyageSummary') || document.getElementById('btnSaveEntry');
          if (save) save.click();
        }
      }
    });
  }

  function boot() {
    if (window.ChengNav && ChengNav.apply) ChengNav.apply();
    ensureBar();
    paint();
  }

  window.addEventListener('resize', boot);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/**
 * Field grammar for a handwritten card, and the checks that follow a read.
 * Dates, times and pairs are brought into one written form. A sounding written "Empty" is 0.
 * Nothing here needs a network or a picture of the whole card.
 */
(function (root) {
  'use strict';

  var MONTHS = {
    JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4,
    MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9,
    OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12
  };

  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function year4(y) { y = String(y); if (y.length === 2) return (+y > 50 ? '19' : '20') + y; return y; }

  function canonTime(raw) {
    var t = String(raw || '').toUpperCase().replace(/[^0-9.:]/g, '');
    var m = t.match(/^(\d{1,2})[.:](\d{2})$/);
    if (m && +m[1] <= 23 && +m[2] <= 59) return pad2(m[1]) + ':' + m[2];
    var d = t.replace(/\D/g, '');
    if (d.length === 5) d = d.slice(0, 4);
    if (d.length === 3) d = '0' + d;
    if (d.length >= 4) {
      var hh = d.slice(0, 2), mm = d.slice(2, 4);
      if (+hh <= 23 && +mm <= 59) return hh + ':' + mm;
    }
    return '';
  }

  function dateFromParts(day, month, year) {
    day = +day; month = +month; year = year4(year);
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year.length === 4)) return '';
    return pad2(day) + '/' + pad2(month) + '/' + year;
  }

  /** A date written as 17-11-2026, 17/11/26, 17 NOV 2026, NOV 17 2026 or 13 NOVEMBER 2026. */
  function nearYear(year, opts) {
    opts = opts || {};
    var nowY = opts.year == null ? 2026 : +opts.year;
    var fallback = opts.defaultYear == null ? nowY : +opts.defaultYear;
    if (year == null || year === '') return String(fallback);
    var y = String(year).replace(/\D/g, '');
    if (!y) return String(fallback);
    if (y.length === 4 && Math.abs(+y - nowY) <= 2) return y;
    if (y.length === 2 && Math.abs(2000 + (+y) - nowY) <= 2) return String(2000 + (+y));
    var tail = y.slice(-2);
    if (tail.length === 2 && Math.abs(2000 + (+tail) - nowY) <= 2) return String(2000 + (+tail));
    return String(fallback);
  }

  function parseDateBits(bits, opts) {
    var day = '', month = 0, year = '';
    bits.forEach(function (b) {
      if (MONTHS[b]) { month = MONTHS[b]; return; }
      if (/^\d{4}$/.test(b)) { year = b; return; }
      if (!/^\d{1,3}$/.test(b)) return;
      if (!day) day = b;
      else if (!month && +b >= 1 && +b <= 12) month = +b;
      else if (!year) year = b;
    });
    if (!day || !month) return '';
    return dateFromParts(day, month, nearYear(year, opts));
  }

  function canonDate(raw, opts) {
    var t = String(raw || '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    var num = t.match(/(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{2,4})/);
    if (num) return dateFromParts(num[1], num[2], nearYear(num[3], opts));
    var bits = t.split(/[\s/-]+/).filter(Boolean);
    var whole = parseDateBits(bits, opts);
    if (whole) return whole;
    /* a printed label often sits in the same crop; take the first window that is a date */
    for (var i = 0; i < bits.length; i++) {
      var win = parseDateBits(bits.slice(i, i + 4), opts);
      if (win) return win;
    }
    return '';
  }

  function canonDateTime(raw, opts) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    /* time is the last clock-like token: 1200H, 12.00, 12:00, 1400 */
    var time = '';
    var tm = t.match(/(\d{1,2}[.:]\d{2}\s*H?|\d{3,4}\s*H)\s*$/i);
    if (tm) {
      time = canonTime(tm[1]);
      t = t.slice(0, tm.index).trim();
    } else {
      var end = t.match(/(\d{3,4})\s*$/);
      if (end && canonTime(end[1])) { time = canonTime(end[1]); t = t.slice(0, end.index).trim(); }
    }
    var date = canonDate(t, opts);
    if (date && time) return date + ' ' + time;
    return date || time;
  }

  /** 112/111 or 112/111 = 223. A missing equals is put back when the third number is the sum. */
  function canonPair(raw) {
    var t = String(raw || '').replace(/\s+/g, '').replace(/[=]/g, '=');
    var m = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:=(\d+(?:\.\d+)?))?$/);
    if (!m) {
      var digits = t.replace(/[^\d./]/g, '');
      var parts = digits.split('/').filter(Boolean);
      if (parts.length === 2) m = [digits, parts[0], parts[1], ''];
      else return digits;
    }
    var a = m[1], b = m[2], c = m[3] || '';
    if (!c) {
      var joined = (t.split('=')[1] || '').replace(/[^\d.]/g, '');
      if (joined && Math.abs(+joined - (+a + +b)) < 0.51) c = String(+a + +b);
    }
    if (c && Math.abs(+c - (+a + +b)) < 0.51) return a + '/' + b + '=' + c;
    return a + '/' + b;
  }

  /**
   * Apply the grammar of one field to the characters the digit reader returned.
   * kind is the data-card-type. emptyWord is set when the ink looked like the word Empty.
   */
  function apply(kind, text, flags) {
    flags = flags || {};
    if (flags.emptyWord && (kind === 'number' || kind === 'int')) return '0';
    var t = String(text || '').trim();
    if (/^empty$/i.test(t) && (kind === 'number' || kind === 'int')) return '0';
    if (!t) return '';
    if (kind === 'time') return canonTime(t);
    if (kind === 'date') return canonDate(t, flags);
    if (kind === 'datetime') return canonDateTime(t, flags);
    if (kind === 'pair') return canonPair(t);
    if (kind === 'int') return t.replace(/\D/g, '');
    return t;
  }

  /** What a field is allowed to hold, so a beam of readings can be ranked. */
  function fieldSpec(key) {
    if (/^exh:/.test(key) || /^t:\d+:(in|out)$/.test(key)) return { kind: 'int', min: 100, max: 650, digits: 3 };
    if (/^t:\d+:rpm$/.test(key)) return { kind: 'int', min: 1000, max: 99999, digits: 5 };
    if (/^rack:/.test(key) || key === 'pumpMark' || key === 'windBft') return { kind: 'int', min: 0, max: 100, digits: 2 };
    if (/^cm:/.test(key)) return { kind: 'int', min: 0, max: 2000 };
    if (key === 'fwRob') return { kind: 'pair' };
    if (key === 'datetime') return { kind: 'datetime' };
    if (key === 'date') return { kind: 'date' };
    if (key === 'time') return { kind: 'time' };
    if (/^fm:|:hrs$|:svc$/.test(key)) return { kind: 'int', min: 0 };
    return { kind: 'number' };
  }

  function candidateScore(key, text, opts) {
    opts = opts || {};
    var spec = fieldSpec(key);
    var raw = String(text || '').trim();
    if (/^empty$/i.test(raw) && (spec.kind === 'int' || spec.kind === 'number')) raw = '0';
    var value = apply(spec.kind === 'int' ? 'int' : spec.kind, raw, opts);
    if (value === '' && raw !== '') return { value: '', score: -1 };
    var score = 1;
    if (spec.kind === 'int' || spec.kind === 'number') {
      var v = parseFloat(value);
      if (!Number.isFinite(v)) return { value: value, score: -1 };
      if (spec.min != null && v < spec.min) score -= 2;
      if (spec.max != null && v > spec.max) score -= 2;
      if (spec.digits && String(Math.round(v)).length !== spec.digits && spec.kind === 'int') score -= 1.5;
      var prev = opts.previous && opts.previous[key];
      if (prev != null && prev !== '' && /^fm:|:hrs$|:svc$|^t:\d+:rpm$/.test(key)) {
        var p = parseFloat(prev);
        if (Number.isFinite(p) && v + 0.05 < p) score -= 3;
        else if (Number.isFinite(p)) score += 0.4;
      }
    }
    if ((spec.kind === 'date' || spec.kind === 'datetime') && value) score += 1;
    if (spec.kind === 'time' && value) score += 1;
    if (spec.kind === 'pair' && value && value.indexOf('/') >= 0) score += 1;
    return { value: value, score: score };
  }

  /** Pick the reading that best fits the field. `cands` are raw strings, best first from the recognizer. */
  function rerank(key, cands, opts) {
    var best = { value: '', score: -1e9 };
    (cands || ['']).forEach(function (c, i) {
      var s = candidateScore(key, c, opts);
      s.score -= i * 0.05;
      if (s.score > best.score) best = s;
    });
    return best.value;
  }

  /** A sounding above the tank, a counter that went backwards, or a ROB that jumped. */
  function crossCheck(fields, opts) {
    opts = opts || {};
    var prev = opts.previous || {};
    var maxCm = opts.maxSoundingCm == null ? 2000 : opts.maxSoundingCm;
    var robJump = opts.robJump == null ? 8 : opts.robJump;
    var flags = [];
    Object.keys(fields || {}).forEach(function (key) {
      var raw = fields[key];
      if (raw == null || raw === '') return;
      var v = parseFloat(String(raw).split('/')[0]);
      if (/^cm:/.test(key) && Number.isFinite(v) && v > maxCm) flags.push({ key: key, kind: 'sounding', text: 'Sounding is above the tank height (' + maxCm + ' cm).' });
      if (prev[key] != null && prev[key] !== '' && Number.isFinite(v)) {
        var p = parseFloat(prev[key]);
        if (Number.isFinite(p)) {
          if (/^fm:|:hrs$|:svc$|^t:\d+:rpm$/.test(key) && v + 0.05 < p) flags.push({ key: key, kind: 'counter', text: 'This reading is below the previous one.' });
          if (/Rob$|^fwRob$/.test(key) && Math.abs(v - p) > robJump) flags.push({ key: key, kind: 'rob', text: 'This ROB moved by more than ' + robJump + ' since the previous entry.' });
        }
      }
    });
    return flags;
  }

  /** Compare a read value with the gold value. Both are already in canonical form. */
  function same(kind, got, want) {
    var g = apply(kind, got, {});
    var w = apply(kind, want, {});
    if (kind === 'text') return String(got || '').trim().toUpperCase().replace(/\s+/g, ' ') === String(want || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!w && !g) return true;
    return g === w;
  }

  var api = { canonTime: canonTime, canonDate: canonDate, canonDateTime: canonDateTime, canonPair: canonPair, apply: apply, crossCheck: crossCheck, same: same, MONTHS: MONTHS, rerank: rerank, fieldSpec: fieldSpec, nearYear: nearYear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChengCardGrammar = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

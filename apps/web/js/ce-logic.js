/* Chief-engineer features: reconciliation, inspection, alerts, backup
   checksums, and the superintendent workbook. Plain data in, plain data out.
   The screens and the noon database call these; they do not change a figure
   the v1 calculators already produced. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChengCe = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* Same aliases as ConsumptionPlan.normGrade, so LSFO and VLSFO are one grade. */
  function normGrade(g) {
    const u = String(g == null ? '' : g).trim().toUpperCase();
    const c = u.replace(/[\s_-]+/g, '');
    return ({ VLSFO: 'LSFO', ULSFO: 'LSFO', LSHFO: 'LSFO', LSIFO: 'LSFO', HSFO: 'HFO', 'MO/MGO': 'MDO/MGO', MDO: 'MDO/MGO', MGO: 'MDO/MGO', ULSMGO: 'LSMGO', LSMDO: 'LSMGO' })[c] || ({ LSMGO: 'LSMGO', LSFO: 'LSFO', HFO: 'HFO' })[c] || u;
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function rulesFrom(stored) {
    const src = stored || {};
    const t = Number(src.tolerancePct);
    const o = Number(src.overfillPct);
    const c = Number(src.consBandPct);
    return {
      tolerancePct: Number.isFinite(t) && t > 0 ? t : 1,
      overfillPct: Number.isFinite(o) && o > 0 ? o : 85,
      consBandPct: Number.isFinite(c) && c > 0 ? c : 15,
    };
  }

  const BOOK_KEYS = {
    id: 1, hidden: 1, submittedAt: 1, submittedBy: 1, supersedes: 1,
    supersededBy: 1, updatedAt: 1, _ceBypass: 1, ceRob: 1,
  };

  function stripBook(row) {
    const out = {};
    if (!row || typeof row !== 'object') return out;
    Object.keys(row).forEach((k) => {
      if (!BOOK_KEYS[k]) out[k] = row[k];
    });
    return out;
  }

  function stable(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }

  function sameNoonFigures(a, b) {
    return stable(stripBook(a)) === stable(stripBook(b));
  }

  /**
   * A submitted noon is not edited in place. The submitted row is hidden and
   * kept; the correction is a new row. The audit names the Chief Engineer.
   * An empty name still keeps both versions (so a save is not lost) and marks
   * the audit so the screen can ask for the name.
   */
  function versionSubmittedEdit(prev, next, opts) {
    const o = opts || {};
    if (!prev || !prev.submittedAt || prev.hidden) return { changed: false };
    if (sameNoonFigures(prev, next)) return { changed: false };
    const actor = String(o.actor || '').trim();
    const newId = o.newId || (String(prev.id) + '-r' + Date.now().toString(36));
    const now = o.now || new Date().toISOString();
    const archived = Object.assign({}, prev, { hidden: true, supersededBy: newId });
    const current = Object.assign({}, next, {
      id: newId,
      hidden: false,
      submittedAt: null,
      submittedBy: null,
      supersedes: prev.id,
      supersededBy: null,
    });
    const audit = {
      id: 'audit-' + newId,
      vesselId: prev.vesselId || next.vesselId || '',
      at: now,
      actor: actor,
      needsName: !actor,
      entity: 'entries',
      entityId: prev.id,
      before: stripBook(prev),
      after: stripBook(current),
      reason: o.reason || 'Correction of submitted noon',
    };
    return { changed: true, archived: archived, current: current, audit: audit, needsName: !actor };
  }

  function assignAuditActor(audit, name) {
    const actor = String(name || '').trim();
    if (!audit || !actor) return audit;
    return Object.assign({}, audit, { actor: actor, needsName: false });
  }

  function addMt(map, grade, mt) {
    const g = normGrade(grade);
    const n = num(mt);
    if (!g || n == null) return;
    map[g] = round3((map[g] || 0) + n);
  }

  function noonByGrade(entry) {
    const out = {};
    if (!entry) return out;
    const src = entry.ceRob || entry.robGrade || entry.closingRob || null;
    if (src && typeof src === 'object') {
      Object.keys(src).forEach((k) => addMt(out, k, src[k]));
    }
    return out;
  }

  function reconcileGrade(row, tolerancePct) {
    const tol = Number(tolerancePct) > 0 ? Number(tolerancePct) : 1;
    const noon = num(row.noonMt);
    const sounded = num(row.soundedMt);
    const delta = noon != null && sounded != null ? round3(sounded - noon) : null;
    let status = 'missing';
    let deltaPct = null;
    if (delta != null) {
      const basis = Math.max(Math.abs(sounded), Math.abs(noon), 0.001);
      deltaPct = round3(Math.abs(delta) / basis * 100);
      status = deltaPct > tol ? 'warn' : 'ok';
    }
    return {
      id: row.id || '',
      vesselId: row.vesselId || '',
      date: row.date || '',
      grade: normGrade(row.grade),
      noonMt: noon,
      soundedMt: sounded,
      bdnMt: num(row.bdnMt),
      orbMt: num(row.orbMt),
      deltaMt: delta,
      deltaPct: deltaPct,
      status: status,
      tolerancePct: tol,
    };
  }

  function buildRecon(src, tolerancePct) {
    const noon = {};
    const sounded = {};
    const bdn = {};
    const orb = {};
    (src.entries || []).forEach((e) => {
      if (!e || e.hidden) return;
      const map = noonByGrade(e);
      Object.keys(map).forEach((g) => { noon[g] = map[g]; });
    });
    (src.grades || []).forEach((g) => {
      if (!g) return;
      const id = normGrade(g.id || g.label || g.grade);
      if (g.logbookMT != null && g.logbookMT !== '' && noon[id] == null) noon[id] = num(g.logbookMT);
      if (g.actualMT != null && g.actualMT !== '') sounded[id] = num(g.actualMT);
    });
    (src.bdn || []).forEach((b) => addMt(bdn, b.grade || b.fuelType || b.fuelGrade, b.mt != null ? b.mt : b.quantityMT));
    (src.orbEntries || []).forEach((e) => {
      if (!e || e.voided) return;
      const code = String(e.code || '');
      const bunker = e.kind === 'bunker' || /^H/i.test(code) || /bunker/i.test(code);
      if (!bunker) return;
      const grade = e.grade || (e.values && (e.values.grade || e.values.fuel));
      const mt = e.mt != null ? e.mt : (e.values && (e.values.mt || e.values.qty || e.values.quantity));
      addMt(orb, grade, mt);
    });
    const grades = {};
    [noon, sounded, bdn, orb].forEach((m) => Object.keys(m).forEach((g) => { grades[g] = 1; }));
    const date = src.date || '';
    const vesselId = src.vesselId || '';
    return Object.keys(grades).sort().map((g) => reconcileGrade({
      id: vesselId + ':' + date + ':' + g,
      vesselId: vesselId,
      date: date,
      grade: g,
      noonMt: noon[g],
      soundedMt: sounded[g],
      bdnMt: bdn[g],
      orbMt: orb[g],
    }, tolerancePct));
  }

  function weekMs() { return 7 * 24 * 60 * 60 * 1000; }

  function isSludgeCode(entry) {
    const code = String(entry.code || '');
    const blob = code + ' ' + JSON.stringify(entry.selectedItems || entry.lines || entry.values || '');
    if (code === 'C.11' || /^C\.11/.test(code)) return true;
    return code === 'C' && /11\.[123]/.test(blob);
  }

  function scanInspection(src) {
    const now = src && src.now ? new Date(src.now).getTime() : Date.now();
    const orb = (src && src.orbEntries) || [];
    const findings = [];
    const hints = [];
    const recent = orb.filter((e) => {
      if (!e || e.voided) return false;
      const t = new Date(e.date || e.createdAt || 0).getTime();
      return Number.isFinite(t) && now >= t && now - t <= weekMs();
    });
    if (recent.length && !recent.some(isSludgeCode)) {
      findings.push({
        level: 'missing',
        item: 'Weekly sludge inventory (C.11) is missing for this week',
      });
    }
    const docs = (src && src.bdn) || [];
    const receipts = (src && src.receipts) || [];
    docs.forEach((doc) => {
      const n = String(doc.bdnNumber || doc.number || '').trim();
      if (!n) return;
      const hit = receipts.some((r) => JSON.stringify(r || {}).toUpperCase().indexOf(n.toUpperCase()) >= 0);
      if (!hit) {
        findings.push({ level: 'missing', item: 'BDN ' + n + ' has no matching receipt' });
      }
    });
    ((src && src.sludge) || []).forEach((row) => {
      const book = num(row.orbM3);
      const sounded = num(row.soundedM3);
      if (book == null || sounded == null) return;
      const basis = Math.max(Math.abs(book), Math.abs(sounded), 0.001);
      if (Math.abs(book - sounded) / basis * 100 > 1) {
        findings.push({
          level: 'inconsistent',
          item: (row.name || 'Sludge tank') + ' retention differs from the sounded figure',
        });
      }
    });
    const bilgeNoted = recent.some((e) => {
      const code = String(e.code || '');
      return code === 'I' || code === 'D' || /bilge/i.test(JSON.stringify(e.lines || e.values || ''));
    });
    if (recent.length && !bilgeNoted) {
      hints.push({
        level: 'hint',
        item: 'Oily bilge retention (Code I) is voluntary under MEPC.1/Circ.736 — record it when the SMS requires it',
      });
    }
    return { findings: findings, hints: hints };
  }

  function isResidual(grade) {
    const g = normGrade(grade);
    return g === 'HFO' || g === 'LSFO' || g === 'RESIDUAL';
  }

  function limitAlerts(input) {
    const src = input || {};
    const rules = rulesFrom(src);
    const alerts = [];
    const fill = num(src.fillPct);
    if (fill != null && fill >= rules.overfillPct) {
      alerts.push({
        id: 'overfill',
        text: 'Bunkering fill ' + fill + '% is at or over the ' + rules.overfillPct + '% limit',
      });
    }
    if (src.ecaAt && src.now) {
      const dt = new Date(src.ecaAt).getTime() - new Date(src.now).getTime();
      if (dt > 0 && dt <= 60 * 60 * 1000 && isResidual(src.noonGrade)) {
        alerts.push({
          id: 'eca',
          text: 'ECA changeover is under an hour away and the noon fuel is still ' + normGrade(src.noonGrade),
        });
      }
    }
    const today = num(src.todayMtPerDay);
    const profile = num(src.profileMtPerDay);
    if (today != null && profile != null && profile > 0) {
      const pct = Math.abs(today - profile) / profile * 100;
      if (pct > rules.consBandPct) {
        alerts.push({
          id: 'consumption',
          text: 'Consumption is outside the ±' + rules.consBandPct + '% band of the vessel profile',
        });
      }
    }
    return alerts;
  }

  function countOf(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return value == null ? 0 : 1;
  }

  function suiteParts(suite) {
    const voyage = (suite && suite.voyage) || {};
    const stores = voyage.stores || {};
    const tank = (suite && suite.tank) || {};
    const vessels = tank.vessels || {};
    const ids = Object.keys(vessels).sort();
    return {
      entries: stores.entries || [],
      orbEntries: stores.orbEntries || [],
      tanks: ids.map((id) => (vessels[id] && vessels[id].tanks) || null),
      readings: ids.map((id) => (vessels[id] && vessels[id].readings) || null),
      bunker: ids.map((id) => ({
        summary: vessels[id] && (vessels[id].bunkerSummary || null),
        plan: vessels[id] && (vessels[id].bunkerPlan || null),
      })),
    };
  }

  function sha256Hex(text) {
    const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
    if (!subtle) return Promise.reject(new Error('SHA-256 is not available'));
    const data = new TextEncoder().encode(String(text));
    return subtle.digest('SHA-256', data).then((buf) => {
      const bytes = new Uint8Array(buf);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    });
  }

  function checksumParts(parts) {
    const keys = Object.keys(parts || {});
    return Promise.all(keys.map((key) => {
      const value = parts[key];
      return sha256Hex(stable(value)).then((hex) => [key, { sha256: hex, count: countOf(value) }]);
    })).then((rows) => {
      const out = {};
      rows.forEach((row) => { out[row[0]] = row[1]; });
      return out;
    });
  }

  function attachSuiteChecksums(suite) {
    return checksumParts(suiteParts(suite)).then((sums) => {
      suite.checksums = sums;
      return suite;
    });
  }

  const NO_CHECKSUM = 'Restored without an integrity block — this file was saved before checksums.';

  function checkSuite(suite) {
    if (!suite || !suite.checksums) return Promise.resolve({ ok: true, warning: NO_CHECKSUM });
    const parts = suiteParts(suite);
    const keys = Object.keys(suite.checksums);
    return Promise.all(keys.map((key) => {
      const stated = suite.checksums[key] || {};
      const value = parts[key];
      return sha256Hex(stable(value)).then((hex) => {
        if (stated.sha256 !== hex || Number(stated.count) !== countOf(value)) return key;
        return '';
      });
    })).then((names) => {
      const failed = names.filter(Boolean);
      if (failed.length) return { ok: false, failed: failed };
      return { ok: true };
    });
  }

  function superintendentSheet(src) {
    const s = src || {};
    const vs = s.vsActual || {};
    return {
      source: s.source || 'Consumption plan profile (planVsActual). Charter-party comparison uses that plan, not a separate contract file.',
      consumption: vs.rows || [],
      rob: s.recon || [],
      bunker: s.bunker || [],
    };
  }

  function sheetRows(sheet) {
    const rows = [['Section', 'Item', 'Planned or noon', 'Actual or sounded', 'Difference', 'Note']];
    (sheet.consumption || []).forEach((r) => {
      rows.push(['Consumption vs plan', r.grade, r.planned, r.actual, r.diff, sheet.source]);
    });
    (sheet.rob || []).forEach((r) => {
      rows.push(['ROB', r.grade, r.noonMt, r.soundedMt, r.deltaMt, r.status || '']);
    });
    (sheet.bunker || []).forEach((r) => {
      const planned = num(r.plannedMt);
      const actual = num(r.actualMt);
      rows.push(['Bunker', r.grade, planned, actual, planned != null && actual != null ? round3(actual - planned) : null, 'BDN versus plan']);
    });
    return rows;
  }

  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colName(index) {
    let n = index + 1;
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function sheetXml(rows) {
    const body = (rows || []).map((row, ri) => {
      const cells = row.map((cell, ci) => {
        const ref = colName(ci) + (ri + 1);
        if (typeof cell === 'number' && Number.isFinite(cell)) {
          return '<c r="' + ref + '"><v>' + cell + '</v></c>';
        }
        return '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(cell) + '</t></is></c>';
      }).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + body + '</sheetData></worksheet>';
  }

  function crc32(bytes) {
    let c = -1;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }

  function concat(parts) {
    let n = 0;
    parts.forEach((p) => { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  function u16(n) { return Uint8Array.of(n & 255, (n >>> 8) & 255); }
  function u32(n) { return Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255); }

  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((f) => {
      const name = new TextEncoder().encode(f.name);
      const crc = crc32(f.data);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length),
        u16(name.length), u16(0), name, f.data,
      ]);
      const central = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(offset), name,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    });
    const centralBlob = concat(centrals);
    const eocd = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBlob.length), u32(offset), u16(0),
    ]);
    return concat(locals.concat([centralBlob, eocd]));
  }

  function encodeUtf8(s) { return new TextEncoder().encode(s); }

  function buildXlsx(rows) {
    const sheet = sheetXml(rows);
    const files = [
      { name: '[Content_Types].xml', data: encodeUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '</Types>') },
      { name: '_rels/.rels', data: encodeUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>') },
      { name: 'xl/workbook.xml', data: encodeUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="Voyage" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: encodeUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '</Relationships>') },
      { name: 'xl/worksheets/sheet1.xml', data: encodeUtf8(sheet) },
    ];
    return zipStore(files);
  }

  return {
    normGrade: normGrade,
    num: num,
    rulesFrom: rulesFrom,
    sameNoonFigures: sameNoonFigures,
    versionSubmittedEdit: versionSubmittedEdit,
    assignAuditActor: assignAuditActor,
    reconcileGrade: reconcileGrade,
    buildRecon: buildRecon,
    scanInspection: scanInspection,
    limitAlerts: limitAlerts,
    stable: stable,
    suiteParts: suiteParts,
    sha256Hex: sha256Hex,
    checksumParts: checksumParts,
    attachSuiteChecksums: attachSuiteChecksums,
    checkSuite: checkSuite,
    NO_CHECKSUM: NO_CHECKSUM,
    superintendentSheet: superintendentSheet,
    sheetRows: sheetRows,
    buildXlsx: buildXlsx,
    ECA_LEAD_MS: 60 * 60 * 1000,
  };
});

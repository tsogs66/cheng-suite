/* ROB reconciliation, pre-inspection, limit alerts, superintendent summary.
   Reads the noon database and the tank files. Does not print a new form. */
window.ChengProModules = window.ChengProModules || {};

(function () {
  const Ce = window.ChengCe;
  const RULES_KEY = 'chengCeRules';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function vessel() {
    try {
      return (window.ChengPro && ChengPro.vessel && ChengPro.vessel.getActive && ChengPro.vessel.getActive()) || null;
    } catch (e) { return null; }
  }

  function vesselId() {
    const v = vessel();
    return v && v.id ? String(v.id) : '';
  }

  function chiefFromVessel() {
    const v = vessel();
    return String((v && v.chiefEngineer) || '').trim();
  }

  function nightOn() {
    const mode = document.documentElement.getAttribute('data-theme') || 'night';
    return mode === 'night';
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('noonReportDB'); }
      catch (err) { reject(err); return; }
      req.onerror = () => reject(req.error || new Error('noon database'));
      req.onupgradeneeded = (e) => {
        try { e.target.transaction.abort(); } catch (err) { /* Voyage owns the schema */ }
        reject(new Error('Voyage Chief database not initialized yet'));
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function idbAll(db, store) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(store)) { resolve([]); return; }
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(db, store, row) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(store)) { resolve(false); return; }
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(store).put(row);
    });
  }

  async function readRules(db, id) {
    let stored = null;
    try {
      const meta = await idbAll(db, 'meta');
      const row = meta.find((m) => m && m.key === 'alertRules:' + id);
      const tol = meta.find((m) => m && m.key === 'robTolerance:' + id);
      stored = Object.assign({}, row && row.value, tol && tol.value != null ? { tolerancePct: tol.value } : {});
    } catch (e) { stored = null; }
    if (!stored || stored.tolerancePct == null) {
      try { stored = JSON.parse(localStorage.getItem(RULES_KEY + ':' + id) || 'null'); } catch (e) { stored = null; }
    }
    return Ce.rulesFrom(stored);
  }

  async function writeRules(db, id, rules) {
    const value = Ce.rulesFrom(rules);
    try { localStorage.setItem(RULES_KEY + ':' + id, JSON.stringify(value)); } catch (e) { /* private mode */ }
    if (!db) return value;
    await idbPut(db, 'meta', { key: 'robTolerance:' + id, value: value.tolerancePct });
    await idbPut(db, 'meta', { key: 'alertRules:' + id, value: { overfillPct: value.overfillPct, consBandPct: value.consBandPct } });
    return value;
  }

  async function loadContext() {
    const id = vesselId();
    const ctx = {
      id: id,
      vessel: vessel(),
      chief: chiefFromVessel(),
      entries: [],
      receipts: [],
      orb: [],
      audit: [],
      grades: [],
      bdn: [],
      sludge: [],
      fillPct: null,
      profileMtPerDay: null,
      todayMtPerDay: null,
      ecaAt: null,
      noonGrade: '',
      plan: null,
      db: null,
      rules: Ce.rulesFrom(null),
    };
    try { ctx.db = await openDb(); } catch (e) { ctx.db = null; }
    if (ctx.db) {
      const allE = await idbAll(ctx.db, 'entries');
      ctx.entries = allE.filter((e) => e && !e.hidden && (!id || !e.vesselId || e.vesselId === id));
      ctx.receipts = (await idbAll(ctx.db, 'receipts')).filter((e) => !id || !e.vesselId || e.vesselId === id);
      ctx.orb = (await idbAll(ctx.db, 'orbEntries')).filter((e) => !id || !e.vesselId || e.vesselId === id);
      ctx.audit = (await idbAll(ctx.db, 'auditLog')).filter((e) => !id || !e.vesselId || e.vesselId === id);
      const meta = await idbAll(ctx.db, 'meta');
      const setup = meta.find((m) => m && (m.key === 'setup:' + id || m.key === 'setup'));
      const plan = setup && setup.value && setup.value.bunkerPlan;
      if (plan) ctx.plan = plan;
      const profile = setup && setup.value && setup.value.perfProfile;
      if (profile && profile.sea && profile.sea.daily != null) ctx.profileMtPerDay = Number(profile.sea.daily);
      if (setup && setup.value && setup.value.chEng && !ctx.chief) ctx.chief = String(setup.value.chEng).trim();
      ctx.rules = await readRules(ctx.db, id || 'ship');
    } else {
      ctx.rules = await readRules(null, id || 'ship');
    }
    if (id) {
      try {
        const fr = await fetch('/tanks/api/vessels/' + encodeURIComponent(id) + '/fuel-report').then((r) => r.ok ? r.json() : null);
        const grades = fr && fr.computed && fr.computed.grades;
        if (Array.isArray(grades)) ctx.grades = grades;
        const cap = fr && fr.computed && fr.computed.sections;
        if (Array.isArray(cap) && cap[0] && cap[0].totals && cap[0].totals.capacity100MT) {
          const weight = Number(cap[0].totals.weightAirMT) || 0;
          const full = Number(cap[0].totals.capacity100MT) || 0;
          if (full > 0) ctx.fillPct = Math.round(weight / full * 1000) / 10;
        }
      } catch (e) { /* tank file optional */ }
      try {
        const bs = await fetch('/tanks/api/vessels/' + encodeURIComponent(id) + '/bunker-summary').then((r) => r.ok ? r.json() : null);
        const form = bs && (bs.form || (bs.computed && bs.computed.form));
        if (form && (form.bdnNumber || (form.bdn && form.bdn.quantityMT))) {
          ctx.bdn = [{
            bdnNumber: form.bdnNumber || '',
            grade: (form.bdn && form.bdn.fuelType) || form.fuelGrade || '',
            quantityMT: form.bdn && form.bdn.quantityMT,
          }];
        }
      } catch (e) { /* bunker file optional */ }
    }
    const latest = ctx.entries.slice().sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || ''))).pop();
    if (latest) {
      const rob = latest.ceRob || {};
      const grades = Object.keys(rob);
      if (grades.length) ctx.noonGrade = grades[0];
      if (latest.me && latest.me.type) ctx.noonGrade = latest.me.type;
      if (latest.me && latest.me.daily != null) ctx.todayMtPerDay = Number(latest.me.daily);
    }
    try {
      const cached = JSON.parse(localStorage.getItem('chengCeEcaAt') || 'null');
      if (cached && cached.at) ctx.ecaAt = cached.at;
    } catch (e) { /* none */ }
    return ctx;
  }

  function publishAlerts(list) {
    try { localStorage.setItem('chengCeLastAlerts', JSON.stringify(list || [])); } catch (e) { /* ignore */ }
  }

  function alertsFor(ctx) {
    return Ce.limitAlerts({
      fillPct: ctx.fillPct,
      overfillPct: ctx.rules.overfillPct,
      ecaAt: ctx.ecaAt,
      now: new Date().toISOString(),
      noonGrade: ctx.noonGrade,
      todayMtPerDay: ctx.todayMtPerDay,
      profileMtPerDay: ctx.profileMtPerDay,
      consBandPct: ctx.rules.consBandPct,
    });
  }

  function pageHead(title, sub) {
    const night = nightOn() ? '<span class="ce-night">Night mode</span>' : '';
    return `<div class="section-head"><h2>${esc(title)}</h2><div class="sub">${esc(sub)} ${night}</div></div>`;
  }

  function chiefField(ctx) {
    const missing = !ctx.chief;
    return `<label>Chief Engineer
      <input id="ceChief" value="${esc(ctx.chief)}" autocomplete="name" placeholder="Name on the correction">
    </label>
    <p class="hint" id="ceChiefHint" ${missing ? '' : 'hidden'}>Enter the Chief Engineer name. A correction is filed under that name.</p>`;
  }

  async function rememberChief(ctx, name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    ctx.chief = trimmed;
    if (ctx.id) {
      try {
        await fetch('/tanks/api/vessels/' + encodeURIComponent(ctx.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chiefEngineer: trimmed }),
        });
      } catch (e) { /* the name still goes on the audit */ }
    }
    if (window.ChengPro && ChengPro.vessel && ChengPro.vessel.refresh) {
      try { await ChengPro.vessel.refresh(); } catch (e) { /* list refresh is optional */ }
    }
    return trimmed;
  }

  function requireChief(ctx) {
    const input = document.getElementById('ceChief');
    const name = String((input && input.value) || ctx.chief || '').trim();
    const hint = document.getElementById('ceChiefHint');
    if (!name) {
      if (hint) hint.hidden = false;
      if (input) input.focus();
      return '';
    }
    if (hint) hint.hidden = true;
    return name;
  }

  function fmt(n) {
    if (n == null || n === '') return '—';
    if (typeof n === 'number' && Number.isFinite(n)) return String(n);
    if (typeof n === 'string') return n;
    return '—';
  }

  async function renderRob(root) {
    const ctx = await loadContext();
    const recon = Ce.buildRecon({
      vesselId: ctx.id,
      date: new Date().toISOString().slice(0, 10),
      entries: ctx.entries,
      grades: ctx.grades,
      bdn: ctx.bdn,
      orbEntries: ctx.orb,
    }, ctx.rules.tolerancePct);
    const warns = recon.filter((r) => r.status === 'warn').length;
    root.innerHTML = `<section class="panel ce-page" data-ce-ready="rob">
      ${pageHead('ROB reconciliation', warns ? warns + ' grade' + (warns === 1 ? '' : 's') + ' outside ' + ctx.rules.tolerancePct + '%' : 'Noon, soundings, BDN and e-ORB')}
      <p class="hint">One figure per grade. The noon column is the logbook, or the ROB stamped when the noon was submitted. A warning is the sounded weight against that noon, in percent. Tolerance default is 1%.</p>
      <div class="ce-meta">
        ${chiefField(ctx)}
        <label>Tolerance %
          <input id="ceTol" type="number" inputmode="decimal" min="0.1" step="0.1" value="${esc(ctx.rules.tolerancePct)}">
        </label>
        <button type="button" class="btn" id="ceSaveRules">Save tolerance</button>
        <button type="button" class="btn primary" id="ceSubmitNoon">Submit noon</button>
      </div>
      <div class="table-scroll"><table class="ce-table">
        <thead><tr><th>Grade</th><th>Noon</th><th>Sounded</th><th>BDN</th><th>e-ORB</th><th>Difference</th><th></th></tr></thead>
        <tbody>${recon.length ? recon.map((r) => `<tr>
          <td>${esc(r.grade)}</td><td>${fmt(r.noonMt)}</td><td>${fmt(r.soundedMt)}</td>
          <td>${fmt(r.bdnMt)}</td><td>${fmt(r.orbMt)}</td>
          <td class="${r.status === 'warn' ? 'ce-warn' : ''}">${fmt(r.deltaMt)}${r.deltaPct != null ? ' (' + r.deltaPct + '%)' : ''}</td>
          <td>${r.status === 'warn' ? 'Outside tolerance' : r.status === 'ok' ? 'Within tolerance' : 'Incomplete'}</td>
        </tr>`).join('') : '<tr><td colspan="7">No noon or sounding figures on this device yet.</td></tr>'}</tbody>
      </table></div>
      <h3>Audit</h3>
      <p class="hint">A submitted noon stays as it was. A correction is a new version. The earlier one is hidden from the log and kept here.</p>
      <div class="table-scroll"><table class="ce-table">
        <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
        <tbody>${ctx.audit.length ? ctx.audit.slice().reverse().map((a) => `<tr>
          <td>${esc(a.at || '')}</td>
          <td>${esc(a.actor || (a.needsName ? 'Name needed' : ''))}</td>
          <td>${esc(a.reason || a.entity || '')}</td>
        </tr>`).join('') : '<tr><td colspan="3">No corrections yet.</td></tr>'}</tbody>
      </table></div>
    </section>`;
    root.querySelector('#ceSaveRules').onclick = async () => {
      const tol = Number(root.querySelector('#ceTol').value);
      ctx.rules = await writeRules(ctx.db, ctx.id || 'ship', Object.assign({}, ctx.rules, { tolerancePct: tol }));
      await renderRob(root);
    };
    root.querySelector('#ceSubmitNoon').onclick = async () => {
      const name = requireChief(ctx);
      if (!name) return;
      await rememberChief(ctx, name);
      if (!ctx.db) return;
      const latest = ctx.entries.slice().sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || ''))).pop();
      if (!latest) return;
      if (latest.submittedAt) return;
      latest.submittedAt = new Date().toISOString();
      latest.submittedBy = name;
      await idbPut(ctx.db, 'entries', latest);
      for (const row of recon) await idbPut(ctx.db, 'robRecon', row);
      await renderRob(root);
    };
    if (ctx.db) {
      for (const row of recon) {
        try { await idbPut(ctx.db, 'robRecon', row); } catch (e) { /* store appears after the v12 open */ }
      }
    }
  }

  async function renderInspect(root) {
    const ctx = await loadContext();
    const scan = Ce.scanInspection({
      now: new Date().toISOString(),
      orbEntries: ctx.orb,
      receipts: ctx.receipts,
      bdn: ctx.bdn,
      sludge: ctx.sludge,
    });
    const n = scan.findings.length;
    root.innerHTML = `<section class="panel ce-page" data-ce-ready="inspect">
      ${pageHead('Pre-inspection check', n ? n + ' item' + (n === 1 ? '' : 's') : 'Nothing missing in this scan')}
      <p class="hint">PSC, vetting and MARPOL. Expected ORB items only. Oily bilge retention stays a hint, because MEPC.1/Circ.736 leaves it voluntary.</p>
      ${n ? `<ul>${scan.findings.map((f) => `<li class="ce-warn">${esc(f.item)}</li>`).join('')}</ul>` : '<p class="ce-banner ce-ok">No missing or inconsistent items in this scan.</p>'}
      ${scan.hints.length ? `<ul>${scan.hints.map((h) => `<li>${esc(h.item)}</li>`).join('')}</ul>` : ''}
    </section>`;
    if (ctx.db && ctx.id) {
      try {
        await idbPut(ctx.db, 'meta', { key: 'pscScan:' + ctx.id, value: { at: new Date().toISOString(), count: n } });
      } catch (e) { /* meta optional */ }
    }
  }

  async function renderAlerts(root) {
    const ctx = await loadContext();
    const list = alertsFor(ctx);
    publishAlerts(list);
    root.innerHTML = `<section class="panel ce-page" data-ce-ready="alerts">
      ${pageHead('Limit alerts', list.length ? list.length + ' open' : 'None open')}
      ${list.length ? list.map((a) => `<p class="ce-banner">${esc(a.text)}</p>`).join('') : '<p class="ce-banner ce-ok">No overfill, ECA or consumption alert.</p>'}
      <p class="hint">Warnings stay on this page, on Home, and on the plan screens. They are not written into a printed noon or bunker sheet.</p>
      <div class="ce-meta">
        <label>Overfill limit %
          <input id="ceOver" type="number" inputmode="decimal" min="1" max="100" step="1" value="${esc(ctx.rules.overfillPct)}">
        </label>
        <label>Consumption band ±%
          <input id="ceBand" type="number" inputmode="decimal" min="1" step="1" value="${esc(ctx.rules.consBandPct)}">
        </label>
        <label>ECA changeover (ship time)
          <input id="ceEca" type="datetime-local" value="">
        </label>
        <button type="button" class="btn" id="ceSaveAlerts">Save</button>
      </div>
      <p class="hint">The ECA reminder shows one hour before the time above, and only while the noon fuel is still a residual grade.</p>
    </section>`;
    root.querySelector('#ceSaveAlerts').onclick = async () => {
      const over = Number(root.querySelector('#ceOver').value);
      const band = Number(root.querySelector('#ceBand').value);
      const eca = root.querySelector('#ceEca').value;
      if (eca) {
        try { localStorage.setItem('chengCeEcaAt', JSON.stringify({ at: new Date(eca).toISOString() })); } catch (e) { /* ignore */ }
      }
      await writeRules(ctx.db, ctx.id || 'ship', Object.assign({}, ctx.rules, { overfillPct: over, consBandPct: band }));
      await renderAlerts(root);
    };
  }

  async function planActual(ctx) {
    if (!ctx.plan || !window.ConsumptionPlan || !ctx.entries.length) return null;
    const latest = ctx.entries.slice().sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || ''))).pop();
    if (!latest || !latest.datetime) return null;
    const fuel = {};
    if (latest.ceRob) Object.keys(latest.ceRob).forEach((g) => { fuel[g] = 0; });
    return ConsumptionPlan.planVsActual(ctx.plan, {
      to: latest.datetime,
      dist: 0,
      fuel: fuel,
      rob: latest.ceRob || {},
    }, ctx.entries[0] && ctx.entries[0].datetime);
  }

  async function renderSummary(root) {
    const ctx = await loadContext();
    let vs = null;
    try {
      if (!window.ConsumptionPlan) {
        await new Promise((resolve, reject) => {
          const s1 = document.createElement('script');
          s1.src = '/voyage/stem-advice.js';
          s1.onload = () => {
            const s2 = document.createElement('script');
            s2.src = '/voyage/consumption-plan.js';
            s2.onload = () => resolve();
            s2.onerror = reject;
            document.head.appendChild(s2);
          };
          s1.onerror = reject;
          document.head.appendChild(s1);
        });
      }
      vs = await planActual(ctx);
    } catch (e) { vs = null; }
    const recon = Ce.buildRecon({
      vesselId: ctx.id, date: new Date().toISOString().slice(0, 10),
      entries: ctx.entries, grades: ctx.grades, bdn: ctx.bdn, orbEntries: ctx.orb,
    }, ctx.rules.tolerancePct);
    const bunker = ctx.bdn.map((b) => ({
      grade: Ce.normGrade(b.grade || ''),
      plannedMt: null,
      actualMt: Ce.num(b.quantityMT),
    }));
    const sheet = Ce.superintendentSheet({ vsActual: vs, recon: recon, bunker: bunker });
    const table = Ce.sheetRows(sheet);
    root.innerHTML = `<section class="panel ce-page" data-ce-ready="summary">
      ${pageHead('Superintendent voyage summary', 'Consumption, ROB, bunker')}
      <p class="hint">${esc(sheet.source)}</p>
      <div class="table-scroll"><table class="ce-table">
        <thead><tr>${table[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${table.slice(1).map((row) => `<tr>${row.map((c) => `<td>${esc(fmt(c))}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="6">Nothing to summarise yet.</td></tr>'}</tbody>
      </table></div>
      <button type="button" class="btn primary" id="ceXlsx">Export Excel</button>
    </section>`;
    root.querySelector('#ceXlsx').onclick = async () => {
      const bytes = Ce.buildXlsx(table);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cheng-voyage-summary.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (ctx.db) {
        try {
          await idbPut(ctx.db, 'voyageBriefs', {
            id: 'brief-' + Date.now().toString(36),
            vesselId: ctx.id,
            at: new Date().toISOString(),
            rows: table,
          });
        } catch (e) { /* append-only when the store exists */ }
      }
    };
  }

  window.ChengProModules['ce-rob'] = { title: 'ROB reconciliation', render: renderRob };
  window.ChengProModules['ce-inspect'] = { title: 'Pre-inspection', render: renderInspect };
  window.ChengProModules['ce-alerts'] = { title: 'Limit alerts', render: renderAlerts };
  window.ChengProModules['ce-summary'] = { title: 'Voyage summary', render: renderSummary };

  async function paintHome(root) {
    const host = root.querySelector('#ceHomeBand');
    if (!host || !Ce) return;
    try {
      const ctx = await loadContext();
      const recon = Ce.buildRecon({
        vesselId: ctx.id, entries: ctx.entries, grades: ctx.grades, bdn: ctx.bdn, orbEntries: ctx.orb,
      }, ctx.rules.tolerancePct);
      const scan = Ce.scanInspection({ now: new Date().toISOString(), orbEntries: ctx.orb, receipts: ctx.receipts, bdn: ctx.bdn });
      const alerts = alertsFor(ctx);
      publishAlerts(alerts);
      const warns = recon.filter((r) => r.status === 'warn').length;
      host.innerHTML = `<p class="ce-banner ${warns || scan.findings.length || alerts.length ? '' : 'ce-ok'}">
        ROB ${warns ? warns + ' outside ' + ctx.rules.tolerancePct + '%' : 'within ' + ctx.rules.tolerancePct + '%'}
        · Inspection ${scan.findings.length}
        · Alerts ${alerts.length}
        ${nightOn() ? '· Night mode' : ''}
      </p>`;
    } catch (e) {
      host.innerHTML = '';
    }
  }

  async function paintBanner(root) {
    if (!root || !Ce) return;
    let el = root.querySelector('.ce-banner-slot');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ce-banner-slot';
      root.insertBefore(el, root.firstChild);
    }
    try {
      const ctx = await loadContext();
      const alerts = alertsFor(ctx);
      publishAlerts(alerts);
      el.innerHTML = alerts.length
        ? alerts.map((a) => `<p class="ce-banner">${esc(a.text)}</p>`).join('')
        : '';
    } catch (e) { el.innerHTML = ''; }
  }

  window.ChengCeUI = { paintHome: paintHome, paintBanner: paintBanner };
})();

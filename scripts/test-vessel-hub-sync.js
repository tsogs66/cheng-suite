#!/usr/bin/env node
'use strict';
/* AIO Vessel Setup save pushes identity and engine into Voyage setup:{id}
   and the oil-record identity, and a print header still uses that name. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const bridgeSrc = fs.readFileSync(path.join(root, 'apps/web/js/voyage-bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'modules/voyage/www/voyage_manager.html'), 'utf8');

function extract(name) {
  let start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(start, i + 1);
}

function fakeIdb(rows) {
  const data = rows.slice();
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            getAll() {
              const req = {};
              Promise.resolve().then(() => {
                req.result = data.slice();
                if (req.onsuccess) req.onsuccess();
              });
              return req;
            },
            put(value) {
              const i = data.findIndex((row) => row.key === value.key);
              if (i >= 0) data[i] = value;
              else data.push(value);
            },
          };
        },
      };
      Promise.resolve().then(() => { if (tx.oncomplete) tx.oncomplete(); });
      return tx;
    },
  };
  return {
    db,
    data,
    indexedDB: {
      open() {
        const req = {};
        Promise.resolve().then(() => {
          req.result = db;
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      },
    },
  };
}

async function loadBridge(rows) {
  const fake = fakeIdb(rows);
  const sandbox = {
    console,
    indexedDB: fake.indexedDB,
    localStorage: { getItem() { return null; }, setItem() {} },
    ChengPro: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bridgeSrc, sandbox);
  return { bridge: sandbox.ChengProVoyageBridge, data: fake.data };
}

(async () => {
  const existing = [
    { key: 'vessels', value: [{ id: 'v-harbour', name: 'M/V HARBOUR KEY', slug: 'harbour-key' }] },
    { key: 'setup:v-harbour', value: {
      vesselName: 'M/V HARBOUR KEY',
      imoNo: '1234567',
      voyageNumber: '42',
      grossTonnage: 41000,
      orb: { ioppForm: 'B', equipment: { owsFitted: true }, tanks: { sludge: [{ id: 's1', name: 'Sludge' }] }, gt: null, callSign: '' },
    } },
  ];
  const { bridge, data } = await loadBridge(existing);
  const pushed = await bridge.exportVesselToVoyage({
    name: 'M/V HARBOUR KEY',
    imo: '1234567',
    callSign: '3EXX9',
    flag: 'PA',
    company: 'Pacific Ocean Shipping',
    dwt: '60000',
    grossTonnage: 35200,
    netTonnage: 19800,
    auxPowerKw: 2400,
    master: 'C. Navarro',
    chiefEngineer: 'A. Reyes',
    mcrKw: 18630,
    mcrRpm: 91,
    voyageRegistryId: 'v-harbour',
  });
  assert.strictEqual(pushed.ok, true);
  const setup = data.find((row) => row.key === 'setup:v-harbour').value;
  assert.strictEqual(setup.vesselName, 'M/V HARBOUR KEY');
  assert.strictEqual(setup.imoNo, '1234567');
  assert.strictEqual(setup.callSign, '3EXX9');
  assert.strictEqual(setup.company, 'Pacific Ocean Shipping');
  assert.strictEqual(setup.grossTonnage, 35200);
  assert.strictEqual(setup.netTonnage, 19800);
  assert.strictEqual(setup.auxPowerKw, 2400);
  assert.strictEqual(setup.mcrKw, 18630);
  assert.strictEqual(setup.voyageNumber, '42', 'voyage ops stay on the voyage record');
  assert.strictEqual(setup.orb.shipName, 'M/V HARBOUR KEY');
  assert.strictEqual(setup.orb.callSign, '3EXX9');
  assert.strictEqual(setup.orb.imo, '1234567');
  assert.strictEqual(setup.orb.flag, 'PA');
  assert.strictEqual(setup.orb.gt, 35200);
  assert.strictEqual(setup.orb.masterName, 'C. Navarro');
  assert.strictEqual(setup.orb.chiefEng, 'A. Reyes');
  assert.strictEqual(setup.orb.ioppForm, 'B', 'IOPP is not replaced');
  assert.strictEqual(setup.orb.equipment.owsFitted, true);
  assert.strictEqual(setup.orb.tanks.sludge[0].name, 'Sludge');

  const headerSb = {
    state: { setup: setup },
    APP_NAME: 'Voyage Chief',
    escPrint: (s) => String(s == null ? '' : s),
  };
  vm.createContext(headerSb);
  vm.runInContext(extract('printDocHeader'), headerSb);
  const header = headerSb.printDocHeader({ title: 'Noon Report' });
  assert.ok(header.includes('pr-doc-header') && header.includes('M/V HARBOUR KEY') && header.includes('Voyage No.') && header.includes('42'));
  assert.ok(!header.includes('Managed in Vessel Setup'), 'print header text is unchanged');

  const blank = await loadBridge(existing);
  const gaps = await blank.bridge.identityGapsFromVoyage({ name: 'M/V HARBOUR KEY', imo: '1234567', voyageRegistryId: 'v-harbour' });
  assert.strictEqual(gaps.grossTonnage, 41000);
  assert.strictEqual(gaps.netTonnage, undefined);
  const kept = await blank.bridge.identityGapsFromVoyage({
    name: 'M/V HARBOUR KEY', imo: '1234567', voyageRegistryId: 'v-harbour', grossTonnage: 100,
  });
  assert.ok(!('grossTonnage' in kept), 'an AIO tonnage already stored is not overwritten');

  assert.ok(html.includes("setup.gt = state.setup.grossTonnage != null && state.setup.grossTonnage !== '' ? state.setup.grossTonnage : setup.gt"));
  assert.ok(html.includes('setup.callSign = state.setup.callSign || setup.callSign'));
  assert.ok(html.includes('Managed in Vessel Setup'));
  assert.ok(html.includes("id=\"s_mcrRpm\"") && html.includes('el.readOnly = !!hub;'));
  assert.ok(fs.readFileSync(path.join(root, 'apps/web/js/modules/vessel.js'), 'utf8').includes('name="grossTonnage"'));
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'modules/voyage/www/index.html'), 'utf8'),
    html,
    'voyage copies stay identical'
  );
  console.log('vessel hub sync ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

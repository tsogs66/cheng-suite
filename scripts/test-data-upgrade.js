/**
 * An update of ChEng AIO must keep ship data.
 * Database names, versions, backup format strings, app id and the sideload
 * keystore stay put. A tank backup written by the previous version imports
 * and exports with the same vessel, tank and reading.
 *
 * Run: node scripts/test-data-upgrade.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const cap = JSON.parse(read('capacitor.config.json'));
assert.strictEqual(cap.appId, 'marine.chengpro.app', 'Android package id');
assert.match(read('electron-builder.yml'), /appId:\s*marine\.chengpro\.app/);

const keystore = fs.readFileSync(path.join(root, 'signing/chengpro-sideload.keystore'));
const keyHash = crypto.createHash('sha256').update(keystore).digest('hex');
assert.strictEqual(
  keyHash,
  '966cff1344ee893aa6a7781f6b51ed899ce7008ca6836fb6f81218ce15c81c27',
  'sideload keystore changed — an APK update would not install over the old app'
);

const voyage = read('modules/voyage/www/voyage_manager.html');
assert.match(voyage, /indexedDB\.open\('noonReportDB',\s*11\)/);
assert.match(voyage, /const DB_BACKUP_FORMAT = 'noon-report-db-v1'/);
assert.match(voyage, /const VESSEL_EXPORT_FORMAT = 'noon-report-vessel-v1'/);
assert.doesNotMatch(voyage, /deleteObjectStore/);
assert.match(voyage, /if \(!d\.objectStoreNames\.contains\('meta'\)\)/);
assert.match(voyage, /if \(!d\.objectStoreNames\.contains\('entries'\)\)/);
assert.match(voyage, /if \(!d\.objectStoreNames\.contains\('voyageLegParts'\)\)/);

const dbjs = read('modules/tanks/public/js/db.js');
assert.match(dbjs, /const IDB_NAME = 'vessel-fuel-tms'/);
assert.match(dbjs, /const IDB_VER = 1/);
assert.doesNotMatch(dbjs, /deleteObjectStore/);

for (const key of ['marine_theme', 'marine_bright', 'vm_bright', 'chengAioEmbedded', 'chengProActiveVesselHint']) {
  assert.ok(voyage.includes(key), 'missing storage key ' + key);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheng-upgrade-'));
const prevData = process.env.CHENG_PRO_DATA_DIR;
const prevTms = process.env.TMS_DATA_DIR;
process.env.CHENG_PRO_DATA_DIR = dir;
process.env.TMS_DATA_DIR = dir;
const store = require(path.join(root, 'modules/tanks/public/js/store-core.js'));

const oldBackup = {
  format: 'vessel-fuel-tms-backup',
  index: {
    vessels: [{ id: 'mv-harbour-key', name: 'MV HARBOUR KEY', imo: '9123456' }],
    activeVesselId: 'mv-harbour-key',
  },
  vessels: {
    'mv-harbour-key': {
      vessel: {
        id: 'mv-harbour-key',
        name: 'MV HARBOUR KEY',
        imo: '9123456',
        callSign: 'TEST',
        flag: 'PA',
      },
      tanks: {
        fuel: [{ id: 'tk-1', name: 'FO PORT', capacity: 400, role: 'storage' }],
        lube: [],
        misc: [],
        water: [],
      },
      readings: { 'tk-1': { reading: 186, tempC: 42 } },
    },
  },
};

const imported = store.importBackup(oldBackup, { merge: false });
assert.strictEqual(imported.ok, true);
const bundle = store.getVesselBundle('mv-harbour-key');
assert.strictEqual(bundle.vessel.name, 'MV HARBOUR KEY');
assert.strictEqual(bundle.vessel.imo, '9123456');
assert.strictEqual(bundle.readings['tk-1'].reading, 186);
assert.strictEqual(bundle.readings['tk-1'].tempC, 42);
assert.ok(bundle.tanks.fuel.some((t) => t.id === 'tk-1' && t.name === 'FO PORT'));

const suiteFile = {
  format: 'cheng-aio-suite-v1',
  tank: oldBackup,
  voyage: { format: 'noon-report-db-v1', entries: [{ id: 'e1', note: 'kept' }] },
};
const again = store.importBackup(suiteFile, { merge: true });
assert.strictEqual(again.ok, true);
const after = store.getVesselBundle('mv-harbour-key');
assert.strictEqual(after.vessel.name, 'MV HARBOUR KEY');
assert.strictEqual(after.readings['tk-1'].reading, 186);

const exported = store.exportBackup();
assert.strictEqual(exported.format, 'vessel-fuel-tms-backup');
assert.strictEqual(exported.vessels['mv-harbour-key'].vessel.imo, '9123456');
assert.strictEqual(exported.vessels['mv-harbour-key'].readings['tk-1'].tempC, 42);

if (prevData == null) delete process.env.CHENG_PRO_DATA_DIR;
else process.env.CHENG_PRO_DATA_DIR = prevData;
if (prevTms == null) delete process.env.TMS_DATA_DIR;
else process.env.TMS_DATA_DIR = prevTms;

console.log('data upgrade: ok');

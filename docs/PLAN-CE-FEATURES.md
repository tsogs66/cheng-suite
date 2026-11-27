# ChEng Pro v2 — chief-engineer features (plan only)

Planning note for the PR #3 branch. No application code in this change. Hard constraints for every phase: existing printouts stay as they are (the Tank Condition print builders stay byte-identical to `history/cheng-pro` 0.3.380 except the already-approved “In use” annex column); `scripts/test-calc-v1-parity.js` keeps passing; app id `marine.chengpro.app`, the sideload key, and IndexedDB names stay; upgrades only add data.

## What is already there

| Need | Existing code / data |
| --- | --- |
| Noon ROB, receipts, e-ORB | `noonReportDB` v11 in `modules/voyage/www/voyage_manager.html` (`openDB`, stores `meta`, `entries`, `receipts`, `documents`, `abstracts`, `printHistory`, `voyageLegs`, `voyageLegParts`, `orbEntries`, `deletedBackup`, `dbSnapshots`, `dbSnapshotParts`, `syncLog`, `syncPieces`). e-ORB text in `modules/voyage/www/eorb.js`. |
| Sounded vs logbook | `modules/tanks/public/js/fuel-report-core.js` `compute()` writes `grades[].actualMT`, `logbookMT`, `differenceMT`. Sheet note in `fuel-report.js` `refreshComputed`. |
| Bunker / BDN / 85% line | `modules/tanks/public/js/bunkering-core.js`, `bunkering-report.js`. 85% fill is `SAFE_FILL_RATIO` and the dashboard warning in `app.js` (`pct >= 85`). Files under `data/vessels/<id>/` via `store-core.js` (`bunker-plan.json`, `bunker-summary.json`, `fuel-report.json`, `readings.json`). Tank IDB is `vessel-fuel-tms` v1 (`modules/tanks/public/js/db.js`). |
| Consumption vs plan | `planVsActual` and `planCsv` / `planText` in `modules/voyage/www/consumption-plan.js` (same file under `modules/tanks/public/js/`). |
| Backup | Suite file `cheng-aio-suite-v1` in `apps/web/js/modules/backup.js`. Voyage formats `noon-report-db-v1` and `noon-report-vessel-v1`. Tank format `vessel-fuel-tms-backup`. |
| Night mode, touch | `marine_theme` / Bright toggle. Phone cards and 44px inputs are already on the sounding sheet (`apps/web/css/station-pages.css`). |

## 1. ROB reconciliation

One figure per grade per ship date, built from the noon entry (`entries`), the sounded sheet (`differenceMT`), the BDN (`bunker-summary` / `receipts`), and e-ORB bunker lines (`orbEntries`). A warning fires when |computed − sounded| is above a tolerance stored per vessel (default proposed: 0.5 MT or 0.5%, whichever is larger — open question). “Submitted” sets a lock flag on that noon entry and that fuel report; the row stays readable. A correction writes a new audit record and a new version; it does not overwrite the submitted snapshot.

UI: a ROB band on Home (all sizes), a full page under Voyage on Windows and in More on phone/tablet. Lock/correct controls sit on Noon and on Soundings, not in the print layout.

Data: new `noonReportDB` store `robRecon` `{ id, vesselId, date, grade, noonMt, soundedMt, bdnMt, orbMt, deltaMt, status }` and `auditLog` `{ id, vesselId, at, actor, entity, entityId, before, after, reason }`. Tolerance in `meta` key `robTolerance:<vesselId>`. Fuel-report JSON gains optional `submittedAt` only. Old keys are never removed.

Tests: fixture with noon 100 MT, sounding 100.4, tolerance 0.5 → no warn; 1.0 → warn. Submit then edit → audit row, original snapshot unchanged. v1 calc parity still green. Upgrade test opens v11 data and reads it back after v12.

Risk: four sources use different grade names (`LSFO` vs `VLSFO`). Reuse `normGrade` from `consumption-plan.js`. Do not invent a fifth ROB formula.

Effort: new store, a matcher, and two screens. Largest of the six because the sources disagree today on purpose (`differenceMT` is already that gap).

## 2. Backup / export / restore

One button on the existing Backup & Sync page (`apps/web/js/modules/backup.js`), same control on Windows, tablet, and phone. It writes one `cheng-aio-suite-v1` file (current format, plus a `checksums` object: sha256 per part and record counts for `entries`, `orbEntries`, tanks, readings, bunker files). Restore refuses the file if a checksum or count does not match, and says which part failed. Share/USB stays the existing save path (Downloads/ChEngAIO on Android, folder picker on desktop).

Data: no new store. The file format stays `cheng-aio-suite-v1`; `checksums` is optional so a v1 backup still restores. Old files without checksums restore with a clear “no integrity block” line, not a hard fail (open question if the user wants a hard fail).

Tests: extend `scripts/test-data-upgrade.js` with a round-trip whose checksum is flipped and must be rejected, and an old backup without `checksums` that still loads MV HARBOUR KEY.

Risk: hashing the whole noon DB on a tablet. Hash per part, not one giant string on the input turn.

Effort: small wrapper on the backup that already exists.

## 3. Pre-inspection check

Read-only scan. ORB: `eorb.js` already lists expected weekly sludge (C.11) and bilge notes. BDN: `bunker-summary.json` number/grade/quantity vs `receipts` and vs ORB bunker codes. Sludge/bilge: ORB C/D/I lines vs tank readings for sludge and bilge tanks. Output is a list of missing or inconsistent items, not a new official form.

UI: one page under More → Ship on every size, and a short count on Home. No print layout change; a plain text list the chief can copy.

Data: none required. Optional cache of the last scan in `meta` key `pscScan:<vesselId>` so Home can show the count offline.

Tests: a fixture ORB week with no C.11, a BDN with no matching receipt, an empty scan. No calc changes.

Risk: flagging voluntary bilge lines (MEPC.1/Circ.736) as missing. Default the scanner to the codes `eorb.js` already calls expected, and leave voluntary ones as hints.

Effort: medium. Rules are lists over data that is already stored.

## 4. Engine-room usability

Most of this is present: night/day (`marine_theme`), 44px inputs on the sounding sheet, phone cards. Remaining work is glove-sized targets on Noon and Bunkering (the same 44px floor), `inputmode="decimal"` on MT/cm/temp fields that do not have it, and a visible “draft saved” for noon and bunker forms that already debounce a save.

UI: no new page. Noon (`voyage_manager.html` entry), Soundings, Bunkering Plan. Same on Windows, tablet, and phone; phone already stacks fields.

Data: none. Drafts stay in the existing noon draft and `fuel-report` / bunker draft fields.

Tests: a noon input has `inputmode="decimal"`; theme class `station` still toggles. Print HTML unchanged.

Risk: a numeric keypad on Windows desktop is wrong for a keyboard. Gate the keypad on coarse pointer, as `sheetPopupWanted()` already does in `fuel-report.js`.

Effort: small, spread across existing forms.

## 5. Limit alerts

Overfill: bunkering already estimates time-to-85% (`bunkering-report.js` estimate sheet, `data-bp-est-mon`). Surface that as a warning on the plan when projected volume crosses the vessel threshold (default 85%, stored per vessel, not hardcoded only). ECA: `consumption-plan.js` already splits legs at ECA entry/exit. A reminder when the next noon’s date crosses that split and the noon fuel is still the residual grade. Consumption: compare today’s MT/day with the vessel profile (`perfProfile` / `planVsActual`). Outside a band (proposed ±15% — open question) raises a warning, not a changed figure.

UI: banners on Bunkering Plan, Noon, and Consumption Plan. Home shows the count. Phone uses the same banners, full width.

Data: `meta` key `alertRules:<vesselId>` `{ overfillPct, consBandPct }`. Alerts themselves need not be stored; the last fired set can sit in `meta` key `alerts:<vesselId>` so a restart still shows them.

Tests: a plan leg projected to 90% warns; 80% does not. An ECA entry tomorrow with residual fuel on the noon warns. `test-calc-v1-parity.js` untouched.

Risk: warning text must not be written into the printed noon or bunker sheet.

Effort: small. The numbers are already computed.

## 6. Superintendent voyage summary

One page that reads `planVsActual` (consumption vs the charter-party / profile figures), `robRecon` from feature 1 (or `differenceMT` if feature 1 is not in yet), and bunker rate vs planned rate from `bunkering-core.js`. Export CSV with the existing `planCsv` pattern. Excel: write a CSV that Excel opens, unless the user requires a real xlsx (that adds a library; open question). No new print stylesheet.

UI: Voyage section, Windows sidebar and phone More. One table, horizontal scroll on a narrow screen, same as the other sheets.

Data: none if it only reads. A saved “issued summary” would be a new `voyageBriefs` store in v12, append-only.

Tests: a known plan and a known actual produce the same CSV columns every run. Parity tests still pass.

Risk: calling it “charter-party” when the only stored figures are the vessel profile and the consumption plan. Label the source on the page.

Effort: medium, and it should follow feature 1 so ROB discrepancies are the reconciled ones.

## Migration

`noonReportDB` 11 → 12 in `openDB()` only. `onupgradeneeded` creates `robRecon`, `auditLog`, and `voyageBriefs` with `if (!contains)`. No `deleteObjectStore`, no rewrite of `entries` or `orbEntries`. `scripts/test-data-upgrade.js` gains a v11 database that is reopened at v12 and still returns the old entry. Tank `vessel-fuel-tms` stays v1; new JSON fields are optional. A device that never opens the new pages keeps today’s files.

## Phases

1. Usability (feature 4) and the v12 empty-store migration. No behaviour change to figures.
2. Limit alerts (feature 5). Read-only on top of bunkering and ECA.
3. Backup checksums (feature 2). Independent, unblocks moving ships.
4. ROB reconciliation and audit (feature 1).
5. Pre-inspection scan (feature 3), using the lock and the audit from phase 4.
6. Superintendent summary and CSV (feature 6).

## Open questions

- Audit actor: chief’s name on the noon, the license email, or the device name?
- ROB tolerance: 0.5 MT, a percent, or both?
- May a submitted noon be corrected in place, or only by a new version that leaves the submitted copy?
- A backup with no checksum (every file shipped before this work): restore it, or refuse it?
- Excel: CSV that Excel opens, or a real xlsx file?
- ECA reminder: how many hours before the split should it show?

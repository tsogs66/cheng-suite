# Audit of ChEng Suite v0.3.383 against v1

Nothing here is merged or released.

A later pass on this branch put a test entitlement in the browser only (`localStorage` key `chengAioLicenseEntitlement`, sku `cheng-aio`, `master: true`, grace through 2027). No license code in the app was changed. With that key, `ChengLicense.isValid` is true and the module list is home, voyage, spares, eca, tanks, performance, eorb, bunkerplan, bunkeringplan, vessel, backup, license, about.

## Licensed pass (this branch)

All 46 visible shell destinations, the 48 menu-parity rows that those buttons cover, plus the CE pages that are their own buttons (ROB reconciliation, limit alerts, voyage summary, pre-inspection), left the “Activate a license” wall and rendered their own screen and buttons. That is the core open-and-show check. Destructive delete and a full file export were not run against Giorgis.

Actions that went past opening the screen:

| Action | v1 | v2 | Status |
| --- | --- | --- | --- |
| NO.1 H.F.O. TANK (P), ullage 150, temp 45, SG 0.9850, drafts and heel 0 | measured 61.353, weight 59.116, VCF 0.9793, 100% 463.5 | the same four figures | Pass. An earlier mismatch was leftover draft/heel on one side, not a different formula. |
| Monitoring save | — | Toast “Report saved” | Pass |
| Tank condition, after bunkering, bunker summary prints | HTML built on Tank Chief 2.2.83 | HTML built on the suite | Both generate. Headers and the ASTM 54/56 labels match. Live header fields (time, drafts) differ because the two data dirs do not share one saved report. v2 annex print omits the In use column; that is the one source difference in `printAnnexPage`. |
| Bunkering plan print button | id is `bp-print-only` | same | Not captured in the first hook (it looked for `bp-print`). Source of the ten bunkering print functions is byte-identical. |
| Voyage Print & Save with no summary open | — | Was a silent return. Now toasts “Open a voyage summary before printing”. | Fixed on this branch |
| Sounding sheet at 1366 and 800 | 113×38 px box, table 1304 px, word ULLAGE | After the fix: 120×44 at 1366, table 1276 px in a 1366 px page, no sideways scroll. At 800 the box is 95×44, ULLAGE still fits, and the page scrolls sideways (table 1047 px). | Fixed on this branch |

## Fixes on this branch

- Sounding sheet uses v1 column rules again: `table.fr-sheet { width: 100% }`, number boxes at least 58 px (temp 46, SG 68), method select at least 7.5 em so ULLAGE is fully visible, 44 px row height from 600 px up. The 100 px title offset is gone; titles sit at 56 px, under the tab strip, and the first row is not covered. A window narrower than the sheet scrolls the page sideways.
- `btnPrintVoyageSummary` tells you when there is nothing to print, in both `voyage_manager.html` and `index.html`.

This pass ran the programs. It did not stop at “the menu opens.”

## What was actually run

| Side | What | Data |
| --- | --- | --- |
| v1 Tank Chief | `tsogs66/tank-management` at `2.2.83`, served on port 8097 | MV GIORGIS seeded from `seed/giorgis` (17 fuel tanks, real trim grids from the Giorgis workbook). Captain Veniamis seed also loaded. |
| v1 Voyage Chief | `tsogs66/voyage-manager` `voyage_manager.html` and `noonreport_backup.json` (7.6 KB). Print functions compared to the suite. The noon backup was not imported. | — |
| v2 main | Suite `v0.3.383` (`origin/main`, port 8096) | Same Giorgis vessel written into its data dir |
| v2 + PR #6 | Suite working tree that is v0.3.383 plus the unmerged monitoring-column CSS (port 8094) | Same Giorgis vessel |

`data/world-port-index/official/WPI.dbf` is in the suite repo. The port list was not opened: in this browser the shell’s Voyage pages stop at the license gate (below).

A standalone Tank Chief window also puts up “activation required” over the sheet. The sheet behind it was measured and photographed after that overlay was removed. That overlay is v1’s own license lock, not a v2 defect.

## Layout (the part that is reproduced)

Target: the sheet fills the width the way v1 does, and a box comfortably holds 6–8 digits. v1 at 1366×768 does that: the HFO table is 1304 px in a 1366 px window, the actual-reading box is 113×38 px, and the method box shows **ULLAGE**.

| Build | Viewport | Actual box | Table width | Window | Result |
| --- | --- | --- | --- | --- | --- |
| v1 Tank Chief 2.2.83 | 1366×768 | 113×38 | 1304 | 1366 | Fills the width. ULLAGE readable. |
| v1 Tank Chief 2.2.83 | 800×1280 | 95×38 | 1128 | 800 | Wider than the window; the sheet’s own sideways scroll is the v1 behaviour. Boxes stay usable. |
| main v0.3.383 | 1366×768 | 184×44 | 1832 | 1366 | Boxes are about a sentence wide. The table is wider than the window. |
| main v0.3.383 | 800×1280 | 184×44 | 1832 | 800 | Same. Later columns sit past the edge. |
| PR #6 | 1366×768 | 55×44 | 1018 | 1366 | Does not fill the screen. Method shows **ULLA** (ULLAGE is clipped). |
| PR #6 | 800×1280 | 55×44 | 1018 | 800 | Still wider than 800, and the boxes are tighter than v1. |

Root cause of the two v2 layouts:

- On main, `html.station table input { min-width: 72px }` plus `width: 100%` on the sheet inputs, with the table sized to its contents, grows every box to the browser’s default field width (~20 characters). The sideways frame does not become a page scrollbar, so the extra columns are easy to miss.
- PR #6 then set number boxes to `7–9ch` and `max-width: 9ch`, and sized the table with `width: max-content`. That stops the sentence-width boxes, but it also clips the method select and leaves a large empty margin at 1366. v1 does not do either of those. v1 uses `table.fr-sheet { width: 100% }` and lets the columns share the window (`thead th` min-width 54 px, inputs min-width 58 / 46 / 68 px).

44 px touch height on the v2 boxes is intact. Phone card rules were not what changed these widths.

## Printouts

Print **builders** were diffed function by function.

| Area | v1 source | v2 source | Result |
| --- | --- | --- | --- |
| Tank monitoring / condition (`fuel-report.js`) | tank-management | suite | 12 print functions identical. `printAnnexPage` drops the **In use** column and its YES/blank cell. That is the one allowed difference already locked by `scripts/test-sounding-print.js`. |
| Bunkering plan / after / summary | tank-management `bunkering-report.js` | suite | 10 print functions identical. |
| Consumption plan | tank-management `bunker-consumption.js` | suite | 4 print functions identical. |
| Voyage Chief prints | voyage-manager `voyage_manager.html` | suite | 68 print functions identical. `buildLogEntryDataPrintDocument` differs (about 6700 vs 7000 characters). |

What was generated and looked at:

| Print | What happened |
| --- | --- |
| Tank condition (Monitoring, Giorgis, PR #6 build) | Print HTML was built (213 KB). The rendered first page shows MV GIORGIS, 11 HFO tanks, fuel grades, ullage/dip, capacities, and the lube / received / daily / survey blocks. It is a real sheet, not an empty page. |
| Tank condition after bunkering | Print HTML was built (212 KB) and the title is “TANK CONDITION AFTER BUNKERING”. Not rendered to a screenshot in this pass. |
| Voyage “Print & Save (A4 Portrait)” (`btnPrintVoyageSummary`) | Click does nothing. The handler returns immediately when `currentVsEntryId` is null, with no toast. That is a silent no-op, not a broken layout. |
| Noon, ROB, range totals, e-ORB, performance, superintendent | Not generated. In the shell those screens stop on “Activate a license…” because this browser has no valid entitlement (`ChengLicense.isValid` is false). The direct Voyage URL does open and lists saved entries (5 Jul 2026 bunkering, 4 Jul 2026 idle). |

I could not reproduce “every printout is broken.” The tank condition print path works on Giorgis. I also cannot sign the other printouts off, because they were not executed.

## Features that were actually used

| Feature | v1 behaviour | v2 behaviour | Status | Root cause | Fix effort |
| --- | --- | --- | --- | --- | --- |
| Monitoring, enter a sounding | v1 sheet accepts ullage, temp, SG | On Giorgis, reading 150, temp 45, SG 0.9850 produced measured 61.353 m³ and weight 59.116 MT | Pass | — | — |
| Monitoring, save | Saves the report | Toast “Report saved” | Pass | — | — |
| Monitoring column layout | Table fills 1366; ULLAGE visible; boxes ~113 px | main: boxes ~184 px, table 1832 px. PR #6: boxes 55 px, method clipped to ULLA, table 1018 px | Fail | See layout section | Small CSS. Match v1 `width: 100%` and the 54/58/46/68 px mins. Do not ship the 8ch cap. |
| Tank condition print | v1 builder | First page renders for Giorgis | Pass (this sheet) | — | — |
| Annex print vs v1 | Has an In use column | In use column removed | Known difference | Intentional, covered by the print parity test | Leave it unless the office wants the column back |
| Bunkering print builders | tank-management | Byte-identical functions | Pass (source) | — | Re-run the buttons on a licensed shell before calling the paper good |
| Voyage summary Print & Save | Prints the open summary | Click returns with no message when no summary is open | Fail | `if (!currentVsEntryId) return` | Small: say why nothing printed |
| Voyage log-entry blank form print | voyage-manager builder | `buildLogEntryDataPrintDocument` is not the same text | Not run | Source differs; output not generated this pass | Diff that one function, then print it |
| Shell: Voyage, Tanks, e-ORB, and their submenus | v1 apps open on their own | “Activate a license to use this program.” | Blocked here | No entitlement in this browser. Direct `/tanks/` and `/voyage/` still open. | Do not treat this as a code defect until it happens on a device that already has a key |
| Consumption Plan, Bunkering Plan | Separate v1 pages | “not on this license” | Blocked here | Same entitlement check (`moduleAllowed`) | Same as above |
| ECA, Spares | Part of the voyage record | “Voyage Chief is not on this license.” | Blocked here | They refuse to open when voyage is not allowed | Same as above |
| Performance | Opens the scramble calculator | Page title “PERFORMANCE CALCULATION”, basis MV GIORGIS | Opened, not calculated | — | Run one scramble on a follow-up |
| Notes, Vessel Setup, Backup, License, About | Present | Pages render their own forms | Opened | — | — |
| ROB reconciliation, limit alerts, voyage summary, pre-inspection | Not in v1 Tank/Voyage apps | Pages render (empty or “nothing missing”) | Opened, not filed | — | — |
| Home | — | “No Voyage Chief data on this device yet” plus links | Opened | Shell has no voyage DB in this profile even though `/voyage/` lists entries | Check why Home does not see the voyage DB |
| Port list / WPI.dbf | Voyage reference | Not opened | Not run | Shell reference page is behind the license gate | Open Reference on a licensed session and search one WPI port |

## Counts

Counted only where something was done, not where a heading appeared.

- Pass: monitoring calculate, monitoring save, tank-condition print render, bunkering/consumption/tank print **source** match (3 groups), annex difference is the known In-use removal.
- Fail: main sheet too wide (2 viewports), PR #6 sheet too small and method clipped (2 viewports), voyage summary print silent no-op.
- Blocked, not scored as a crash: every Voyage Chief, Tank Chief, and e-ORB screen inside the shell, plus Consumption Plan, Bunkering Plan, ECA, and Spares. Cause in this browser: no valid license entitlement.
- Not run: noon print, ROB print, e-ORB print, performance calculation, superintendent export, importing `noonreport_backup.json`, a WPI port search.

The “about 60% of the program does nothing” report matches the shell license gate **if the device has no key loaded**. It was not reproduced as a crash behind a loaded key. That still has to be tried with the ship’s key before anyone calls the gate a bug.

## Fix order

1. Drop the PR #6 `7–9ch` caps. Put the sounding sheet back to v1 proportions: `width: 100%` on `table.fr-sheet`, column mins of about 54 px, inputs at the v1 58 / 46 / 68 px mins, method wide enough for the word ULLAGE, tank name sized to the name. Keep the 44 px row height and the header that sits above row 1.
2. On main, stop the inputs growing to ~20 characters, and make the extra columns reachable with a visible sideways scroll when the window is narrower than the v1 sheet (800 px). Do not shrink the 1366 px sheet below the v1 width.
3. Make `btnPrintVoyageSummary` say that no voyage summary is open, instead of returning quietly.
4. On a browser that already holds the ship’s license, print noon, ROB, the bunkering sheets, e-ORB, and the superintendent summary, and only then change print code. The tank condition builder is not the thing that is empty.
5. If that licensed session still shows “Activate a license” on Voyage or Tanks, that is the 60% failure and it goes next. It did not happen as a crash in this unlicensed browser.

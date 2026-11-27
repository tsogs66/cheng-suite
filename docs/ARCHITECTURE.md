# ChEng Suite v2 — architecture

Companion to [PLAN.md](PLAN.md). This is the target shape. It is not implemented in this pull request.

Working name: ChEng Suite. Stack stays vanilla HTML, CSS, and JavaScript, plus the Node gateway and the Python voyage sync process that ChEng AIO 0.3.380 already runs.

## What each repository is

ChEng AIO (`Cheng-Pro` 0.3.380, `2f0b79bb`) is the integrated product:

```
apps/web/                 shell
modules/voyage/www/       Voyage SPA copy
modules/voyage/sync-server/   Python auth + voyage sync (same tree as voyage-manager)
modules/tanks/public/     Tank SPA copy
modules/tanks/server/     Tank Express API copy
server/index.js           gateway
desktop/                  Electron
deploy/proxmox-install.sh Debian 12 LXC
```

Voyage Chief (`voyage-manager` 1.0.395) is a flat SPA: `voyage_manager.html` at the repo root, helpers beside it, `sync-server/` for Python, Capacitor `webDir` `www` (filled by `scripts/sync-www.js`). Windows is an NSIS installer that drops a PowerShell loopback server into `%LOCALAPPDATA%\NoonReport`. It is not Electron. The loopback server exists so IndexedDB and the service worker have a stable origin. `file://` would make storage a new origin on every launch.

Tank Chief (`tank-management` 2.2.83) is a modular SPA (`public/`) plus Express (`server/`). Electron and Capacitor match AIO’s generation (Capacitor 6, Electron 33). Voyage’s Android project is Capacitor 7. The suite does not unify that major version until the release milestone, and only with an in-place APK test.

App ids, which are also the Android storage scopes:

| Build | appId | Packaging today |
| --- | --- | --- |
| ChEng AIO | `marine.chengpro.app` | electron-builder NSIS + portable, Capacitor APK, PWA |
| Voyage Chief | `com.noonreport.voyagemanager` | NSIS + PowerShell loopback, Capacitor 7 |
| Tank Chief | `cloud.tsogs.tankmanagement` | electron-builder NSIS + portable, Capacitor 6 |

## Target layout

```
apps/shell/            suite shell (from apps/web)
apps/voyage/           one Voyage SPA
  sync-server/         Python server.py, accounts.py, lan_sync.py
apps/tanks/
  public/              one Tank SPA
  server/              one Express API
packages/ui/           tokens, icons, day/night, textures
packages/shared/       helpers that are already one blob
server/                gateway
desktop/               Electron main, one config, three product targets
deploy/                LXC install + update
docs/
history/               imported archives from milestone 1; not served
```

The gateway mounts the same URLs it mounts now, so bookmarks and the Android WebView keep working:

| URL | Process |
| --- | --- |
| `/` | shell |
| `/voyage/` | Voyage SPA |
| `/tanks/` | Tank SPA and `/tanks/api/…` |
| `/api/auth`, `/api/admin`, `/api/voyage`, `/api/voyage-misc`, `/api/voyage-lan`, `/api/assignments`, `/api/vessels` | proxy to Python on `127.0.0.1:8787` |
| `/api/shell/…` | shared vessel identity on the tank store |
| `/api/sync/…`, `/api/lan/…` | tank sync, also at the gateway root because clients call the host without `/tanks` |
| `/api/health` | both modules |
| license routes, `/license-admin` | existing license host |

Python data directory: `{DATA}/voyage-sync/`, with `accounts.db` at `{DATA}/voyage-sync/accounts.db` (`SYNC_DATA_DIR`, `SYNC_ACCOUNTS_DB`). Tank JSON uses the same `DATA` root via `CHENG_PRO_DATA_DIR` / `TMS_DATA_DIR`. Those two env names stay accepted.

When Electron binds the main server to loopback, a second listener on `0.0.0.0:47617` answers only paired live-sync routes. That split stays. A phone on the ship Wi-Fi cannot reach a server that is only on `127.0.0.1`.

## Design system

Source: [Cheng-Pro PR 475](https://github.com/tsogs66/Cheng-Pro/pull/475), folder `docs/redesign-mockups/`. Night is the working theme. Day is the same consoles on chart paper. The mockups are static HTML (`station.css`, `station.js`, `icons.js`). No framework and no build step. `packages/ui` starts as those files, trimmed to tokens and icons, loaded with a stylesheet link.

Tokens to carry over:

- Night ground `#0b1218`. Day ground `#e6e0d2`.
- Fuel, distillate, lube, and fresh water keep the pipe colours the suite already uses (`scripts/test-pipe-colors.js` locks the current ones).
- Type: Inter for reading, JetBrains Mono for figures and plate stamps. Nothing under 12px. Touch targets 44px on a phone or tablet. Windows tightens them so a 768px-tall laptop still fits the form.
- Icons: Lucide 0.468.0, ISC, inlined, plus the original marine glyphs (sextant, tank gauge, sounding tape, bunker hose, oil-record book, lube drum). No request at sea. The mockup README is the icon table (item, plate colour, license).
- One day/night control visible per layout. The shell markup has three buttons plus one on the embed strip; CSS already hides the extras when the layout is right. v2 keeps a single visible control.

Day/night persistence uses the keys the apps already write: `marine_theme`, `marine_bright`, and `vm_bright`. A device that is already on the day theme stays there. New code writes the same keys the current page reads.

`packages/ui` does not own calculations, forms, or IndexedDB.

Shared helpers move only when the blob hash matches on the pinned tips. The list is in PLAN.md. `sea-distance` is not on that list: Voyage and the AIO Voyage copy share one tree, and Tank’s `public/sea-distance` is a different tree.

## Navigation

Windows sidebar, from 1366px wide, in today’s order:

Home, Voyage, Tanks, Consumption Plan, Bunkering Plan, ECA, e-ORB, Performance, Spares, Notes, Vessel Setup, Backup & Sync, License, About.

Inside Voyage, the second row stays Watch, Voyage, Books, Ship. Inside Tank, the second row stays Summary, Tanks, Fuel Management, Reference, System. Those rows are the module menus. On the suite they are not drawn (milestone 8). On the standalone builds they are the only Windows menu.

Touch layouts, from the mockup README:

| Viewport | Chrome |
| --- | --- |
| Width 320–599, portrait, coarse pointer | Bottom bar: Home, Noon, Soundings, More. e-ORB on the bar from 360px wide. |
| Coarse pointer, height under 500 (phone turned sideways) | No bottom bar. One chip row: Noon, Soundings, Home, e-ORB, More. |
| Width 600–1365, portrait, coarse pointer | Same bottom bar. More columns of figures. No Windows sidebar. |
| Width 600–1365, landscape, tall enough to be a tablet, coarse pointer | Left rail. Large items Noon, Soundings, Home, then the Windows sections as 44px rows. |
| Width 1366 and up | Windows sidebar, including a 1366×768 laptop. |

Phone home is four scroll-snap panes, each one viewport tall: Voyage, Fuel, Tanks, Engine. A tab strip and dots jump to a pane. A pane that overflows scrolls inside itself. Noon and Soundings stay on the bottom bar. Tablet and Windows keep one scrolling board.

More lists every Windows item, grouped Watch / Voyage / Tanks / Ship. The mockup README’s parity table is the checklist for milestone 7.

### The detection bug

Today a window is treated as a phone when its short side is 900px or less, or its width is 1180px or less, or the pointer is coarse and the **screen** short side is 1100px or less. A 1366×768 laptop fails the first test because 768 ≤ 900. A 1920×1080 touch laptop fails the third test because 1080 ≤ 1100.

The shell’s `shell.js` later drops the height test. Voyage and Tank never do. The shell’s inline script in `index.html` still has the height test, so the first paint can be the phone bar. The shell’s touch test still reads `screen`, so a touch 1080p Windows PC keeps the phone bar after `shell.js` runs.

v2 uses one function in all three entry points, including the inline boot script:

```
touch chrome when
  matchMedia('(hover: none) and (pointer: coarse)')
  and innerWidth < 1366
```

`innerWidth` is the viewport. `screen.width` and `screen.height` are not read. `innerHeight` is not an input to this decision. Height under 500 only chooses chips instead of the bottom bar after the window is already touch chrome. A fine pointer keeps the Windows sidebar, including when the user has dragged a desktop window narrow; the existing hamburger covers that narrow mouse band and is not shown at 1366 or wider.

A resize and orientation listener runs the same function. The class on `<html>` is either the Windows layout or the touch layout, never both menus.

Other chrome from the redundancy audit, handled with the nav work rather than as a separate project:

- Android full-screen control and `#navFab` stay Android-only.
- Tank’s sounding popup stays on a coarse pointer. A fine pointer at 1366 types in the grid.
- The page-zoom magnet hides on a fine pointer and a wide window. Ctrl/Cmd plus wheel stays. Whether to do this in milestone 6 or later is open question 14.
- Tank’s unconditional 70px bottom padding is removed when the bottom bar is not shown.

## Data and migration

v2 reads and writes the stores v1 already uses. Database names and backup format strings stay.

### Voyage Chief, on the device

IndexedDB `noonReportDB`, version 11. Object stores created in `onupgradeneeded`: `meta`, `entries`, `receipts`, `documents`, `abstracts`, `printHistory`, `voyageLegs`, `voyageLegParts`, `orbEntries`, `deletedBackup`, `dbSnapshots`, `dbSnapshotParts`, `syncLog`, `syncPieces`.

Do not open the database under another name. Do not bump version 11 without an upgrade function that only adds stores. A version bump that recreates stores wipes the ship. The comment in the page says a single oversized value closes the Android WebView; the part stores (`voyageLegParts`, `dbSnapshotParts`, `syncPieces`) stay.

Backup formats the page already accepts and emits:

| Format | Role |
| --- | --- |
| `noon-report-db-v1` | Full Voyage database. Stores listed in `DB_BACKUP_STORES`. |
| `noon-report-vessel-v1` | One vessel. |
| `noon-report-eorb-v1` | Oil record book extract. |
| `cheng-aio-suite-v1` | Suite file. Voyage reads `suite.voyage`. |

`localStorage` keys the Voyage page uses: `marine_bright`, `vm_bright`, `marine_theme`, `chengAioEmbedded`, `chengProActiveVesselHint`, `chengShipClock`, `noonReportDeviceId`. Keep those names. Active vessel inside the database is the `meta` record `activeVesselId`, not a new key.

### Tank Chief, on the device and on disk

IndexedDB `vessel-fuel-tms`, version 1, stores `kv` and `queue` (`public/js/db.js`). The browser runs the same `store-core.js` as the server, against the shim in `node-shim.js`. That is why the file cannot be forked into a “phone store” and a “server store.”

On disk, under `CHENG_PRO_DATA_DIR` or `TMS_DATA_DIR`: the vessel index, one folder of JSON per vessel, and (on the AIO copy) `users/<email-slug>/` when a license email scope is active. Unscoped installs keep the legacy root paths. Backup formats: `vessel-fuel-tms-backup`, `vessel-fuel-tms-sync`. A suite file `cheng-aio-suite-v1` is accepted by reading `suite.tank`.

### What an upgrade must not change

- IndexedDB names `noonReportDB` and `vessel-fuel-tms`.
- Backup format strings above. Standalone apps restore files written by the suite, and the other way around, as `docs/VESSEL_OWNERSHIP.md` already requires.
- `accounts.db` path under `voyage-sync/`.
- Android `appId` for any build that should see its old WebView storage. A new app id is a new empty database.
- Electron user-data directory for ChEng AIO. The display name can change only if `app.setPath('userData', …)` still points at the old folder. Portable mode keeps the sibling data directory the current EXE uses (`ChEngAIO-data/` in the 0.3.380 README). A rename of that folder is a reviewed copy, not a silent new path.
- Loopback host and sticky port behaviour. Chromium scopes `localStorage` to host:port. The gateway already mirrors the license and the sync credentials to `desktop-license.json` and `desktop-sync-creds.json` because a port change looks like an empty profile. v2 keeps those files.
- Voyage standalone’s `%LOCALAPPDATA%\NoonReport` profile. The suite EXE does not read it. Moving a standalone Voyage ship onto the suite is an export of `noon-report-db-v1` and an import, until a later milestone is written for that copy.

Server cutover (milestone 10) copies the data directory to the new container. It does not move it, and it does not run seed against the copy. `npm run seed` on a production data directory is a bug.

Shared identity stays one record per vessel (name, IMO, call sign, flag, company, type, DWT, notes, assets). Voyage keeps flowmeters, noon entries, and e-ORB. Tank keeps calibration, soundings, and bunker plans. The shell’s active vessel id is the one both modules follow when they are embedded. Standalone builds keep their own pickers.

## Sync and the Proxmox install

One Debian 12 LXC is the default. Both products already install that way, and the suite script in `deploy/proxmox-install.sh` is the one to evolve. A VM is only worth it if the host later needs a different kernel or a service an LXC cannot run. Node, Python, and nginx do not need a VM.

Suggested guest: 2 vCPU, 2–4 GB RAM, disk for the vessel JSON plus room for `accounts.db` and a local backup copy. Code and data are different directories:

| Path | Contents |
| --- | --- |
| `/opt/cheng-suite` | git checkout, `npm install`, restarted on update |
| `/var/lib/cheng-suite` | vessel JSON, `voyage-sync/accounts.db`, desktop mirrors |
| `/root/cheng-suite.env` | copy of today’s `/root/cheng-pro.env` (`SYNC_ADMIN_*`, `SYNC_API_TOKEN`, `LICENSE_*`) |

The current script clones into `/opt/cheng-pro` and stores data inside that clone (`CHENG_PRO_DATA_DIR=$APP_DIR/data`), with `git clean` exclusions for `data/`. That works until a clean or a replaced directory takes the ship with it. v2 stops doing that. On first boot against an old container, if `/opt/cheng-pro/data` exists and `/var/lib/cheng-suite` does not, the update copies one into the other and leaves the source in place.

Processes on the guest:

- `cheng-suite.service` runs Node on `127.0.0.1:8788` and spawns Python on `127.0.0.1:8787`.
- nginx listens on `8080` and proxies `/` to `8788`, `client_max_body_size 64m`, long proxy read timeout (the current file uses 600s) so a chunked leg upload is not cut off.
- Live-sync port `47617` only when the main bind is loopback.

nginx on the container is enough for the ship LAN at `http://<ct-ip>:8080`. TLS is a front door in front of that port if question 8 says so. It is not required for Electron or for the Voyage loopback installer.

Backups:

- Proxmox snapshot or `vzdump` of the container before every update, kept long enough to restore a bad release.
- A second copy of `/var/lib/cheng-suite` and the env file onto storage outside the container. The snapshot and the file copy are different things; a snapshot restores the whole guest, the file copy restores the books if the guest disk is the thing that failed.
- The app-level backups the chief already makes (`noon-report-db-v1`, `vessel-fuel-tms-backup`, `cheng-aio-suite-v1`) stay the way a single PC is restored.

Updates:

- Tag on this repository. The guest fetches that tag, resets the code checkout, runs `npm install --omit=dev`, restarts the service, and curls `/api/health`.
- The data directory is not cleaned and not seeded.
- The env file is created only when it is absent. An existing file is sourced as-is. Missing license keys may be appended the way the current script backfills them. Existing values are not rotated.
- Health failure leaves the previous snapshot as the way back. The script should not delete the previous checkout until health passes. A simple approach: install the new tag beside the old one and flip a symlink after health, or restore the snapshot. Either is fine; deleting the only copy and then failing health is not.

The current container keeps its hostname, port, and data until the user switches. The new container is a second CT id.

## Build and release

No bundler is required to serve the apps. CI already syntax-checks the files a browser will load. Keep that.

| Artifact | How v1 does it | v2 |
| --- | --- | --- |
| Suite Windows NSIS + portable EXE | `electron-builder` in Cheng-Pro `release.yml` on `windows-latest`, tag `v*` | Same pipeline. `appId` `marine.chengpro.app`. Artifact names can gain a suite prefix only if the portable data directory name stays `ChEngAIO-data` or the EXE looks for the old name and copies it. |
| Suite Android APK | Capacitor 6, `android:prepare`, sideload keystore from `scripts/android-release-prep.js` | Same app id, same keystore, so an install updates in place. The release notes already say not to uninstall first. |
| Suite PWA | `apps/web/manifest.webmanifest`, service worker, install from the LAN URL | Same origin (`http://<ct>:8080/`) so the installed PWA keeps its storage. |
| Voyage Windows | `makensis` + PowerShell loopback, version from the service-worker cache (`1.0.<cache>`) | Keep this installer for the standalone flag until question 5 says to stop. Do not replace it with Electron in the same milestone as the suite EXE. |
| Voyage Android | Capacitor 7, app id `com.noonreport.voyagemanager` | Separate Capacitor project until a planned major-version bump. |
| Tank Windows and Android | electron-builder and Capacitor 6, app id `cloud.tsogs.tankmanagement` | Same ids if standalone builds continue. |
| Linux AppImage | `dist:linux` on AIO and Tank | Keep the script. It is not the ship path. |

Three `package.json` version fields exist today: suite `0.3.380`, Voyage `1.0.395`, Tank `2.2.83`. The gateway `/api/health` reports the suite version. About screens can keep showing the module numbers until question 9 picks one scheme. A tag on `cheng-suite` is the release the Proxmox guest checks out. Do not renumber the module versions inside a nav-only milestone.

`release.yml` jobs to carry forward: Windows electron-builder with `ELECTRON` available, Android assembleRelease with Java 21, publish the EXE and the APK to the GitHub release on `v*`. `ci.yml` jobs to carry forward: `node --check` on shell and module scripts, `copy-embedded.js` diff, Voyage `index.html` identical to `voyage_manager.html` until one name remains, Python 3.11, Tesseract and poppler for the PDF import test, `npm test` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.

The suite `npm test` script is the long chain in Cheng-Pro `package.json` (node scripts plus a few Python tests). Voyage and Tank have their own chains, and AIO already calls into both. After the move, one chain runs from the new paths. Splitting that chain is not required for the first green run.

## Testing

Existing tests are node and Python scripts. They parse source, run calculators, and boot the gateway plus Python for an auth smoke test. They do not drive a phone. Keep them green on every milestone from 2 onward. Path updates belong in the same commit as the move that breaks them.

Add, with the milestone that needs them:

| Check | When |
| --- | --- |
| Predicate unit: coarse+narrow is touch; fine pointer at 1366×768 is Windows; coarse at 1920 is Windows; height 768 with a fine pointer is Windows | Milestone 6 |
| Static check that the inline boot script and the later script call the same predicate (the current first-paint bug) | Milestone 6 |
| Hash check that `packages/shared` files have no second divergent copy | Milestone 4 |
| Format-string check: `noonReportDB`, `vessel-fuel-tms`, `noon-report-db-v1`, `noon-report-vessel-v1`, `vessel-fuel-tms-backup`, `cheng-aio-suite-v1` still appear as the live constants | Milestone 3, and again at 11 |
| Nav parity list: every Windows item has a More entry for the product flag under test | Milestone 7 |

Screen matrix, from the mockups. Manual on a real device or a browser at those CSS pixels. CI does not need a device lab. The four that guard the detection bug are first: 1366×768 fine pointer, 1920×1080 coarse pointer, 360×800 coarse portrait, 800×360 coarse landscape.

| Size | What to look at |
| --- | --- |
| 1366×768 | Windows sidebar, in the shell and inside an open module |
| 1920×1080 | Sidebar still; extra width adds columns, not a new menu |
| 360×800 and 320×568 | Bottom bar, four home panes, Noon steps, Soundings cards |
| 800×360 | Chips, no bottom bar, panes still reachable |
| 800×1280 | Bottom bar, no sidebar |
| 1280×800 | Touch rail, not the Windows list |
| Day theme | Home, Noon, Soundings at 1366×768 and 360×800 |

Tank already depends on Playwright as a devDependency. A small Playwright script for the four bug sizes is appropriate in milestone 6 if it can run headless against the gateway. It is not a requirement for milestone 1 or 2. The current `npm test` chain is the requirement there.

Service-worker and backup tests that already exist (`test_backup_integrity`, `test_snapshot_size`, resumable upload, leg chunk upload) stay in the chain. They are the regression net for “a sync must not drop the open leg.”

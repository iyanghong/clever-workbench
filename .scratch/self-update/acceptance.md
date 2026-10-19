# Installed application acceptance

## Scope

This exercises full packaged Clever Workbench applications, not only the small helper fixture. macOS 27.0 (26A428), Apple Silicon, Electron 44.9.0. Both versions use the existing ad-hoc-signing packaging configuration; no Developer ID or notarization is added.

The transport substitutes only Electron `net.fetch` in the external Playwright harness. It maps the exact fixed GitHub API and asset URLs to local responses containing a real packaged ZIP and its SHA-256 checksum. No production alternate-source switch is introduced. An initial real startup request may encounter GitHub rate limiting before the harness attaches; the harness temporarily advances the external clock solely to make its explicit fixture check eligible, then restores it before downloading/installing.

This is **not public GitHub Release acceptance**. A real published old/new release pair and its public asset download path remain to be exercised. No release is created by the test.

## Reproduction

1. Run the normal application build.
2. In two newly allocated disposable output directories, use the normal electron-builder macOS arm64 packaging command with version 0.1.0 and `extraMetadata.version=0.1.1` respectively. Build the new version's `zip` target. Keep signing and security attributes unchanged.
3. Run `node scripts/verify-installed-update.mjs OLD_APP NEW_ZIP 0.1.1` with absolute artifact paths. The harness copies the old app into its own temporary directory and creates private test data, so supplied original packages and real user data remain untouched.
4. Run `tests/e2e/update.spec.ts` with `CWB_TEST_EXECUTABLE` pointing to the old packaged executable. Its installed-health fixture uses the canonical application path to match the real process.

The harness exercises the public bridge to check, download and install. It verifies a missing master password blocks installation, initializes a test vault, saves a document and image, requests installation, and inspects the transaction/health evidence. It preserves the quarantine attribute added by the real downloader. Finally it restores the encrypted pre-update backup into a separate private data directory through a full packaged old app and checks the document and image content.

## Findings and evidence

- Installed version display, installed nonce/window/IPC health confirmation, and damaged-history availability checks: **3 passed**, with the development-only check correctly skipped.
- Initial full update run correctly went red on a product defect hidden by Node-only extraction tests: Electron's ASAR filesystem interception rejected writing the staged `Contents/Resources/app.asar` (`Invalid package`). Reproduced with both a ditto ZIP and the official electron-builder ZIP. Official artifact: `/tmp/cwb-acceptance-new/Clever-Workbench-0.1.1-arm64.zip`, 128907853 bytes; failed isolated run: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-TIzJkt`.
- The production fix uses Electron's raw filesystem for bundle extraction. A subsequent real run reached LaunchServices, which relocated the quarantined app under AppTranslocation. It had no health receipt because strict installed-path matching ignored the transaction; the production fix now reports an explicit manual outcome for this case.
- A later rerun caught a quarantine-preservation regression introduced by staging cleanup hardening: precreating the destination directory before `ditto` lost the source bundle-root quarantine attribute. The staged bundle still carried `0083;6ad5f78e;Clever Workbench;`, while the installed bundle had only `com.apple.provenance`. This run produced a health success receipt but **failed acceptance** because the security attribute was lost. Evidence: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/cwb-installed-update-wIrZSe`; transaction `cf54168f-d929-4738-a460-142a86665ef8`, staged bundle `user-data/updates/staging/release-538yz4/Clever Workbench.app`. This must not count as a valid successful update.
- Final full packaged rerun pending below.

## Security and recovery boundaries

The helper fixture already demonstrated local same-path replacement/relaunch and restoration after an actual filesystem rename refusal. The full-app acceptance adds the real save, encrypted backup, download extraction and startup-health path. Gatekeeper rejection of a quarantined ad-hoc package is an allowed **manual** outcome, never reported as healthy success. Neither the harness nor updater removes quarantine or changes Gatekeeper settings. App package restoration and backup restoration are separate operations; the harness restores data only into a new disposable profile with its known test password.

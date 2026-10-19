# macOS bundle replacement experiment

## Scope and reproduction

Run `node scripts/verify-macos-update.mjs` on macOS after installing dependencies. It creates two real Electron `.app` fixture bundles with versions 0.1.1 and 0.1.2, an install ZIP, and private user-data folders under a newly allocated system temporary directory. Bundles use ad-hoc signatures. They contain a real Electron browser window and write a receipt only after its page rendered. No user installation or workbench data is used. Disposable artifacts remain at the printed path for inspection.

The helper runs using `/bin/sh` and system tools only, survives the installed app exit, stages on the destination filesystem, waits at most 60 seconds for the original PID, preserves the old app, renames the new app into the exact current location, then invokes LaunchServices. Its final `awaiting-health` state is deliberately not success; the coordinator must establish actual version/database/window/IPC health later.

Helper arguments: parent PID, absolute installed `.app` path, absolute verified staged `.app` path, absolute private transaction-directory path. Copy the helper outside the bundle before invoking it in production. It writes `helper-status` atomically and appends diagnostics to `helper.log`. It starts the updated application with `--clever-update-transaction <directory>`. The coordinator must restrict input paths and authenticate transaction ownership; renderer-supplied paths are not allowed.

## Results

- Environment: macOS 27.0 (26A428), arm64, Electron 44.9.0.
- Red: first execution failed with missing helper, exit 127, at the public install/relaunch assertion.
- Green: actual 0.1.1 process exited; actual 0.1.2 launched at the same installed executable path, rendered its window, and used the same isolated user-data directory. Prior app remained available.
- Complete passing run evidence: `/var/folders/73/c35nxr410f11hfh3ls36xjlc0000gn/T/clever-update-experiment-PuMUuf`; old PID 61606, new PID 61723. Both replacement/relaunch and real filesystem refusal/restoration assertions passed (exit 0).
- Filesystem failure case: the fixture marks only its disposable staged bundle immutable (`uchg`) after staging. This forces a real rename error after the original app has been moved aside. The test requires restoring/relaunching 0.1.1 and rejects any 0.1.2 launch. The flag is removed from that disposable test candidate in `finally`; this is unrelated to quarantine.

## Gatekeeper and permissions

`codesign --verify --deep --strict` accepts the fixture bundles' ad-hoc signatures. `spctl --assess --type execute` rejects the same bundle. Local LaunchServices execution nevertheless worked: these fixtures were generated locally and had no `com.apple.quarantine` attribute (only `com.apple.provenance` was listed). Therefore the experiment proves local bundle replacement/relaunch, **not** trusted distribution or the behavior of a quarantined GitHub download. Ticket 07 must exercise real distributed assets and report prompts or rejections. No quarantine attribute was removed and no Gatekeeper setting was changed.

The helper rejects an unwritable parent and preserves diagnostic material. This experiment does not claim privilege escalation, arbitrary macOS installation compatibility, or automatic user-data downgrade.

## Production integration gates

Before enabling the install button, ticket 04 must integrate flush, mutation gating, encrypted backup, transaction ownership and persistence; harden interrupted-transaction recovery and lock cleanup; retain a bounded previous application safely; and handle app identity/version validation. Ticket 05 must independently confirm launch health and surface recovery directions. This helper is a proven installation primitive, not a complete update coordinator.

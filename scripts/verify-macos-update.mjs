// Real-system smoke test. Uses only disposable Electron bundles and isolated data.
import { execFileSync, spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('macOS required');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(path.join(tmpdir(), 'clever-update-experiment-'));
const electron = path.join(repo, 'node_modules/electron/dist/Electron.app');
const helper = path.join(repo, 'scripts/macos-update-helper.sh');
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
const waitFor = async (predicate, timeout = 45000) => {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`Timed out; evidence: ${root}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
function bundle(destination, version) {
  run('/usr/bin/ditto', [electron, destination]);
  const resources = path.join(destination, 'Contents/Resources/app');
  mkdirSync(resources, { recursive: true });
  writeFileSync(
    path.join(resources, 'package.json'),
    JSON.stringify({ name: 'clever-update-experiment', version, main: 'main.cjs' }),
  );
  writeFileSync(
    path.join(resources, 'main.cjs'),
    `
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const path = require('node:path');
const tx = process.argv[process.argv.indexOf('--clever-update-transaction') + 1];
app.setPath('userData', path.join(tx, 'isolated-data'));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  await w.loadURL('data:text/html,<h1>Update experiment</h1>');
  const rendered = await w.webContents.executeJavaScript('document.querySelector("h1").textContent');
  fs.writeFileSync(path.join(tx, app.getVersion() + '.json'), JSON.stringify({ version: app.getVersion(), pid: process.pid, executable: process.execPath, rendered, data: app.getPath('userData') }));
  if (fs.readFileSync(path.join(tx, 'expected-version'), 'utf8').trim() === app.getVersion()) {
    fs.writeFileSync(path.join(tx, 'health.json.next'), JSON.stringify({ outcome: 'success', version: app.getVersion(), rendered }), {mode: 0o600});
    fs.renameSync(path.join(tx, 'health.json.next'), path.join(tx, 'health.json'));
  }
  setTimeout(() => app.quit(), 4000);
});
`,
  );
  run('/usr/libexec/PlistBuddy', [
    '-c',
    `Set :CFBundleIdentifier com.cleverworkbench.update-experiment`,
    path.join(destination, 'Contents/Info.plist'),
  ]);
  run('/usr/libexec/PlistBuddy', [
    '-c',
    `Set :CFBundleShortVersionString ${version}`,
    path.join(destination, 'Contents/Info.plist'),
  ]);
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', destination]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination]);
}
const current = path.join(root, 'Installed.app');
const userData = path.join(root, 'profile');
const stagingRoot = path.join(userData, 'updates/staging');
mkdirSync(stagingRoot, { recursive: true });
const stageDirectory = mkdtempSync(path.join(stagingRoot, 'release-'));
const staged = path.join(stageDirectory, 'Clever Workbench.app');
const oldFixture = path.join(root, 'Old.fixture.app');
const newFixture = path.join(root, 'New.fixture.app');
const transaction = path.join(root, 'transaction');
mkdirSync(transaction, { mode: 0o700 });
writeFileSync(path.join(transaction, 'expected-version'), '0.1.2');
writeFileSync(path.join(transaction, 'expected-app-id'), 'com.cleverworkbench.update-experiment');
writeFileSync(path.join(transaction, 'user-data-directory'), userData);
writeFileSync(path.join(userData, 'preserved-data'), 'user data');
writeFileSync(path.join(root, 'preserved-backup.cwb'), 'encrypted backup fixture');
bundle(current, '0.1.1');
bundle(staged, '0.1.2');
run('/usr/bin/ditto', [current, oldFixture]);
run('/usr/bin/ditto', [staged, newFixture]);
run('/usr/bin/ditto', [current, current + '.previous-retired']);
run('/usr/bin/ditto', [
  '-c',
  '-k',
  '--keepParent',
  staged,
  path.join(stageDirectory, 'update.zip'),
]);
run('/usr/bin/open', ['-n', current, '--args', '--clever-update-transaction', transaction]);
await waitFor(() => existsSync(path.join(transaction, '0.1.1.json')));
const old = JSON.parse(readFileSync(path.join(transaction, '0.1.1.json')));
const worker = spawn('/bin/sh', [helper, String(old.pid), current, staged, transaction], {
  stdio: 'inherit',
});
const result = new Promise((resolve) => worker.on('exit', resolve));
assert.equal(await result, 0, 'helper completes replacement and launch');
assert.equal(
  readFileSync(path.join(transaction, 'helper-status'), 'utf8').trim(),
  'completed',
  'helper requires a matching application health receipt',
);
await waitFor(() => existsSync(path.join(transaction, '0.1.2.json')));
const next = JSON.parse(readFileSync(path.join(transaction, '0.1.2.json')));
assert.equal(next.version, '0.1.2');
assert.equal(next.rendered, 'Update experiment');
assert.equal(next.executable, old.executable, 'same installed application location');
assert.equal(next.data, old.data, 'same isolated data location');
assert.ok(!existsSync(current + '.previous'));
assert.ok(!existsSync(current + '.previous-retired'));
assert.ok(!existsSync(stageDirectory), 'successful install removes ZIP and extracted app');
assert.equal(readFileSync(path.join(userData, 'preserved-data'), 'utf8'), 'user data');
assert.ok(existsSync(path.join(root, 'preserved-backup.cwb')));
assert.deepEqual(JSON.parse(readFileSync(path.join(transaction, 'cleanup.json'))), {
  previousRemoved: true,
  retiredRemoved: true,
  stageRemoved: true,
});
console.log(
  JSON.stringify(
    { result: 'PASS replacement/relaunch/cleanup with data and backup retained', root, old, next },
    null,
    2,
  ),
);

// Inject a real filesystem refusal AFTER staging, so the helper must undo the
// already completed old-bundle rename. No production-only fault hooks or mocks.
const failureApp = path.join(root, 'Failure.app');
const failureTx = path.join(root, 'failure-transaction');
mkdirSync(failureTx, { mode: 0o700 });
writeFileSync(path.join(failureTx, 'expected-version'), '0.1.2');
writeFileSync(path.join(failureTx, 'expected-app-id'), 'com.cleverworkbench.update-experiment');
run('/usr/bin/ditto', [oldFixture, failureApp]);
const blocker = spawn('/bin/sleep', ['30']);
const failedWorker = spawn(
  '/bin/sh',
  [helper, String(blocker.pid), failureApp, newFixture, failureTx],
  { stdio: 'inherit' },
);
const failedResult = new Promise((resolve) => failedWorker.on('exit', resolve));
await waitFor(
  () =>
    existsSync(path.join(failureTx, 'helper-status')) &&
    readFileSync(path.join(failureTx, 'helper-status'), 'utf8').trim() === 'waiting-for-exit',
);
run('/usr/bin/chflags', ['uchg', failureApp + '.incoming']);
blocker.kill();
try {
  assert.equal(await failedResult, 1);
  assert.equal(
    readFileSync(path.join(failureTx, 'helper-status'), 'utf8').trim(),
    'failed:replacement-restored',
  );
  await waitFor(() => existsSync(path.join(failureTx, '0.1.1.json')));
  assert.equal(JSON.parse(readFileSync(path.join(failureTx, '0.1.1.json'))).version, '0.1.1');
  assert.ok(
    !existsSync(path.join(failureTx, '0.1.2.json')),
    'failed install never launches new version',
  );
  assert.ok(existsSync(newFixture), 'failed install retains its downloaded candidate');
  assert.ok(
    !existsSync(path.join(failureTx, 'cleanup.json')),
    'failure never runs success cleanup',
  );
  console.log(
    JSON.stringify(
      { result: 'PASS replacement failure restored/relaunched old app', root, failureApp },
      null,
      2,
    ),
  );
} finally {
  run('/usr/bin/chflags', ['nouchg', failureApp + '.incoming']);
}

// Re-enter the externally persisted crash boundary: old app has been moved,
// new app has not. Recovery restores the package without touching/launching data.
const interruptedApp = path.join(root, 'Interrupted.app');
const interruptedTx = path.join(root, 'interrupted-transaction');
mkdirSync(interruptedTx, { mode: 0o700 });
writeFileSync(path.join(interruptedTx, 'expected-app-id'), 'com.cleverworkbench.update-experiment');
writeFileSync(path.join(interruptedTx, 'helper-status'), 'replacing-app');
run('/usr/bin/ditto', [oldFixture, interruptedApp + '.previous']);
const recovery = spawn('/bin/sh', [helper, '99999999', interruptedApp, newFixture, interruptedTx], {
  stdio: 'inherit',
});
assert.equal(await new Promise((resolve) => recovery.on('exit', resolve)), 1);
assert.equal(
  readFileSync(path.join(interruptedTx, 'helper-status'), 'utf8').trim(),
  'failed:interrupted-replacement-restored',
);
assert.ok(existsSync(path.join(interruptedApp, 'Contents/MacOS/Electron')));
assert.ok(!existsSync(path.join(interruptedTx, '0.1.1.json')));
console.log(
  JSON.stringify(
    { result: 'PASS interrupted replacement restored without launching old data', root },
    null,
    2,
  ),
);

// A successful launch is not permission to follow staging/retention symlinks.
// Keep the external fixtures intact while still cleaning the known old package.
const guardedApp = path.join(root, 'Guarded.app');
const guardedTx = path.join(root, 'guarded-transaction');
const guardedProfile = path.join(root, 'guarded-profile');
const external = path.join(root, 'unrelated-files');
mkdirSync(guardedTx, { mode: 0o700 });
mkdirSync(path.join(guardedProfile, 'updates'), { recursive: true });
mkdirSync(external);
const externalStage = mkdtempSync(path.join(external, 'release-'));
run('/usr/bin/ditto', [oldFixture, guardedApp]);
run('/usr/bin/ditto', [newFixture, path.join(externalStage, 'Candidate.app')]);
symlinkSync(external, path.join(guardedProfile, 'updates/staging'));
symlinkSync(oldFixture, guardedApp + '.previous-retired');
writeFileSync(path.join(guardedTx, 'expected-version'), '0.1.2');
writeFileSync(path.join(guardedTx, 'expected-app-id'), 'com.cleverworkbench.update-experiment');
writeFileSync(path.join(guardedTx, 'user-data-directory'), guardedProfile);
const guarded = spawn(
  '/bin/sh',
  [
    helper,
    '99999999',
    guardedApp,
    path.join(guardedProfile, 'updates/staging', path.basename(externalStage), 'Candidate.app'),
    guardedTx,
  ],
  { stdio: 'inherit' },
);
assert.equal(await new Promise((resolve) => guarded.on('exit', resolve)), 0);
assert.deepEqual(JSON.parse(readFileSync(path.join(guardedTx, 'cleanup.json'))), {
  previousRemoved: true,
  retiredRemoved: false,
  stageRemoved: false,
});
assert.ok(!existsSync(guardedApp + '.previous'));
assert.ok(lstatSync(guardedApp + '.previous-retired').isSymbolicLink());
assert.ok(existsSync(oldFixture));
assert.ok(existsSync(path.join(externalStage, 'Candidate.app')));
console.log(
  JSON.stringify({ result: 'PASS cleanup refuses retention and staging symlinks', root }, null, 2),
);

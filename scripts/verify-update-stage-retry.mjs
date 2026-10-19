import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const input = path.resolve(process.argv[2]);
const helper = path.resolve('scripts/macos-update-helper.sh');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-stage-retry-'));
const target = path.join(root, 'Installed.app');
const source = path.join(root, 'Candidate.app');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const wait = async (predicate) => {
  const deadline = Date.now() + 30000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
try {
  run('/usr/bin/ditto', [input, target]);
  run('/usr/bin/ditto', [input, source]);
  run('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0083;12345678;Clever Workbench;', source]);
  const quarantine = run('/usr/bin/xattr', ['-px', 'com.apple.quarantine', source]);
  const version = run('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    path.join(source, 'Contents/Info.plist'),
  ]);
  const identity = run('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleIdentifier',
    path.join(source, 'Contents/Info.plist'),
  ]);
  const makeTx = async (name) => {
    const dir = path.join(root, name);
    await fs.mkdir(dir, { mode: 0o700 });
    await fs.writeFile(path.join(dir, 'expected-version'), version);
    await fs.writeFile(path.join(dir, 'expected-app-id'), identity);
    return dir;
  };
  const failed = await makeTx('failed');
  const child = spawn('/bin/sh', [helper, String(process.pid), target, source, failed], {
    stdio: 'ignore',
  });
  const firstEnded = new Promise((resolve) => child.once('exit', resolve));
  try {
    await wait(
      async () =>
        (await fs.readFile(path.join(failed, 'helper-status'), 'utf8').catch(() => '')).trim() ===
        'waiting-for-exit',
    );
    assert.equal(
      run('/usr/bin/xattr', ['-px', 'com.apple.quarantine', target + '.incoming']),
      quarantine,
      'staging must preserve quarantine exactly',
    );
  } finally {
    child.kill('SIGTERM');
    await firstEnded;
  }
  assert.notEqual(await firstEnded, 0);
  assert.equal(
    await fs.access(target + '.incoming').then(
      () => true,
      () => false,
    ),
    false,
    'failed copy must remove only its own partial candidate',
  );
  const retry = await makeTx('retry');
  const second = spawn('/bin/sh', [helper, String(process.pid), target, source, retry], {
    stdio: 'ignore',
  });
  const ended = new Promise((resolve) => second.once('exit', resolve));
  try {
    await wait(
      async () =>
        (await fs.readFile(path.join(retry, 'helper-status'), 'utf8').catch(() => '')).trim() ===
        'waiting-for-exit',
    );
    assert.equal(
      run('/usr/bin/xattr', ['-px', 'com.apple.quarantine', target + '.incoming']),
      quarantine,
      'retry must preserve quarantine exactly',
    );
  } finally {
    second.kill('SIGTERM');
    await ended;
  }
  assert.equal(
    run('/usr/libexec/PlistBuddy', [
      '-c',
      'Print :CFBundleShortVersionString',
      path.join(target, 'Contents/Info.plist'),
    ]),
    version,
  );
  console.log('PASS real interrupted-stage cleanup and retry; installed app untouched');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

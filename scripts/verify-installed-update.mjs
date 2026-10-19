// Acceptance at the installed-app boundary. Transport is a local fixture, NOT GitHub acceptance.
// Usage: node scripts/verify-installed-update.mjs /absolute/old.app /absolute/new.zip 0.1.1
import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const [oldApp, zip, nextVersion] = process.argv.slice(2);
if (process.platform !== 'darwin' || !oldApp || !zip || !nextVersion)
  throw Error('Supply old .app, new ZIP, next version on macOS');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-installed-update-'));
const installed = path.join(root, 'Installed.app');
const userData = path.join(root, 'user-data');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
run('/usr/bin/ditto', [oldApp, installed]);
const binary = run('/usr/libexec/PlistBuddy', [
  '-c',
  'Print :CFBundleExecutable',
  path.join(installed, 'Contents/Info.plist'),
]).trim();
const executable = path.join(installed, 'Contents/MacOS', binary);
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: userData };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const application = await _electron.launch({ executablePath: executable, args: [], env });
let launchedTransaction = '';
try {
  const page = await application.firstWindow();
  const password = 'isolated-update-acceptance-password';
  const assetName = `Clever-Workbench-${nextVersion}-arm64.zip`;
  const releaseRoot = `https://github.com/iyanghong/clever-workbench/releases/download/v${nextVersion}/`;
  const zipBytes = await fs.readFile(zip);
  const checksums = `${createHash('sha256').update(zipBytes).digest('hex')}  ${assetName}\n`;
  const sumsPath = path.join(root, 'SHA256SUMS');
  await fs.writeFile(sumsPath, checksums);
  const release = {
    tag_name: `v${nextVersion}`,
    draft: false,
    prerelease: false,
    published_at: new Date().toISOString(),
    body: 'Local acceptance transport fixture; not a published release.',
    assets: [
      { name: assetName, size: zipBytes.length, browser_download_url: releaseRoot + assetName },
      {
        name: 'SHA256SUMS',
        size: Buffer.byteLength(checksums),
        browser_download_url: releaseRoot + 'SHA256SUMS',
      },
    ],
  };
  await application.evaluate(
    ({ net }, fixture) => {
      const original = net.fetch.bind(net);
      net.fetch = async (input, options) => {
        const url = String(input);
        if (url === 'https://api.github.com/repos/iyanghong/clever-workbench/releases/latest')
          return Response.json(fixture.release);
        if (url === fixture.zipUrl) return original(fixture.zipFile);
        if (url === fixture.sumsUrl) return original(fixture.sumsFile);
        return original(input, options);
      };
    },
    {
      release,
      zipUrl: releaseRoot + assetName,
      sumsUrl: releaseRoot + 'SHA256SUMS',
      zipFile: pathToFileURL(zip).href,
      sumsFile: pathToFileURL(sumsPath).href,
    },
  );
  const waitFor = async (predicate, timeout = 90_000) => {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
      if (Date.now() > deadline) throw Error(`Timeout; inspect ${root}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };
  await waitFor(
    async () => (await page.evaluate(() => window.desktop.updateSnapshot())).status !== 'checking',
  );
  // An initial real startup request can race the transport fixture and hit a rate
  // limit. Advance ONLY the external clock while making the explicit fixture check.
  const initial = await page.evaluate(() => window.desktop.updateSnapshot());
  await application.evaluate((_, retryAt) => {
    globalThis.__acceptanceNow = Date.now;
    const offset = Math.max(0, Date.parse(retryAt || '') - Date.now() + 1) || 0;
    Date.now = () => globalThis.__acceptanceNow() + offset;
  }, initial.retryAt);
  const available = await page.evaluate(() => window.desktop.checkUpdate());
  await application.evaluate(() => {
    Date.now = globalThis.__acceptanceNow;
  });
  assert.equal(available.status, 'available');
  const downloaded = await page.evaluate(() => window.desktop.downloadUpdate());
  assert.equal(downloaded.status, 'ready', JSON.stringify(downloaded));
  await assert.rejects(
    page.evaluate(() => window.desktop.installUpdate()),
    /主密码/,
  );
  await page.evaluate((value) => window.desktop.initializeVault(value), password);
  const id = await page.evaluate(async () => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
      ),
      (x) => x.charCodeAt(0),
    );
    const image = await window.desktop.importImage(bytes, 'acceptance.png');
    const { createdId } = await window.desktop.mutate({ type: 'document.create' });
    const doc = await window.desktop.document(createdId);
    await window.desktop.mutate({
      ...doc,
      type: 'document.edit',
      title: 'Update acceptance retained document',
      markdown: `Preserved attachment\n\n![image](${image.src})`,
    });
    return createdId;
  });
  console.log(JSON.stringify({ stage: 'install-request', root, id }));
  const installRequest = page.evaluate(() => window.desktop.installUpdate()).catch(() => {});
  const txRoot = path.join(userData, 'updates/transactions');
  await waitFor(async () => (await fs.readdir(txRoot).catch(() => [])).length > 0);
  const [txId] = await fs.readdir(txRoot);
  const transactionDir = path.join(txRoot, txId);
  launchedTransaction = transactionDir;
  await waitFor(async () => {
    const value = await fs
      .readFile(path.join(transactionDir, 'helper-status'), 'utf8')
      .catch(() => '');
    return /awaiting-health|completed|needs-attention:/.test(value);
  }, 150_000);
  await installRequest;
  const transaction = JSON.parse(
    await fs.readFile(path.join(transactionDir, 'transaction.json'), 'utf8'),
  );
  let helperPhase = (await fs.readFile(path.join(transactionDir, 'helper-status'), 'utf8')).trim();
  let health = null;
  await waitFor(async () => {
    helperPhase = (await fs.readFile(path.join(transactionDir, 'helper-status'), 'utf8')).trim();
    health = JSON.parse(
      await fs.readFile(path.join(transactionDir, 'health.json'), 'utf8').catch(() => 'null'),
    );
    return !!health || helperPhase.startsWith('needs-attention:');
  }, 75_000).catch(() => {});
  assert.ok((await fs.stat(transaction.backup)).isFile());
  assert.ok((await fs.stat(installed + '.previous')).isDirectory());
  // LaunchServices can normalize attribution while preserving quarantine.
  const quarantine = run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', installed]).trim();
  assert.match(quarantine, /^[0-9a-f]{4};/i);
  const observed =
    health?.outcome === 'success'
      ? 'success'
      : health?.outcome === 'manual' || helperPhase.startsWith('needs-attention:')
        ? 'manual'
        : 'unconfirmed';
  if (observed === 'manual')
    assert.ok(
      (await fs.readFile(path.join(transactionDir, 'RECOVERY.txt'), 'utf8')).length > 0,
      'Manual outcome retains readable recovery instructions outside the app',
    );

  // Stop only the disposable newly launched copy before testing recovery separately.
  for (const line of run('/bin/ps', ['-axo', 'pid=,command=']).split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (
      match &&
      (match[2].startsWith(executable) ||
        match[2].startsWith('/private' + executable) ||
        (match[2].includes('.app/Contents/MacOS/') &&
          match[2].endsWith(`--clever-update-transaction ${transactionDir}`)))
    ) {
      try {
        process.kill(Number(match[1]), 'SIGTERM');
      } catch {}
    }
  }
  const restoredData = path.join(root, 'restored-data');
  const restoreApp = await _electron.launch({
    executablePath: path.join(installed + '.previous', 'Contents/MacOS', binary),
    args: [],
    env: { ...env, CLEVER_WORKBENCH_DATA_DIR: restoredData },
  });
  try {
    await restoreApp.evaluate(({ dialog }, backup) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [backup] });
    }, transaction.backup);
    const restoredPage = await restoreApp.firstWindow();
    const restored = await restoredPage.evaluate(
      async ({ password, id }) => {
        const selection = await window.desktop.chooseBackup();
        const info = await window.desktop.inspectBackup(selection.token, password);
        await window.desktop.restoreBackup(info.token);
        const document = await window.desktop.document(id);
        const imageUrl = document.markdown.match(/!\[image\]\(([^)]+)\)/)[1];
        const width = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image.naturalWidth);
          image.onerror = () => reject(Error('Restored attachment did not render'));
          image.src = imageUrl;
        });
        return {
          title: document.title,
          imageWidth: width,
        };
      },
      { password, id },
    );
    assert.equal(restored.title, 'Update acceptance retained document');
    assert.equal(restored.imageWidth, 1);
    const report = {
      root,
      transport: 'local fixture of exact fixed GitHub URLs',
      helperPhase,
      health,
      observed,
      transaction,
      backupRestore: restored,
      quarantine,
      quarantinePreserved: true,
      publicGitHubReleaseVerified: false,
    };
    await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert.notEqual(
      observed,
      'unconfirmed',
      'A relocated/blocked launch must have an explicit manual outcome, not silently remain pending',
    );
  } finally {
    await restoreApp.close();
  }
} finally {
  await application.close().catch(() => {});
  // A LaunchServices child may have been translocated. Match this run's private
  // transaction exactly so even a failed assertion cannot leave its app running.
  for (const line of run('/bin/ps', ['-axo', 'pid=,command=']).split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (
      match &&
      launchedTransaction &&
      match[2].includes('.app/Contents/MacOS/') &&
      match[2].endsWith(`--clever-update-transaction ${launchedTransaction}`)
    ) {
      try {
        process.kill(Number(match[1]), 'SIGTERM');
      } catch {}
    }
  }
}

const { app } = require('electron');
const { UpdateCoordinator, fetchUpdate, localGitHubCredential } = require('./api.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

app.setPath('userData', path.join(__dirname, 'profile'));
app.whenReady().then(async () => {
  const target = process.argv[2];
  const directory = path.join(__dirname, 'profile');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const updates = new UpdateCoordinator({
    currentVersion: '0.0.0',
    packaged: true,
    platform: 'darwin',
    arch: 'arm64',
    stagingDirectory: path.join(directory, 'updates', 'staging'),
    fetch: fetchUpdate,
    githubCredential: () => localGitHubCredential(directory),
  });
  const checked = await updates.check(true);
  assert.equal(checked.status, 'available', checked.message || checked.status);
  assert.equal(checked.release.version, target, '目标必须是预期的正式 Release');
  const downloaded = await updates.download();
  assert.equal(downloaded.status, 'ready', downloaded.message || downloaded.status);
  assert.equal(updates.preparedUpdate().version, target);
  console.log(`PASS real private GitHub Release v${target}: Electron download, complete hash and native bundle validation`);
  app.quit();
}).catch((error) => {
  console.error(error instanceof Error ? error.message : '真实更新传输验证失败。');
  app.exit(1);
});

import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// All accounts, passwords, addresses and images here are fictional test fixtures.
const password = 'fictional-migration-master-password';
const [executable, outputName, inputName] = process.argv.slice(2);
if (!executable || !outputName)
  throw new Error(
    'Usage: node scripts/verify-migration.mjs <executable> <output-prefix> [input-prefix]',
  );
const output = path.resolve(outputName),
  input = inputName ? path.resolve(inputName) : null;
await fs.mkdir(path.dirname(output), { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-migration-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let application;
async function launch() {
  application = await electron.launch({ executablePath: path.resolve(executable), args: [], env });
  const page = await application.firstWindow();
  await page.waitForFunction(() => Boolean(window.desktop));
  assert(page.url().startsWith('file:'));
  return page;
}
async function capture(page) {
  return page.evaluate(async () => {
    const api = window.desktop,
      snapshot = await api.snapshot();
    const { settings, ...data } = snapshot;
    const taskBodies = await Promise.all(snapshot.tasks.map((task) => api.task(task.id)));
    const documentBodies = await Promise.all(
      snapshot.documents.map((document) => api.document(document.id)),
    );
    return {
      data,
      taskBodies,
      documentBodies,
      preferences: {
        theme: settings.theme,
        reduceMotion: settings.reduceMotion,
        reduceTransparency: settings.reduceTransparency,
        highContrast: settings.highContrast,
      },
    };
  });
}
try {
  let page = await launch();
  if (input) {
    const expected = JSON.parse(await fs.readFile(`${input}.json`, 'utf8'));
    await page.evaluate(async () => {
      await window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '恢复前应被保留的目标机记录',
          markdown: '',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          projectId: null,
        },
      });
    });
    await application.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, `${input}.cwb`);
    const token = await page.evaluate(async (password) => {
      const selection = await window.desktop.chooseBackup();
      assertSelection(selection);
      function assertSelection(value) {
        if (!value) throw new Error('Backup selection was cancelled.');
      }
      try {
        await window.desktop.inspectBackup(selection.token, 'wrong-password');
        throw new Error('Wrong password was accepted.');
      } catch (error) {
        if (String(error).includes('Wrong password was accepted.')) throw error;
      }
      return (await window.desktop.inspectBackup(selection.token, password)).token;
    }, password);
    assert.equal((await page.evaluate(() => window.desktop.snapshot())).tasks.length, 1);
    await page.evaluate((token) => window.desktop.restoreBackup(token), token);
    assert.deepEqual(await capture(page), expected.workspace);
    assert.equal((await page.evaluate(() => window.desktop.vaultStatus())).unlocked, false);
    await page.evaluate((password) => window.desktop.unlockVault(password), password);
    for (const secret of expected.secrets)
      assert.equal(
        await page.evaluate(
          ({ accountId, kind }) => window.desktop.readSecret(accountId, kind),
          secret,
        ),
        secret.value,
      );
    const generation = (await fs.readFile(path.join(profile, 'data', 'CURRENT'), 'utf8')).trim();
    for (const asset of expected.assets)
      assert.deepEqual(
        await fs.readFile(path.join(profile, 'data', 'vaults', generation, 'assets', asset.name)),
        Buffer.from(asset.base64, 'base64'),
      );
    // Continue editing after import so the return trip is more than a static copy.
    await page.evaluate(async (platform) => {
      const api = window.desktop,
        document = (await api.snapshot()).documents.find((item) => item.deletedAt === null);
      const record = await api.document(document.id);
      await api.mutate({
        ...record,
        type: 'document.edit',
        markdown: `${record.markdown}\n\n在 ${platform} 恢复后继续编辑。`,
      });
    }, process.platform);
  } else {
    await page.evaluate(async (password) => {
      const api = window.desktop,
        content = { type: 'doc', content: [{ type: 'paragraph' }] },
        now = Math.floor(Date.now() / 60000) * 60000;
      const projectId = (
        await api.mutate({ type: 'project.create', name: '园区一期', color: '#007aff' })
      ).createdId;
      const nextProject = (
        await api.mutate({ type: 'project.create', name: '园区二期', color: '#34a271' })
      ).createdId;
      const systemId = (await api.mutate({ type: 'system.save', name: '园区平台', projectId }))
        .createdId;
      const environmentId = (await api.mutate({ type: 'environment.save', systemId, name: '生产' }))
        .createdId;
      const testing = (await api.mutate({ type: 'environment.save', systemId, name: '测试' }))
        .createdId;
      const serviceId = (
        await api.mutate({
          type: 'service.save',
          systemId,
          name: '订单服务',
          repository: 'https://example.com/orders.git',
        })
      ).createdId;
      await api.mutate({
        type: 'deployment.save',
        serviceId,
        environmentId,
        address: 'https://prod.example.com',
        port: '8080',
      });
      await api.mutate({
        type: 'deployment.save',
        serviceId,
        environmentId: testing,
        address: 'https://test.example.com',
        port: '8081',
      });
      const resourceId = (
        await api.mutate({
          type: 'resource.save',
          environmentId,
          name: '生产 Redis',
          kind: 'redis',
          address: 'redis.example.com',
          port: '6379',
        })
      ).createdId;
      const server = (
        await api.mutate({
          type: 'resource.save',
          environmentId,
          name: '应用服务器',
          kind: 'server',
          address: '192.0.2.10',
          port: '22',
          fields: { 用途: '订单部署' },
        })
      ).createdId;
      const admin = (
        await api.mutate({ type: 'account.save', environmentId, name: '超管', username: 'admin' })
      ).createdId;
      const reader = (
        await api.mutate({
          type: 'account.save',
          environmentId,
          name: 'B 角色',
          username: 'reader',
        })
      ).createdId;
      const redis = (
        await api.mutate({
          type: 'account.save',
          environmentId,
          resourceId,
          name: '缓存连接',
          username: 'cache',
        })
      ).createdId;
      const ssh = (
        await api.mutate({
          type: 'account.save',
          environmentId,
          resourceId: server,
          name: 'SSH',
          username: 'deploy',
        })
      ).createdId;
      await api.initializeVault(password);
      for (const [accountId, kind, value] of [
        [admin, 'password', 'fictional-admin-password'],
        [reader, 'password', 'fictional-reader-password'],
        [redis, 'token', 'fictional-cache-token'],
        [ssh, 'privateKey', 'fictional-ssh-material'],
      ])
        await api.saveSecret(accountId, kind, value);
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
        ),
        (character) => character.charCodeAt(0),
      );
      const image = await api.importImage(bytes, '迁移截图.png');
      const context = { projectId, systemId, environmentId, resourceId };
      const task = (
        await api.mutate({
          type: 'task.create',
          draft: {
            title: '完成缓存排查',
            content,
            markdown: `处理记录\n\n![截图](${image.src})`,
            ...context,
            startedAt: now - 86400000,
          },
        })
      ).createdId;
      await api.mutate({ type: 'task.complete', id: task, complete: true });
      const trash = (
        await api.mutate({
          type: 'task.create',
          draft: { title: '回收站工作', content, markdown: '待恢复的内容', ...context },
        })
      ).createdId;
      await api.mutate({ type: 'task.delete', id: trash });
      const document = (await api.mutate({ type: 'document.create', context: { resourceId } }))
        .createdId;
      await api.mutate({
        ...(await api.document(document)),
        type: 'document.edit',
        title: '缓存排障方案',
        markdown: `## 排查\n\n| 项目 | 结果 |\n| --- | --- |\n| 连接 | 正常 |\n\n![截图](${image.src})`,
      });
      const deleted = (await api.mutate({ type: 'document.create', context: { resourceId } }))
        .createdId;
      await api.mutate({
        ...(await api.document(deleted)),
        type: 'document.edit',
        markdown: `回收站截图\n\n![截图](${image.src})`,
      });
      await api.mutate({ type: 'document.delete', id: deleted });
      await api.mutate({
        type: 'system.save',
        id: systemId,
        name: '园区平台',
        projectId: nextProject,
      });
      await api.mutate({ type: 'project.archive', id: projectId, archived: true });
      await api.mutate({
        type: 'task.create',
        draft: { title: '继续二期工作', content, markdown: '', projectId: nextProject, systemId },
      });
      await api.saveDraft({
        title: '未提交的工作',
        content,
        markdown: `草稿图片\n\n![截图](${image.src})`,
        projectId: nextProject,
        systemId,
        environmentId,
        resourceId,
      });
      await api.mutate({ type: 'favorite.set', kind: 'system', id: systemId, pinned: true });
      await api.mutate({ type: 'favorite.set', kind: 'account', id: redis, pinned: true });
      await api.mutate({ type: 'settings', theme: 'dark', reduceMotion: true, autoBackup: false });
    }, password);
  }
  // Force a restart before exporting: no original process key or editor cache is available.
  await application.close();
  page = await launch();
  assert.equal((await page.evaluate(() => window.desktop.vaultStatus())).unlocked, false);
  await page.evaluate((password) => window.desktop.unlockVault(password), password);
  const workspace = await capture(page),
    secrets = [];
  for (const account of workspace.data.accounts)
    for (const kind of account.secretKinds)
      secrets.push({
        accountId: account.id,
        kind,
        value: await page.evaluate(({ id, kind }) => window.desktop.readSecret(id, kind), {
          id: account.id,
          kind,
        }),
      });
  await page.evaluate(() => window.desktop.lockVault());
  await application.evaluate(({ dialog }, filename) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
  }, `${output}.cwb`);
  assert.equal(await page.evaluate(() => window.desktop.backup()), `${output}.cwb`);
  assert.equal((await page.evaluate(() => window.desktop.vaultStatus())).unlocked, false);
  const generation = (await fs.readFile(path.join(profile, 'data', 'CURRENT'), 'utf8')).trim(),
    assetDirectory = path.join(profile, 'data', 'vaults', generation, 'assets'),
    assets = [];
  for (const name of await fs.readdir(assetDirectory))
    assets.push({
      name,
      base64: (await fs.readFile(path.join(assetDirectory, name))).toString('base64'),
    });
  const runtime = await application.evaluate(({ app }) => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    node: process.versions.node,
    arch: process.arch,
    platform: process.platform,
  }));
  assert(runtime.packaged);
  const evidence = {
    runtime,
    os: { type: os.type(), release: os.release(), version: os.version() },
    createdAt: new Date().toISOString(),
    source: input ? path.basename(input) : null,
    workspace,
    secrets,
    assets,
  };
  await fs.writeFile(`${output}.json`, JSON.stringify(evidence, null, 2));
  const encrypted = await fs.readFile(`${output}.cwb`);
  assert.equal(encrypted.subarray(0, 8).toString(), 'CWBK0001');
  for (const secret of secrets) assert.equal(encrypted.includes(Buffer.from(secret.value)), false);
  console.log(
    JSON.stringify(
      {
        output,
        runtime,
        imported: input,
        assets: assets.length,
        secrets: secrets.length,
        tasks: workspace.data.tasks.length,
        documents: workspace.data.documents.length,
      },
      null,
      2,
    ),
  );
} finally {
  if (application) await application.close();
  await fs.rm(profile, { recursive: true, force: true });
}

import { collectLedgerCopy, prepareLedgerCopy } from './ledger-copy';
import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  dialog,
  shell,
  Menu,
  nativeTheme,
  nativeImage,
  clipboard,
  powerMonitor,
  safeStorage,
} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Store, assetName, text } from './store';
import { checkEncryptedArchive } from './encrypted-archive';
import { SecretClipboard } from './secret-clipboard';
import { Vault } from './vault';
import { Backups } from './backup';
import { backupProtection } from './backup-crypto';
import { SystemExports } from './system-export';
import { Tools } from './tools';
import { UpdateCoordinator } from './update';
import { localGitHubCredential } from './update-credential';
import { fetchUpdate } from './update-fetch';
import { UpdateInstallation } from './update-install';
import { launchUpdateHelper, resolveUpdateTarget } from './update-launcher';
import { UpdateJournal, UpdateHealth } from './update-recovery';
import { exportScheme, renderExportDocument } from './export-native';
import { GuidanceDevice, readBundledGuidance } from './guidance';

protocol.registerSchemesAsPrivileged([
  { scheme: exportScheme, privileges: { standard: true, secure: true } },
  {
    scheme: 'workbench-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
if (process.env.CLEVER_WORKBENCH_DATA_DIR)
  app.setPath('userData', path.resolve(process.env.CLEVER_WORKBENCH_DATA_DIR));
let window: BrowserWindow | null = null,
  store: Store,
  backups: Backups,
  systemExports: SystemExports,
  tools: Tools,
  vault: Vault,
  secretClipboard: SecretClipboard,
  restoring = false,
  rotatingProtection = false,
  allowClose = false,
  closePending = false,
  quitting = false;
let updates: UpdateCoordinator;
let updateJournal: UpdateJournal | undefined, updateHealth: UpdateHealth | undefined;
let updaterAvailable = true;
function disableUpdates() {
  updaterAvailable = false;
  updates.stop();
  updates.setRecoverySummary('manual', '更新记录无法写入，在线更新已暂停；本地工作空间仍可使用。');
}
let installation: UpdateInstallation;
let guidanceDevice: GuidanceDevice | undefined;
let updateFrozen = false;
const activeOperations = new Set<Promise<unknown>>();
const updateReadChannels = new Set([
  'guidance-availability',
  'guidance-versions',
  'update-history',
  'update-health-ready',
  'update-health-confirm',
  'update-recovery-open',
  'update-snapshot',
  'data-generation',
  'system-appearance',
  'vault-status',
  'snapshot',
  'document',
  'search-documents',
  'task',
  'global-search',
  'search',
]);
const backupSelections = new Map<string, { filename: string; expires: number }>();
const pendingFlush = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
function flushRenderer() {
  return new Promise<void>((resolve, reject) => {
    if (!window || window.isDestroyed()) return resolve();
    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingFlush.delete(id);
      reject(new Error('无法确认编辑内容已保存，请返回检查。'));
    }, 15000);
    pendingFlush.set(id, {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    window.webContents.send('flush', id);
  });
}
function secureHandler(channel: string, handler: (...args: any[]) => any) {
  ipcMain.handle(channel, async (event, generation, ...args) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('来源无效。');
    try {
      if (channel !== 'data-generation' && generation !== store.generation)
        throw new Error('资料已切换，请重新操作。');
      if (updateFrozen && !updateReadChannels.has(channel))
        throw new Error('正在准备安装更新，请等待完成。');
      const operation = Promise.resolve().then(() => handler(...args));
      const tracked = !updateReadChannels.has(channel) && channel !== 'update-install';
      if (tracked) activeOperations.add(operation);
      let result;
      try {
        result = await operation;
      } finally {
        if (tracked && activeOperations.delete(operation) && activeOperations.size === 0)
          if (window && !window.isDestroyed())
            window.webContents.send('guidance-availability-changed');
      }
      if (
        !['data-generation', 'restore-backup'].includes(channel) &&
        generation !== store.generation
      )
        throw new Error('资料已切换，旧操作结果已取消。');
      return result;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '操作失败。');
    }
  });
}
function writable(generation = store.generation) {
  if (updateFrozen) throw new Error('正在准备安装更新，请等待完成。');
  if (restoring) throw new Error('正在恢复数据，请稍候。');
  if (rotatingProtection) throw new Error('正在变更凭据保护，请稍候。');
  if (generation !== store.generation) throw new Error('资料已切换，旧操作已取消。');
}
async function changeProtection(operation: () => Promise<void>) {
  const generation = store.generation,
    assertCurrent = vault.protectionGuard();
  await flushRenderer();
  writable(generation);
  assertCurrent();
  if (backups.busy) throw new Error('请等待备份或恢复完成后再变更凭据保护。');
  rotatingProtection = true;
  try {
    await operation();
  } finally {
    rotatingProtection = false;
  }
}
function importLocalImage(bytes: Uint8Array, name: string) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new Error('单张图片应在 20 MB 以内。');
  if (nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty())
    throw new Error('图片内容损坏或格式不支持。');
  return store.importImage(bytes, name);
}
function applyTheme() {
  const theme = store.settings().theme;
  if (nativeTheme.themeSource !== theme) nativeTheme.themeSource = theme;
  applyWindowMaterial();
}
function systemAppearance() {
  return {
    reduceTransparency: nativeTheme.prefersReducedTransparency,
    highContrast: nativeTheme.shouldUseHighContrastColors,
  };
}
function applyWindowMaterial() {
  if (!window || window.isDestroyed() || process.platform !== 'darwin') return;
  const preferences = store.settings(),
    system = systemAppearance();
  const opaque =
    preferences.reduceTransparency ||
    preferences.highContrast ||
    system.reduceTransparency ||
    system.highContrast;
  window.setVibrancy(opaque ? null : 'sidebar');
  window.setBackgroundColor(
    opaque ? (nativeTheme.shouldUseDarkColors ? '#202124' : '#f6f6f8') : '#00000000',
  );
}
let checkingAutomatic = false;
async function checkAutomaticBackup(flush: boolean) {
  if (
    checkingAutomatic ||
    closePending ||
    restoring ||
    rotatingProtection ||
    backups.busy ||
    installation?.busy ||
    updateFrozen
  )
    return;
  checkingAutomatic = true;
  const generation = store.generation;
  try {
    if (flush) await flushRenderer();
    if (
      closePending ||
      restoring ||
      rotatingProtection ||
      updateFrozen ||
      installation?.busy ||
      generation !== store.generation
    )
      return;
    await backups.automatic();
  } catch (cause) {
    if (!restoring && generation === store.generation)
      store.set('lastBackupError', cause instanceof Error ? cause.message : String(cause));
  } finally {
    checkingAutomatic = false;
    window?.webContents.send('settings-changed', store.settings());
  }
}
function createWindow() {
  const mac = process.platform === 'darwin';
  window = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: mac ? '#00000000' : '#f5f5f7',
    title: 'Clever Workbench',
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    ...(mac
      ? {
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          trafficLightPosition: { x: 20, y: 21 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  applyWindowMaterial();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('did-finish-load', () => {
    updateHealth?.windowReady();
    void updateHealth?.poll().catch(() => {});
  });
  window.webContents.on('did-fail-load', () => {
    void updateHealth?.fail('新版窗口加载失败，请查看日志与恢复材料。').catch(() => {});
  });
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL)
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (installation?.busy || updateFrozen) return;
    if (closePending) return;
    closePending = true;
    void (async () => {
      try {
        if (tools.busy) throw new Error('工具任务尚未完成，请等待完成后再退出。');
        if (restoring || rotatingProtection)
          throw new Error('资料保护操作正在进行，请完成后再关闭窗口。');
        await backups.whenIdle();
        await flushRenderer();
        if (restoring || rotatingProtection)
          throw new Error('资料保护操作正在进行，请完成后再关闭窗口。');
        await backups.whenIdle();
        vault?.lock();
        await systemExports.whenIdle();
        if (tools.busy) throw new Error('工具任务尚未完成，请等待完成后再退出。');
        await tools.dispose();
        await guidanceDevice?.whenIdle();
        allowClose = true;
        if (quitting) app.quit();
        else window?.close();
      } catch (e) {
        quitting = false;
        await dialog.showMessageBox(window!, {
          type: 'warning',
          message: e instanceof Error ? e.message : String(e),
          buttons: ['返回应用'],
        });
      } finally {
        closePending = false;
      }
    })();
  });
  window.on('closed', () => {
    backupSelections.clear();
    for (const token of backups.prepared.keys()) void backups.discard(token).catch(() => {});
    window = null;
    allowClose = false;
  });
}
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
app.on('second-instance', () => {
  window?.show();
  window?.focus();
});
app
  .whenReady()
  .then(async () => {
    updates = new UpdateCoordinator({
      currentVersion: app.getVersion(),
      stagingDirectory: path.join(app.getPath('userData'), 'updates', 'staging'),
      packaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      preflight: async () => {
        await resolveUpdateTarget(app.getPath('exe'));
      },
      fetch: fetchUpdate,
      githubCredential: () => localGitHubCredential(app.getPath('userData')),
    });
    try {
      updateJournal = await UpdateJournal.open(path.join(app.getPath('userData'), 'updates'));
      updateHealth = new UpdateHealth(updateJournal, {
        version: app.getVersion(),
        target: path.resolve(app.getPath('exe'), '../../..'),
        userDataDirectory: app.getPath('userData'),
        status: (status, message) => {
          if (status === 'validating') {
            updates.setInstallationState({ status, message });
            updates.setRecoverySummary(status, message);
          } else updates.finishHealthCheck(status, message, updaterAvailable);
        },
      });
      if (app.isPackaged) await updateHealth.discover();
      const previous = updateJournal.list()[0];
      if (previous && ['success', 'manual', 'failed'].includes(previous.outcome))
        updates.setRecoverySummary(previous.outcome, previous.message ?? '请查看上次更新记录。');
    } catch {
      updaterAvailable = false;
      updates.stop();
      updates.setInstallationState({
        status: 'manual',
        message: '更新记录无法读取，在线更新暂不可用；本地工作空间仍可使用。',
      });
    }
    store = new Store(path.join(app.getPath('userData'), 'data'));
    store.snapshot();
    updateHealth?.databaseReady();
    backups = new Backups(store, () => vault);
    tools = new Tools(store, __dirname);
    secureHandler('tool-state', (id) => tools.get(id).snapshot());
    secureHandler('tool-command', (id, command) => {
      writable();
      if (closePending && command?.type !== 'settings')
        throw new Error('窗口正在关闭，请稍后重试。');
      return tools.get(id).command(command);
    });
    secureHandler('tool-path', async (kind) => {
      if (!['file', 'directory', 'output'].includes(kind)) throw new Error('路径选择类型无效。');
      const selected = await dialog.showOpenDialog(window!, {
        title: kind === 'output' ? '选择输出位置' : '选择工具输入',
        properties: kind === 'file' ? ['openFile'] : ['openDirectory', 'createDirectory'],
      });
      return selected.canceled ? null : (selected.filePaths[0] ?? null);
    });
    secureHandler('tool-open-output', async (id) => {
      const output = tools.get(id).snapshot().output;
      if (!output) throw new Error('尚无已完成的输出。');
      const error = await shell.openPath(output);
      if (error) throw new Error(error);
    });
    updates.subscribe((state) => {
      window?.webContents.send('update-state', state);
      if (updateJournal && updaterAvailable)
        void updateJournal
          .observe(state)
          .then((changed) => {
            if (changed) window?.webContents.send('update-history-changed');
          })
          .catch(() => {
            disableUpdates();
          });
    });
    secureHandler('update-snapshot', () => updates.snapshot());
    secureHandler('update-check', () => {
      if (!updaterAvailable) return updates.snapshot();
      return updates.check(true);
    });
    secureHandler('update-download', () => {
      if (!updaterAvailable) throw Error('更新记录不可写，请检查更新目录。');
      return updates.download();
    });
    secureHandler('update-download-cancel', () => updates.cancelDownload());
    secureHandler('update-history', async () => {
      await updateJournal?.refreshCleanup();
      return updateJournal?.list() ?? [];
    });
    secureHandler('update-health-ready', () => updateHealth?.challenge ?? null);
    secureHandler('update-health-confirm', async (nonce) => {
      if (typeof nonce === 'string') await updateHealth?.confirm(nonce);
    });
    secureHandler('update-recovery-open', async (id, kind) => {
      if (typeof id !== 'string' || !['backup', 'logs', 'previous'].includes(kind))
        throw Error('恢复资料类型无效。');
      const filename = updateJournal?.recoveryPath(id, kind);
      if (!filename) throw Error('没有对应恢复资料。');
      await fs.access(filename);
      shell.showItemInFolder(filename);
    });
    installation = new UpdateInstallation({
      prepared: () => updates.preparedUpdate(),
      preflight: () => updates.preflight(),
      status: (state) =>
        updates.setInstallationState(
          state as Parameters<UpdateCoordinator['setInstallationState']>[0],
        ),
      eligible: () => {
        if (!updaterAvailable) throw Error('更新记录不可写，请检查更新目录。');
        if (!app.isPackaged || process.platform !== 'darwin' || process.arch !== 'arm64')
          throw Error('当前运行方式不支持自动安装更新。');
        if (restoring || rotatingProtection || closePending)
          throw Error('请等待资料保护或关闭操作完成后再更新。');
        if (tools.busy) throw Error('工具任务尚未完成，请等待完成后再更新。');
        if (!backupProtection(store.db))
          throw Error('请先设置独立备份密码，以便更新前创建完整加密备份。');
      },
      flush: flushRenderer,
      freeze: (value) => {
        updateFrozen = value;
      },
      idle: async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.all([
              Promise.all([...activeOperations]),
              backups.whenIdle(),
              systemExports.whenIdle(),
            ]),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(Error('仍有资料操作未完成，请完成后重试。')), 30000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      },
      backup: async () => {
        const filename = path.join(
          store.settings().backupDir,
          `Clever-Workbench-update-${randomUUID()}.cwb`,
        );
        await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        await backups.create(filename);
        return filename;
      },
      launch: async (prepared, backup) => {
        await updateJournal?.flush();
        await launchUpdateHelper({
          beforeLaunch: async (directory, transaction) => {
            await updateJournal?.attach(directory, transaction);
          },
          historyId: updateJournal?.activeId,
          prepared,
          backup,
          executable: app.getPath('exe'),
          currentVersion: app.getVersion(),
          userDataDirectory: app.getPath('userData'),
          transactionsDirectory: path.join(app.getPath('userData'), 'updates', 'transactions'),
          helperSource: path.join(__dirname, 'macos-update-helper.sh'),
        });
      },
      quit: () => {
        vault.lock();
        allowClose = true;
        app.quit();
      },
    });
    secureHandler('update-install', async () => {
      await installation.install();
      return updates.snapshot();
    });
    if (updaterAvailable && !updateHealth?.pending) updates.start();
    setInterval(() => {
      void updateHealth
        ?.poll()
        .then((changed) => {
          if (changed) window?.webContents.send('update-history-changed');
        })
        .catch(() => {
          disableUpdates();
        });
    }, 1000).unref();
    secureHandler('guidance-availability', () => {
      // Native file dialogs live inside active IPC operations; they have no renderer DOM modal.
      const busy =
        updateFrozen ||
        restoring ||
        rotatingProtection ||
        closePending ||
        quitting ||
        backups.busy ||
        installation?.busy ||
        activeOperations.size > 0;
      return busy
        ? { available: false, reason: '请等待当前保存、文件选择、备份或安装操作完成。' }
        : { available: true };
    });
    guidanceDevice = await GuidanceDevice.open(path.join(app.getPath('userData'), 'guidance'));
    const guidanceCatalog = await readBundledGuidance(path.join(__dirname, 'guidance'));
    secureHandler('guidance-versions', () => ({
      currentVersion: app.getVersion(),
      releases: guidanceCatalog.releases,
    }));
    secureHandler('guidance-state', () => {
      writable();
      return guidanceDevice!.observe(app.getVersion());
    });
    secureHandler('guidance-acknowledge', (version) => {
      writable();
      if (version !== app.getVersion()) throw Error('只能确认当前正在运行版本的指引。');
      if (closePending || quitting) throw Error('应用正在关闭，尚未确认的指引将在下次启动时保留。');
      return guidanceDevice!.acknowledge(version);
    });
    secureHandler('data-generation', () => store.generation);
    secureHandler('system-appearance', systemAppearance);
    nativeTheme.on('updated', () => {
      applyWindowMaterial();
      window?.webContents.send('system-appearance', systemAppearance());
    });
    vault = new Vault(
      store,
      (status) => {
        if (!status.unlocked) void secretClipboard?.clearOwned();
        window?.webContents.send('vault-status', status);
      },
      {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(value),
      },
    );
    secretClipboard = new SecretClipboard(vault, clipboard);
    systemExports = new SystemExports(store, vault, renderExportDocument);
    powerMonitor.on('lock-screen', () => vault.lock());
    powerMonitor.on('suspend', () => vault.lock());
    setInterval(() => vault.checkIdle(), 10_000).unref();
    applyTheme();
    protocol.handle('workbench-asset', (request) => {
      const url = new URL(request.url),
        filename = url.pathname.slice(1);
      if (url.hostname !== 'image' || !assetName.test(filename))
        return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(path.join(store.directory, 'assets', filename)).href);
    });
    secureHandler('vault-activity', () => vault.touch());
    secureHandler('secret-copy', (id, kind) => {
      writable();
      return secretClipboard.copy(id, kind);
    });
    secureHandler('ledger-copy-preview', (selection) => {
      writable();
      const { text: _text, ...preview } = collectLedgerCopy(store.snapshot(), selection);
      return preview;
    });
    secureHandler('ledger-copy', (request) => {
      const generation = store.generation;
      writable(generation);
      return secretClipboard.copyPrepared(() => {
        writable(generation);
        return prepareLedgerCopy(store.snapshot(), request, (id) => vault.read(id, 'password'));
      });
    });
    secureHandler('account-copy-text', (id) => {
      writable();
      return secretClipboard.copyAccount(id);
    });
    secureHandler('account-copy-secrets', (id, target, kinds) => {
      writable();
      return vault.copyAccount(id, target, kinds);
    });
    secureHandler('resource-copy-secrets', (id, target) => {
      writable();
      return vault.copyResource(id, target);
    });
    secureHandler('vault-status', () => vault.status());
    secureHandler('vault-initialize', (password) =>
      changeProtection(async () => {
        await vault.initialize(password);
        await secretClipboard.clearOwned();
      }),
    );
    secureHandler('vault-unlock', async (password) => {
      writable();
      await vault.unlock(password);
    });
    secureHandler('vault-system-unlock', () => {
      writable();
      vault.unlockSystem();
    });
    secureHandler('backup-configure', (password) =>
      changeProtection(() => vault.configureBackup(password)),
    );
    secureHandler('vault-lock', () => vault.lock());
    secureHandler('vault-disable', (password) =>
      changeProtection(() => vault.disableMaster(password)),
    );
    secureHandler('vault-rotate', (currentPassword, nextPassword) =>
      changeProtection(() => vault.rotate(currentPassword, nextPassword)),
    );
    secureHandler('secret-read', (accountId, kind) => {
      writable();
      return vault.read(accountId, kind);
    });
    secureHandler('secret-save', (accountId, kind, value) => {
      writable();
      vault.save(accountId, kind, value);
      return store.snapshot();
    });
    secureHandler('secret-remove', (accountId, kind) => {
      writable();
      vault.remove(accountId, kind);
      return store.snapshot();
    });
    secureHandler('snapshot', () => store.snapshot());
    secureHandler('system-export', async (options) => {
      const generation = store.generation;
      writable(generation);
      systemExports.validate(options);
      await flushRenderer();
      writable(generation);
      if (closePending) throw new Error('窗口正在关闭，导出已取消。');
      const system = store.ledger.system(options.systemId);
      const name = Array.from(system.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'))
        .slice(0, 40)
        .join('');
      const extension = systemExports.fileExtension(options);
      const selection = await dialog.showSaveDialog(window!, {
        title: '导出系统资料',
        defaultPath: `${name}-系统资料.${extension}`,
        filters: [{ name: '系统资料', extensions: [extension] }],
      });
      if (selection.canceled || !selection.filePath) return null;
      writable(generation);
      if (closePending) throw new Error('窗口正在关闭，导出已取消。');
      return systemExports.write(options, selection.filePath);
    });
    secureHandler('ledger-capture', (input) => {
      writable();
      return vault.capture(input);
    });
    secureHandler('ledger-batch', (input) => {
      writable();
      return vault.captureBatch(input);
    });
    secureHandler('access-copy-secrets', (id, target) => {
      writable();
      return vault.copyAccess(id, target);
    });
    secureHandler('document', (id) => store.document(id));
    secureHandler('search-documents', (query) => store.searchDocuments(query));
    secureHandler('task', (id) => store.task(id));
    secureHandler('global-search', (query) => store.globalSearch(query));
    secureHandler('search', (query) => store.search(query));
    secureHandler('mutate', (command) => {
      writable();
      const result = store.mutate(command);
      applyTheme();
      if (command.type === 'settings')
        window?.webContents.send('settings-changed', result.snapshot.settings);
      return result;
    });
    secureHandler('draft', (draft) => {
      writable();
      store.saveDraft(draft);
    });
    secureHandler('import-image', (bytes, name) => {
      writable();
      return importLocalImage(bytes, name);
    });
    secureHandler('choose-images', async () => {
      writable();
      const generation = store.generation;
      const selection = await dialog.showOpenDialog(window!, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
      const assets = [],
        errors = [];
      for (const file of selection.filePaths) {
        try {
          const stat = await fs.stat(file);
          if (stat.size > 20 * 1024 * 1024) throw new Error('超过 20 MB');
          const bytes = await fs.readFile(file);
          writable(generation);
          assets.push(importLocalImage(bytes, path.basename(file)));
        } catch (e) {
          errors.push(`${path.basename(file)}：${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { assets, errors };
    });
    secureHandler('backup', async () => {
      const generation = store.generation;
      await flushRenderer();
      const selection = await dialog.showSaveDialog(window!, {
        defaultPath: `Clever-Workbench-${new Date().toISOString().slice(0, 10)}.cwb`,
        filters: [{ name: 'Clever Workbench 备份', extensions: ['cwb'] }],
      });
      if (selection.canceled || !selection.filePath) return null;
      writable(generation);
      await backups.create(selection.filePath);
      return selection.filePath;
    });
    secureHandler('choose-backup', async () => {
      writable();
      if (backups.busy) throw new Error('请等待正在进行的备份操作。');
      const selection = await dialog.showOpenDialog(window!, {
        properties: ['openFile'],
        filters: [{ name: 'Clever Workbench 加密备份', extensions: ['cwb'] }],
      });
      if (selection.canceled || !selection.filePaths[0]) return null;
      await checkEncryptedArchive(selection.filePaths[0]);
      backupSelections.clear();
      const token = randomUUID();
      backupSelections.set(token, {
        filename: selection.filePaths[0],
        expires: Date.now() + 10 * 60_000,
      });
      return { token, name: path.basename(selection.filePaths[0]) };
    });
    secureHandler('inspect-backup', async (token, password) => {
      const selected = backupSelections.get(text(token, 100));
      if (!selected || Date.now() > selected.expires) {
        backupSelections.delete(token);
        throw new Error('文件选择已过期，请重新选择备份。');
      }
      const result = await backups.inspect(selected.filename, password);
      backupSelections.delete(token);
      return result;
    });
    secureHandler('discard-backup', async (token) => {
      backupSelections.delete(text(token, 100));
      await backups.discard(token);
    });
    secureHandler('restore-backup', async (token) => {
      if (tools.busy) throw new Error('请先等待工具任务完成，再恢复工作台备份。');
      text(token);
      await flushRenderer();
      writable();
      if (tools.busy) throw new Error('请先等待工具任务完成，再恢复工作台备份。');
      restoring = true;
      try {
        const result = await backups.restore(token);
        await tools.dispose();
        window?.webContents.send('data-restored', store.generation);
        return result;
      } finally {
        restoring = false;
        applyTheme();
        window?.webContents.send('settings-changed', store.settings());
        window?.webContents.send('vault-status', vault.status());
      }
    });
    secureHandler('retry-backup', async () => {
      const generation = store.generation;
      await flushRenderer();
      writable(generation);
      await backups.automatic(true);
      window?.webContents.send('settings-changed', store.settings());
      return store.snapshot();
    });
    secureHandler('backup-directory', async () => {
      const generation = store.generation;
      writable(generation);
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled) return null;
      const directory = result.filePaths[0];
      await fs.access(directory, 2);
      writable(generation);
      if (backups.busy) throw new Error('备份正在进行，请完成后再更改目录。');
      store.db.exec('BEGIN IMMEDIATE');
      try {
        store.set('backupDir', directory);
        store.set('lastBackupAt', null);
        store.set('lastBackupRevision', -1);
        store.set('lastBackupError', null);
        store.markChanged();
        store.db.exec('COMMIT');
      } catch (cause) {
        store.db.exec('ROLLBACK');
        throw cause;
      }
      window?.webContents.send('settings-changed', store.settings());
      return store.snapshot();
    });
    secureHandler('copy-text', (value) => secretClipboard.copyText(text(value, 200_000)));
    secureHandler('open-external', async (value) => {
      const url = new URL(text(value, 8192));
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('仅支持 HTTP 或 HTTPS 链接。');
      await shell.openExternal(url.href);
    });
    ipcMain.on('flushed', (event, token, error) => {
      if (event.sender !== window?.webContents) return;
      const pending = pendingFlush.get(token);
      if (pending) {
        pendingFlush.delete(token);
        if (error) pending.reject(new Error(String(error)));
        else pending.resolve();
      }
    });
    const send = (command: string) => {
      if (!installation.busy && !updateFrozen) window?.webContents.send('native-command', command);
    };
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin'
          ? [
              {
                label: app.name,
                submenu: [
                  { role: 'about' as const },
                  { type: 'separator' as const },
                  { role: 'hide' as const },
                  { role: 'hideOthers' as const },
                  { type: 'separator' as const },
                  { role: 'quit' as const },
                ],
              },
            ]
          : []),
        {
          label: '文件',
          submenu: [
            { label: '新增任务', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
            { label: '搜索任务', accelerator: 'CmdOrCtrl+K', click: () => send('search') },
            { type: 'separator' },
            { role: 'close' },
          ],
        },
        {
          label: '编辑',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: '视图',
          submenu: [
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { role: 'togglefullscreen' },
            ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
          ],
        },
        { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
      ]),
    );
    createWindow();
    void checkAutomaticBackup(false);
    setInterval(() => {
      void checkAutomaticBackup(true);
    }, 60000).unref();
    app.on('activate', () => {
      if (!window) createWindow();
    });
  })
  .catch(async (error) => {
    await updateHealth
      ?.fail('新版资料库或启动初始化失败，请查看恢复材料；未自动恢复旧数据。')
      .catch(() => {});
    dialog.showErrorBox('Clever Workbench 无法打开', error.message);
    app.quit();
  });
app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  updates?.stop();
  vault?.lock();
  store?.close();
});

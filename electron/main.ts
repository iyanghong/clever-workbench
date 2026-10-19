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
import { SystemExports } from './system-export';
import { Tools } from './tools';
import { exportScheme, renderExportDocument } from './export-native';

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
      const result = await handler(...args);
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
  if (restoring) throw new Error('正在恢复数据，请稍候。');
  if (rotatingProtection) throw new Error('正在变更主密码，请稍候。');
  if (generation !== store.generation) throw new Error('资料已切换，旧操作已取消。');
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
  if (checkingAutomatic || closePending || restoring || rotatingProtection || backups.busy) return;
  checkingAutomatic = true;
  const generation = store.generation;
  try {
    if (flush) await flushRenderer();
    if (closePending || restoring || rotatingProtection || generation !== store.generation) return;
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
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL)
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
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
  .then(() => {
    store = new Store(path.join(app.getPath('userData'), 'data'));
    backups = new Backups(store);
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
    secureHandler('data-generation', () => store.generation);
    secureHandler('system-appearance', systemAppearance);
    nativeTheme.on('updated', () => {
      applyWindowMaterial();
      window?.webContents.send('system-appearance', systemAppearance());
    });
    vault = new Vault(store, (status) => {
      if (!status.unlocked) void secretClipboard?.clearOwned();
      window?.webContents.send('vault-status', status);
    });
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
    secureHandler('account-copy-secrets', (id, target, kinds) => {
      writable();
      return vault.copyAccount(id, target, kinds);
    });
    secureHandler('resource-copy-secrets', (id, target) => {
      writable();
      return vault.copyResource(id, target);
    });
    secureHandler('vault-status', () => vault.status());
    secureHandler('vault-initialize', async (password) => {
      writable();
      await vault.initialize(password);
    });
    secureHandler('vault-unlock', async (password) => {
      writable();
      await vault.unlock(password);
    });
    secureHandler('vault-lock', () => vault.lock());
    secureHandler('vault-rotate', async (currentPassword, nextPassword) => {
      const generation = store.generation;
      await flushRenderer();
      writable(generation);
      if (backups.busy) throw new Error('备份或恢复正在进行，请完成后再变更主密码。');
      rotatingProtection = true;
      try {
        await vault.rotate(currentPassword, nextPassword);
      } finally {
        rotatingProtection = false;
      }
    });
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
      const selection = await dialog.showSaveDialog(window!, {
        title: '导出系统资料',
        defaultPath: `${name}-系统资料.zip`,
        filters: [{ name: '系统资料包', extensions: ['zip'] }],
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
      vault.lock();
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
    const send = (command: string) => window?.webContents.send('native-command', command);
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
  .catch((error) => {
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
  vault?.lock();
  store?.close();
});

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
import { SecretClipboard } from './secret-clipboard';
import { Vault } from './vault';
import { Backups } from './backup';

protocol.registerSchemesAsPrivileged([
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
  vault: Vault,
  secretClipboard: SecretClipboard,
  restoring = false,
  allowClose = false,
  closePending = false,
  quitting = false;
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
  ipcMain.handle(channel, async (event, ...args) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('来源无效。');
    try {
      return await handler(...args);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '操作失败。');
    }
  });
}
function writable() {
  if (restoring) throw new Error('正在恢复数据，请稍候。');
}
function importLocalImage(bytes: Uint8Array, name: string) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new Error('单张图片应在 20 MB 以内。');
  if (nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty())
    throw new Error('图片内容损坏或格式不支持。');
  return store.importImage(bytes, name);
}
function applyTheme() {
  nativeTheme.themeSource = store.settings().theme;
}
function createWindow() {
  const mac = process.platform === 'darwin';
  window = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#f5f5f7',
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
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closePending) return;
    closePending = true;
    void (async () => {
      try {
        if (backups.busy || restoring) throw new Error('备份或恢复正在进行，请完成后再关闭窗口。');
        await flushRenderer();
        vault?.lock();
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
    vault = new Vault(store, (status) => {
      if (!status.unlocked) void secretClipboard?.clearOwned();
      window?.webContents.send('vault-status', status);
    });
    secretClipboard = new SecretClipboard(vault, clipboard);
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
    secureHandler('document', (id) => store.document(id));
    secureHandler('search-documents', (query) => store.searchDocuments(query));
    secureHandler('task', (id) => store.task(id));
    secureHandler('global-search', (query) => store.globalSearch(query));
    secureHandler('search', (query) => store.search(query));
    secureHandler('mutate', (command) => {
      writable();
      const result = store.mutate(command);
      applyTheme();
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
          assets.push(importLocalImage(await fs.readFile(file), path.basename(file)));
        } catch (e) {
          errors.push(`${path.basename(file)}：${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { assets, errors };
    });
    secureHandler('backup', async () => {
      await flushRenderer();
      const selection = await dialog.showSaveDialog(window!, {
        defaultPath: `Clever-Plan-${new Date().toISOString().slice(0, 10)}.cleverplan.zip`,
        filters: [{ name: 'Clever Workbench 备份', extensions: ['zip'] }],
      });
      if (selection.canceled || !selection.filePath) return null;
      await backups.create(selection.filePath);
      return selection.filePath;
    });
    secureHandler('inspect-backup', async () => {
      const selection = await dialog.showOpenDialog(window!, {
        properties: ['openFile'],
        filters: [{ name: 'Clever Workbench 备份', extensions: ['zip'] }],
      });
      if (selection.canceled) return null;
      return backups.inspect(selection.filePaths[0]);
    });
    secureHandler('discard-backup', (token) => backups.discard(text(token)));
    secureHandler('restore-backup', async (token) => {
      vault.lock();
      text(token);
      await flushRenderer();
      writable();
      restoring = true;
      try {
        return await backups.restore(token);
      } finally {
        restoring = false;
        applyTheme();
      }
    });
    secureHandler('retry-backup', async () => {
      await flushRenderer();
      await backups.automatic(true);
      return store.snapshot();
    });
    secureHandler('backup-directory', async () => {
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled) return null;
      const directory = result.filePaths[0];
      await fs.access(directory, 2);
      store.set('backupDir', directory);
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
    setInterval(() => {
      if (!restoring) void backups.automatic();
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

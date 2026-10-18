import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/types';
let generation = ipcRenderer.invoke('data-generation') as Promise<string>;
ipcRenderer.on('data-restored', (_event, next: string) => {
  generation = Promise.resolve(next);
});
const call = async (channel: string, ...args: unknown[]) => {
  const expected = generation;
  return ipcRenderer.invoke(channel, await expected, ...args);
};
const api: DesktopAPI = {
  platform: process.platform,
  onDataRestored(handler) {
    const listener = () => handler();
    ipcRenderer.on('data-restored', listener);
    return () => ipcRenderer.removeListener('data-restored', listener);
  },
  vaultStatus: () => call('vault-status'),
  vaultActivity: () => call('vault-activity'),
  copySecret: (id, kind) => call('secret-copy', id, kind),
  copyAccountWithSecrets: (id, target, kinds) => call('account-copy-secrets', id, target, kinds),
  copyResourceWithSecrets: (id, target) => call('resource-copy-secrets', id, target),
  initializeVault: (password) => call('vault-initialize', password),
  unlockVault: (password) => call('vault-unlock', password),
  rotateVault: (current, next) => call('vault-rotate', current, next),
  lockVault: () => call('vault-lock'),
  readSecret: (accountId, kind) => call('secret-read', accountId, kind),
  saveSecret: (accountId, kind, value) => call('secret-save', accountId, kind, value),
  removeSecret: (accountId, kind) => call('secret-remove', accountId, kind),
  onSettingsChange(handler) {
    const listener = (_: unknown, settings: Parameters<typeof handler>[0]) => handler(settings);
    ipcRenderer.on('settings-changed', listener);
    return () => ipcRenderer.removeListener('settings-changed', listener);
  },
  onVaultStatus(handler) {
    const listener = (_: unknown, status: Parameters<typeof handler>[0]) => handler(status);
    ipcRenderer.on('vault-status', listener);
    return () => ipcRenderer.removeListener('vault-status', listener);
  },
  snapshot: () => call('snapshot'),
  document: (id) => call('document', id),
  searchDocuments: (query) => call('search-documents', query),
  task: (id) => call('task', id),
  search: (q) => call('search', q),
  globalSearch: (query) => call('global-search', query),
  mutate: (c) => call('mutate', c),
  saveDraft: (d) => call('draft', d),
  importImage: (b, n) => call('import-image', b, n),
  chooseImages: () => call('choose-images'),
  backup: () => call('backup'),
  chooseBackup: () => call('choose-backup'),
  inspectBackup: (token, password) => call('inspect-backup', token, password),
  restoreBackup: (t) => call('restore-backup', t),
  discardBackup: (t) => call('discard-backup', t),
  retryBackup: () => call('retry-backup'),
  backupDirectory: () => call('backup-directory'),
  copyText: (value) => call('copy-text', value),
  openExternal: (u) => call('open-external', u),
  onFlush(handler) {
    const listener = async (_: unknown, token: string) => {
      try {
        await handler();
        ipcRenderer.send('flushed', token, null);
      } catch (e) {
        ipcRenderer.send('flushed', token, e instanceof Error ? e.message : String(e));
      }
    };
    ipcRenderer.on('flush', listener);
    return () => ipcRenderer.removeListener('flush', listener);
  },
  onNativeCommand(handler) {
    const listener = (_: unknown, command: string) => handler(command);
    ipcRenderer.on('native-command', listener);
    return () => ipcRenderer.removeListener('native-command', listener);
  },
};
contextBridge.exposeInMainWorld('desktop', api);

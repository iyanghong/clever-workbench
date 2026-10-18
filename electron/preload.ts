import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/types';
const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const api: DesktopAPI = {
  platform: process.platform,
  snapshot: () => call('snapshot'),
  document: (id) => call('document', id),
  searchDocuments: (query) => call('search-documents', query),
  task: (id) => call('task', id),
  search: (q) => call('search', q),
  mutate: (c) => call('mutate', c),
  saveDraft: (d) => call('draft', d),
  importImage: (b, n) => call('import-image', b, n),
  chooseImages: () => call('choose-images'),
  backup: () => call('backup'),
  inspectBackup: () => call('inspect-backup'),
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

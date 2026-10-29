import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/types';
let flushHandler: (() => Promise<void>) | null = null;
const waitingFlush = new Set<string>();
function drainFlush() {
  if (!flushHandler) return;
  const handler = flushHandler;
  for (const token of waitingFlush) {
    waitingFlush.delete(token);
    void Promise.resolve()
      .then(handler)
      .then(
        () => ipcRenderer.send('flushed', token, null),
        (cause) =>
          ipcRenderer.send(
            'flushed',
            token,
            cause instanceof Error ? cause.message : String(cause),
          ),
      );
  }
}
// A close can arrive before React mounts its save coordinator.
ipcRenderer.on('flush', (_event, token: string) => {
  waitingFlush.add(token);
  drainFlush();
});
let generation = ipcRenderer.invoke('data-generation') as Promise<string>;
ipcRenderer.on('data-restored', (_event, next: string) => {
  generation = Promise.resolve(next);
});
const call = async (channel: string, ...args: unknown[]) => {
  const expected = generation;
  return ipcRenderer.invoke(channel, await expected, ...args);
};
const api: DesktopAPI = {
  guidanceAvailability: () => call('guidance-availability'),
  onGuidanceAvailabilityChanged(handler) {
    const listener = () => handler();
    ipcRenderer.on('guidance-availability-changed', listener);
    return () => ipcRenderer.removeListener('guidance-availability-changed', listener);
  },
  guidanceVersions: () => call('guidance-versions'),
  guidanceState: () => call('guidance-state'),
  guidanceAcknowledge: (version) => call('guidance-acknowledge', version),
  tools: {
    state: (id) => call('tool-state', id),
    command: (id, command) => call('tool-command', id, command),
    choosePath: (kind) => call('tool-path', kind),
    openOutput: (id) => call('tool-open-output', id),
  },
  updateSnapshot: () => call('update-snapshot'),
  updateHistory: () => call('update-history'),
  updateHealthReady: () => call('update-health-ready'),
  confirmUpdateHealth: (nonce) => call('update-health-confirm', nonce),
  openUpdateRecovery: (id, kind) => call('update-recovery-open', id, kind),
  onUpdateHistory(handler) {
    const listener = () => handler();
    ipcRenderer.on('update-history-changed', listener);
    return () => ipcRenderer.removeListener('update-history-changed', listener);
  },
  checkUpdate: () => call('update-check'),
  downloadUpdate: () => call('update-download'),
  cancelUpdateDownload: () => call('update-download-cancel'),
  installUpdate: () => call('update-install'),
  onUpdateState(handler) {
    const listener = (_: unknown, state: Parameters<typeof handler>[0]) => handler(state);
    ipcRenderer.on('update-state', listener);
    return () => ipcRenderer.removeListener('update-state', listener);
  },
  captureLedgerBatch: (input) => call('ledger-batch', input),
  exportSystem: (options) => call('system-export', options),
  platform: process.platform,
  captureLedger: (input) => call('ledger-capture', input),
  copyAccessWithSecrets: (id, target) => call('access-copy-secrets', id, target),
  systemAppearance: () => call('system-appearance'),
  onSystemAppearance(handler) {
    const listener = (_event: unknown, preferences: Parameters<typeof handler>[0]) =>
      handler(preferences);
    ipcRenderer.on('system-appearance', listener);
    return () => ipcRenderer.removeListener('system-appearance', listener);
  },
  onDataRestored(handler) {
    const listener = () => handler();
    ipcRenderer.on('data-restored', listener);
    return () => ipcRenderer.removeListener('data-restored', listener);
  },
  vaultStatus: () => call('vault-status'),
  vaultActivity: () => call('vault-activity'),
  copySecret: (id, kind) => call('secret-copy', id, kind),
  copyAccountText: (id) => call('account-copy-text', id),
  previewLedgerCopy: (selection) => call('ledger-copy-preview', selection),
  copyLedger: (request) => call('ledger-copy', request),
  copyAccountWithSecrets: (id, target, kinds) => call('account-copy-secrets', id, target, kinds),
  copyResourceWithSecrets: (id, target) => call('resource-copy-secrets', id, target),
  initializeVault: (password) => call('vault-initialize', password),
  unlockVault: (password) => call('vault-unlock', password),
  unlockSystemVault: () => call('vault-system-unlock'),
  configureBackup: (password) => call('backup-configure', password),
  rotateVault: (current, next) => call('vault-rotate', current, next),
  disableMasterPassword: (password) => call('vault-disable', password),
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
    flushHandler = handler;
    drainFlush();
    return () => {
      if (flushHandler === handler) flushHandler = null;
    };
  },
  onNativeCommand(handler) {
    const listener = (_: unknown, command: string) => handler(command);
    ipcRenderer.on('native-command', listener);
    return () => ipcRenderer.removeListener('native-command', listener);
  },
};
contextBridge.exposeInMainWorld('desktop', api);

import { describe, expect, it } from 'vitest';
import { UpdateInstallation } from '../electron/update-install';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';

describe('update installation operation', () => {
  it('creates a recoverable encrypted backup of the final saved edit even with a recent automatic backup', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-install-data-'));
    const store = new Store(directory);
    const vault = new Vault(store);
    const backups = new Backups(store);
    const password = 'update-data-protection-example';
    let frozen = false;
    try {
      await vault.initialize(password);
      store.set('lastBackupAt', Date.now());
      store.set('lastBackupRevision', store.get('revision', 0));
      const id = store.mutate({ type: 'document.create' }).createdId!;
      const backupPath = path.join(directory, 'update.cwb');
      const installation = new UpdateInstallation({
        prepared: () => ({
          appPath: '/stage/Test.app',
          version: '0.2.0',
          stageDirectory: '/stage',
        }),
        status: () => {},
        eligible: () => {},
        flush: async () => {
          store.mutate({
            ...store.document(id),
            type: 'document.edit',
            title: 'last saved update edit',
            markdown: 'saved before replacement',
          });
        },
        freeze: (value) => {
          frozen = value;
        },
        idle: () => backups.whenIdle(),
        backup: async () => {
          expect(frozen).toBe(true);
          await backups.create(backupPath);
          return backupPath;
        },
        launch: async (_prepared, archive) => {
          expect(fs.readFileSync(archive).subarray(0, 8).toString()).toBe('CWBK0001');
          expect(fs.readFileSync(archive).includes(Buffer.from('last saved update edit'))).toBe(
            false,
          );
        },
        quit: () => {},
      });
      await installation.install();
      store.mutate({ ...store.document(id), type: 'document.edit', title: 'later test change' });
      const inspected = await backups.inspect(backupPath, password);
      await backups.restore(inspected.token);
      expect(store.document(id).title).toBe('last saved update edit');
      expect(store.document(id).markdown).toBe('saved before replacement');
    } finally {
      vault.lock();
      store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  it('does not freeze or quit when saving fails', async () => {
    let frozen = false;
    let quit = false;
    const installation = new UpdateInstallation({
      prepared: () => ({ appPath: '/stage/Test.app', version: '0.2.0', stageDirectory: '/stage' }),
      status: () => {},
      eligible: () => {},
      flush: async () => {
        throw Error('save failed');
      },
      freeze: (value) => {
        frozen = value;
      },
      idle: async () => {},
      backup: async () => '/backup.cwb',
      launch: async () => {},
      quit: () => {
        quit = true;
      },
    });
    await expect(installation.install()).rejects.toThrow('save failed');
    expect(frozen).toBe(false);
    expect(quit).toBe(false);
  });
  it('keeps the application writable after a refused backup and never launches installer', async () => {
    let frozen = false;
    let launched = false;
    const installation = new UpdateInstallation({
      prepared: () => ({ appPath: '/stage/Test.app', version: '0.2.0', stageDirectory: '/stage' }),
      status: () => {},
      eligible: () => {},
      flush: async () => {},
      freeze: (value) => {
        frozen = value;
      },
      idle: async () => {},
      backup: async () => {
        expect(frozen).toBe(true);
        throw Error('主密码未设置');
      },
      launch: async () => {
        launched = true;
      },
      quit: () => {
        throw Error('must not quit');
      },
    });
    await expect(installation.install()).rejects.toThrow('主密码未设置');
    expect(frozen).toBe(false);
    expect(launched).toBe(false);
  });
  it('coalesces repeated install clicks and quits only after backup and helper readiness', async () => {
    let resolve!: () => void;
    let frozen = false;
    let launches = 0;
    let quits = 0;
    let saved = false;
    const barrier = new Promise<void>((done) => {
      resolve = done;
    });
    const installation = new UpdateInstallation({
      prepared: () => ({ appPath: '/stage/Test.app', version: '0.2.0', stageDirectory: '/stage' }),
      status: () => {},
      eligible: () => {},
      flush: async () => {
        await barrier;
        expect(frozen).toBe(false);
        saved = true;
      },
      freeze: (value) => {
        frozen = value;
      },
      idle: async () => {},
      backup: async () => {
        expect(saved && frozen).toBe(true);
        return '/full-encrypted.cwb';
      },
      launch: async (_prepared, backup) => {
        expect(backup).toBe('/full-encrypted.cwb');
        launches++;
      },
      quit: () => {
        quits++;
      },
    });
    const first = installation.install();
    const second = installation.install();
    expect(quits).toBe(0);
    resolve();
    await Promise.all([first, second]);
    expect(launches).toBe(1);
    expect(quits).toBe(1);
    expect(frozen).toBe(true);
  });
});

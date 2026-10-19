import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { UpdateJournal, UpdateHealth } from '../electron/update-recovery';
// Native installation transactions require POSIX ownership; history remains portable.
const posixTest = test.skipIf(process.platform === 'win32');
async function pendingFixture() {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'update-health-'));
  const root = path.join(userData, 'updates');
  const journal = await UpdateJournal.open(root);
  const id = '12345678-1234-4234-8234-123456789abc',
    directory = path.join(root, 'transactions', id);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(userData, 'Clever Workbench.app');
  await fs.writeFile(
    path.join(directory, 'transaction.json'),
    JSON.stringify({
      id,
      createdAt: new Date().toISOString(),
      currentVersion: '0.1.0',
      targetVersion: '0.2.0',
      target,
      backup: path.join(userData, 'backup.cwb'),
      stageDirectory: path.join(root, 'stage'),
      userDataDirectory: userData,
    }),
    { mode: 0o600 },
  );
  await fs.writeFile(path.join(directory, 'helper-status'), 'launching');
  return { journal, userData, directory, target };
}
posixTest(
  'health success requires actual version, database, window and nonce roundtrip after helper awaits health',
  async () => {
    const f = await pendingFixture();
    try {
      const health = new UpdateHealth(f.journal, {
        version: '0.2.0',
        target: f.target,
        userDataDirectory: f.userData,
      });
      await health.discover();
      health.databaseReady();
      health.windowReady();
      await health.confirm('wrong');
      expect(f.journal.list()[0].outcome).toBe('in-progress');
      await health.confirm(health.challenge!);
      expect(f.journal.list()[0].outcome).toBe('in-progress');
      await fs.writeFile(path.join(f.directory, 'helper-status'), 'awaiting-health');
      await health.poll();
      expect(f.journal.list()[0].outcome).toBe('success');
      expect(
        JSON.parse(await fs.readFile(path.join(f.directory, 'health.json'), 'utf8')).outcome,
      ).toBe('success');
    } finally {
      await fs.rm(f.userData, { recursive: true, force: true });
    }
  },
);
test('update attempts including failed downloads survive restart and retain only the latest 30', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'update-history-'));
  try {
    let now = 1000;
    const journal = await UpdateJournal.open(root, () => now);
    for (let i = 0; i < 32; i++) {
      await journal.observe({ currentVersion: '0.1.0', status: 'downloading' });
      now += 50;
      await journal.observe({
        currentVersion: '0.1.0',
        status: 'error',
        message: 'Download failed',
      });
    }
    const loaded = await UpdateJournal.open(root, () => now);
    expect(loaded.list()).toHaveLength(30);
    expect(loaded.list()[0]).toMatchObject({
      outcome: 'failed',
      durations: { downloading: 50 },
      message: 'Download failed',
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
posixTest(
  'timeout preserves backup and database while exposing a manual recovery result',
  async () => {
    const f = await pendingFixture();
    let now = Date.now();
    try {
      await fs.writeFile(path.join(f.userData, 'database'), 'user data');
      const health = new UpdateHealth(f.journal, {
        version: '0.2.0',
        target: f.target,
        userDataDirectory: f.userData,
        now: () => now,
      });
      await health.discover();
      now += 60001;
      await health.poll();
      expect(f.journal.list()[0]).toMatchObject({
        outcome: 'manual',
        backup: path.join(f.userData, 'backup.cwb'),
      });
      expect(await fs.readFile(path.join(f.userData, 'database'), 'utf8')).toBe('user data');
    } finally {
      await fs.rm(f.userData, { recursive: true, force: true });
    }
  },
);
posixTest('an unrelated installed path cannot confirm a pending installation', async () => {
  const f = await pendingFixture();
  try {
    const health = new UpdateHealth(f.journal, {
      version: '0.2.0',
      target: '/Applications/Other.app',
      userDataDirectory: f.userData,
    });
    await health.discover();
    expect(health.pending).toBe(false);
    expect(health.challenge).toBeUndefined();
  } finally {
    await fs.rm(f.userData, { recursive: true, force: true });
  }
});
posixTest('database startup failure is recorded outside the database', async () => {
  const f = await pendingFixture();
  try {
    const health = new UpdateHealth(f.journal, {
      version: '0.2.0',
      target: f.target,
      userDataDirectory: f.userData,
    });
    await health.discover();
    await health.fail('Database unavailable');
    expect(
      JSON.parse(await fs.readFile(path.join(f.directory, 'health.json'), 'utf8')).outcome,
    ).toBe('manual');
    expect((await UpdateJournal.open(f.journal.root)).list()[0].outcome).toBe('manual');
  } finally {
    await fs.rm(f.userData, { recursive: true, force: true });
  }
});
posixTest(
  'a quarantined app launched through AppTranslocation records manual recovery instead of ignoring the pending update',
  async () => {
    const f = await pendingFixture();
    try {
      const health = new UpdateHealth(f.journal, {
        version: '0.2.0',
        target: '/private/var/folders/test/AppTranslocation/nonce/d/Clever Workbench.app',
        userDataDirectory: f.userData,
      });
      await health.discover();
      expect(f.journal.list()[0]).toMatchObject({
        outcome: 'manual',
        backup: path.join(f.userData, 'backup.cwb'),
      });
      expect(health.challenge).toBeUndefined();
    } finally {
      await fs.rm(f.userData, { recursive: true, force: true });
    }
  },
);

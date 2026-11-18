import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { LocalLedgerImports } from '../electron/ledger-import';

let workers: string;
const cleanup: (() => Promise<void>)[] = [];
beforeAll(async () => {
  workers = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-import-worker-'));
  await build({
    entryPoints: ['electron/ledger-import-worker.ts'],
    outfile: path.join(workers, 'worker.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
  });
});
afterAll(async () => {
  await fs.rm(workers, { recursive: true, force: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0)) await dispose();
});
async function setup(systemMode = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-import-controller-'));
  const store = new Store(path.join(root, 'data'));
  const key = randomBytes(32);
  const system = systemMode
    ? {
        available: () => true,
        encrypt(value: string) {
          const iv = randomBytes(12),
            cipher = createCipheriv('aes-256-gcm', key, iv);
          const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
          return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
        },
        decrypt(value: Buffer) {
          const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
          decipher.setAuthTag(value.subarray(12, 28));
          return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString();
        },
      }
    : undefined;
  let controller: LocalLedgerImports;
  const readyBusy: boolean[] = [];
  const vault = new Vault(
    store,
    (status) => {
      if (!status.unlocked) controller?.onVaultLocked();
    },
    system,
  );
  controller = new LocalLedgerImports(
    store,
    vault,
    path.join(workers, 'worker.cjs'),
    path.join(root, 'models'),
    () => {
      if (controller.snapshot().job?.phase === 'ready') readyBusy.push(controller.busy);
    },
  );
  cleanup.push(async () => {
    controller.dispose();
    vault.lock();
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const systemId = store.mutate({ type: 'system.save', name: '合成系统' }).createdId!;
  const filename = path.join(root, '合成.csv');
  await fs.writeFile(
    filename,
    '名称,环境,IP,用户名,密码\n合成服务器,生产,192.0.2.99,ops,fixture-controller-secret\n',
  );
  const state = controller.choose(filename, { systemId, kind: 'server' });
  await vi.waitFor(() => expect(controller.snapshot().job?.phase).toBe('ready'));
  return { root, store, vault, controller, id: state.job!.id, systemId, readyBusy };
}
const output = () => ({
  content: JSON.stringify({
    candidates: [
      {
        key: 'server1',
        kind: 'server',
        name: { source: 's6', value: '合成服务器' },
        address: { source: 's8', value: '192.0.2.99' },
        accounts: [{ username: { source: 's9', value: 'ops' }, passwordSource: 's10' }],
      },
    ],
  }),
  seconds: 0,
  inputTokens: 1,
  outputTokens: 1,
});

test('the parser completion event permits immediate analysis without waiting for worker exit', async () => {
  const { readyBusy } = await setup();
  expect(readyBusy[0]).toBe(false);
});

test('an unchecked candidate with invalid edited fields is outside the submitted batch', async () => {
  const { store, vault, controller, id } = await setup();
  await vault.initialize('fixture-selected-only-master');
  const response = output();
  const raw = JSON.parse(response.content);
  raw.candidates.push({ ...raw.candidates[0], key: 'skipped-server' });
  vi.spyOn(controller.runtime, 'chat').mockResolvedValue({
    ...response,
    content: JSON.stringify(raw),
  });
  controller.analyze({ id, model: 'qwen3:4b' });
  await vi.waitFor(() => expect(controller.snapshot().job?.phase).toBe('review'));
  const candidates = controller.snapshot().job!.candidates.map((candidate, index) => ({
    ...candidate,
    environmentIds: [],
    reviewed: true,
    selected: index === 0,
    fields: index ? { 用途: '合成'.repeat(2000) } : candidate.fields,
  }));
  controller.commit({ id, candidates, passwordEdits: {} });
  expect(store.snapshot().resources).toHaveLength(1);
  expect(controller.snapshot().job?.created).toBe(1);
});

test('real parser worker keeps raw passwords out of snapshots, previews and inference input; cancelled model results cannot return', async () => {
  const { controller, id } = await setup();
  expect(JSON.stringify(controller.snapshot())).not.toContain('fixture-controller-secret');
  expect(JSON.stringify(controller.sources(id, ['s10']))).not.toContain(
    'fixture-controller-secret',
  );
  let finish!: (value: ReturnType<typeof output>) => void;
  const chat = vi.spyOn(controller.runtime, 'chat').mockImplementation(async (_model, messages) => {
    expect(JSON.stringify(messages)).not.toContain('fixture-controller-secret');
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  controller.analyze({ id, model: 'qwen3:4b' });
  await vi.waitFor(() => expect(chat).toHaveBeenCalled());
  controller.cancel(id);
  finish(output());
  await vi.waitFor(() => expect(controller.busy).toBe(false));
  expect(controller.snapshot().job?.phase).toBe('cancelled');
  expect(controller.snapshot().job?.candidates).toEqual([]);
});

test('an actual backup restore invalidates in-flight analysis and prevents old commits', async () => {
  const { root, store, vault, controller, id } = await setup();
  await vault.initialize('fixture-restore-master');
  const backups = new Backups(store, () => vault);
  const filename = path.join(root, 'backup.cwb');
  await backups.create(filename);
  const prepared = await backups.inspect(filename, 'fixture-restore-master');
  let finish!: (value: ReturnType<typeof output>) => void;
  vi.spyOn(controller.runtime, 'chat').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  controller.analyze({ id, model: 'qwen3:4b' });
  const generation = store.generation;
  await backups.restore(prepared.token);
  expect(store.generation).not.toBe(generation);
  finish(output());
  await vi.waitFor(() => expect(controller.snapshot().job).toBeNull());
  expect(() => controller.commit({ id, candidates: [], passwordEdits: {} })).toThrow('资料已切换');
  expect(store.snapshot().resources).toHaveLength(0);
});

test('an expired system credential session cannot auto-unlock and submit candidates cancelled by the lock callback', async () => {
  const { store, vault, controller, id } = await setup(true);
  vault.unlockSystem();
  vi.spyOn(controller.runtime, 'chat').mockResolvedValue(output());
  controller.analyze({ id, model: 'qwen3:4b' });
  await vi.waitFor(() => expect(controller.snapshot().job?.phase).toBe('review'));
  const candidates = controller
    .snapshot()
    .job!.candidates.map((item) => ({ ...item, reviewed: true, environmentIds: [] }));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
  expect(() => controller.commit({ id, candidates, passwordEdits: {} })).toThrow();
  expect(store.snapshot().resources).toHaveLength(0);
});

test('credential expiry also cancels a pending submission containing a manually entered password', async () => {
  const { root, store, vault, controller, id, systemId } = await setup(true);
  controller.discard(id);
  const filename = path.join(root, '普通资料.csv');
  await fs.writeFile(filename, '名称,用户名\n普通服务器,ops\n');
  const next = controller.choose(filename, { systemId, kind: 'server' }).job!.id;
  await vi.waitFor(() => expect(controller.snapshot().job?.phase).toBe('ready'));
  vault.unlockSystem();
  vi.spyOn(controller.runtime, 'chat').mockResolvedValue({
    ...output(),
    content: JSON.stringify({
      candidates: [
        {
          key: 'server1',
          kind: 'server',
          name: { source: 's3', value: '普通服务器' },
          accounts: [{ username: { source: 's4', value: 'ops' } }],
        },
      ],
    }),
  });
  controller.analyze({ id: next, model: 'qwen3:4b' });
  await vi.waitFor(() => expect(controller.snapshot().job?.phase).toBe('review'));
  const candidates = controller
    .snapshot()
    .job!.candidates.map((item) => ({ ...item, reviewed: true, environmentIds: [] }));
  const accountId = candidates[0].accounts[0].id;
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
  expect(() =>
    controller.commit({
      id: next,
      candidates,
      passwordEdits: { [accountId]: 'manual-fixture-password' },
    }),
  ).toThrow();
  expect(store.snapshot().resources).toHaveLength(0);
});

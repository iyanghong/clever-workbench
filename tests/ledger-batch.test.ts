import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { parseTsv } from '../src/shared/paste-table';
const roots: string[] = [],
  stores: Store[] = [],
  vaults: Vault[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-batch-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  const systemId = store.mutate({ type: 'system.save', name: '批量系统' }).createdId!;
  return { store, vault, systemId };
}
afterEach(() => {
  for (const v of vaults.splice(0)) v.lock();
  for (const s of stores.splice(0)) s.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
test('TSV preserves quoted multiline cells and reports malformed boundaries', () => {
  expect(parseTsv('名称\t说明\r\n节点\t"第一行\n第二行"\r\n').rows).toEqual([
    ['名称', '说明'],
    ['节点', '第一行\n第二行'],
  ]);
  expect(parseTsv('a\tb\n1').warnings).toHaveLength(1);
  expect(parseTsv('a\t"broken').warnings[0]).toContain('引号');
});
test('locked batches and invalid later rows never leave partial objects or credentials', async () => {
  const { store, vault, systemId } = setup();
  const input = {
    token: randomUUID(),
    systemId,
    environmentId: null,
    kind: 'server' as const,
    rows: [
      { name: '节点一', username: 'ops', password: 'fixture-secret' },
      { name: '节点二', port: 'bad' },
    ],
  };
  expect(() => vault.captureBatch(input)).toThrow();
  expect(store.snapshot().resources).toHaveLength(0);
  await vault.initialize('fictional-master-password');
  expect(() => vault.captureBatch(input)).toThrow('端口');
  expect(store.snapshot().resources).toHaveLength(0);
  expect(store.snapshot().accounts).toHaveLength(0);
  expect(store.db.prepare('SELECT * FROM secrets').all()).toHaveLength(0);
});
test('batch stores secrets encrypted, is idempotent and refuses unconfirmed duplicates', async () => {
  const { store, vault, systemId } = setup();
  await vault.initialize('fictional-master-password');
  const input = {
    token: randomUUID(),
    systemId,
    environmentId: null,
    kind: 'server' as const,
    rows: [
      { name: '节点一', address: '192.0.2.1', username: 'ops', password: 'fictional-batch-secret' },
    ],
  };
  const first = vault.captureBatch(input);
  const account = first.snapshot.accounts[0];
  expect(vault.read(account.id, 'password')).toBe(input.rows[0].password);
  expect(JSON.stringify(store.db.prepare('SELECT * FROM resources').all())).not.toContain(
    input.rows[0].password,
  );
  expect(JSON.stringify(store.db.prepare('SELECT * FROM secrets').all())).not.toContain(
    input.rows[0].password,
  );
  expect(vault.captureBatch(input).createdId).toBe(first.createdId);
  expect(store.snapshot().resources).toHaveLength(1);
  expect(() =>
    vault.captureBatch({
      ...input,
      token: randomUUID(),
      rows: [{ name: '独立节点', address: '192.0.2.1' }],
    }),
  ).toThrow('重复');
  vault.captureBatch({
    ...input,
    token: randomUUID(),
    rows: [{ name: '独立节点', address: '192.0.2.1', confirmDuplicate: true }],
  });
  expect(store.snapshot().resources).toHaveLength(2);
});

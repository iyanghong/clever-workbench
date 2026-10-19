import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from './store';
import type { LedgerCapture } from '../src/ledger-types';
import type { LedgerBatch } from '../src/ledger-workspace-types';
import { WorkspaceLedger } from './ledger-workspace';
import type {
  SecretKind,
  VaultStatus,
  AccountCopyTarget,
  ResourceCopyTarget,
  AccessCopyTarget,
} from '../src/vault-types';
import {
  derive,
  keyAad,
  newProtection,
  seal,
  unseal,
  validateConfig,
  validateSealed,
  type VaultConfig,
} from './vault-crypto';

export function initializeVault(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS secrets(
    accountId TEXT NOT NULL REFERENCES accounts(id), kind TEXT NOT NULL CHECK(kind IN ('password','token','privateKey')),
    value TEXT NOT NULL, updatedAt INTEGER NOT NULL, PRIMARY KEY(accountId,kind)
  );`);
}
export function validateVault(db: DatabaseSync) {
  const row = db.prepare("SELECT value FROM preferences WHERE key='vaultConfig'").get();
  if (row) validateConfig(JSON.parse(String(row.value)));
  const secrets = db.prepare('SELECT * FROM secrets').all();
  if (secrets.length && !row) throw new Error('秘密缺少主密码保护材料。');
  for (const item of secrets) {
    if (
      !['password', 'token', 'privateKey'].includes(String(item.kind)) ||
      typeof item.value !== 'string' ||
      item.value.length > 1_000_000 ||
      !Number.isSafeInteger(item.updatedAt)
    )
      throw new Error('秘密记录格式无效。');
    validateSealed(JSON.parse(item.value), 256_000);
  }
}
const secretAad = (accountId: string, kind: SecretKind) =>
  `clever-workbench/secret/1/${accountId}/${kind}`;
export async function verifyVaultIntegrity(
  db: DatabaseSync,
  password: unknown,
  expected: VaultConfig,
) {
  validateVault(db);
  const row = db.prepare("SELECT value FROM preferences WHERE key='vaultConfig'").get();
  if (!row) return; // A recovery copy of an uninitialized workspace has no secrets.
  const config = JSON.parse(String(row.value)) as VaultConfig;
  if (!isDeepStrictEqual(config, expected)) throw new Error('备份内外的秘密保护材料不一致。');
  const wrapping = await derive(password, config.kdf);
  let key: Buffer | undefined;
  try {
    key = unseal(config.key, wrapping, keyAad(config), 32);
    if (key.length !== 32) throw new Error();
    for (const secret of db.prepare('SELECT accountId,kind,value FROM secrets').iterate()) {
      const bytes = unseal(
        JSON.parse(String(secret.value)),
        key,
        secretAad(String(secret.accountId), secret.kind as SecretKind),
        256_000,
      );
      bytes.fill(0);
    }
  } catch {
    throw new Error('备份中的秘密保护材料或密文校验失败，当前资料未修改。');
  } finally {
    wrapping.fill(0);
    key?.fill(0);
  }
}
export class Vault {
  private key: Buffer | null = null;
  private dataGeneration: string | null = null;
  private protectionId: string | null = null;
  private generation = 0;
  private busy = false;
  private initialized = false;
  private lastActivity = Date.now();
  constructor(
    private store: Store,
    private onStatus: (status: VaultStatus) => void = () => {},
  ) {
    this.initialized = store.get('vaultConfig', null) !== null;
  }
  status(): VaultStatus {
    this.checkIdle();
    this.initialized = this.store.get('vaultConfig', null) !== null;
    return { initialized: this.initialized, unlocked: this.key !== null };
  }
  config(): VaultConfig {
    const config = this.store.get<unknown>('vaultConfig', null);
    validateConfig(config);
    return config;
  }
  lock() {
    this.generation++;
    this.key?.fill(0);
    this.key = null;
    this.dataGeneration = null;
    this.protectionId = null;
    this.onStatus({ initialized: this.initialized, unlocked: false });
  }
  checkIdle() {
    if (
      this.key &&
      (Date.now() - this.lastActivity >= 15 * 60_000 ||
        this.dataGeneration !== this.store.generation ||
        this.protectionId !== this.store.get<VaultConfig | null>('vaultConfig', null)?.id)
    )
      this.lock();
  }
  touch() {
    this.checkIdle();
    if (this.key) this.lastActivity = Date.now();
  }
  private requireKey() {
    this.checkIdle();
    if (!this.key) throw new Error('请先解锁秘密。');
    this.lastActivity = Date.now();
    return this.key;
  }
  authorizeSecretOperation() {
    this.requireKey();
    const generation = this.generation;
    return () => {
      this.checkIdle();
      if (!this.key || generation !== this.generation)
        throw new Error('秘密操作已取消，请重新解锁。');
    };
  }
  private account(accountId: unknown, kind: unknown): asserts kind is SecretKind {
    if (
      typeof accountId !== 'string' ||
      accountId.length > 100 ||
      !['password', 'token', 'privateKey'].includes(String(kind))
    )
      throw new Error('秘密目标无效。');
    this.store.ledger.account(accountId);
  }
  private async exclusive(operation: (assertCurrent: () => void) => Promise<void>) {
    if (this.busy) throw new Error('正在处理主密码，请稍后再试。');
    this.checkIdle();
    this.busy = true;
    const generation = this.generation;
    const dataGeneration = this.store.generation;
    const protectionId = this.store.get<VaultConfig | null>('vaultConfig', null)?.id;
    try {
      await operation(() => {
        if (
          generation !== this.generation ||
          dataGeneration !== this.store.generation ||
          protectionId !== this.store.get<VaultConfig | null>('vaultConfig', null)?.id
        )
          throw new Error('操作已取消，请重新解锁。');
      });
    } finally {
      this.busy = false;
    }
  }
  async initialize(password: unknown) {
    return this.exclusive(async (assertCurrent) => {
      if (this.status().initialized) throw new Error('主密码已设置，请解锁。');
      if (this.store.db.prepare('SELECT 1 FROM secrets LIMIT 1').get())
        throw new Error('秘密缺少保护材料，请从完整备份恢复。');
      const key = randomBytes(32);
      try {
        const config = await newProtection(password, key);
        assertCurrent();
        this.store.db.exec('BEGIN IMMEDIATE');
        try {
          this.store.set('vaultConfig', config);
          this.store.markChanged();
          this.store.db.exec('COMMIT');
        } catch (cause) {
          this.store.db.exec('ROLLBACK');
          throw cause;
        }
        this.key = Buffer.from(key);
        this.dataGeneration = this.store.generation;
        this.protectionId = config.id;
        this.lastActivity = Date.now();
        this.onStatus(this.status());
      } finally {
        key.fill(0);
      }
    });
  }
  async unlock(password: unknown) {
    return this.exclusive(async (assertCurrent) => {
      const config = this.config(),
        wrapping = await derive(password, config.kdf);
      let key: Buffer | undefined;
      try {
        try {
          key = unseal(config.key, wrapping, keyAad(config), 32);
        } catch {
          throw new Error('主密码错误或保护材料损坏。');
        }
        if (key.length !== 32) throw new Error('主密码保护材料无效。');
        assertCurrent();
        this.key?.fill(0);
        this.key = Buffer.from(key);
        this.dataGeneration = this.store.generation;
        this.protectionId = config.id;
        this.lastActivity = Date.now();
        this.onStatus(this.status());
      } finally {
        wrapping.fill(0);
        key?.fill(0);
      }
    });
  }
  async rotate(currentPassword: unknown, nextPassword: unknown) {
    return this.exclusive(async (assertCurrent) => {
      const current = this.config();
      const wrapping = await derive(currentPassword, current.kdf);
      let oldKey: Buffer | undefined, nextKey: Buffer | undefined;
      try {
        try {
          oldKey = unseal(current.key, wrapping, keyAad(current), 32);
        } catch {
          throw new Error('当前主密码错误或保护材料损坏。');
        }
        if (oldKey.length !== 32) throw new Error('主密码保护材料无效。');
        assertCurrent();
        nextKey = randomBytes(32);
        const next = await newProtection(nextPassword, nextKey);
        assertCurrent();
        this.store.db.exec('BEGIN IMMEDIATE');
        try {
          for (const row of this.store.db.prepare('SELECT accountId,kind FROM secrets').all()) {
            const accountId = String(row.accountId),
              kind = row.kind;
            this.account(accountId, kind);
            const bytes = this.decrypt(accountId, kind, oldKey);
            try {
              this.store.db
                .prepare('UPDATE secrets SET value=? WHERE accountId=? AND kind=?')
                .run(
                  JSON.stringify(seal(bytes, nextKey, secretAad(accountId, kind))),
                  accountId,
                  kind,
                );
            } finally {
              bytes.fill(0);
            }
          }
          this.store.set('vaultConfig', next);
          this.store.markChanged();
          this.store.db.exec('COMMIT');
        } catch (cause) {
          this.store.db.exec('ROLLBACK');
          throw cause;
        }
        this.initialized = true;
        this.lock();
      } finally {
        wrapping.fill(0);
        oldKey?.fill(0);
        nextKey?.fill(0);
      }
    });
  }
  private writeSecret(accountId: string, kind: SecretKind, value: unknown, key: Buffer) {
    this.account(accountId, kind);
    if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > 256_000)
      throw new Error('请填写秘密，内容不能超过 256 KB。');
    const bytes = Buffer.from(value);
    try {
      const sealed = seal(bytes, key, secretAad(accountId, kind));
      this.store.db
        .prepare(
          'INSERT INTO secrets VALUES(?,?,?,?) ON CONFLICT(accountId,kind) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt',
        )
        .run(accountId, kind, JSON.stringify(sealed), Date.now());
    } finally {
      bytes.fill(0);
    }
  }
  save(accountId: string, kind: SecretKind, value: unknown) {
    const key = this.requireKey();
    this.copyTransaction(() => {
      this.writeSecret(accountId, kind, value, key);
      return accountId;
    });
  }
  capture(input: LedgerCapture) {
    if (
      !input ||
      typeof input !== 'object' ||
      !['access', 'server'].includes(input.kind) ||
      ['password', 'username', 'address', 'purpose'].some(
        (key) =>
          input[key as keyof LedgerCapture] !== undefined &&
          typeof input[key as keyof LedgerCapture] !== 'string',
      ) ||
      (input.fields !== undefined &&
        (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields)))
    )
      throw new Error('台账录入内容无效。');
    const key = input.password ? this.requireKey() : null;
    return this.copyTransaction(() => {
      const now = Date.now();
      const id =
        input.kind === 'access'
          ? this.store.ledger.accessEntries.save(
              {
                type: 'access.save',
                systemId: input.systemId,
                environmentId: input.environmentId,
                name: input.name,
                addresses: input.address ? [{ label: '主地址', url: input.address }] : [],
              },
              now,
            )
          : this.store.ledger.saveResource(
              {
                type: 'resource.save',
                systemId: input.systemId,
                environmentId: input.environmentId,
                kind: 'server',
                name: input.name,
                address: input.address,
                fields: { ...input.fields, ...(input.purpose ? { 用途: input.purpose } : {}) },
              },
              now,
            );
      if (input.username || input.password) {
        const accountId = this.store.ledger.saveAccount(
          {
            type: 'account.save',
            environmentId: input.environmentId,
            resourceId: input.kind === 'server' ? id : null,
            accessId: input.kind === 'access' ? id : null,
            name: '默认账号',
            username: input.username,
          },
          now,
        );
        if (key) this.writeSecret(accountId, 'password', input.password, key);
      }
      return id;
    });
  }
  captureBatch(input: LedgerBatch) {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.token !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(input.token) ||
      !Array.isArray(input.rows) ||
      !input.rows.length ||
      input.rows.length > 200 ||
      ![
        'access',
        'server',
        'database',
        'redis',
        'other',
        'service',
        'job',
        'backup',
        'account',
        'node',
      ].includes(input.kind)
    )
      throw new Error('批量录入格式无效，每次最多 200 条。');
    this.store.ledger.system(input.systemId);
    if (
      input.environmentId !== null &&
      this.store.ledger.environment(input.environmentId).systemId !== input.systemId
    )
      throw new Error('请选择本系统环境。');
    for (const row of input.rows) {
      if (!row || typeof row !== 'object' || typeof row.name !== 'string' || !row.name.trim())
        throw new Error('每条记录都需要名称。');
      for (const key of [
        'address',
        'port',
        'notes',
        'repository',
        'username',
        'password',
        'accountName',
        'frequency',
        'count',
      ] as const)
        if (row[key] !== undefined && typeof row[key] !== 'string')
          throw new Error('批量字段类型无效。');
      if (
        (row.username || row.password) &&
        ['service', 'job', 'backup', 'node'].includes(input.kind)
      )
        throw new Error('此类条目不直接保存账号，请单独选择账号录入。');
    }
    const completed = this.store.db
      .prepare('SELECT createdId FROM ledger_batches WHERE token=?')
      .get(input.token);
    if (completed)
      return { createdId: String(completed.createdId), snapshot: this.store.snapshot() };
    const key = input.rows.some((row) => row.password) ? this.requireKey() : null;
    return this.copyTransaction(() => {
      const workspace = new WorkspaceLedger(this.store.db),
        created: string[] = [],
        now = Date.now();
      for (const row of input.rows) {
        let id: string, accountId: string | undefined;
        const resources = ['server', 'database', 'redis', 'other'].includes(input.kind);
        const existing = resources
          ? this.store.ledger.snapshot().resources.filter((r) => r.systemId === input.systemId)
          : input.kind === 'access'
            ? this.store.ledger.accessEntries.list().filter((r) => r.systemId === input.systemId)
            : [];
        if (
          row.confirmDuplicate !== true &&
          existing.some(
            (r) =>
              r.name.toLowerCase() === row.name.trim().toLowerCase() ||
              (row.address &&
                ('address' in r
                  ? r.address === row.address
                  : r.addresses.some((a) => a.url === row.address))),
          )
        )
          throw new Error('疑似重复记录需要在预览中选择跳过或仍新增。');
        if (input.kind === 'access')
          id = this.store.ledger.accessEntries.save(
            {
              type: 'access.save',
              systemId: input.systemId,
              environmentId: input.environmentId,
              name: row.name,
              notes: row.notes,
              addresses: row.address ? [{ label: '主地址', url: row.address }] : [],
            },
            now,
          );
        else if (resources)
          id = this.store.ledger.saveResource(
            {
              type: 'resource.save',
              systemId: input.systemId,
              environmentId: input.environmentId,
              kind: input.kind as 'server' | 'database' | 'redis' | 'other',
              name: row.name,
              address: row.address,
              port: row.port,
              notes: row.notes,
              fields: row.fields,
            },
            now,
          );
        else if (input.kind === 'service')
          id = this.store.ledger.saveService(
            {
              type: 'service.save',
              systemId: input.systemId,
              name: row.name,
              repository: row.repository,
              notes: row.notes,
            },
            now,
          );
        else if (input.kind === 'job' || input.kind === 'backup')
          id = workspace.saveOperation({
            systemId: input.systemId,
            environmentId: input.environmentId,
            serviceId: null,
            resourceId: null,
            documentId: null,
            name: row.name,
            kind: input.kind,
            frequency: row.frequency ?? '',
            status: row.status ?? 'unverified',
            notes: row.notes ?? '',
          });
        else if (input.kind === 'node') {
          if (
            !input.ownerId ||
            !input.environmentId ||
            this.store.ledger.service(input.ownerId).systemId !== input.systemId
          )
            throw new Error('请选择本系统服务与部署环境。');
          id = workspace.saveNode({
            serviceId: input.ownerId,
            environmentId: input.environmentId,
            name: row.name,
            serverId: null,
            address: row.address ?? '',
            port: row.port ?? '',
            notes: row.notes ?? '',
            mode: row.mode ?? 'fixed',
            count: row.count ?? '',
          });
        } else {
          if (
            !input.ownerId ||
            !['resource', 'access', 'environment'].includes(input.ownerKind ?? '')
          )
            throw new Error('请选择账号所属对象。');
          const owner =
            input.ownerKind === 'resource'
              ? this.store.ledger.resource(input.ownerId)
              : input.ownerKind === 'access'
                ? this.store.ledger.accessEntries.get(input.ownerId)
                : this.store.ledger.environment(input.ownerId);
          if (owner.systemId !== input.systemId) throw new Error('账号归属必须在本系统内。');
          const environmentId =
            'environmentId' in owner ? (owner.environmentId as string | null) : owner.id;
          if (
            row.confirmDuplicate !== true &&
            row.username &&
            this.store.ledger
              .snapshot()
              .accounts.some(
                (a) =>
                  a.username === row.username &&
                  (input.ownerKind === 'resource'
                    ? a.resourceId === owner.id
                    : input.ownerKind === 'access'
                      ? a.accessId === owner.id
                      : a.environmentId === owner.id && !a.resourceId && !a.accessId),
              )
          )
            throw new Error('疑似重复账号需要确认。');
          id = this.store.ledger.saveAccount(
            {
              type: 'account.save',
              name: row.name,
              environmentId,
              resourceId: input.ownerKind === 'resource' ? owner.id : null,
              accessId: input.ownerKind === 'access' ? owner.id : null,
              username: row.username,
              notes: row.notes,
            },
            now,
          );
          accountId = id;
        }
        if ((resources || input.kind === 'access') && (row.username || row.password))
          accountId = this.store.ledger.saveAccount(
            {
              type: 'account.save',
              environmentId: input.environmentId,
              resourceId: resources ? id : null,
              accessId: input.kind === 'access' ? id : null,
              name: row.accountName || '默认账号',
              username: row.username,
            },
            now,
          );
        if (row.password && accountId && key)
          this.writeSecret(accountId, 'password', row.password, key);
        created.push(id);
      }
      this.store.db
        .prepare('INSERT INTO ledger_batches VALUES(?,?,?)')
        .run(input.token, created[0], now);
      return created[0];
    });
  }
  read(accountId: string, kind: SecretKind): string {
    const key = this.requireKey();
    this.account(accountId, kind);
    const bytes = this.decrypt(accountId, kind, key);
    try {
      return bytes.toString('utf8');
    } finally {
      bytes.fill(0);
    }
  }
  private decrypt(accountId: string, kind: SecretKind, key: Buffer) {
    const row = this.store.db
      .prepare('SELECT value FROM secrets WHERE accountId=? AND kind=?')
      .get(accountId, kind);
    if (!row) throw new Error('尚未保存这项秘密。');
    let value: unknown;
    try {
      if (typeof row.value !== 'string' || row.value.length > 1_000_000) throw new Error();
      value = JSON.parse(row.value);
    } catch {
      throw new Error('秘密记录校验失败。');
    }
    return unseal(value, key, secretAad(accountId, kind), 256_000);
  }
  private cloneSecret(source: string, target: string, kind: SecretKind, key: Buffer) {
    const bytes = this.decrypt(source, kind, key);
    try {
      this.store.db
        .prepare('INSERT INTO secrets VALUES(?,?,?,?)')
        .run(target, kind, JSON.stringify(seal(bytes, key, secretAad(target, kind))), Date.now());
    } finally {
      bytes.fill(0);
    }
  }
  private copyTransaction(operation: () => string) {
    this.store.db.exec('BEGIN IMMEDIATE');
    let createdId: string;
    try {
      createdId = operation();
      this.store.markChanged();
      this.store.db.exec('COMMIT');
    } catch (cause) {
      this.store.db.exec('ROLLBACK');
      throw cause;
    }
    return { createdId, snapshot: this.store.snapshot() };
  }
  copyAccount(id: string, options: AccountCopyTarget, kinds: SecretKind[]) {
    const key = this.requireKey();
    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      !Array.isArray(kinds) ||
      !kinds.length ||
      kinds.length > 3 ||
      new Set(kinds).size !== kinds.length
    )
      throw new Error('请选择需要复制的秘密。');
    for (const kind of kinds) this.account(id, kind);
    return this.copyTransaction(() => {
      const created = this.store.ledger.copyAccount(
        { ...options, type: 'account.copy', id },
        Date.now(),
      );
      for (const kind of kinds) this.cloneSecret(id, created, kind, key);
      return created;
    });
  }
  private copyOwnerSecrets(accounts: Map<string, string>, key: Buffer) {
    for (const [source, target] of accounts) {
      for (const secret of this.store.db
        .prepare('SELECT kind FROM secrets WHERE accountId=?')
        .all(source)) {
        this.account(source, secret.kind);
        this.cloneSecret(source, target, secret.kind as SecretKind, key);
      }
    }
  }
  copyResource(id: string, options: ResourceCopyTarget) {
    const key = this.requireKey();
    if (!options || typeof options !== 'object' || Array.isArray(options))
      throw new Error('资源复制目标无效。');
    return this.copyTransaction(() => {
      const target = this.store.ledger.copyResource(
        { ...options, type: 'resource.copy', id },
        Date.now(),
      );
      this.copyOwnerSecrets(target.accounts, key);
      return target.id;
    });
  }
  copyAccess(id: string, options: AccessCopyTarget) {
    const key = this.requireKey();
    if (!options || typeof options !== 'object' || Array.isArray(options))
      throw new Error('入口复制目标无效。');
    return this.copyTransaction(() => {
      const target = this.store.ledger.copyAccess(
        { ...options, type: 'access.copy', id },
        Date.now(),
      );
      this.copyOwnerSecrets(target.accounts, key);
      return target.id;
    });
  }
  remove(accountId: string, kind: SecretKind) {
    this.requireKey();
    this.account(accountId, kind);
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      this.store.db
        .prepare('DELETE FROM secrets WHERE accountId=? AND kind=?')
        .run(accountId, kind);
      this.store.markChanged();
      this.store.db.exec('COMMIT');
    } catch (cause) {
      this.store.db.exec('ROLLBACK');
      throw cause;
    }
  }
}

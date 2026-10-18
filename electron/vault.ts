import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from './store';
import type { SecretKind, VaultStatus } from '../src/vault-types';
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
export class Vault {
  private key: Buffer | null = null;
  private generation = 0;
  private busy = false;
  private initialized = false;
  constructor(
    private store: Store,
    private onStatus: (status: VaultStatus) => void = () => {},
  ) {
    this.initialized = store.get('vaultConfig', null) !== null;
  }
  status(): VaultStatus {
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
    this.onStatus({ initialized: this.initialized, unlocked: false });
  }
  private requireKey() {
    if (!this.key) throw new Error('请先解锁秘密。');
    return this.key;
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
  private async exclusive(operation: (generation: number) => Promise<void>) {
    if (this.busy) throw new Error('正在处理主密码，请稍后再试。');
    this.busy = true;
    const generation = this.generation;
    try {
      await operation(generation);
    } finally {
      this.busy = false;
    }
  }
  async initialize(password: unknown) {
    return this.exclusive(async (generation) => {
      if (this.status().initialized) throw new Error('主密码已设置，请解锁。');
      const key = randomBytes(32);
      try {
        const config = await newProtection(password, key);
        if (generation !== this.generation) throw new Error('操作已取消，请重新解锁。');
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
        this.onStatus(this.status());
      } finally {
        key.fill(0);
      }
    });
  }
  async unlock(password: unknown) {
    return this.exclusive(async (generation) => {
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
        if (generation !== this.generation) throw new Error('操作已取消，请重新解锁。');
        this.key?.fill(0);
        this.key = Buffer.from(key);
        this.onStatus(this.status());
      } finally {
        wrapping.fill(0);
        key?.fill(0);
      }
    });
  }
  save(accountId: string, kind: SecretKind, value: unknown) {
    const key = this.requireKey();
    this.account(accountId, kind);
    if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > 256_000)
      throw new Error('请填写秘密，内容不能超过 256 KB。');
    const bytes = Buffer.from(value);
    try {
      const sealed = seal(bytes, key, secretAad(accountId, kind));
      this.store.db.exec('BEGIN IMMEDIATE');
      try {
        this.store.db
          .prepare(
            'INSERT INTO secrets VALUES(?,?,?,?) ON CONFLICT(accountId,kind) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt',
          )
          .run(accountId, kind, JSON.stringify(sealed), Date.now());
        this.store.markChanged();
        this.store.db.exec('COMMIT');
      } catch (cause) {
        this.store.db.exec('ROLLBACK');
        throw cause;
      }
    } finally {
      bytes.fill(0);
    }
  }
  read(accountId: string, kind: SecretKind): string {
    const key = this.requireKey();
    this.account(accountId, kind);
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
    const bytes = unseal(value, key, secretAad(accountId, kind), 256_000);
    try {
      return bytes.toString('utf8');
    } finally {
      bytes.fill(0);
    }
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

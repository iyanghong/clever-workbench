import { constants, privateDecrypt, publicEncrypt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  backupAad,
  decode,
  derive,
  keyAad,
  newProtection,
  unseal,
  validateConfig,
  validateProtection,
  type VaultConfig,
} from './vault-crypto';

export type PortableProtection = Omit<VaultConfig, 'version' | 'key'> & {
  version: 2;
  dataKeyEnvelope: string;
};
export type BackupConfig = VaultConfig | PortableProtection;

export function backupProtection(db: DatabaseSync): BackupConfig | null {
  const row = db.prepare("SELECT value FROM preferences WHERE key='backupConfig'").get();
  if (row) {
    const config: unknown = JSON.parse(String(row.value));
    validateBackupConfig(config);
    return config;
  }
  const modern = db
    .prepare("SELECT value FROM preferences WHERE key='localProtectionVersion'")
    .get();
  if (modern && JSON.parse(String(modern.value)) === 2) return null;
  const legacy = db.prepare("SELECT value FROM preferences WHERE key='vaultConfig'").get();
  if (!legacy) return null;
  const config: unknown = JSON.parse(String(legacy.value));
  validateConfig(config);
  return config;
}

export function validateBackupConfig(value: unknown): asserts value is BackupConfig {
  if ((value as BackupConfig | null)?.version === 1) return validateConfig(value);
  validateProtection(value);
  const config = value as PortableProtection;
  if (config.version !== 2) throw new Error('不支持的备份保护版本。');
  decode(config.dataKeyEnvelope, 384, 384);
}

export function portableProtection(config: BackupConfig, key: Buffer): PortableProtection {
  validateBackupConfig(config);
  if (key.length !== 32) throw new Error('资料密钥无效。');
  return {
    version: 2,
    id: config.id,
    kdf: config.kdf,
    backupPublicKey: config.backupPublicKey,
    backupPrivateKey: config.backupPrivateKey,
    dataKeyEnvelope: publicEncrypt(
      {
        key: decode(config.backupPublicKey, 1024),
        format: 'der',
        type: 'spki',
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      key,
    ).toString('base64'),
  };
}

export async function newBackupProtection(password: unknown, key: Buffer) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 1024)
    throw new Error('备份密码需为 6 到 1024 个字符。');
  return portableProtection(await newProtection(password, key), key);
}

export async function recoverBackupKey(config: BackupConfig, password: unknown) {
  validateBackupConfig(config);
  const wrapping = await derive(password, config.kdf);
  let privateKey: Buffer | undefined, key: Buffer | undefined;
  try {
    if (config.version === 1) key = unseal(config.key, wrapping, keyAad(config), 32);
    else {
      privateKey = unseal(config.backupPrivateKey, wrapping, backupAad(config), 8192);
      key = privateDecrypt(
        {
          key: privateKey,
          format: 'der',
          type: 'pkcs8',
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        decode(config.dataKeyEnvelope, 384, 384),
      );
    }
    if (key.length !== 32) throw new Error();
    return Buffer.from(key);
  } catch {
    throw new Error('备份密码错误或资料保护材料损坏。');
  } finally {
    wrapping.fill(0);
    privateKey?.fill(0);
    key?.fill(0);
  }
}

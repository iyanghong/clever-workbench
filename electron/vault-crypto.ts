import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  generateKeyPair,
  randomBytes,
  randomUUID,
  scrypt,
} from 'node:crypto';

export type Sealed = { version: 1; iv: string; tag: string; ciphertext: string };
export type VaultConfig = {
  version: 1;
  id: string;
  kdf: { name: 'scrypt'; N: 131072; r: 8; p: 1; salt: string };
  key: Sealed;
  backupPublicKey: string;
  backupPrivateKey: Sealed;
};
export const parameters = { name: 'scrypt', N: 131072, r: 8, p: 1 } as const;
export function decode(value: unknown, max: number, exact?: number) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(max / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new Error('保护材料格式无效。');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > max || (exact !== undefined && bytes.length !== exact))
    throw new Error('保护材料长度无效。');
  return bytes;
}
export function validateSealed(value: unknown, max = 1_000_000): asserts value is Sealed {
  if (!value || typeof value !== 'object') throw new Error('加密记录格式无效。');
  const data = value as Sealed;
  if (data.version !== 1) throw new Error('不支持的加密记录版本。');
  decode(data.iv, 12, 12);
  decode(data.tag, 16, 16);
  decode(data.ciphertext, max);
}
export function seal(bytes: Uint8Array, key: Buffer, aad: string): Sealed {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}
export function unseal(value: unknown, key: Buffer, aad: string, max = 1_000_000): Buffer {
  validateSealed(value, max);
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, decode(value.iv, 12, 12), {
      authTagLength: 16,
    });
    cipher.setAAD(Buffer.from(aad));
    cipher.setAuthTag(decode(value.tag, 16, 16));
    const pending = cipher.update(decode(value.ciphertext, max));
    try {
      return Buffer.concat([pending, cipher.final()]);
    } finally {
      pending.fill(0);
    }
  } catch {
    throw new Error('秘密完整性校验失败，无法读取。');
  }
}
export function validateProtection(
  value: unknown,
): asserts value is Omit<VaultConfig, 'version' | 'key'> {
  if (!value || typeof value !== 'object') throw new Error('主密码保护材料缺失。');
  const data = value as VaultConfig;
  if (
    typeof data.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(data.id) ||
    !data.kdf ||
    data.kdf.name !== 'scrypt' ||
    data.kdf.N !== 131072 ||
    data.kdf.r !== 8 ||
    data.kdf.p !== 1
  )
    throw new Error('不支持的主密码保护参数。');
  decode(data.kdf.salt, 16, 16);
  validateSealed(data.backupPrivateKey, 8192);
  const publicKey = createPublicKey({
    key: decode(data.backupPublicKey, 1024),
    format: 'der',
    type: 'spki',
  });
  if (
    publicKey.asymmetricKeyType !== 'rsa' ||
    publicKey.asymmetricKeyDetails?.modulusLength !== 3072
  )
    throw new Error('备份保护材料无效。');
}
export function validateConfig(value: unknown): asserts value is VaultConfig {
  validateProtection(value);
  const data = value as VaultConfig;
  if (data.version !== 1) throw new Error('不支持的主密码保护版本。');
  validateSealed(data.key, 32);
}
export async function derive(password: unknown, kdf: VaultConfig['kdf']) {
  if (typeof password !== 'string' || password.length > 1024 || password.length === 0)
    throw new Error('请输入主密码，最多 1024 个字符。');
  if (kdf.name !== 'scrypt' || kdf.N !== 131072 || kdf.r !== 8 || kdf.p !== 1)
    throw new Error('不支持的主密码保护参数。');
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      decode(kdf.salt, 16, 16),
      32,
      { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(new Error('主密码处理失败，请重试。')) : resolve(key)),
    ),
  );
}
export function keyAad(config: Pick<VaultConfig, 'id'>) {
  return `clever-workbench/vault/1/${config.id}/data-key`;
}
export function backupAad(config: Pick<VaultConfig, 'id' | 'backupPublicKey'>) {
  return `clever-workbench/vault/1/${config.id}/backup-key/${config.backupPublicKey}`;
}
export async function newProtection(password: unknown, dataKey: Buffer): Promise<VaultConfig> {
  if (typeof password !== 'string' || password.length < 6 || password.length > 1024)
    throw new Error('主密码需为 6 到 1024 个字符。');
  const base = {
    version: 1 as const,
    id: randomUUID(),
    kdf: { ...parameters, salt: randomBytes(16).toString('base64') },
  };
  const key = await derive(password, base.kdf);
  let privateKey: Buffer | undefined;
  try {
    const pair = await new Promise<{ publicKey: Buffer; privateKey: Buffer }>((resolve, reject) =>
      generateKeyPair(
        'rsa',
        {
          modulusLength: 3072,
          publicKeyEncoding: { type: 'spki', format: 'der' },
          privateKeyEncoding: { type: 'pkcs8', format: 'der' },
        },
        (error, publicKey, privateKey) =>
          error ? reject(new Error('无法生成备份保护材料。')) : resolve({ publicKey, privateKey }),
      ),
    );
    privateKey = pair.privateKey;
    const config = { ...base, backupPublicKey: pair.publicKey.toString('base64') };
    return {
      ...config,
      key: seal(dataKey, key, keyAad(config)),
      backupPrivateKey: seal(privateKey, key, backupAad(config)),
    };
  } finally {
    key.fill(0);
    privateKey?.fill(0);
  }
}

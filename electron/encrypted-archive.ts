import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  privateDecrypt,
  constants,
  randomBytes,
} from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import { backupAad, decode, derive, unseal } from './vault-crypto';
import { validateBackupConfig, type BackupConfig } from './backup-crypto';

const magic = Buffer.from('CWBK0001');
const portableMagic = Buffer.from('CWBK0002');
const maxHeader = 16 * 1024,
  maxFile = 10 * 1024 ** 3;
type Header = {
  version: 1 | 2;
  algorithm: 'RSA-OAEP-SHA256/AES-256-GCM';
  protection: BackupConfig;
  wrappedKey: string;
  iv: string;
};
async function exact(handle: fsp.FileHandle, length: number, position: number) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error('备份文件被截断。');
    offset += bytesRead;
  }
  return buffer;
}
async function envelope(handle: fsp.FileHandle) {
  const stat = await handle.stat();
  if (!stat.isFile() || stat.size < 28 || stat.size > maxFile)
    throw new Error('备份格式无效或文件超过容量。');
  const lead = await exact(handle, 12, 0);
  const version = lead.subarray(0, 8).equals(magic)
    ? 1
    : lead.subarray(0, 8).equals(portableMagic)
      ? 2
      : null;
  if (!version) throw new Error('备份格式或版本不兼容，需要 Clever Workbench 加密备份。');
  const length = lead.readUInt32BE(8);
  if (length < 2 || length > maxHeader || stat.size < 12 + length + 16)
    throw new Error('备份头部大小无效。');
  const raw = await exact(handle, length, 12);
  let header: Header;
  try {
    header = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('备份头部格式无效。');
  }
  if (!header || header.version !== version || header.algorithm !== 'RSA-OAEP-SHA256/AES-256-GCM')
    throw new Error('备份加密版本不兼容。');
  validateBackupConfig(header.protection);
  if (header.protection.version !== version) throw new Error('备份保护版本不一致。');
  decode(header.wrappedKey, 384, 384);
  decode(header.iv, 12, 12);
  return {
    header,
    prefix: Buffer.concat([lead, raw]),
    start: 12 + length,
    end: stat.size - 17,
    tag: await exact(handle, 16, stat.size - 16),
  };
}
export async function checkEncryptedArchive(filename: string) {
  const handle = await fsp.open(filename, 'r');
  try {
    await envelope(handle);
  } finally {
    await handle.close();
  }
}
export async function encryptArchive(input: Readable, filename: string, protection: BackupConfig) {
  validateBackupConfig(protection);
  const key = randomBytes(32),
    iv = randomBytes(12);
  try {
    const wrapped = publicEncrypt(
      {
        key: decode(protection.backupPublicKey, 1024),
        format: 'der',
        type: 'spki',
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      key,
    );
    const header: Header = {
      version: protection.version,
      algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
      protection,
      wrappedKey: wrapped.toString('base64'),
      iv: iv.toString('base64'),
    };
    const raw = Buffer.from(JSON.stringify(header));
    if (raw.length > maxHeader) throw new Error('备份保护材料过大。');
    const lead = Buffer.alloc(12);
    (protection.version === 1 ? magic : portableMagic).copy(lead);
    lead.writeUInt32BE(raw.length, 8);
    const prefix = Buffer.concat([lead, raw]);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(prefix);
    // Attach the pipeline before the caller starts feeding its ZIP stream.
    fs.writeFileSync(filename, prefix, { flag: 'wx', mode: 0o600 });
    let size = prefix.length + 16;
    const limit = new Transform({
      transform(chunk, _encoding, done) {
        size += chunk.length;
        if (size > maxFile) return done(new Error('备份超过容量上限。'));
        done(null, chunk);
      },
    });
    await pipeline(
      input,
      limit,
      cipher,
      fs.createWriteStream(filename, { flags: 'a', mode: 0o600 }),
    );
    await fsp.appendFile(filename, cipher.getAuthTag());
  } finally {
    key.fill(0);
  }
}
export async function decryptArchive(
  filename: string,
  destination: string,
  password: unknown,
): Promise<BackupConfig> {
  const handle = await fsp.open(filename, 'r');
  let wrapping: Buffer | undefined, privateKey: Buffer | undefined, key: Buffer | undefined;
  try {
    const data = await envelope(handle);
    wrapping = await derive(password, data.header.protection.kdf);
    try {
      privateKey = unseal(
        data.header.protection.backupPrivateKey,
        wrapping,
        backupAad(data.header.protection),
        8192,
      );
      key = privateDecrypt(
        {
          key: privateKey,
          format: 'der',
          type: 'pkcs8',
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        decode(data.header.wrappedKey, 384, 384),
      );
      if (key.length !== 32) throw new Error();
    } catch {
      throw new Error('备份密码错误或保护材料损坏。');
    }
    const cipher = createDecipheriv('aes-256-gcm', key, decode(data.header.iv, 12, 12), {
      authTagLength: 16,
    });
    cipher.setAAD(data.prefix);
    cipher.setAuthTag(data.tag);
    try {
      await pipeline(
        handle.createReadStream({ start: data.start, end: data.end, autoClose: false }),
        cipher,
        fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
      );
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === 'ENOSPC') throw new Error('磁盘空间不足，无法预检备份。');
      if (code === 'EACCES' || code === 'EPERM')
        throw new Error('无法写入恢复预检目录，请检查权限。');
      throw new Error('备份认证校验失败，文件可能已损坏或被修改。');
    }
    return data.header.protection;
  } catch (cause) {
    await fsp.rm(destination, { force: true });
    throw cause;
  } finally {
    wrapping?.fill(0);
    privateKey?.fill(0);
    key?.fill(0);
    await handle.close();
  }
}

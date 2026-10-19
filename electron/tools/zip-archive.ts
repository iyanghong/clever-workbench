import fs from 'node:fs/promises';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl';
import { crc32 } from 'node:zlib';
import type { ToolProgress } from '../../src/tool-types';

export const MAX_TEXT_SIZE = 200_000_000;
const HEADER_SIZE = 37;
export type Report = (value: ToolProgress) => void;
export type Own = (filename: string) => void;
const quiet: Report = () => {};
const noOwner: Own = () => {};
async function readExactly(file: fs.FileHandle, size: number, position: number) {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = await file.read(buffer, offset, size - offset, position + offset);
    if (!read.bytesRead) throw new Error('文件读取不完整，处理期间内容可能已变化。');
    offset += read.bytesRead;
  }
  return buffer;
}
export function checkNames(names: string[]) {
  const seen = new Set<string>();
  for (const name of names) {
    if (
      !name ||
      name === '.' ||
      name === '..' ||
      /[ .]$|[<>:"/\\|?*\x00-\x1f]/.test(name) ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)
    )
      throw new Error(`文件名无法跨平台安全还原：${name}`);
    // Full case folding for the common multi-character folds, including German sharp S.
    const folded = name.normalize('NFC').toUpperCase().toLowerCase();
    if (seen.has(folded)) throw new Error(`同一目录中有跨平台重名项：${name}`);
    seen.add(folded);
  }
}
export async function ordinaryPath(input: string, directory = false) {
  if (typeof input !== 'string' || !input.trim() || input.length > 32768 || input.includes('\0'))
    throw new Error('请输入有效的本地路径。');
  const expanded = input.startsWith('~/')
    ? path.join((await import('node:os')).homedir(), input.slice(2))
    : input;
  const stat = await fs.lstat(expanded);
  if (
    stat.isSymbolicLink() ||
    !(directory ? stat.isDirectory() : stat.isFile() || stat.isDirectory())
  )
    throw new Error('请选择普通文件或目录，不支持符号链接或特殊文件。');
  return fs.realpath(expanded);
}
function relativeParts(name: string) {
  const parts = name.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..') || name.includes('\\'))
    throw new Error(`包含不安全路径：${name}`);
  for (const part of parts) checkNames([part]);
  return parts;
}
function checkTree(names: string[]) {
  const children = new Map<string, Set<string>>();
  for (const name of names) {
    const parts = relativeParts(name);
    parts.forEach((part, depth) => {
      const parent = parts.slice(0, depth).join('/');
      if (!children.has(parent)) children.set(parent, new Set());
      children.get(parent)!.add(part);
    });
  }
  for (const names of children.values()) checkNames([...names]);
}
export async function inspectFiles(source: string, names: string[]) {
  source = await ordinaryPath(source, true);
  checkNames([path.basename(source)]);
  const available: string[] = [],
    missing: string[] = [];
  for (const name of [...new Set(names)].sort()) {
    const parts = relativeParts(name);
    let item = source,
      absent = false;
    for (let i = 0; i < parts.length; i++) {
      item = path.join(item, parts[i]);
      const stat = await fs.lstat(item).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
        throw error;
      });
      if (!stat) {
        absent = true;
        break;
      }
      if (stat.isSymbolicLink() || !(i === parts.length - 1 ? stat.isFile() : stat.isDirectory()))
        throw new Error(`不支持符号链接、子模块或特殊文件：${name}`);
    }
    (absent ? missing : available).push(name);
  }
  checkTree(available);
  return { available, missing };
}
type Entry = { name: string; file?: string; size: number };
async function makeZip(
  source: string,
  target: string,
  files: string[] | undefined,
  report: Report,
) {
  report({ phase: '扫描文件', processed: 0, total: null });
  const entries: Entry[] = [];
  checkNames([path.basename(source)]);
  if (files) {
    const { available, missing } = await inspectFiles(source, files);
    if (missing.length) throw new Error('文件清单已变化，请重新预览。');
    if (!available.length) throw new Error('没有可打包文件。');
    entries.push({ name: `${path.basename(source)}/`, size: 0 });
    for (const name of available) {
      const file = path.join(source, name);
      entries.push({
        name: `${path.basename(source)}/${name}`,
        file,
        size: (await fs.stat(file)).size,
      });
    }
  } else {
    const walk = async (file: string, name: string) => {
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || !(stat.isDirectory() || stat.isFile()))
        throw new Error(`不支持符号链接或特殊文件：${name}`);
      if (stat.isFile()) {
        entries.push({ name, file, size: stat.size });
        return;
      }
      entries.push({ name: `${name}/`, size: 0 });
      const children = (await fs.readdir(file)).sort();
      checkNames(children);
      for (const child of children) await walk(path.join(file, child), `${name}/${child}`);
    };
    await walk(source, path.basename(source));
  }
  let processed = 0;
  const total = entries.reduce((sum, item) => sum + item.size, 0);
  report({ phase: '压缩文件', processed, total });
  const zip = new yazl.ZipFile();
  const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
  zip.on('error', (error) => output.destroy(error));
  const completion = pipeline(zip.outputStream, output);
  for (const entry of entries) {
    if (!entry.file) {
      zip.addEmptyDirectory(entry.name);
      continue;
    }
    zip.addReadStreamLazy(entry.name, {}, (callback) => {
      // Recheck selected paths immediately before reading; never follow a swapped final symlink.
      void (async () => {
        const relative = path.relative(source, entry.file!).split(path.sep).join('/');
        if (relative) {
          const check = await inspectFiles(source, [relative]);
          if (check.missing.length) throw new Error(`文件已移除：${entry.name}`);
        }
        const handle = await fs.open(entry.file!, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        if (!(await handle.stat()).isFile()) {
          await handle.close();
          throw new Error('输入不再是普通文件。');
        }
        const stream = handle.createReadStream();
        stream.on('data', (chunk: Buffer) => {
          processed += chunk.length;
          report({
            phase: '压缩文件',
            processed,
            total: Math.max(total, processed),
            filename: entry.name,
          });
        });
        callback(null, stream);
      })().catch((error) => callback(error, undefined!));
    });
  }
  zip.end();
  await completion;
  report({ phase: '压缩文件', processed, total: processed });
}
function key(password: string, salt: Buffer) {
  if (typeof password !== 'string' || !password.length) throw new Error('密码不能为空。');
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}
function header(salt: Buffer, archive: Buffer, index: number, count: number) {
  const data = Buffer.alloc(HEADER_SIZE);
  data.write('ZTXT1');
  salt.copy(data, 5);
  archive.copy(data, 21);
  data.writeUInt32BE(index, 29);
  data.writeUInt32BE(count, 33);
  return data;
}
export function parsePart(data: Buffer) {
  if (data.length < HEADER_SIZE + 16 || data.toString('ascii', 0, 5) !== 'ZTXT1')
    throw new Error('不是有效的 ZIP 文本分片，或分片内容不完整。');
  const index = data.readUInt32BE(29),
    count = data.readUInt32BE(33);
  if (index < 1 || index > count || count > 999999) throw new Error('文本分片序号无效。');
  return { index, count, identity: data.subarray(5, 29).toString('hex') };
}
export function decodePart(encoded: Buffer) {
  if (encoded.at(-1) === 0) encoded = encoded.subarray(0, -1);
  if (!encoded.length || encoded.length > MAX_TEXT_SIZE)
    throw new Error('分片不能为空，且每片最多 200 MB。');
  const text = encoded.toString('latin1');
  // Node's base64 decoder silently ignores invalid bytes; validate before decoding.
  let padding = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 61) {
      padding++;
      if (i < text.length - 2 || padding > 2) throw new Error('TXT 分片不是有效 Base64。');
    } else if (
      padding ||
      !(
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 43 ||
        c === 47
      )
    )
      throw new Error('TXT 分片不是有效 Base64。');
  }
  if (text.length % 4) throw new Error('TXT 分片不是完整 Base64。');
  const data = Buffer.from(text, 'base64');
  parsePart(data);
  return data;
}
async function outputParent(selected: string, fallback: string) {
  return selected ? ordinaryPath(selected, true) : fallback;
}
async function refuseExisting(output: string) {
  const exists = await fs.lstat(output).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (exists) throw new Error(`目标目录已存在，请选择其他输出位置：${output}`);
}
export async function encryptPath(
  input: string,
  password: string,
  outputDir = '',
  partSizeMB = 50,
  files?: string[],
  report: Report = quiet,
  own: Own = noOwner,
) {
  if (!Number.isInteger(partSizeMB) || partSizeMB < 1 || partSizeMB > 200)
    throw new Error('每个 TXT 上限必须是 1～200 之间的整数 MB。');
  const source = await ordinaryPath(input);
  if (source === path.dirname(source)) throw new Error('不能归档根目录。');
  const output = path.join(
    await outputParent(outputDir, path.dirname(source)),
    `${path.basename(source)}.txtparts`,
  );
  await refuseExisting(output);
  const salt = randomBytes(16),
    archive = randomBytes(8),
    secret = key(password, salt);
  const temporary = await fs.mkdtemp(path.join(path.dirname(source), '.ztxt-'));
  own(temporary);
  let created = false;
  try {
    const zipPath = path.join(temporary, 'archive.zip');
    await makeZip(source, zipPath, files, report);
    const size = (await fs.stat(zipPath)).size;
    const chunkSize = Math.floor((partSizeMB * 1_000_000) / 4) * 3 - HEADER_SIZE - 16;
    const count = Math.max(1, Math.ceil(size / chunkSize));
    if (count > 999999) throw new Error('分片数量超过 999999。');
    await fs.mkdir(output, { mode: 0o700 });
    created = true;
    own(output);
    const file = await fs.open(zipPath, 'r');
    try {
      let processed = 0;
      for (let index = 1; index <= count; index++) {
        const head = header(salt, archive, index, count);
        const nonce = Buffer.concat([archive, head.subarray(29, 33)]);
        const cipher = createCipheriv('aes-256-gcm', secret, nonce);
        cipher.setAAD(head);
        const chunk = await readExactly(file, Math.min(chunkSize, size - processed), processed);
        const encoded = Buffer.concat([
          head,
          cipher.update(chunk),
          cipher.final(),
          cipher.getAuthTag(),
        ]).toString('base64');
        const filename = `part-${String(index).padStart(6, '0')}.txt`;
        await fs.writeFile(path.join(output, filename), encoded, { flag: 'wx', mode: 0o600 });
        processed += chunk.length;
        report({ phase: '加密生成 TXT', processed, total: size, filename });
      }
    } finally {
      await file.close();
    }
    return output;
  } catch (error) {
    if (created) await fs.rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    secret.fill(0);
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
async function openZip(filename: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(
      filename,
      { lazyEntries: true, autoClose: false, strictFileNames: true },
      (error, zip) => (error ? reject(error) : resolve(zip!)),
    ),
  );
}
async function entriesFor(zip: yauzl.ZipFile) {
  return new Promise<yauzl.Entry[]>((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('entry', (entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.once('end', () => resolve(entries));
    zip.once('error', reject);
    zip.readEntry();
  });
}
async function extractZip(filename: string, output: string, report: Report, own: Own) {
  const zip = await openZip(filename);
  let created = false;
  try {
    const entries = await entriesFor(zip),
      names = new Set<string>();
    for (const entry of entries) {
      const name = entry.fileName.replace(/\/$/, '');
      relativeParts(name);
      if (names.has(name)) throw new Error(`ZIP 包含重复路径：${name}`);
      names.add(name);
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (![0, 0o100000, 0o040000].includes(mode)) throw new Error('ZIP 包含符号链接或特殊文件。');
    }
    checkTree([...names]);
    const fileNames = new Set(
      entries.filter((e) => !e.fileName.endsWith('/')).map((e) => e.fileName),
    );
    for (const name of names) {
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++)
        if (fileNames.has(parts.slice(0, i).join('/'))) throw new Error('ZIP 文件与目录路径冲突。');
    }
    await fs.mkdir(output, { mode: 0o700 });
    created = true;
    own(output);
    const total = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    let processed = 0;
    report({ phase: '解压文件', processed, total });
    for (const entry of entries) {
      const target = path.join(output, ...entry.fileName.split('/'));
      if (entry.fileName.endsWith('/')) {
        await fs.mkdir(target, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
        zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream!))),
      );
      let checksum = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          checksum = crc32(chunk, checksum);
          processed += chunk.length;
          report({ phase: '解压文件', processed, total, filename: entry.fileName });
          callback(null, chunk);
        },
      });
      await pipeline(stream, meter, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      if (checksum !== entry.crc32) throw new Error(`ZIP 文件校验失败：${entry.fileName}`);
    }
    report({ phase: '解压文件', processed, total: processed });
  } catch (error) {
    if (created) await fs.rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    zip.close();
  }
}
export async function decryptPath(
  input: string,
  password: string,
  outputDir = '',
  report: Report = quiet,
  own: Own = noOwner,
) {
  const source = await ordinaryPath(input, true);
  const output = path.join(await outputParent(outputDir, source), 'restored');
  await refuseExisting(output);
  const names = (await fs.readdir(source))
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .sort();
  if (!names.length || names.length > 999999) throw new Error('目录中没有一套有效的 TXT 分片。');
  let total = 0;
  for (const [i, name] of names.entries()) {
    if (name !== `part-${String(i + 1).padStart(6, '0')}.txt`)
      throw new Error('TXT 分片混杂、缺失或命名错误。');
    const stat = await fs.lstat(path.join(source, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEXT_SIZE + 1)
      throw new Error('TXT 分片无效或超过 200 MB。');
    total += stat.size;
  }
  const temporary = await fs.mkdtemp(path.join(source, '.ztxt-'));
  own(temporary);
  let secret: Buffer | undefined;
  try {
    const zipPath = path.join(temporary, 'archive.zip'),
      file = await fs.open(zipPath, 'wx', 0o600);
    try {
      let identity = '',
        processed = 0;
      for (const [i, name] of names.entries()) {
        const part = await fs.open(
          path.join(source, name),
          constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
        );
        let encoded: Buffer;
        try {
          const stat = await part.stat();
          if (!stat.isFile() || stat.size > MAX_TEXT_SIZE + 1)
            throw new Error('TXT 分片无效或超过 200 MB。');
          encoded = await readExactly(part, stat.size, 0);
        } finally {
          await part.close();
        }
        const data = decodePart(encoded),
          meta = parsePart(data);
        if (meta.index !== i + 1 || meta.count !== names.length)
          throw new Error('TXT 分片格式或顺序错误。');
        if (i === 0) {
          identity = meta.identity;
          secret = key(password, data.subarray(5, 21));
        }
        if (identity !== meta.identity) throw new Error('TXT 分片来自不同归档。');
        const decipher = createDecipheriv(
          'aes-256-gcm',
          secret!,
          Buffer.concat([data.subarray(21, 29), data.subarray(29, 33)]),
        );
        decipher.setAAD(data.subarray(0, HEADER_SIZE));
        decipher.setAuthTag(data.subarray(-16));
        let decoded: Buffer;
        try {
          decoded = Buffer.concat([
            decipher.update(data.subarray(HEADER_SIZE, -16)),
            decipher.final(),
          ]);
        } catch {
          throw new Error(`密码错误或分片已损坏：${name}`);
        }
        await file.writeFile(decoded);
        processed += encoded.length;
        report({ phase: '校验解密 TXT', processed, total, filename: name });
      }
    } finally {
      await file.close();
    }
    await extractZip(zipPath, output, report, own);
    return output;
  } finally {
    secret?.fill(0);
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

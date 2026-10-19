import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, createCipheriv, scryptSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import * as yazl from 'yazl';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { runToolWorker } from '../electron/tools/runner';
import { encryptPath, decryptPath, decodePart } from '../electron/tools/zip-archive';
import { storePart, collectionStatus } from '../electron/tools/clipboard-parts';
import { gitBranches, gitCommits, gitPreview, dateBounds } from '../electron/tools/git-files';
import { ZipTextTool } from '../electron/tools/zip-tool';
import { Store } from '../electron/store';

const roots: string[] = [];
const stores: Store[] = [];
async function temporary() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-zip-test-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture(root: string) {
  const source = path.join(root, '示例');
  await fs.mkdir(path.join(source, '空目录'), { recursive: true });
  await fs.writeFile(path.join(source, '空文件'), '');
  await fs.writeFile(path.join(source, '.隐藏'), 'hidden');
  await fs.writeFile(path.join(source, '正文.txt'), '你好，ZIP 文本归档。');
  await fs.writeFile(path.join(source, '二进制.bin'), randomBytes(1_600_000));
  return source;
}
async function assertSame(source: string, restored: string) {
  expect((await fs.readdir(restored)).sort()).toEqual((await fs.readdir(source)).sort());
  for (const name of await fs.readdir(source)) {
    const original = path.join(source, name),
      target = path.join(restored, name);
    if ((await fs.stat(original)).isDirectory()) await assertSame(original, target);
    else expect(await fs.readFile(target)).toEqual(await fs.readFile(original));
  }
}
test('原 Python 工具生成的固定样例可在无 Python 环境还原', async () => {
  const root = await temporary();
  await fs.copyFile('tests/fixtures/zip-text/legacy-part.txt', path.join(root, 'part-000001.txt'));
  const output = await decryptPath(root, 'fixture-only-测试');
  expect(await fs.readFile(path.join(output, '互通样例', '说明.txt'), 'utf8')).toBe(
    '来自原 Python 工具的兼容样例。\n',
  );
  expect(await fs.readFile(path.join(output, '互通样例', 'binary.bin'))).toEqual(
    Buffer.from(Array.from({ length: 16 }, (_, index) => index)),
  );
  expect(await fs.readdir(path.join(output, '互通样例', '空目录'))).toEqual([]);
});
test('多片归档保留中文、二进制、隐藏文件和空目录；密码、缺片和已存在输出受保护', async () => {
  const root = await temporary(),
    source = await fixture(root),
    password = ' 空格与中文🔑 ';
  const parts = await encryptPath(source, password, '', 1);
  const files = (await fs.readdir(parts)).sort();
  expect(files.length).toBeGreaterThan(1);
  expect((await fs.stat(path.join(parts, files[0]))).size).toBe(1_000_000);
  await expect(decryptPath(parts, '错误')).rejects.toThrow('密码错误');
  await expect(fs.stat(path.join(parts, 'restored'))).rejects.toMatchObject({ code: 'ENOENT' });
  const output = await decryptPath(parts, password);
  await assertSame(source, path.join(output, '示例'));
  await expect(encryptPath(source, password)).rejects.toThrow('已存在');
  await expect(decryptPath(parts, password)).rejects.toThrow('已存在');
  await fs.rm(output, { recursive: true });
  await fs.rename(path.join(parts, files[0]), path.join(parts, 'wrong.txt'));
  await expect(decryptPath(parts, password)).rejects.toThrow('缺失或命名');
});
test('ZIP 输入仍作为普通文件；磁盘仅接受单个末尾 NUL，不自动去除空白', async () => {
  const root = await temporary(),
    source = path.join(root, '原始.zip');
  await fs.writeFile(source, 'opaque zip bytes');
  const parts = await encryptPath(source, ' '),
    first = path.join(parts, 'part-000001.txt'),
    encoded = await fs.readFile(first);
  await fs.writeFile(first, Buffer.concat([encoded, Buffer.from('\0')]));
  const result = await decryptPath(parts, ' ');
  expect(await fs.readFile(path.join(result, '原始.zip'), 'utf8')).toBe('opaque zip bytes');
  await fs.rm(result, { recursive: true });
  await fs.writeFile(first, Buffer.concat([encoded, Buffer.from('\n')]));
  await expect(decryptPath(parts, ' ')).rejects.toThrow('Base64');
  expect(() => decodePart(Buffer.concat([encoded, Buffer.from('\0\0')]))).toThrow('Base64');
});
test('粘贴分片流式去空白、乱序收齐，识别重复、混包及截断，失败不覆盖旧文件', async () => {
  const root = await temporary(),
    source = await fixture(root),
    parts = await encryptPath(source, 'test', '', 1);
  const collected = [];
  for (const [index, name] of (await fs.readdir(parts)).sort().reverse().entries()) {
    const text = await fs.readFile(path.join(parts, name));
    async function* chunks() {
      for (let i = 0; i < text.length; i += 9001)
        yield Buffer.concat([text.subarray(i, i + 9001), Buffer.from(' \r\n\t')]);
      yield Buffer.from('\0');
    }
    const target = path.join(root, `paste-${index}`);
    collected.push({ ...(await storePart(chunks(), target, () => {})), id: String(index) });
    await expect(storePart(chunks(), target, () => {})).rejects.toMatchObject({ code: 'EEXIST' });
    expect((await fs.stat(target)).size).toBe(text.length);
  }
  expect(collectionStatus(collected).ready).toBe(true);
  expect(collectionStatus(collected.slice(1)).description).toContain('缺少');
  expect(collectionStatus([...collected, collected[0]]).description).toContain('重复');
  expect(
    collectionStatus([collected[0], { ...collected[1], identity: 'another' }]).description,
  ).toContain('不同归档');
  async function* invalid() {
    yield Buffer.from('a'.repeat(100) + '!');
  }
  const rejected = path.join(root, 'invalid');
  await expect(storePart(invalid(), rejected, () => {})).rejects.toThrow('Base64');
  await expect(fs.stat(rejected)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('拒绝符号链接、跨平台大小写冲突和非法文件名', async () => {
  const root = await temporary(),
    source = path.join(root, 'source');
  await fs.mkdir(source);
  await fs.writeFile(path.join(root, 'outside'), 'keep');
  await fs.symlink(path.join(root, 'outside'), path.join(source, 'link'));
  await expect(encryptPath(source, 'test')).rejects.toThrow('符号链接');
  await fs.rm(path.join(source, 'link'));
  await fs.writeFile(path.join(source, 'CON.txt'), 'invalid');
  await expect(encryptPath(source, 'test')).rejects.toThrow('跨平台');
});

test('已通过 GCM 认证的恶意 ZIP 路径、链接、重复项和 CRC 损坏仍拒绝且清理输出', async () => {
  const root = await temporary();
  const archive = async (duplicate = false) => {
    const zip = new yazl.ZipFile(),
      chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve) => {
      zip.outputStream.on('data', (chunk) => chunks.push(chunk));
      zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
    zip.addBuffer(Buffer.from('payload'), 'safe.txt', { compress: false });
    if (duplicate) zip.addBuffer(Buffer.from('another'), 'safe.txt');
    zip.end();
    return done;
  };
  const valid = await archive();
  const badCRC = Buffer.from(valid);
  badCRC[badCRC.indexOf('payload')] ^= 1;
  const traversal = Buffer.from(valid);
  for (
    let offset = traversal.indexOf('safe.txt');
    offset >= 0;
    offset = traversal.indexOf('safe.txt', offset + 8)
  )
    traversal.write('../x.txt', offset);
  const link = Buffer.from(valid),
    central = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  link.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
  for (const [name, bytes] of [
    ['crc', badCRC],
    ['traversal', traversal],
    ['link', link],
    ['duplicate', await archive()],
  ] as const) {
    const data = name === 'duplicate' ? await archive(true) : bytes;
    const parts = path.join(root, name);
    await fs.mkdir(parts);
    const salt = randomBytes(16),
      archiveId = randomBytes(8),
      header = Buffer.alloc(37);
    header.write('ZTXT1');
    salt.copy(header, 5);
    archiveId.copy(header, 21);
    header.writeUInt32BE(1, 29);
    header.writeUInt32BE(1, 33);
    const key = scryptSync('test', salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
    const cipher = createCipheriv(
      'aes-256-gcm',
      key,
      Buffer.concat([archiveId, header.subarray(29, 33)]),
    );
    cipher.setAAD(header);
    const encoded = Buffer.concat([
      header,
      cipher.update(data),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
    await fs.writeFile(path.join(parts, 'part-000001.txt'), encoded);
    await expect(decryptPath(parts, 'test')).rejects.toThrow();
    expect(await fs.readdir(parts)).toEqual(['part-000001.txt']);
  }
  await expect(fs.stat(path.join(root, 'x.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('后台进程意外退出时仅清理其创建的本次文件', async () => {
  const root = await temporary(),
    worker = path.join(root, 'crash.cjs'),
    owned = path.join(root, 'owned'),
    untouched = path.join(root, 'untouched');
  await fs.writeFile(untouched, 'keep');
  await fs.writeFile(
    worker,
    `const {parentPort, workerData} = require('node:worker_threads'); require('node:fs').mkdirSync(workerData); parentPort.postMessage({type:'owned',filename:workerData}); setTimeout(()=>process.exit(1),10);`,
  );
  await expect(runToolWorker(worker, owned, () => {})).rejects.toThrow('意外退出');
  await expect(fs.stat(owned)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fs.readFile(untouched, 'utf8')).toBe('keep');
});
test('Git 字面目录范围、作者筛选、删除路径、当前磁盘内容及过期预览', async () => {
  const root = await temporary();
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', '测试作者');
  git('config', 'user.email', 'test@example.invalid');
  const source = path.join(root, '范围[1]');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'a.txt'), 'committed');
  await fs.writeFile(path.join(source, 'deleted.txt'), 'delete');
  await fs.writeFile(path.join(root, 'outside.txt'), 'outside');
  git('add', '.');
  git('commit', '-m', 'first');
  const first = git('rev-parse', 'HEAD');
  await fs.rm(path.join(source, 'deleted.txt'));
  git('add', '.');
  git('commit', '-m', 'delete');
  const second = git('rev-parse', 'HEAD');
  await fs.writeFile(path.join(source, 'a.txt'), 'current uncommitted');
  const branches = await gitBranches(source);
  expect(branches.branch).toBe('refs/heads/main');
  const commits = await gitCommits({
    source,
    branch: branches.branch,
    author: 'TEST@',
    start: '',
    end: '',
    recentHours: 0,
  });
  expect(commits).toHaveLength(2);
  const preview = await gitPreview(source, [first, second]);
  expect(preview.available).toEqual(['a.txt']);
  expect(preview.missing).toEqual(['deleted.txt']);
  const parts = await encryptPath(source, 'test', root, 1, preview.available);
  const restored = await decryptPath(parts, 'test');
  expect(await fs.readFile(path.join(restored, '范围[1]', 'a.txt'), 'utf8')).toBe(
    'current uncommitted',
  );
  const worker = path.join(root, 'zip-worker.cjs');
  await build({
    entryPoints: ['electron/tools/zip-worker.ts'],
    outfile: worker,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
  });
  await fs.rm(path.join(source, 'a.txt'));
  await expect(
    runToolWorker(
      worker,
      {
        type: 'pack',
        settings: { source, outputDir: root, partSizeMB: 1 },
        password: 'test',
        preview,
      },
      () => {},
    ),
  ).rejects.toThrow('范围已变化');
  expect(() => dateBounds('2025-02-29', '')).toThrow('日期无效');
  expect(() => dateBounds('2026-10-20', '2026-10-19')).toThrow('不能晚于');
});

test.skipIf(!process.env.ZIP_TOOL_LARGE)(
  '200 MB 上限的真实分片可归档、流式粘贴校验及还原，主线程保持响应',
  { timeout: 120000 },
  async () => {
    const root = await temporary(),
      source = path.join(root, 'large.bin'),
      worker = path.join(root, 'zip-worker.cjs');
    const file = await fs.open(source, 'wx');
    try {
      for (let i = 0; i < 151; i++) await file.writeFile(randomBytes(1_000_000));
    } finally {
      await file.close();
    }
    await build({
      entryPoints: ['electron/tools/zip-worker.ts'],
      outfile: worker,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
    });
    const store = new Store(path.join(root, 'data'));
    stores.push(store);
    const tool = new ZipTextTool(store, worker);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      tool.snapshot();
    }, 100);
    try {
      tool.command({
        type: 'pack',
        settings: { source, outputDir: root, partSizeMB: 200 },
        password: 'large',
      });
      await tool.whenIdle();
      expect(tool.snapshot().error).toBe('');
      expect(ticks).toBeGreaterThan(5);
      const parts = tool.snapshot().output,
        first = path.join(parts, 'part-000001.txt');
      expect((await fs.stat(first)).size).toBe(200_000_000);
      const imported = await storePart(
        createReadStream(first),
        path.join(root, 'pasted'),
        () => {},
      );
      expect(imported.size).toBe(200_000_000);
      expect(imported.count).toBe(2);
      tool.command({
        type: 'restore',
        settings: { source: parts, outputDir: root, partSizeMB: 200 },
        password: 'large',
      });
      await tool.whenIdle();
      expect(tool.snapshot().error).toBe('');
      const digest = async (filename: string) => {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(filename)) hash.update(chunk);
        return hash.digest('hex');
      };
      expect(await digest(path.join(tool.snapshot().output, 'large.bin'))).toBe(
        await digest(source),
      );
    } finally {
      clearInterval(timer);
      await tool.dispose();
    }
  },
);

test('后台控制器拒绝重入，成功与失败都完成生命周期，工具偏好不保存密码', async () => {
  const root = await temporary(),
    source = await fixture(root),
    worker = path.join(root, 'zip-worker.cjs');
  await build({
    entryPoints: ['electron/tools/zip-worker.ts'],
    outfile: worker,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
  });
  const store = new Store(path.join(root, 'data'));
  stores.push(store);
  const tool = new ZipTextTool(store, worker),
    settings = { source, outputDir: root, partSizeMB: 1 };
  tool.command({ type: 'pack', settings, password: 'private' });
  expect(tool.snapshot().busy).toBe(true);
  expect(() => tool.command({ type: 'pack', settings, password: 'private' })).toThrow('仍在处理');
  await expect(tool.dispose()).rejects.toThrow('正在处理');
  await tool.whenIdle();
  expect(tool.snapshot().error).toBe('');
  expect(tool.snapshot().output).toBe(await fs.realpath(path.join(root, '示例.txtparts')));
  expect(store.get('zipTextSettings', {})).toEqual(settings);
  tool.command({
    type: 'restore',
    settings: { ...settings, source: tool.snapshot().output },
    password: 'wrong',
  });
  await tool.whenIdle();
  expect(tool.snapshot().busy).toBe(false);
  expect(tool.snapshot().error).toContain('密码错误');
  await tool.dispose();
});

test.skipIf(!process.env.ZIP_TOOL_REFERENCE || !process.env.ZIP_TOOL_PYTHON)(
  '与原 Python 工具双向真实互通',
  async () => {
    const root = await temporary(),
      source = await fixture(root),
      referenceOutput = path.join(root, 'python-output'),
      nodeOutput = path.join(root, 'node-output');
    await fs.mkdir(referenceOutput);
    await fs.mkdir(nodeOutput);
    const password = '互通🔑 password';
    const python = (code: string, ...args: string[]) =>
      execFileSync(process.env.ZIP_TOOL_PYTHON!, ['-B', '-c', code, ...args], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: process.env.ZIP_TOOL_REFERENCE },
      }).trim();
    const oldParts = python(
      'import sys; from zip_to_txt import encrypt_path; print(encrypt_path(sys.argv[1], sys.argv[2], output_dir=sys.argv[3], part_size_mb=1))',
      source,
      password,
      referenceOutput,
    );
    const nodeRestored = await decryptPath(oldParts, password);
    await assertSame(source, path.join(nodeRestored, '示例'));
    const newParts = await encryptPath(source, password, nodeOutput, 1);
    const oldRestored = python(
      'import sys; from zip_to_txt import decrypt_path; print(decrypt_path(sys.argv[1], sys.argv[2]))',
      newParts,
      password,
    );
    await assertSame(source, path.join(oldRestored, '示例'));
  },
);

import nodeFs from 'node:fs';
// Electron's patched fs treats app.asar as a mounted archive even while it is
// still being written. Bundle staging must always use the actual filesystem.
const rawFs: typeof nodeFs = process.versions.electron ? require('original-fs') : nodeFs;
const fs = rawFs.promises;
const createWriteStream = rawFs.createWriteStream;
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as yauzl from 'yauzl';

export type RunCommand = (command: string, args: string[]) => Promise<string>;
export const runCommand: RunCommand = async (command, args) =>
  (await promisify(execFile)(command, args, { timeout: 60000, maxBuffer: 1024 * 1024 })).stdout;
export async function extractBundle(
  zipPath: string,
  destination: string,
  version: string,
  run: RunCommand,
) {
  const archive = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (error, zip) =>
      error ? reject(error) : resolve(zip!),
    ),
  );
  const links: { filename: string; target: string }[] = [];
  const seen = new Set<string>();
  let total = 0,
    count = 0;
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      archive.close();
      reject(error);
    };
    archive.on('error', fail);
    archive.on('end', resolve);
    archive.on('entry', async (entry: yauzl.Entry) => {
      try {
        const name = entry.fileName;
        if (
          ++count > 100000 ||
          name.includes('\\') ||
          name.includes('\0') ||
          name.split('/').some((x) => x === '..' || x === '.') ||
          !name.startsWith('Clever Workbench.app/') ||
          seen.has(name.toLowerCase()) ||
          (total += entry.uncompressedSize) > 3 * 1024 ** 3
        )
          throw Error('更新压缩包包含不安全路径、重复条目或过大内容。');
        seen.add(name.toLowerCase());
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff,
          kind = mode & 0o170000;
        const filename = path.join(destination, name);
        if (name.endsWith('/')) {
          if (kind && kind !== 0o040000) throw Error('更新包目录类型无效。');
          await fs.mkdir(filename, { recursive: true });
        } else {
          if (kind && kind !== 0o100000 && kind !== 0o120000) throw Error('更新包文件类型无效。');
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) =>
            archive.openReadStream(entry, (e, s) => (e ? rej(e) : res(s!))),
          );
          if (kind === 0o120000) {
            if (entry.uncompressedSize > 4096) throw Error('更新包链接无效。');
            const chunks: Buffer[] = [];
            for await (const chunk of stream as any) chunks.push(chunk);
            const target = Buffer.concat(chunks).toString('utf8');
            const resolved = path.resolve(path.dirname(filename), target),
              root = path.join(destination, 'Clever Workbench.app');
            if (
              !target ||
              target.includes('\0') ||
              path.isAbsolute(target) ||
              !resolved.startsWith(root + path.sep)
            )
              throw Error('更新包链接超出应用范围。');
            links.push({ filename, target });
          } else {
            await fs.mkdir(path.dirname(filename), { recursive: true });
            await pipeline(
              stream,
              createWriteStream(filename, { flags: 'wx', mode: mode & 0o777 || 0o644 }),
            );
          }
        }
        archive.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    archive.readEntry();
  });
  for (const link of links) {
    const relative = path.relative(destination, link.filename).toLowerCase();
    if ([...seen].some((name) => name.startsWith(relative + '/')))
      throw Error('更新包不能在链接下写入文件。');
    await fs.mkdir(path.dirname(link.filename), { recursive: true });
  }
  for (const link of links) {
    await fs.symlink(link.target, link.filename);
  }
  const appPath = path.join(destination, 'Clever Workbench.app');
  const realRoot = await fs.realpath(appPath);
  for (const link of links) {
    if (!(await fs.realpath(link.filename)).startsWith(realRoot + path.sep))
      throw Error('更新包链接超出应用范围。');
  }
  const info = JSON.parse(
    await run('/usr/bin/plutil', [
      '-convert',
      'json',
      '-o',
      '-',
      path.join(appPath, 'Contents/Info.plist'),
    ]),
  );
  if (
    info.CFBundleIdentifier !== 'com.cleverworkbench.desktop' ||
    info.CFBundleShortVersionString !== version ||
    typeof info.CFBundleExecutable !== 'string' ||
    path.basename(info.CFBundleExecutable) !== info.CFBundleExecutable
  )
    throw Error('更新包应用身份或版本不匹配。');
  const executable = path.join(appPath, 'Contents/MacOS', info.CFBundleExecutable);
  if (
    !(await fs.stat(executable)).isFile() ||
    !(await fs.realpath(executable)).startsWith(realRoot + path.sep)
  )
    throw Error('更新包主程序无效。');
  if ((await run('/usr/bin/lipo', ['-archs', executable])).trim() !== 'arm64')
    throw Error('更新包架构不匹配。');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
  // Downloads via fetch do not automatically receive browser quarantine metadata.
  await run('/usr/bin/xattr', [
    '-w',
    'com.apple.quarantine',
    `0083;${Math.floor(Date.now() / 1000).toString(16)};Clever Workbench;`,
    appPath,
  ]);
  return appPath;
}

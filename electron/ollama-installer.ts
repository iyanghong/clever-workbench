import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);

// A pinned public asset also works when GitHub rate-limits anonymous release metadata.
const installer = {
  url: 'https://github.com/ollama/ollama/releases/download/v0.40.16/Ollama.dmg',
  size: 229996388,
  sha256: 'b48d74a2d8c6a0592c816a4f85643d8d8608ad592abafbe95c04128a73c398c6',
};
type InstallerProgress = NonNullable<import('../src/ledger-import-types').OllamaState['installer']>;

export async function fetchInstaller(
  send: typeof fetch,
  filename: string,
  asset: typeof installer,
  progress: (n: InstallerProgress) => void,
) {
  const output = await fs.open(filename, 'wx', 0o600);
  const groupAbort = new AbortController(),
    chunkSize = 4 * 1024 * 1024;
  let received = 0,
    next = 0,
    whole = false,
    downloadUrl = asset.url + '?workbench=' + Date.now();
  async function part(start: number) {
    const end = Math.min(start + chunkSize, asset.size) - 1;
    for (let attempt = 0; ; attempt++) {
      groupAbort.signal.throwIfAborted();
      try {
        const res = await send(downloadUrl, {
          credentials: 'omit',
          headers: { Range: 'bytes=' + start + '-' + end },
          signal: AbortSignal.any([groupAbort.signal, AbortSignal.timeout(90000)]),
        });
        const complete = start === 0 && res.status === 200;
        const partial =
          res.status === 206 &&
          res.headers.get('content-range') === 'bytes ' + start + '-' + end + '/' + asset.size;
        if (!res.body || (!complete && !partial)) {
          await res.body?.cancel();
          throw Error('官方安装包未返回所请求的文件范围。');
        }
        const length = complete ? asset.size : end - start + 1,
          reader = res.body.getReader();
        let offset = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (offset + value.length > length) {
              await reader.cancel();
              throw Error('安装包长度校验失败。');
            }
            let written = 0;
            while (written < value.length) {
              const n = await output.write(
                value,
                written,
                value.length - written,
                start + offset + written,
              );
              if (!n.bytesWritten) throw Error('无法写入 Ollama 安装包，请检查磁盘空间。');
              written += n.bytesWritten;
            }
            offset += value.length;
          }
        } finally {
          reader.releaseLock();
        }
        if (offset !== length) throw Error('安装包长度校验失败，请重试。');
        if (start === 0 && res.url.startsWith('https://')) downloadUrl = res.url;
        whole = complete || whole;
        received += length;
        progress({ phase: 'download', received, total: asset.size });
        return;
      } catch (error) {
        if (attempt >= 2 || groupAbort.signal.aborted) throw error;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  try {
    progress({ phase: 'download', received: 0, total: asset.size });
    await part(0);
    next = chunkSize;
    async function worker() {
      try {
        while (!whole && next < asset.size) {
          const start = next;
          next += chunkSize;
          await part(start);
        }
      } catch (e) {
        groupAbort.abort();
        throw e;
      }
    }
    const completed = await Promise.allSettled([worker(), worker(), worker()]);
    const failure = completed.find((r) => r.status === 'rejected');
    if (failure?.status === 'rejected') throw Error('官方下载中断，请检查网络后重试。');
  } finally {
    await output.close();
  }
  progress({ phase: 'verify', received, total: asset.size });
  const hash = createHash('sha256');
  for await (const part of createReadStream(filename)) hash.update(part);
  if (received !== asset.size || hash.digest('hex') !== asset.sha256)
    throw Error('Ollama 安装包校验失败，请重新下载。');
}
export async function prepareOllamaInstaller(
  send: typeof fetch,
  tempDirectory: string,
  guard: () => void,
  progress: (n: InstallerProgress) => void = () => {},
) {
  if (process.platform !== 'darwin' || parseInt(os.release()) < 23)
    throw new Error('此安装入口需要 macOS 14 或更高版本。');
  const dir = await fs.mkdtemp(path.join(tempDirectory, 'workbench-ollama-')),
    filename = path.join(dir, 'Ollama.dmg');
  try {
    await fetchInstaller(send, filename, installer, progress);
    await exec('/usr/bin/hdiutil', ['verify', filename], { timeout: 120000 });
    await exec('/usr/bin/xattr', [
      '-w',
      'com.apple.quarantine',
      '0081;' + Math.floor(Date.now() / 1000).toString(16) + ';Clever Workbench;',
      filename,
    ]);
    guard();
    return filename;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

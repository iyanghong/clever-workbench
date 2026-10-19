import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decryptPath, encryptPath, type Report, type Own } from './zip-archive';
import { gitBranches, gitCommits, gitPreview } from './git-files';
import { clipboardChunks, storePart } from './clipboard-parts';
import type { GitFilter, GitPreview, TextPart, ZipSettings } from '../../src/tool-types';
export type ZipWork =
  | { type: 'pack'; settings: ZipSettings; password: string; preview?: GitPreview }
  | { type: 'restore'; settings: ZipSettings; password: string }
  | { type: 'capture'; target: string }
  | {
      type: 'paste';
      parts: (TextPart & { path: string })[];
      temporary: string;
      outputDir: string;
      password: string;
    }
  | { type: 'branches'; source: string }
  | { type: 'commits'; filter: GitFilter }
  | { type: 'preview'; source: string; commits: string[] };
export async function executeZipWork(
  work: ZipWork,
  report: Report,
  own: Own = () => {},
): Promise<unknown> {
  switch (work.type) {
    case 'pack': {
      const { settings, password, preview } = work;
      if (preview) {
        const latest = await gitPreview(settings.source, preview.commits);
        if (
          JSON.stringify([latest.available, latest.missing]) !==
          JSON.stringify([preview.available, preview.missing])
        )
          throw new Error('文件范围已变化，请重新预览并确认后再归档。');
      }
      return encryptPath(
        settings.source,
        password,
        settings.outputDir,
        settings.partSizeMB,
        preview?.available,
        report,
        own,
      );
    }
    case 'restore':
      return decryptPath(work.settings.source, work.password, work.settings.outputDir, report, own);
    case 'branches':
      return gitBranches(work.source);
    case 'commits':
      return gitCommits(work.filter);
    case 'preview':
      return gitPreview(work.source, work.commits);
    case 'capture':
      return storePart(clipboardChunks(), work.target, report, own);
    case 'paste': {
      const staging = await fs.mkdtemp(path.join(work.temporary, 'restore-'));
      own(staging);
      try {
        for (const part of work.parts)
          await fs.link(
            part.path,
            path.join(staging, `part-${String(part.index).padStart(6, '0')}.txt`),
          );
        return await decryptPath(staging, work.password, work.outputDir, report, own);
      } finally {
        await fs.rm(staging, { recursive: true, force: true });
      }
    }
  }
}
if (parentPort) {
  const port = parentPort;
  let last = 0,
    phase = '';
  const report: Report = (progress) => {
    const now = Date.now();
    if (progress.phase !== phase || now - last > 100 || progress.processed === progress.total) {
      last = now;
      phase = progress.phase;
      port.postMessage({ type: 'progress', progress });
    }
  };
  void executeZipWork(workerData as ZipWork, report, (filename) =>
    port.postMessage({ type: 'owned', filename }),
  )
    .then(
      (result) => port.postMessage({ type: 'result', result }),
      (error) =>
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        }),
    )
    .finally(() => port.close());
}

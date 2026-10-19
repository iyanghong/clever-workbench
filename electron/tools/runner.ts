import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import type { ToolProgress } from '../../src/tool-types';

/** A worker lives for one operation. Only small progress records and results cross this boundary. */
export function runToolWorker<T>(
  filename: string,
  work: unknown,
  report: (value: ToolProgress) => void,
) {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(filename, { workerData: work });
    let result: T,
      received = false,
      failure: Error | undefined;
    const owned = new Set<string>();
    worker.on('message', (message) => {
      if (message.type === 'progress') report(message.progress);
      else if (message.type === 'result') {
        result = message.result;
        received = true;
      } else if (message.type === 'error') failure = new Error(message.error);
      else if (message.type === 'owned' && typeof message.filename === 'string')
        owned.add(message.filename);
    });
    worker.once('error', (error) => {
      failure = error instanceof Error ? error : new Error(String(error));
    });
    worker.once('exit', (code) => {
      if (!failure && code === 0 && received) {
        resolve(result!);
        return;
      }
      void Promise.all(
        [...owned].map((filename) => fs.rm(filename, { recursive: true, force: true })),
      ).then(
        () => reject(failure ?? new Error('工具处理进程意外退出，已清理本次未完成输出，请重试。')),
        () =>
          reject(
            new Error(
              `${failure?.message ?? '工具处理进程意外退出。'} 本次临时文件未能全部清理，请检查输出位置。`,
            ),
          ),
      );
    });
  });
}

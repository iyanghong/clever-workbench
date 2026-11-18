import { parentPort, workerData } from 'node:worker_threads';
import { parseLedgerFile } from './ledger-import-file';

void parseLedgerFile(workerData.filename).then(
  (result) => parentPort?.postMessage({ result }),
  (error) =>
    parentPort?.postMessage({
      error:
        error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message
          : '文件读取失败，请检查文件权限、格式或是否已被移动。',
    }),
);

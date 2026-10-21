import { expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { electron } from './e2e/launch';

test.skipIf(process.platform !== 'darwin')(
  '模拟钥匙串只允许明确指定的临时隔离资料目录',
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-launch-guard-'));
    const previous = process.env.CWB_TEST_EXECUTABLE;
    // If the guard regresses, the invalid executable prevents touching any real application/data.
    process.env.CWB_TEST_EXECUTABLE = path.join(root, 'must-not-launch');
    try {
      await fs.symlink(process.cwd(), path.join(root, 'outside-link'));
      for (const dataDir of [
        '',
        process.cwd(),
        os.tmpdir(),
        path.join(root, 'outside-link'),
        path.join(root, 'missing'),
      ]) {
        await expect(async () =>
          electron.launch({
            args: [],
            env: {
              ...process.env,
              CWB_TEST_MOCK_KEYCHAIN: '1',
              CLEVER_WORKBENCH_DATA_DIR: dataDir,
            },
          }),
        ).rejects.toThrow('模拟钥匙串测试必须使用');
      }
    } finally {
      if (previous === undefined) delete process.env.CWB_TEST_EXECUTABLE;
      else process.env.CWB_TEST_EXECUTABLE = previous;
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);

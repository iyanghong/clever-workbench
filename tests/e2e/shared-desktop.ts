import { test as base, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { electron } from './launch';

// Each spec gets its own worker fixture and data directory. A retry gets a fresh worker.
export function sharedDesktopTests(group: string) {
  return base.extend<{}, { desktopGroup: string; app: ElectronApplication }>({
    desktopGroup: [group, { scope: 'worker' }],
    app: [
      async ({ desktopGroup }, use) => {
        await using directory = await fs.mkdtempDisposable(
          path.join(os.tmpdir(), `workbench-${desktopGroup}-`),
        );
        const env: Record<string, string> = {
          ...process.env,
          CLEVER_WORKBENCH_DATA_DIR: directory.path,
        };
        delete env.ELECTRON_RUN_AS_NODE;
        await using app = await electron.launch({ args: ['.'], env });
        await use(app);
      },
      { scope: 'worker' },
    ],
    page: async ({ app }, use) => {
      const page = await app.firstWindow();
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await use(page);
    },
  });
}

import { _electron } from '@playwright/test';
import { realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Run the same behavior checks against development output or an installed executable.
export const electron = {
  async launch(options: NonNullable<Parameters<typeof _electron.launch>[0]>) {
    const executablePath = process.env.CWB_TEST_EXECUTABLE;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.env ?? process.env))
      if (value !== undefined) env[key] = value;
    const mockKeychain = (env.CWB_TEST_MOCK_KEYCHAIN ?? process.env.CWB_TEST_MOCK_KEYCHAIN) === '1';
    if (mockKeychain || options.args?.some((arg) => arg.startsWith('--use-mock-keychain'))) {
      let isolated = false;
      try {
        const directory = env.CLEVER_WORKBENCH_DATA_DIR;
        const resolved = directory && realpathSync(directory);
        const relative = resolved && path.relative(realpathSync(os.tmpdir()), resolved);
        isolated = Boolean(
          resolved &&
          relative &&
          !relative.startsWith(`..${path.sep}`) &&
          relative !== '..' &&
          !path.isAbsolute(relative) &&
          statSync(resolved).isDirectory(),
        );
      } catch {
        /* Missing or inaccessible directories do not authorize a test adapter. */
      }
      if (!mockKeychain || process.platform !== 'darwin' || !isolated)
        throw Error(
          '模拟钥匙串测试必须使用 macOS、显式 CWB_TEST_MOCK_KEYCHAIN=1 和系统临时目录内已经创建的独立资料目录。',
        );
    }
    const args = executablePath ? [] : [...(options.args ?? [])];
    if (mockKeychain && !args.includes('--use-mock-keychain')) args.unshift('--use-mock-keychain');
    if (executablePath) delete env.VITE_DEV_SERVER_URL;
    const app = await _electron.launch({
      ...options,
      env,
      ...(executablePath ? { executablePath } : {}),
      args,
    });
    if (env.CWB_TEST_KEEP_VERSION_GUIDANCE !== '1') {
      try {
        const page = await app.firstWindow();
        const versions = await page.evaluate(() => window.desktop.guidanceVersions());
        const state = await page.evaluate(() => window.desktop.guidanceState());
        if (
          versions.releases.some(
            (release) =>
              release.version === versions.currentVersion && release.operationChange === 'changed',
          ) &&
          state.shownThrough !== versions.currentVersion
        ) {
          // Unrelated desktop tests begin after first-use guidance is recorded.
          await page.evaluate(
            (version) => window.desktop.guidanceAcknowledge(version),
            versions.currentVersion,
          );
          await page.reload();
        }
      } catch (error) {
        await app.close();
        throw error;
      }
    }
    return app;
  },
};

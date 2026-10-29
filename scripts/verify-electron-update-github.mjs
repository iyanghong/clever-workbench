// Post-publication check of the fixed updater source against the real private Release.
// It downloads and validates into isolated temporary data; no application is installed.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import electron from 'electron';

const target = process.argv[2];
if (process.platform !== 'darwin' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(target ?? ''))
  throw Error('用法：node scripts/verify-electron-update-github.mjs X.Y.Z（macOS）');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-real-update-transport-'));
try {
  await build({
    stdin: {
      contents: [
        `export { UpdateCoordinator } from ${JSON.stringify(path.resolve('electron/update.ts'))};`,
        `export { fetchUpdate } from ${JSON.stringify(path.resolve('electron/update-fetch.ts'))};`,
        `export { localGitHubCredential } from ${JSON.stringify(path.resolve('electron/update-credential.ts'))};`,
      ].join('\n'),
      resolveDir: process.cwd(),
    },
    outfile: path.join(root, 'api.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'original-fs'],
  });
  await fs.copyFile('scripts/fixtures/update-github.cjs', path.join(root, 'main.cjs'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [path.join(root, 'main.cjs'), target], { env, stdio: 'inherit' });
  const result = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  if (result !== 0) throw Error(`真实 GitHub 更新传输验证失败（${result}）。`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

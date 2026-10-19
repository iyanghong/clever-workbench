// Native 302 regression at UpdateCoordinator.check/download; all transport is a local fixture.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import electron from 'electron';
const archive = path.resolve(process.argv[2]);
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-native-transport-'));
try {
  await build({
    stdin: {
      contents: `export {UpdateCoordinator} from ${JSON.stringify(path.resolve('electron/update.ts'))}; export {fetchUpdate} from ${JSON.stringify(path.resolve('electron/update-fetch.ts'))};`,
      resolveDir: process.cwd(),
    },
    outfile: path.join(root, 'api.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'original-fs'],
  });
  await fs.copyFile('scripts/fixtures/update-transport.cjs', path.join(root, 'main.cjs'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [path.join(root, 'main.cjs'), archive, version], {
    env,
    stdio: 'inherit',
  });
  const result = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  if (result !== 0) throw Error(`Native transport regression failed (${result})`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

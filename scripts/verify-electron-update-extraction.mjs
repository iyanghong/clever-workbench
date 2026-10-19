import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { build } from 'esbuild';

const archive = path.resolve(process.argv[2]);
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'electron-update-extract-'));
try {
  await build({
    entryPoints: ['electron/update-package.ts'],
    outfile: path.join(root, 'extract.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['original-fs'],
  });
  const main = path.join(root, 'main.cjs');
  await fs.writeFile(
    main,
    `const {app}=require('electron');const fs=require('node:fs');const path=require('node:path');const {extractBundle,runCommand}=require('./extract.cjs');app.setPath('userData',path.join(__dirname,'profile'));app.whenReady().then(async()=>{if(!process.versions.electron)throw Error('Electron required');const dir=path.join(__dirname,'staging');fs.mkdirSync(dir);await extractBundle(process.argv[2],dir,process.argv[3],runCommand);console.log('PASS Electron runtime app.asar staging and native verification');app.quit();}).catch(error=>{console.error(error);app.exit(1);});`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [main, archive, version], { env, stdio: 'inherit' });
  const result = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  if (result !== 0) throw Error(`Electron extraction failed: ${result}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

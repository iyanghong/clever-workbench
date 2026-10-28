import { build } from 'esbuild';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
// Copy raw documents; malformed or missing guidance must not become a build gate.
await rm('dist-electron/guidance', { recursive: true, force: true });
await mkdir('dist-electron/guidance', { recursive: true });
async function copyGuidance(relative = '') {
  const source = path.join('content/guidance', relative);
  const entries = await readdir(source, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const file = path.join(relative, entry.name);
    if (entry.isDirectory()) await copyGuidance(file);
    else if (entry.isFile() && entry.name.endsWith('.json')) {
      const target = path.join('dist-electron/guidance', file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join('content/guidance', file), target).catch(() => {
        console.warn(`操作指引未能复制：${file}；应用仍可使用其他有效内容。`);
      });
    }
  }
}
await copyGuidance();
await build({
  entryPoints: ['electron/tools/zip-worker.ts'],
  outfile: 'dist-electron/zip-worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
});
await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', 'original-fs'],
  sourcemap: true,
});
await copyFile('scripts/macos-update-helper.sh', 'dist-electron/macos-update-helper.sh');
await build({
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
});

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
if (process.platform !== 'darwin')
  throw new Error(
    'Icon generation uses macOS sips/iconutil; release builds use the committed icons.',
  );
const run = (file, args) => execFileSync(file, args, { stdio: 'ignore' });
fs.mkdirSync('build/icon.iconset', { recursive: true });
run('sips', ['-s', 'format', 'png', 'build/icon.svg', '--out', 'build/icon.png']);
for (const size of [16, 32, 128, 256, 512])
  for (const scale of [1, 2]) {
    const pixels = String(size * scale),
      suffix = scale === 2 ? '@2x' : '';
    run('sips', [
      '-z',
      pixels,
      pixels,
      'build/icon.png',
      '--out',
      `build/icon.iconset/icon_${size}x${size}${suffix}.png`,
    ]);
  }
run('iconutil', ['-c', 'icns', 'build/icon.iconset', '-o', 'build/icon.icns']);
run('sips', [
  '-s',
  'format',
  'ico',
  '-z',
  '256',
  '256',
  'build/icon.png',
  '--out',
  'build/icon.ico',
]);
console.log('Generated macOS and Windows icons from build/icon.svg.');

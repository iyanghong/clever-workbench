import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
const tag = process.argv[2];
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '') || tag !== `v${version}`)
  throw Error('应用版本与 tag 不一致，或不是正式 vX.Y.Z 版本。');
console.log(`Release ${tag}: version verified`);
if (!process.argv.includes('--check-version')) {
  const sums = [];
  for (const extension of ['zip', 'dmg']) {
    const name = `Clever-Workbench-${version}-arm64.${extension}`;
    const file = `release/${name}`;
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > 1024 ** 3)
      throw Error(`Release 资产无效：${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    sums.push(`${hash.digest('hex')}  ${name}`);
  }
  await fs.writeFile('release/SHA256SUMS', sums.join('\n') + '\n');
  console.log('Release ZIP, DMG and SHA256SUMS ready');
}

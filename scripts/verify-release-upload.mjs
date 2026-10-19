import fs from 'node:fs/promises';
const tag = process.argv[2];
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? ''))
  throw Error('Invalid stable tag');
const version = tag.slice(1);
const { assets } = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
for (const name of [
  `Clever-Workbench-${version}-arm64.zip`,
  `Clever-Workbench-${version}-arm64.dmg`,
  'SHA256SUMS',
]) {
  const matching = assets.filter((asset) => asset.name === name);
  const stat = await fs.stat(`release/${name}`);
  if (matching.length !== 1 || matching[0].size !== stat.size || matching[0].state !== 'uploaded')
    throw Error(`上传资产缺失或大小不匹配：${name}`);
}
console.log('All release assets uploaded; ready to publish');

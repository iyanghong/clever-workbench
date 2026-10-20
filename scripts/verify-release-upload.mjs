import fs from 'node:fs/promises';
import { localAssets, verifyUploadedAssets, versionParts } from './release-tools/core.mjs';
const tag = process.argv[2];
versionParts(tag);
const { assets } = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
verifyUploadedAssets(await localAssets(tag), assets);
console.log('All release assets uploaded; ready to publish');

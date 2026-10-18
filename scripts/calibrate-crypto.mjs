import { performance } from 'node:perf_hooks';
import { derive, parameters } from '../electron/vault-crypto.ts';
const milliseconds = [];
for (let index = 0; index < 3; index++) {
  const started = performance.now();
  const key = await derive('fictional-calibration-password', {
    ...parameters,
    salt: Buffer.alloc(16, 7).toString('base64'),
  });
  key.fill(0);
  milliseconds.push(Math.round(performance.now() - started));
}
console.log(
  JSON.stringify({
    node: process.versions.node,
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    parameters,
    milliseconds,
  }),
);

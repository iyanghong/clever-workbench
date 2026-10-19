const { app } = require('electron');
const { UpdateCoordinator, fetchUpdate } = require('./api.cjs');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
app.setPath('userData', path.join(__dirname, 'profile'));
app
  .whenReady()
  .then(async () => {
    const [, , archive, version] = process.argv;
    const fixtureToken = 'native-transport-fixture-credential';
    const name = `Clever-Workbench-${version}-arm64.zip`;
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
    const sums = `${hash.digest('hex')}  ${name}\n`;
    const github = 'https://github.com/iyanghong/clever-workbench/releases/download';
    const api = 'https://api.github.com/repos/iyanghong/clever-workbench/releases';
    const requests = [];
    const release = {
      tag_name: `v${version}`,
      draft: false,
      prerelease: false,
      assets: [
        {
          name,
          size: fs.statSync(archive).size,
          browser_download_url: `${github}/v${version}/${name}`,
          url: `${api}/assets/1`,
        },
        {
          name: 'SHA256SUMS',
          size: Buffer.byteLength(sums),
          browser_download_url: `${github}/v${version}/SHA256SUMS`,
          url: `${api}/assets/2`,
        },
      ],
    };
    const server = http.createServer((request, response) => {
      const authorized = request.headers.authorization === `Bearer ${fixtureToken}`;
      requests.push({
        path: request.url,
        authorized,
        hasAuthorization: !!request.headers.authorization,
      });
      if (request.url === '/metadata') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(release));
      } else if (request.url.startsWith('/assets/')) {
        if (!authorized) {
          response.writeHead(401);
          response.end();
          return;
        }
        response.writeHead(302, {
          Location: `https://release-assets.githubusercontent.com/cwb-fixture/${request.url.endsWith('/1') ? 'app.zip' : 'SHA256SUMS'}`,
        });
        response.end();
      } else if (request.url === '/cdn/app.zip') {
        response.writeHead(200, { 'Content-Length': String(fs.statSync(archive).size) });
        const file = fs.createReadStream(archive);
        response.on('close', () => file.destroy());
        file.pipe(response);
      } else if (request.url === '/cdn/SHA256SUMS') {
        response.end(sums);
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const coordinator = new UpdateCoordinator({
      currentVersion: '0.0.0',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
      stagingDirectory: path.join(__dirname, 'stage'),
      githubCredential: async () => fixtureToken,
      fetch: (input, init) => {
        const url = new URL(String(input));
        const route =
          url.hostname === 'api.github.com'
            ? url.pathname.endsWith('/latest')
              ? '/metadata'
              : `/assets/${url.pathname.split('/').pop()}`
            : `/cdn/${url.pathname.split('/').pop()}`;
        return fetchUpdate(`http://127.0.0.1:${port}${route}`, init);
      },
    });
    try {
      assert.equal((await coordinator.check()).status, 'available');
      const downloaded = await coordinator.download();
      assert.equal(downloaded.status, 'ready', JSON.stringify(downloaded));
      assert.ok(requests.filter((r) => r.path.startsWith('/assets/')).every((r) => r.authorized));
      assert.ok(requests.some((r) => r.path === '/cdn/app.zip'));
      assert.ok(requests.some((r) => r.path === '/cdn/SHA256SUMS'));
      assert.ok(
        requests.filter((r) => r.path.startsWith('/cdn/')).every((r) => !r.hasAuthorization),
      );
      console.log(
        'PASS native Electron 302, authenticated API, credential-free CDN, real ZIP validation (local transport fixture)',
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

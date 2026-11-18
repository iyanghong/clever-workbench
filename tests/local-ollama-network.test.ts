import { expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localInferenceProfile, LocalOllama } from '../electron/local-ollama';

test.skipIf(process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec'))(
  'macOS inference sandbox permits local HTTP but rejects non-local connections before transmission',
  async () => {
    const server = http.createServer((_request, response) => {
      response.end('synthetic-network-probe');
    });
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const port = (server.address() as { port: number }).port;
    const program = `const http=require('node:http');let finished=false;const done=s=>{if(!finished){finished=true;console.log(s)}};const req=http.get({host:process.argv[1],port:Number(process.argv[2])},res=>{res.resume();res.on('end',()=>done('allowed'))});req.setTimeout(500,()=>{done('timeout');req.destroy()});req.on('error',e=>done('blocked:'+e.code));`;
    const run = promisify(execFile);
    try {
      const baseline = await run(process.execPath, ['-e', program, '127.0.0.1', String(port)]);
      expect(baseline.stdout.trim()).toBe('allowed');
      const local = await run('/usr/bin/sandbox-exec', [
        '-p',
        localInferenceProfile,
        process.execPath,
        '-e',
        program,
        '127.0.0.1',
        String(port),
      ]);
      expect(local.stdout.trim()).toBe('allowed');
      const outside = await run(process.execPath, ['-e', program, '203.0.113.1', '443']);
      expect(outside.stdout.trim()).not.toMatch(/^blocked:(?:EPERM|EACCES)$/);
      const remote = await run('/usr/bin/sandbox-exec', [
        '-p',
        localInferenceProfile,
        process.execPath,
        '-e',
        program,
        '203.0.113.1',
        '443',
      ]);
      expect(remote.stdout.trim()).toMatch(/^blocked:(?:EPERM|EACCES)$/);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);

test('cloud names and arbitrary model URLs are refused before a process or request is started', async () => {
  const runtime = new LocalOllama('/nonexistent-cwb-network-probe');
  expect(() => runtime.download('gpt-oss:120b-cloud')).toThrow('本地模型');
  expect(() => runtime.download('https://example.invalid/model')).toThrow('本地模型');
  await expect(
    runtime.chat('gpt-oss:120b-cloud' as never, [], {}, new AbortController().signal),
  ).rejects.toThrow('本地模型');
});

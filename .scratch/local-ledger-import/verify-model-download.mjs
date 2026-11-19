import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const evidence = path.resolve('.scratch/local-ledger-import/evidence');
await fs.mkdir(evidence, { recursive: true });
let binaryDirectory = process.env.CWB_TEST_OLLAMA_DIR;
if (!binaryDirectory) {
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(evidence, 'runtime.json'), 'utf8'));
    binaryDirectory = path.join(metadata.directory, 'runtime');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
if (binaryDirectory) process.env.PATH = `${binaryDirectory}${path.delimiter}${process.env.PATH ?? ''}`;
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-real-pull-cancel-'));
const filename = path.join(temporary, 'runtime.cjs');
await build({ entryPoints: ['electron/local-ollama.ts'], outfile: filename, bundle: true, platform: 'node', format: 'cjs' });
const { LocalOllama } = createRequire(import.meta.url)(filename);
const runtime = new LocalOllama(path.join(temporary, 'models'));
const report = { syntheticTest: true, version: null, model: 'qwen3:4b', runs: [] };
async function waitFor(predicate, timeout = 90_000) {
  const started = Date.now();
  while (!predicate()) {
    assert(Date.now() - started < timeout, '真实下载状态等待超时');
    const state = runtime.snapshot();
    assert(!(state.error && !runtime.downloading), state.error ?? '下载失败');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
try {
  await runtime.start();
  report.version = runtime.snapshot().version;
  assert.equal(runtime.snapshot().models.length, 0);
  let previous = 0;
  for (let index = 0; index < 2; index++) {
    runtime.download('qwen3:4b');
    await waitFor(() => (runtime.snapshot().download?.completed ?? 0) > previous + 1024 * 1024);
    const progress = runtime.snapshot().download;
    previous = progress.completed;
    console.log('真实下载字节', index + 1, progress.completed, '/', progress.total);
    runtime.cancelDownload();
    const started = Date.now();
    while (runtime.downloading && Date.now() - started < 5000) await new Promise((resolve) => setTimeout(resolve, 50));
    assert(!runtime.downloading, '取消后请求没有结束');
    const state = runtime.snapshot();
    assert.equal(state.phase, 'ready');
    assert.match(state.error, /已取消/);
    assert(!state.models.some((model) => model.name === 'qwen3:4b'));
    report.runs.push({ attempt: index + 1, progress, cancelled: true, noIncompleteModel: true });
  }
  report.passed = true;
} finally {
  runtime.stop();
  await fs.writeFile(path.join(evidence, 'download-cancel-resume.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.rm(temporary, { recursive: true, force: true });
}

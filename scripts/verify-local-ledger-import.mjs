import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = process.cwd();
const output = path.join(root, '.scratch/local-ledger-import/evidence');
await fs.mkdir(output, { recursive: true });
const modelDirectory = process.env.CWB_TEST_OLLAMA_MODELS;
assert(modelDirectory, '请设置 CWB_TEST_OLLAMA_MODELS，指向测试用本地模型缓存。');
const binaryDirectory = process.argv[2] || process.env.CWB_TEST_OLLAMA_DIR;
const model = process.argv[3] ?? 'qwen3:4b';
assert(['qwen3:4b', 'qwen3:8b'].includes(model), '仅验证指定的本地模型');
if (binaryDirectory)
  process.env.PATH = `${binaryDirectory}${path.delimiter}${process.env.PATH ?? ''}`;
const sourceFiles = [
  'electron/local-ollama.ts',
  'electron/ledger-import-file.ts',
  'electron/ledger-import-source.ts',
  'electron/ledger-import-model.ts',
  'src/ledger-import-types.ts',
  'src/ledger-columns.ts',
  'package-lock.json',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (filename) => [
      filename,
      createHash('sha256')
        .update(await fs.readFile(path.join(root, filename)))
        .digest('hex'),
    ]),
  ),
);
const bundle = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-import-probe-'));
const bundleFile = path.join(bundle, 'probe.cjs');
await build({
  stdin: {
    contents: [
      "export { LocalOllama } from './electron/local-ollama.ts';",
      "export { parseLedgerFile, publicImportSources } from './electron/ledger-import-file.ts';",
      "export { extractLedgerCandidates } from './electron/ledger-import-model.ts';",
      "export { createLedgerImportFixtures } from './tests/fixtures/ledger-import.ts';",
    ].join('\n'),
    resolveDir: root,
  },
  outfile: bundleFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
});
const {
  LocalOllama,
  parseLedgerFile,
  publicImportSources,
  extractLedgerCandidates,
  createLedgerImportFixtures,
} = createRequire(import.meta.url)(bundleFile);
const runtime = new LocalOllama(modelDirectory);
const report = {
  time: new Date().toISOString(),
  model,
  runtime: null,
  files: [],
  failures: [],
  platform: process.platform,
  architecture: process.arch,
  sourceHashes,
};
const trace = [];
const measuredRuntime = {
  async chat(...args) {
    const response = await runtime.chat(...args);
    trace.push({ syntheticInput: true, model, input: args[1], response });
    await fs.writeFile(
      path.join(output, `raw-synthetic-${model.replace(':', '-')}.json`),
      JSON.stringify(trace, null, 2) + '\n',
    );
    return response;
  },
};
try {
  await runtime.start();
  report.runtime = runtime.snapshot().version;
  console.log('真实服务启动：', runtime.snapshot().version);
  runtime.download(model);
  let last = -1;
  while (runtime.downloading) {
    const download = runtime.snapshot().download;
    const percent = download?.total
      ? Math.floor((download.completed / download.total) * 10) * 10
      : 0;
    if (percent !== last) {
      console.log('准备模型：', model, `${percent}%`);
      last = percent;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(
    runtime.snapshot().models.some((item) => item.name === model),
    runtime.snapshot().error ?? '模型未准备完成',
  );
  const manifestBytes = await fs.readFile(
    path.join(modelDirectory, 'manifests/registry.ollama.ai/library/qwen3', model.split(':')[1]),
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert(/^sha256:[a-f0-9]{64}$/.test(manifest.config.digest));
  report.modelManifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  report.modelLayers = manifest.layers.map((layer) => ({
    digest: layer.digest,
    bytes: layer.size,
    mediaType: layer.mediaType,
  }));
  const configuration = JSON.parse(
    await fs.readFile(
      path.join(modelDirectory, 'blobs', manifest.config.digest.replace(':', '-')),
      'utf8',
    ),
  );
  report.modelConfiguration = configuration;
  const fixtures = await createLedgerImportFixtures(path.join(output, 'fixtures'));
  const cases = [
    ...fixtures.map((fixture) => ({ ...fixture, scope: 'all' })),
    { ...fixtures[1], scope: 'database', expected: { 订单数据库: 'database' } },
  ];
  for (const fixture of cases) {
    const started = performance.now();
    const file = await parseLedgerFile(fixture.filename);
    assert(
      !JSON.stringify(publicImportSources(file)).includes('fixture-'),
      '密码不应进入公共来源或模型输入',
    );
    const extracted = await extractLedgerCandidates(
      measuredRuntime,
      model,
      file,
      fixture.scope,
      '脱敏演示系统',
      new AbortController().signal,
      (done, total) => console.log(path.basename(fixture.filename), `分析 ${done}/${total}`),
    );
    const entry = {
      filename: path.basename(fixture.filename),
      scope: fixture.scope,
      seconds: (performance.now() - started) / 1000,
      expected: fixture.expected,
      candidates: extracted.candidates,
      warnings: [...file.warnings, ...extracted.warnings],
      timings: extracted.timings,
      checks: [],
    };
    report.files.push(entry);
    const check = (label, operation) => {
      try {
        operation();
        entry.checks.push({ label, passed: true });
      } catch (error) {
        entry.checks.push({ label, passed: false });
        report.failures.push(`${entry.filename}（${entry.scope}）：${label}：${error.message}`);
      }
    };
    check('全部预期对象及类型', () => {
      assert.equal(extracted.candidates.length, Object.keys(fixture.expected).length);
      for (const [name, kind] of Object.entries(fixture.expected))
        assert(
          extracted.candidates.some((item) => item.name === name && item.kind === kind),
          `缺少 ${kind} ${name}`,
        );
    });
    check('环境等待人工确认', () =>
      assert(extracted.candidates.every((item) => item.environmentIds === null)),
    );
    check('没有无来源字段或秘密明文', () => {
      assert(
        extracted.candidates.every((item) => item.sourceIds.length && !item.warnings.length),
        '存在需要人工补充的来源字段',
      );
      assert(!JSON.stringify(extracted.candidates).includes('fixture-'));
    });
    if (entry.filename.endsWith('.csv'))
      check('账号前导零、地址及密码引用', () => {
        const server = extracted.candidates.find((item) => item.kind === 'server');
        assert.equal(server?.address, '192.0.2.10');
        assert.equal(server?.port, '22');
        assert.equal(server.accounts[0]?.username, '000123');
        assert(server.accounts[0]?.passwordRef);
        assert(
          extracted.candidates
            .find((item) => item.kind === 'access')
            ?.addresses.some((item) => item.url === 'https://repo.example.invalid'),
        );
      });
    if (entry.filename.endsWith('.xlsx'))
      check('同一数据库的多账号和多连接', () => {
        const database = extracted.candidates.find((item) => item.kind === 'database');
        assert.equal(database?.accounts.length, 2);
        assert.equal(database?.connections.length, 2);
        assert.deepEqual(database.accounts.map((item) => item.username).sort(), [
          'orders_app',
          'orders_read',
        ]);
        assert(database.accounts.every((item) => item.passwordRef));
        assert.deepEqual(database.connections.map((item) => item.address).sort(), [
          '192.0.2.20',
          '192.0.2.21',
        ]);
      });
    if (entry.filename.endsWith('.docx'))
      check('跨对象关系与段落密码引用', () => {
        const service = extracted.candidates.find((item) => item.kind === 'service');
        assert.equal(service?.repository, 'https://git.example.invalid/orders');
        const resource = extracted.candidates.find((item) => item.kind === 'other');
        assert.equal(
          extracted.candidates.find((item) => item.kind === 'node')?.service?.candidate,
          service?.id,
        );
        assert.equal(
          extracted.candidates.find((item) => item.kind === 'job')?.service?.candidate,
          service?.id,
        );
        assert.equal(
          extracted.candidates.find((item) => item.kind === 'backup')?.owner?.candidate,
          resource?.id,
        );
        assert(extracted.candidates.find((item) => item.kind === 'account')?.passwordRef);
      });
    await fs.writeFile(
      path.join(output, `extraction-${model.replace(':', '-')}.json`),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      entry.filename,
      `${entry.seconds.toFixed(1)} 秒`,
      entry.checks.filter((item) => item.passed).length + '/' + entry.checks.length,
      '项通过',
    );
  }
  if (report.failures.length) {
    console.error(report.failures.join('\n'));
    process.exitCode = 1;
  }
} catch (error) {
  report.failures.push(error.message);
  await fs.writeFile(
    path.join(output, `extraction-${model.replace(':', '-')}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  throw error;
} finally {
  runtime.stop();
  await fs.rm(bundle, { recursive: true, force: true });
}

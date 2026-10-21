import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { SystemExports } from '../electron/system-export';
import { emptyContent } from '../src/domain';
import { Backups } from '../electron/backup';
import type { SystemExportOptions } from '../src/export-types';

const roots: string[] = [],
  stores: Store[] = [],
  vaults: Vault[] = [];
afterEach(() => {
  for (const vault of vaults.splice(0)) vault.lock();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
async function files(filename: string) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const result = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(result));
      zip.on('entry', (entry: yauzl.Entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            result.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

test('可排除文档和任务，按本地开始日期含首尾筛选任务，无文档直接导出一个文件', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-export-selection-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  const systemId = store.mutate({ type: 'system.save', name: '筛选平台' }).createdId!;
  const otherSystemId = store.mutate({ type: 'system.save', name: '其他平台' }).createdId!;
  const documentId = store.mutate({ type: 'document.create', context: { systemId } }).createdId!;
  store.mutate({ ...store.document(documentId), type: 'document.edit', markdown: '文档正文' });
  for (const [title, startedAt, owner, deleted] of [
    ['区间之前', new Date(2025, 9, 19, 23, 59).getTime(), systemId, false],
    ['首日零点', new Date(2025, 9, 20).getTime(), systemId, false],
    ['末日最后一分钟', new Date(2025, 9, 21, 23, 59).getTime(), systemId, false],
    ['区间之后', new Date(2025, 9, 22).getTime(), systemId, false],
    ['其他系统任务', new Date(2025, 9, 20).getTime(), otherSystemId, false],
    ['回收站任务', new Date(2025, 9, 20).getTime(), systemId, true],
  ] as const) {
    const id = store.mutate({
      type: 'task.create',
      draft: {
        title,
        startedAt,
        systemId: owner,
        projectId: null,
        content: emptyContent(),
        markdown: `${title}正文`,
      },
    }).createdId!;
    if (deleted) store.mutate({ type: 'task.delete', id });
  }
  const exporter = new SystemExports(store, vault);
  const target = path.join(root, '系统资料.md');
  const options: SystemExportOptions = {
    systemId,
    formats: ['markdown'],
    secretKinds: [],
    includeDocuments: false,
    includeTasks: true,
  };
  expect(await exporter.write(options, target)).toEqual({ path: target, files: 1 });
  const all = fs.readFileSync(target, 'utf8');
  for (const title of ['区间之前', '首日零点', '末日最后一分钟', '区间之后'])
    expect(all).toContain(`${title}正文`);
  for (const excluded of ['文档正文', '其他系统任务', '回收站任务'])
    expect(all).not.toContain(excluded);
  for (const [start, end, included, excluded] of [
    ['2025-10-20', '2025-10-21', ['首日零点', '末日最后一分钟'], ['区间之前', '区间之后']],
    ['2025-10-21', '', ['末日最后一分钟', '区间之后'], ['区间之前', '首日零点']],
    ['', '2025-10-20', ['区间之前', '首日零点'], ['末日最后一分钟', '区间之后']],
    ['2025-10-20', '2025-10-20', ['首日零点'], ['末日最后一分钟']],
    ['2027-01-01', '', [], ['区间之前', '首日零点', '末日最后一分钟', '区间之后']],
  ] as const) {
    await exporter.write({ ...options, taskStartDate: start, taskEndDate: end }, target);
    const markdown = fs.readFileSync(target, 'utf8');
    for (const title of included) expect(markdown).toContain(`${title}正文`);
    for (const title of excluded) expect(markdown).not.toContain(`${title}正文`);
  }
  await exporter.write({ ...options, includeTasks: false }, target);
  expect(fs.readFileSync(target, 'utf8')).not.toContain('正文');
  const before = fs.readFileSync(target);
  for (const invalid of [
    { includeDocuments: 'false' },
    { includeTasks: 0 },
    { taskStartDate: 123 },
    { taskEndDate: null },
    { taskStartDate: '2026-02-30' },
    { taskEndDate: '2025-02-29' },
    { taskStartDate: '2025-10-22', taskEndDate: '2025-10-20' },
  ]) {
    await expect(
      exporter.write({ ...options, ...invalid } as SystemExportOptions, target),
    ).rejects.toThrow();
    expect(fs.readFileSync(target)).toEqual(before);
  }
  store.mutate({ type: 'document.delete', id: documentId });
  expect(await exporter.write({ ...options, includeDocuments: true }, target)).toEqual({
    path: target,
    files: 1,
  });
});

test('任务合并保留各自引用链接，单文件图片内嵌，多格式仅包含各格式总览', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-export-inline-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  const systemId = store.mutate({ type: 'system.save', name: '单文件平台' }).createdId!;
  const image = store.importImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
      'base64',
    ),
    '任务图片.png',
  );
  for (const title of ['第一项', '第二项'])
    store.mutate({
      type: 'task.create',
      draft: {
        title,
        systemId,
        projectId: null,
        content: emptyContent(),
        markdown: `[${title}链接][ref]\n\n[ref]: https://example.test/${title === '第一项' ? 'first' : 'second'}\n\n![图片](${image.src})\n\n\`\`\`text\n${image.src}\n\`\`\``,
      },
    });
  const options: SystemExportOptions = {
    systemId,
    formats: ['markdown'],
    secretKinds: [],
    includeDocuments: true,
    includeTasks: true,
  };
  const exporter = new SystemExports(store, vault, async (format, markdown, assets) => {
    expect(markdown).toContain('第一项链接');
    expect(markdown).toContain('第二项链接');
    expect(assets.size).toBe(1);
    return Buffer.from(format);
  });
  expect(exporter.fileExtension(options)).toBe('md');
  const target = path.join(root, '资料.md');
  await exporter.write(options, target);
  const markdown = fs.readFileSync(target, 'utf8');
  expect(markdown).toContain('[第一项链接](<https://example.test/first>)');
  expect(markdown).toContain('[第二项链接](<https://example.test/second>)');
  expect(markdown.match(/!\[图片\]\(data:image\/png;base64,/g)).toHaveLength(2);
  expect(markdown).toContain(`\`\`\`text\n${image.src}\n\`\`\``);
  const multiple = { ...options, formats: ['markdown', 'docx', 'pdf'] as const };
  expect(exporter.fileExtension({ ...multiple, formats: [...multiple.formats] })).toBe('zip');
  const bundle = path.join(root, '资料.zip');
  expect(
    (await exporter.write({ ...multiple, formats: [...multiple.formats] }, bundle)).files,
  ).toBe(3);
  expect([...(await files(bundle)).keys()]).toEqual([
    'Markdown/系统总览.md',
    'Word/系统总览.docx',
    'PDF/系统总览.pdf',
  ]);
  for (const format of ['docx', 'pdf'] as const) {
    expect(exporter.fileExtension({ ...options, formats: [format] })).toBe(format);
    expect(
      (await exporter.write({ ...options, formats: [format] }, path.join(root, `资料.${format}`)))
        .files,
    ).toBe(1);
  }
  fs.rmSync(path.join(store.directory, 'assets'), { recursive: true });
  await expect(exporter.write(options, target)).rejects.toThrow('图片无法读取');
  expect(fs.readFileSync(target, 'utf8')).toBe(markdown);
  await exporter.write({ ...options, includeTasks: false }, target);
  expect(fs.readFileSync(target, 'utf8')).not.toContain('第一项');
});

test.each([false, true])(
  '导出过程中锁定会取消秘密输出，失败保留原文件并清理本次临时文件（ZIP：%s）',
  async (bundle) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-export-cancel-'));
    roots.push(root);
    const store = new Store(root);
    stores.push(store);
    const vault = new Vault(store);
    vaults.push(vault);
    await vault.initialize('fictional-export-cancel-password');
    const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
    if (bundle) store.mutate({ type: 'document.create', context: { systemId } });
    vault.capture({
      kind: 'access',
      systemId,
      environmentId: null,
      name: 'GitLab',
      username: 'reader',
      password: 'fictional-export-secret',
    });
    const target = path.join(root, 'existing.zip');
    fs.writeFileSync(target, 'original-export');
    const exporter = new SystemExports(store, vault);
    const pending = exporter.write(
      {
        systemId,
        includeDocuments: true,
        includeTasks: true,
        formats: ['markdown'],
        secretKinds: ['password'],
      },
      target,
    );
    vault.lock();
    await expect(pending).rejects.toThrow('重新解锁');
    expect(fs.readFileSync(target, 'utf8')).toBe('original-export');
    expect(fs.readdirSync(root).filter((name) => name.startsWith('.workbench-export-'))).toEqual(
      [],
    );
    await expect(
      exporter.write(
        {
          systemId,
          includeDocuments: true,
          includeTasks: true,
          formats: ['invalid'] as any,
          secretKinds: [],
        },
        target,
      ),
    ).rejects.toThrow('格式');
    expect(fs.readFileSync(target, 'utf8')).toBe('original-export');
  },
);

test('长文档输出不会在重新解锁或资料恢复后迟到发布旧会话内容', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-export-session-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  const password = 'fictional-export-session-password';
  await vault.initialize(password);
  const systemId = store.mutate({ type: 'system.save', name: '订单平台' }).createdId!;
  vault.capture({
    kind: 'access',
    systemId,
    environmentId: null,
    name: 'GitLab',
    password: 'fictional-sensitive-export',
  });
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const render = async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Buffer.from('%PDF-1.7\nfictional-renderer-output');
  };
  const exporter = new SystemExports(store, vault, render);
  const target = path.join(root, 'late.zip');
  const first = exporter.write(
    {
      systemId,
      includeDocuments: true,
      includeTasks: true,
      formats: ['pdf'],
      secretKinds: ['password'],
    },
    target,
  );
  await entered;
  vault.lock();
  await vault.unlock(password);
  release();
  await expect(first).rejects.toThrow('重新解锁');
  await exporter.whenIdle();
  expect(fs.existsSync(target)).toBe(false);
  const backups = new Backups(store);
  const backupFile = path.join(root, 'source.cwb');
  await backups.create(backupFile);
  const prepared = await backups.inspect(backupFile, password);
  const second = exporter.write(
    { systemId, includeDocuments: true, includeTasks: true, formats: ['pdf'], secretKinds: [] },
    target,
  );
  await backups.restore(prepared.token);
  release();
  await expect(second).rejects.toThrow('资料库已切换');
  await exporter.whenIdle();
  expect(fs.existsSync(target)).toBe(false);
  expect(fs.readdirSync(root).filter((name) => name.startsWith('.workbench-export-'))).toEqual([]);
});

test('Markdown 系统资料包包含独立文档、任务、图片和所选密码，排除其他系统、通用与回收站', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-system-export-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  await vault.initialize('fictional-export-master-password');
  const a = store.mutate({ type: 'system.save', name: '订单/平台' }).createdId!;
  const b = store.mutate({ type: 'system.save', name: '设备平台' }).createdId!;
  const server = vault.capture({
    kind: 'server',
    systemId: a,
    environmentId: null,
    name: '应用节点',
    address: '192.0.2.10',
    fields: { 操作系统: 'Kylin Linux V10', CPU: '16 核', 内存: '32G', 硬盘: '500G' },
    username: 'deploy',
    password: 'fictional|password<&>',
  }).createdId;
  const account = store.snapshot().accounts.find((item) => item.resourceId === server)!;
  vault.save(account.id, 'token', 'fictional-token-excluded');
  const image = store.importImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
      'base64',
    ),
    '现场.png',
  );
  for (const [systemId, title, markdown, deleted] of [
    [a, '排障/说明 (生产)#1', `正文与图片\n\n![现场](${image.src})`, false],
    [a, '排障/说明 (生产)#1', '同名独立文档', false],
    [a, '已删除', 'excluded-trash-marker', true],
    [b, '其他系统', 'excluded-system-marker', false],
    [null, '通用模板', 'excluded-common-marker', false],
  ] as const) {
    const id = store.mutate({ type: 'document.create', context: { systemId } }).createdId!;
    store.mutate({ ...store.document(id), type: 'document.edit', title, markdown });
    if (deleted) store.mutate({ type: 'document.delete', id });
  }
  store.mutate({
    type: 'task.create',
    draft: {
      title: '无项目系统任务',
      dueAt: { kind: 'date', value: '2026-10-23' },
      urgentAt: { kind: 'date', value: '2026-10-20' },
      projectId: null,
      systemId: a,
      content: emptyContent(),
      markdown: '任务正文完整保留',
    },
  });
  const before = store.snapshot();
  const target = path.join(root, 'export.zip');
  const exporter = new SystemExports(store, vault);
  await exporter.write(
    {
      systemId: a,
      includeDocuments: true,
      includeTasks: true,
      formats: ['markdown'],
      secretKinds: ['password'],
    },
    target,
  );
  const output = await files(target);
  const overview = output.get('Markdown/系统总览.md')!.toString();
  expect(overview).toContain('32G');
  expect(overview).toContain('192.0.2.10');
  expect(overview).toContain('fictional|password<&>');
  const documents = [...output].filter(([name]) => name.startsWith('Markdown/文档/'));
  expect(documents).toHaveLength(2);
  expect(new Set(documents.map(([name]) => name)).size).toBe(2);
  for (const link of overview.matchAll(/\]\(([^)]+)\)/g))
    expect(output.has(`Markdown/${decodeURIComponent(link[1].replace(/^<|>$/g, ''))}`)).toBe(true);
  const markdown = [...output]
    .filter(([name]) => name.endsWith('.md'))
    .map(([, bytes]) => bytes.toString())
    .join('\n');
  expect(markdown).toContain('任务正文完整保留');
  expect(markdown).toContain('预计完成时间');
  expect(markdown).toContain('2026-10-23');
  expect(markdown).toContain('临期开始时间');
  expect(markdown).toContain('../图片/');
  expect(markdown).not.toContain('workbench-asset:');
  for (const excluded of [
    'excluded-trash-marker',
    'excluded-system-marker',
    'excluded-common-marker',
    'fictional-token-excluded',
  ])
    expect(markdown).not.toContain(excluded);
  expect(
    [...output.keys()].some((name) => name.startsWith('Markdown/图片/') && name.endsWith('.png')),
  ).toBe(true);
  expect(store.snapshot()).toEqual(before);
  vault.save(account.id, 'privateKey', 'fictional-private-key');
  await exporter.write(
    {
      systemId: a,
      includeDocuments: true,
      includeTasks: true,
      formats: ['markdown'],
      secretKinds: ['token', 'privateKey'],
    },
    path.join(root, 'keys.zip'),
  );
  const keys = (await files(path.join(root, 'keys.zip'))).get('Markdown/系统总览.md')!.toString();
  expect(keys).toContain('fictional-token-excluded');
  expect(keys).toContain('fictional-private-key');
  expect(keys).not.toContain('fictional|password<&>');
  vault.lock();
  await expect(
    exporter.write(
      {
        systemId: a,
        includeDocuments: true,
        includeTasks: true,
        formats: ['markdown'],
        secretKinds: ['password'],
      },
      path.join(root, 'locked.zip'),
    ),
  ).rejects.toThrow('解锁');
  expect(fs.existsSync(path.join(root, 'locked.zip'))).toBe(false);
  await exporter.write(
    {
      systemId: a,
      includeDocuments: true,
      includeTasks: true,
      formats: ['markdown'],
      secretKinds: [],
    },
    path.join(root, 'metadata.zip'),
  );
  expect(
    (await files(path.join(root, 'metadata.zip'))).get('Markdown/系统总览.md')!.toString(),
  ).not.toContain('fictional|password<&>');
  await expect(
    exporter.write(
      {
        systemId: a,
        includeDocuments: true,
        includeTasks: true,
        formats: ['markdown'],
        secretKinds: [],
      },
      path.join(root, 'missing-directory', 'out.zip'),
    ),
  ).rejects.toThrow();
  fs.rmSync(path.join(store.directory, 'assets'), { recursive: true });
  await expect(
    exporter.write(
      {
        systemId: a,
        includeDocuments: true,
        includeTasks: true,
        formats: ['markdown'],
        secretKinds: [],
      },
      target,
    ),
  ).rejects.toThrow('图片无法读取');
  expect((await files(target)).get('Markdown/系统总览.md')).toEqual(
    output.get('Markdown/系统总览.md'),
  );
});

test('形似图片 URI 的密码和代码原样保留，只打包真正图片节点，外部图片改为说明', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-image-nodes-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  await vault.initialize('fictional-image-node-password');
  const systemId = store.mutate({ type: 'system.save', name: '节点语义' }).createdId!;
  const missing = `workbench-asset://image/${'a'.repeat(64)}.png`;
  vault.capture({ kind: 'access', systemId, environmentId: null, name: '入口', password: missing });
  const image = store.importImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
      'base64',
    ),
    '截图.png',
  );
  const id = store.mutate({ type: 'document.create', context: { systemId } }).createdId!;
  store.mutate({
    ...store.document(id),
    type: 'document.edit',
    title: '原始代码',
    markdown: `# 说明\n\n\`${image.src}\` 和 \`&copy;\`\n\n\`\`\`text\n![不是图片](${image.src})\n\`\`\`\n\n![真正图片][现场]\n\n[现场]: ${image.src}\n\n![外部](https://example.test/remote.png)\n\n> 引用 **强调**\n\n- [x] 完成\n  - 嵌套\n\n| A | B |\n| --- | ---: |\n| 内容 | 32G |`,
  });
  const target = path.join(root, 'nodes.zip');
  await new SystemExports(store, vault).write(
    {
      systemId,
      includeDocuments: true,
      includeTasks: true,
      formats: ['markdown'],
      secretKinds: ['password'],
    },
    target,
  );
  const output = await files(target);
  expect(output.get('Markdown/系统总览.md')!.toString()).toContain(missing);
  const document = [...output].find(([name]) => name.startsWith('Markdown/文档/'))![1].toString();
  expect(document).toContain(`\`${image.src}\``);
  expect(document).toContain(`![不是图片](${image.src})`);
  expect(document).toContain('`&copy;`');
  expect(document).toContain('外部图片：');
  expect(document).not.toContain('![外部]');
  expect(document).toContain('![真正图片](../图片/');
  expect(document).toContain('- [x] 完成');
  expect([...output.keys()].filter((name) => name.startsWith('Markdown/图片/'))).toHaveLength(1);
});

test('新台账范围、节点、运维和任务历史进入导出与完整备份，恢复保留身份', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-expanded-export-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const vault = new Vault(store);
  vaults.push(vault);
  const password = 'fictional-expanded-backup-password';
  await vault.initialize(password);
  const systemId = store.mutate({ type: 'system.save', name: '扩展平台' }).createdId!,
    prod = store.mutate({ type: 'environment.save', systemId, name: '生产' }).createdId!,
    testing = store.mutate({ type: 'environment.save', systemId, name: '测试' }).createdId!;
  const server = store.mutate({
    type: 'resource.save',
    systemId,
    environmentId: null,
    kind: 'server',
    name: '应用节点',
    address: '192.0.2.19',
  }).createdId!;
  store.mutate({
    type: 'scope.save',
    kind: 'resource',
    ownerId: server,
    scope: { environmentIds: [prod, testing], tags: ['内网'] },
  });
  const service = store.mutate({ type: 'service.save', systemId, name: '订单服务' }).createdId!;
  const node = store.mutate({
    type: 'node.save',
    value: {
      serviceId: service,
      environmentId: prod,
      name: '独立节点',
      serverId: server,
      address: '',
      port: '8080',
      notes: '调度说明',
      mode: 'fixed',
      count: '',
    },
  }).createdId!;
  const operation = store.mutate({
    type: 'operation.save',
    value: {
      systemId,
      environmentId: prod,
      serviceId: service,
      resourceId: null,
      documentId: null,
      name: '每日巡检',
      kind: 'job',
      frequency: '每日 02:00',
      status: 'unverified',
      notes: '先校对',
    },
  }).createdId!;
  const task = store.mutate({
    type: 'task.create',
    draft: {
      title: '迁移任务',
      projectId: null,
      systemId,
      content: emptyContent(),
      markdown: '任务正文',
      history: '原项目：建设一期',
    },
  }).createdId!;
  const exportPath = path.join(root, 'expanded.md');
  await new SystemExports(store, vault).write(
    {
      systemId,
      includeDocuments: true,
      includeTasks: true,
      formats: ['markdown'],
      secretKinds: [],
    },
    exportPath,
  );
  const overview = fs.readFileSync(exportPath, 'utf8');
  for (const value of ['生产、测试', '内网', '独立节点', '192.0.2.19', '每日巡检', '每日 02:00'])
    expect(overview).toContain(value);
  expect(overview.match(/### 应用节点/g) || []).toHaveLength(1);
  expect(overview).toContain('原项目：建设一期');
  expect(overview).not.toContain('| 项目 |');
  expect(store.globalSearch('独立节点')[0].kind).toBe('deployment');
  expect(store.globalSearch('每日巡检')[0].kind).toBe('operation');
  expect(store.globalSearch('内网 应用节点').some((hit) => hit.id === server)).toBe(true);
  const backup = new Backups(store),
    backupPath = path.join(root, 'complete.cwb');
  await backup.create(backupPath);
  store.mutate({ type: 'node.delete', id: node });
  store.mutate({ type: 'operation.delete', id: operation });
  const info = await backup.inspect(backupPath, password);
  await backup.restore(info.token);
  expect(store.snapshot().deploymentNodes[0]).toMatchObject({ id: node, serverId: server });
  expect(store.snapshot().operations[0].id).toBe(operation);
  expect(store.task(task).history).toBe('原项目：建设一期');
  expect(store.snapshot().scopes.find((s) => s.ownerId === server)?.environmentIds).toEqual([
    prod,
    testing,
  ]);
});

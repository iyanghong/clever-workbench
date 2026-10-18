import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import { text, type Store } from './store';
import { exportImageNames, portableMarkdown } from './export-markdown';
import type { Vault } from './vault';
import {
  exportFormatLabels,
  type ExportFormat,
  type SystemExportOptions,
  type SystemExportResult,
} from '../src/export-types';
import { secretLabels } from '../src/vault-types';
import type { ObjectContext } from '../src/ledger-types';

type ExportDocument = { name: string; markdown: string };
export type DocumentRenderer = (
  format: Exclude<ExportFormat, 'markdown'>,
  markdown: string,
  images: Map<string, Buffer>,
) => Promise<Buffer>;
const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/[\\`*_{}\[\]<>#|!]/g, '\\$&');
const heading = (value: string) => escape(value.replace(/\s+/g, ' '));
const date = (value: number | null) =>
  value === null ? '—' : new Date(value).toISOString().replace('T', ' ').slice(0, 19);
const table = (rows: [string, string][]) =>
  '| 信息 | 内容 |\n| --- | --- |\n' +
  rows
    .map(([key, value]) => `| ${escape(key)} | ${escape(value || '—').replace(/\r?\n/g, '<br>')} |`)
    .join('\n') +
  '\n\n';
function filename(title: string, index: number) {
  const name =
    Array.from(
      title
        .normalize('NFC')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/g, ''),
    )
      .slice(0, 40)
      .join('') || '未命名';
  return `${String(index + 1).padStart(3, '0')}-${name}`;
}
const fileLink = (name: string) =>
  name
    .split('/')
    .map((part) =>
      encodeURIComponent(part).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`),
    )
    .join('/');
function code(value: string) {
  const length = Math.max(3, ...[...value.matchAll(/`+/g)].map((match) => match[0].length + 1));
  const fence = '`'.repeat(length);
  return `${fence}text\n${value}\n${fence}\n\n`;
}

export class SystemExports {
  private busy = false;
  private idleWaiters = new Set<() => void>();
  constructor(
    private store: Store,
    private vault: Vault,
    private renderDocument?: DocumentRenderer,
  ) {}
  whenIdle() {
    if (!this.busy) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  validate(options: SystemExportOptions) {
    if (!options || typeof options !== 'object') throw new Error('导出选项无效。');
    this.store.ledger.system(text(options.systemId, 100));
    if (
      !Array.isArray(options.formats) ||
      !options.formats.length ||
      options.formats.length !== new Set(options.formats).size ||
      options.formats.some((format) => !['markdown', 'docx', 'pdf'].includes(format))
    )
      throw new Error('请选择支持的导出格式。');
    if (
      !Array.isArray(options.secretKinds) ||
      options.secretKinds.length !== new Set(options.secretKinds).size ||
      options.secretKinds.some((kind) => !['password', 'token', 'privateKey'].includes(kind))
    )
      throw new Error('请选择需要导出的秘密类型。');
  }

  private collect(options: SystemExportOptions) {
    this.validate(options);
    const snapshot = this.store.snapshot();
    const system = snapshot.systems.find((item) => item.id === options.systemId)!;
    const accounts = snapshot.accounts.filter((item) => item.systemId === system.id);
    const links = snapshot.systemProjects.filter((item) => item.systemId === system.id);
    const environments = snapshot.environments.filter((item) => item.systemId === system.id);
    const services = snapshot.services.filter((item) => item.systemId === system.id);
    const resources = snapshot.resources.filter((item) => item.systemId === system.id);
    const entries = snapshot.accessEntries.filter((item) => item.systemId === system.id);
    const hasSecrets = accounts.some((account) =>
      account.secretKinds.some((kind) => options.secretKinds.includes(kind)),
    );
    const assertSession = hasSecrets ? this.vault.authorizeSecretOperation() : () => {};
    const generation = this.store.generation;
    const assertCurrent = () => {
      if (this.store.generation !== generation) throw new Error('资料库已切换，请重新导出。');
      assertSession();
    };
    const environmentName = (id: string | null | undefined) =>
      snapshot.environments.find((item) => item.id === id)?.name ?? '系统通用';
    const projectName = (id: string | null) =>
      snapshot.projects.find((item) => item.id === id)?.name ?? '不关联项目';
    const background = (
      value: Partial<ObjectContext> & { projectId: string | null },
    ): [string, string][] => [
      ['系统', system.name],
      ['项目', projectName(value.projectId)],
      ['环境', environmentName(value.environmentId)],
      ['资源', snapshot.resources.find((item) => item.id === value.resourceId)?.name ?? '—'],
    ];
    const documents: ExportDocument[] = [];
    const tasks = snapshot.tasks.filter(
      (item) => item.systemId === system.id && item.deletedAt === null,
    );
    const records = snapshot.documents.filter(
      (item) => item.systemId === system.id && item.deletedAt === null,
    );
    let overview = `# ${heading(system.name)} 系统总览\n\n本资料包包含该系统的技术台账、关联任务和文档。导出时间采用 UTC。\n\n`;
    if (hasSecrets) overview += '**包含明文秘密，请妥善保存和交接。**\n\n';
    overview += table([
      ['系统', system.name],
      ['登录地址', system.url],
      ['当前项目', projectName(system.currentProjectId)],
      ['创建时间', date(system.createdAt)],
      ['更新时间', date(system.updatedAt)],
      ['导出时间', date(Date.now())],
      ['说明', system.notes],
    ]);
    if (links.length) overview += '## 项目关联\n\n';
    for (const link of links)
      overview += table([
        ['项目', projectName(link.projectId)],
        ['阶段', link.projectId === system.currentProjectId ? '当前' : '历史'],
        ['关联时间', date(link.linkedAt)],
        [
          '归档时间',
          date(snapshot.projects.find((p) => p.id === link.projectId)?.archivedAt ?? null),
        ],
      ]);
    if (environments.length) overview += '## 环境\n\n';
    for (const item of environments)
      overview += table([
        ['环境', item.name],
        ['说明', item.notes],
      ]);
    if (services.length) overview += '## 服务与部署\n\n';
    for (const service of services) {
      overview +=
        `### ${heading(service.name)}\n\n` +
        table([
          ['仓库', service.repository],
          ['说明', service.notes],
        ]);
      for (const deployment of snapshot.deployments.filter((item) => item.serviceId === service.id))
        overview += table([
          ['环境', environmentName(deployment.environmentId)],
          ['部署地址', deployment.address],
          ['端口', deployment.port],
          ['说明', deployment.notes],
        ]);
    }
    if (resources.length) overview += '## 资源与服务器\n\n';
    for (const resource of resources)
      overview +=
        `### ${heading(resource.name)}\n\n` +
        table([
          ['类型', { server: '服务器', redis: 'Redis', other: '其他资源' }[resource.kind]],
          ['环境', environmentName(resource.environmentId)],
          ['IP 或地址', resource.address],
          ['端口', resource.port],
          ...Object.entries(resource.fields),
          ['说明', resource.notes],
        ]);
    if (entries.length) overview += '## 访问入口\n\n';
    for (const entry of entries) {
      overview +=
        `### ${heading(entry.name)}\n\n` +
        table([
          ['环境', environmentName(entry.environmentId)],
          ['常用账号', accounts.find((a) => a.id === entry.preferredAccountId)?.name ?? '—'],
          ['说明', entry.notes],
        ]);
      for (const address of entry.addresses)
        overview += table([
          ['地址名称', address.label],
          ['地址', address.url],
          ['常用地址', address.id === entry.preferredAddressId ? '是' : '否'],
        ]);
    }
    if (accounts.length) overview += '## 账号\n\n';
    for (const account of accounts) {
      const owner =
        snapshot.resources.find((r) => r.id === account.resourceId)?.name ??
        snapshot.accessEntries.find((e) => e.id === account.accessId)?.name ??
        '系统账号';
      overview +=
        `### ${heading(owner)} / ${heading(account.name)}\n\n` +
        table([
          ['环境', environmentName(account.environmentId)],
          ['用途或角色', account.name],
          ['用户名', account.username],
          ['说明', account.notes],
        ]);
      for (const kind of account.secretKinds) {
        overview += `**${secretLabels[kind]}**\n\n`;
        overview += options.secretKinds.includes(kind)
          ? code(this.vault.read(account.id, kind))
          : '已保存，本次未选择导出。\n\n';
      }
    }
    if (tasks.length) overview += '## 关联任务\n\n';
    for (const [index, task] of tasks.entries()) {
      const name = `任务/${filename(task.title, index)}.md`;
      overview += `- [${heading(task.title)}](${fileLink(name)}) · ${task.completedAt === null ? '未完成' : '已完成'}\n`;
      documents.push({
        name,
        markdown:
          `# ${heading(task.title)}\n\n` +
          table([
            ...background(task),
            ['创建时间', date(task.createdAt)],
            ['开始时间', date(task.startedAt)],
            ['完成时间', date(task.completedAt)],
          ]) +
          this.store.task(task.id).markdown,
      });
    }
    if (records.length) overview += '\n## 技术文档\n\n';
    for (const [index, record] of records.entries()) {
      const name = `文档/${filename(record.title, index)}.md`;
      overview += `- [${heading(record.title || '未命名文档')}](${fileLink(name)})\n`;
      documents.push({
        name,
        markdown:
          `# ${heading(record.title || '未命名文档')}\n\n` +
          table([
            ...background(record),
            ['创建时间', date(record.createdAt)],
            ['更新时间', date(record.updatedAt)],
          ]) +
          this.store.document(record.id).markdown,
      });
    }
    documents.unshift({ name: '系统总览.md', markdown: overview });
    const assets = new Map<string, Buffer>();
    for (const document of documents)
      for (const name of exportImageNames(document.markdown)) {
        if (!assets.has(name)) {
          try {
            assets.set(name, fs.readFileSync(path.join(this.store.directory, 'assets', name)));
          } catch {
            throw new Error('文档引用的图片无法读取，请修复图片后再导出。');
          }
        }
      }
    return { documents, assets, assertCurrent, hasSecrets };
  }

  async write(options: SystemExportOptions, target: string): Promise<SystemExportResult> {
    if (this.busy) throw new Error('正在导出系统资料，请稍后再试。');
    this.busy = true;
    const temporary = path.join(path.dirname(target), `.workbench-export-${randomUUID()}.tmp`);
    let stream: Readable | undefined;
    let writing: Promise<void> | undefined;
    try {
      const { documents, assets, assertCurrent, hasSecrets } = this.collect(options);
      const zip = new ZipFile();
      stream = zip.outputStream as Readable;
      zip.on('error', (error) => stream?.destroy(error));
      writing = pipeline(stream, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      let writeError: unknown;
      void writing.catch((error) => {
        writeError = error;
      });
      let fileCount = 1;
      zip.addBuffer(
        Buffer.from(
          `系统资料包\n\n请按格式目录打开系统总览及各份文档。${hasSecrets ? '\n包含明文秘密，请妥善保存和交接。' : ''}\n`,
        ),
        '阅读说明.txt',
      );
      for (const format of options.formats) {
        for (const document of documents) {
          if (writeError) throw writeError;
          assertCurrent();
          let bytes: Buffer;
          if (format === 'markdown') {
            const prefix = document.name.includes('/') ? '../图片/' : '图片/';
            bytes = Buffer.from(portableMarkdown(document.markdown, prefix));
          } else {
            if (!this.renderDocument) throw new Error('当前环境无法生成所选文档格式。');
            bytes = await this.renderDocument(format, document.markdown, assets);
          }
          assertCurrent();
          zip.addBuffer(
            bytes,
            `${exportFormatLabels[format]}/${document.name.replace(/\.md$/, format === 'markdown' ? '.md' : `.${format}`)}`,
          );
          fileCount++;
        }
        if (format === 'markdown')
          for (const [name, bytes] of assets) {
            zip.addBuffer(bytes, `Markdown/图片/${name}`);
            fileCount++;
          }
      }
      zip.end();
      await writing;
      assertCurrent();
      fs.renameSync(temporary, target);
      return { path: target, files: fileCount };
    } finally {
      stream?.destroy();
      await writing?.catch(() => {});
      try {
        fs.rmSync(temporary, { force: true });
      } finally {
        this.busy = false;
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    }
  }
}

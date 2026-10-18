// Fictional, isolated data for inspecting the app's actual export files and screens.
import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const output = path.resolve(process.env.CWB_EXPORT_QA_DIR || 'release/export-qa');
await fs.mkdir(output, { recursive: true });
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-export-qa-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  const image = [
    ...(await fs.readFile('.scratch/ledger-access-entries/evidence/server-capture.png')),
  ];
  const systemId = await page.evaluate(async (bytes) => {
    const api = window.desktop;
    const oldProject = (
      await api.mutate({ type: 'project.create', name: '订单一期', color: '#007aff' })
    ).createdId;
    const nextProject = (
      await api.mutate({ type: 'project.create', name: '订单二期', color: '#007aff' })
    ).createdId;
    const id = (
      await api.mutate({
        type: 'system.save',
        name: '订单平台',
        projectId: oldProject,
        url: 'https://orders.example.test',
        notes: '以下内容均为虚构验收资料。',
      })
    ).createdId;
    await api.mutate({ type: 'system.save', id, name: '订单平台', projectId: nextProject });
    const environmentId = (
      await api.mutate({
        type: 'environment.save',
        systemId: id,
        name: '生产环境',
        notes: '双节点部署',
      })
    ).createdId;
    const serviceId = (
      await api.mutate({
        type: 'service.save',
        systemId: id,
        name: '订单服务',
        repository: 'git@example.test:orders/service.git',
        notes: '统一处理订单请求',
      })
    ).createdId;
    await api.mutate({
      type: 'deployment.save',
      serviceId,
      environmentId,
      address: 'https://api.example.test',
      port: '8443',
      notes: '网关转发',
    });
    await api.initializeVault('fictional-export-qa-password');
    await api.captureLedger({
      kind: 'server',
      systemId: id,
      environmentId,
      name: '应用服务器 1',
      address: '192.0.2.111',
      purpose: '应用服务、定时任务与日志收集',
      fields: {
        操作系统: 'Kylin Linux V10',
        CPU: 'Intel Core Processor (Skylake) 16 核',
        内存: '32G',
        硬盘: '500G',
      },
      username: 'deploy',
      password: 'fictional-only-password<&>|`',
    });
    const entry = (
      await api.captureLedger({
        kind: 'access',
        systemId: id,
        environmentId: null,
        name: 'GitLab',
        address: 'https://git.example.test',
        username: 'maintainer',
        password: 'fictional-git-password',
      })
    ).createdId;
    const current = (await api.snapshot()).accessEntries.find((value) => value.id === entry);
    await api.mutate({
      type: 'access.save',
      id: entry,
      addresses: [
        ...current.addresses,
        { label: '内网', url: 'https://git.internal.example.test' },
      ],
    });
    const attachment = await api.importImage(Uint8Array.from(bytes), '服务器录入示意.png');
    const rows = Array.from(
      { length: 32 },
      (_, index) =>
        `| 节点 ${String(index + 1).padStart(2, '0')} | 192.0.2.${index + 1} | 运行正常，保留最近七天的审计日志。 |`,
    ).join('\n');
    const markdown = [
      '## 排障步骤',
      '这是一份包含 **中文与 English**、*强调*、~~旧方案~~及 `systemctl status` 的说明。字符检查：© & < >。',
      '1. 先确认告警。\n2. 检查日志。\n   - 记录现场。\n   - 保留回退路径。',
      '- [x] 确认节点状态\n- [ ] 完成复盘',
      '> 所有地址、账号和密码仅用于虚构验收。',
      '```sh\ncurl --fail https://api.example.test/health\nexport SAMPLE="literal <value> & test"\n```',
      '## 节点清单',
      '| 节点 | IP | 用途和状态 |\n| --- | --- | --- |\n' + rows,
      '## 现场图片',
      `![服务器录入示意](${attachment.src})`,
      '图片后续正文：以上检查已完成，最后一段应可见。',
    ].join('\n\n');
    for (const body of [markdown, '## 补充记录\n\n同名文档仍然独立保留。']) {
      const documentId = (
        await api.mutate({
          type: 'document.create',
          context: { systemId: id, environmentId },
          projectId: oldProject,
        })
      ).createdId;
      await api.mutate({
        ...(await api.document(documentId)),
        type: 'document.edit',
        title: '排障/说明 (生产)#1',
        markdown: body,
      });
    }
    const common = (await api.mutate({ type: 'document.create', context: { systemId: null } }))
      .createdId;
    await api.mutate({
      ...(await api.document(common)),
      type: 'document.edit',
      title: '通用模板',
      markdown: '这份通用文档不进入系统资料。',
    });
    await api.mutate({
      type: 'task.create',
      draft: {
        title: '整理部署说明',
        projectId: null,
        systemId: id,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        markdown:
          '## 本次工作\n\n- 检查两台服务器\n- 更新维护文档\n\n项目可留空，系统关联仍然保留。',
      },
    });
    return id;
  }, image);
  await page.getByRole('button', { name: '文档', exact: true }).click();
  await page.getByLabel('文档范围', { exact: true }).selectOption(systemId);
  await page.getByRole('button', { name: '文档 排障/说明 (生产)#1', exact: true }).first().click();
  await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue('排障/说明 (生产)#1');
  await page.screenshot({ path: path.join(output, 'system-documents.png') });
  await page.getByLabel('文档范围', { exact: true }).selectOption('common');
  await page.getByRole('button', { name: '文档 通用模板', exact: true }).click();
  await expect(page.getByLabel('文档标题', { exact: true })).toHaveValue('通用模板');
  await page.screenshot({ path: path.join(output, 'general-documents.png') });
  await page.getByRole('button', { name: '快速新建', exact: true }).click();
  await page.getByRole('button', { name: '新任务', exact: true }).click();
  await page.getByRole('dialog').getByLabel('关联系统', { exact: true }).selectOption(systemId);
  await page.getByRole('dialog').screenshot({ path: path.join(output, 'system-task.png') });
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await app.evaluate(
    ({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    },
    path.join(output, 'system-package.zip'),
  );
  await page.getByRole('button', { name: '台账', exact: true }).click();
  await page.getByRole('button', { name: '导出系统资料', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导出系统资料', exact: true });
  await dialog.getByLabel('Word', { exact: true }).check();
  await dialog.getByLabel('PDF', { exact: true }).check();
  await dialog.getByRole('button', { name: '导出资料包', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('系统资料包已导出', { timeout: 30000 });
  await dialog.screenshot({ path: path.join(output, 'system-export-dialog.png') });
  await fs.writeFile(
    path.join(output, 'generation.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        fictionalData: true,
        formats: ['markdown', 'docx', 'pdf'],
        files: 14,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Export QA files saved: ${output}`);
} finally {
  await app.close();
  await fs.rm(directory, { recursive: true, force: true });
}

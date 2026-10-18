import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../electron/vault';
import { Backups } from '../electron/backup';
import { Store } from '../electron/store';
import { emptyContent } from '../src/domain';
const stores: Store[] = [],
  roots: string[] = [];
function open() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-docs-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('从资源创建文档带入当时项目，系统换项目后仍可查询旧文档并恢复误删', () => {
  const store = open();
  const projectId = store.mutate({
    type: 'project.create',
    name: '园区一期',
    color: '#007aff',
  }).createdId!;
  const nextProject = store.mutate({
    type: 'project.create',
    name: '园区二期',
    color: '#34a271',
  }).createdId!;
  const systemId = store.mutate({ type: 'system.save', name: '园区平台', projectId }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const resourceId = store.mutate({
    type: 'resource.save',
    environmentId,
    kind: 'redis',
    name: '生产缓存',
  }).createdId!;
  const id = store.mutate({ type: 'document.create', context: { resourceId } }).createdId!;
  expect(store.document(id)).toMatchObject({
    title: '',
    projectId,
    systemId,
    environmentId,
    resourceId,
    markdown: '',
  });
  store.mutate({
    type: 'document.edit',
    id,
    title: '缓存连接排障',
    markdown: '## 根因\n\n连接池耗尽',
    content: emptyContent(),
    projectId,
    systemId,
    environmentId,
    resourceId,
  });
  store.mutate({ type: 'system.save', id: systemId, name: '智慧园区平台', projectId: nextProject });
  expect(store.document(id)).toMatchObject({ projectId, systemId, resourceId });
  expect(store.searchDocuments('连接池')).toEqual([id]);
  expect(() => store.mutate({ type: 'resource.delete', id: resourceId })).toThrow('引用');
  store.mutate({ type: 'document.delete', id });
  expect(store.searchDocuments('连接池')).toEqual([]);
  store.mutate({ type: 'document.restore', id });
  store.close();
  stores.pop();
  const reopened = new Store(store.root);
  stores.push(reopened);
  expect(reopened.document(id)).toMatchObject({
    projectId,
    systemId,
    environmentId,
    resourceId,
    markdown: '## 根因\n\n连接池耗尽',
    deletedAt: null,
  });
});

test('无标题未分类文档可保存，任务的资源背景可调整且校验环境', () => {
  const store = open();
  const doc = store.mutate({ type: 'document.create' }).createdId!;
  store.mutate({
    type: 'document.edit',
    id: doc,
    title: '',
    markdown: '先记录再整理。',
    content: emptyContent(),
    projectId: null,
    systemId: null,
    environmentId: null,
    resourceId: null,
  });
  expect(store.document(doc).markdown).toBe('先记录再整理。');
  const systemId = store.mutate({ type: 'system.save', name: '应用平台' }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const otherEnvironment = store.mutate({
    type: 'environment.save',
    systemId,
    name: '测试',
  }).createdId!;
  const resourceId = store.mutate({
    type: 'resource.save',
    environmentId,
    kind: 'redis',
    name: '缓存',
  }).createdId!;
  const taskId = store.mutate({
    type: 'task.create',
    draft: {
      title: '排查缓存',
      markdown: '',
      content: emptyContent(),
      projectId: null,
      systemId,
      environmentId,
      resourceId,
    },
  }).createdId!;
  expect(store.task(taskId)).toMatchObject({ environmentId, resourceId });
  expect(() =>
    store.mutate({
      type: 'document.edit',
      id: doc,
      title: '',
      markdown: '无效关联不会覆盖',
      content: emptyContent(),
      projectId: null,
      systemId,
      environmentId: otherEnvironment,
      resourceId,
    }),
  ).toThrow('环境');
  expect(store.document(doc).markdown).toBe('先记录再整理。');
});

test('备份保留源码文档和回收站引用的附件，恢复后仍能读取', async () => {
  const store = open(),
    backups = new Backups(store);
  const asset = store.importImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
      'base64',
    ),
    '现场.png',
  );
  const id = store.mutate({ type: 'document.create' }).createdId!;
  const markdown = `<details>原始结构</details>\n\n![现场](${asset.src})`;
  store.mutate({
    type: 'document.edit',
    id,
    title: '待恢复的资料',
    markdown,
    content: emptyContent(),
    projectId: null,
    systemId: null,
    environmentId: null,
    resourceId: null,
  });
  store.mutate({ type: 'document.delete', id });
  const filename = path.join(store.root, 'documents.zip');
  const vault = new Vault(store);
  await vault.initialize('fictional-document-backup-password');
  vault.lock();
  await backups.create(filename);
  store.mutate({ type: 'document.purge', id });
  const info = await backups.inspect(filename, 'fictional-document-backup-password');
  expect(info.documents).toBe(1);
  expect(info.images).toBe(1);
  await backups.restore(info.token);
  expect(store.document(id).markdown).toBe(markdown);
  expect(store.document(id).deletedAt).not.toBeNull();
  expect(fs.existsSync(path.join(store.directory, 'assets', asset.src.split('/').at(-1)!))).toBe(
    true,
  );
});

test('项目归档清除当前标记但保留历史，账号与旧项目文档继续维护', () => {
  const store = open();
  const projectId = store.mutate({
    type: 'project.create',
    name: '阶段项目',
    color: '#007aff',
  }).createdId!;
  const systemId = store.mutate({ type: 'system.save', name: '长期系统', projectId }).createdId!;
  const environmentId = store.mutate({
    type: 'environment.save',
    systemId,
    name: '生产',
  }).createdId!;
  const accountId = store.mutate({ type: 'account.save', environmentId, name: '超管' }).createdId!;
  const documentId = store.mutate({ type: 'document.create', context: { systemId } }).createdId!;
  const taskId = store.mutate({
    type: 'task.create',
    draft: { title: '阶段收尾', markdown: '', content: emptyContent(), projectId, systemId },
  }).createdId!;
  expect(() => store.mutate({ type: 'project.archive', id: projectId, archived: true })).toThrow(
    '未完成',
  );
  expect(store.snapshot().systems[0].currentProjectId).toBe(projectId);
  store.mutate({ type: 'task.complete', id: taskId, complete: true });
  store.mutate({ type: 'project.archive', id: projectId, archived: true });
  expect(store.snapshot().systems[0].currentProjectId).toBeNull();
  expect(store.snapshot().systemProjects).toContainEqual(
    expect.objectContaining({ systemId, projectId }),
  );
  store.mutate({
    type: 'account.save',
    id: accountId,
    environmentId,
    name: '运维超管',
    username: 'ops',
  });
  const document = store.document(documentId);
  store.mutate({ ...document, type: 'document.edit', markdown: '归档后补充复盘' });
  expect(store.document(documentId)).toMatchObject({ projectId, markdown: '归档后补充复盘' });
  expect(() => store.mutate({ type: 'task.complete', id: taskId, complete: false })).toThrow(
    '恢复项目',
  );
  store.mutate({ type: 'task.complete', id: taskId, complete: false, restoreProject: true });
  expect(store.snapshot().projects[0].archivedAt).toBeNull();
  expect(store.task(taskId).completedAt).toBeNull();
  expect(store.snapshot().systems[0].currentProjectId).toBeNull();
});

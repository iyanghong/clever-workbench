import { test, expect } from '@playwright/test';
import { electron } from './launch';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('任务可选保存预计完成日期，按创建月份归类，编辑正文不丢失日期', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-task-planning-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const id = await page.evaluate(
      async () =>
        (
          await window.desktop.mutate({
            type: 'task.create',
            draft: {
              title: '计划上线',
              projectId: null,
              content: { type: 'doc', content: [{ type: 'paragraph' }] },
              markdown: '',
            },
          })
        ).createdId!,
    );
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.locator('[data-task-group]')).toHaveCount(1);
    await page.locator('.task-open').filter({ hasText: '计划上线' }).click();
    await expect(page.getByLabel('预计完成日期', { exact: true })).toBeVisible({ timeout: 3000 });
    await page.getByLabel('预计完成日期', { exact: true }).fill('2026-10-23');
    await expect
      .poll(() => page.evaluate(async (id) => (await window.desktop.task(id)).dueAt, id))
      .toEqual({ kind: 'date', value: '2026-10-23' });
    await page.getByLabel('任务标题', { exact: true }).fill('计划上线并验证');
    await page.getByLabel('关闭详情').click();
    await expect
      .poll(() => page.evaluate(async (id) => await window.desktop.task(id), id))
      .toMatchObject({ title: '计划上线并验证', dueAt: { kind: 'date', value: '2026-10-23' } });
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('逾期和临期跨组置顶，切换到期口径及完成重开不产生重复任务', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-task-urgency-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    await app.evaluate(() => {
      Date.now = () => Date.parse('2026-10-20T02:00:00Z');
    });
    const page = await app.firstWindow();
    await page.clock.setFixedTime(new Date('2026-10-20T02:00:00Z'));
    await page.evaluate(async () => {
      for (const [title, due] of [
        ['普通任务', null],
        ['临期任务', '2026-10-20T14:00:00Z'],
        ['逾期任务', '2026-10-20T01:00:00Z'],
      ] as const) {
        await window.desktop.mutate({
          type: 'task.create',
          draft: {
            title,
            projectId: null,
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            markdown: '',
            dueAt: due ? { kind: 'time', value: Date.parse(due) } : null,
          },
        });
      }
    });
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.locator('[data-task-group="pending-overdue"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.task-title')).toHaveText(['逾期任务', '临期任务', '普通任务']);
    await page.getByRole('button', { name: '紧凑', exact: true }).click();
    await page.locator('.task-open').first().click();
    await expect(page.locator('.task-row[data-urgency="near"] .task-timing')).toBeVisible();
    expect(
      await page
        .locator('.task-row[data-urgency="near"] .task-open')
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(44);
    await page.getByLabel('关闭详情').click();
    await page.getByLabel('时间归类', { exact: true }).selectOption('due');
    await expect(page.locator('.task-title')).toHaveText(['逾期任务', '临期任务', '普通任务']);
    await expect(page.locator('[data-task-group="pending-unplanned"]')).toBeVisible();
    await page.getByRole('button', { name: '完成 逾期任务', exact: true }).click();
    await expect(page.locator('.task-title')).toHaveText(['临期任务', '普通任务']);
    await page.getByRole('button', { name: /^已完成/ }).click();
    await expect(page.locator('.task-row[data-urgency="overdue"]')).toHaveCount(0);
    await page.getByRole('button', { name: '重新打开 逾期任务', exact: true }).click();
    await page.getByRole('button', { name: /^未完成/ }).click();
    await expect(page.locator('.task-title')).toHaveText(['逾期任务', '临期任务', '普通任务']);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('自定义临期在指定时刻生效，清除后恢复默认规则', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-custom-urgency-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.clock.setFixedTime(new Date('2026-10-20T02:00:00Z'));
    await page.evaluate(async () =>
      window.desktop.mutate({
        type: 'task.create',
        draft: {
          title: '提前关注',
          projectId: null,
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          markdown: '',
          dueAt: { kind: 'date', value: '2026-10-26' },
          urgentAt: { kind: 'time', value: Date.parse('2026-10-20T03:00:00Z') },
        },
      }),
    );
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.locator('.task-row')).toHaveAttribute('data-urgency', 'normal');
    await page.clock.setFixedTime(new Date('2026-10-20T03:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.task-row')).toHaveAttribute('data-urgency', 'near');
    await page.locator('.task-open').click();
    await page.getByRole('button', { name: '清除临期开始时间', exact: true }).click();
    await page.getByLabel('关闭详情').click();
    await expect(page.locator('.task-row')).toHaveAttribute('data-urgency', 'normal');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('管理共用标签并组合筛选，优先区不能绕过标签条件', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-task-tags-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '管理标签', exact: true })).toBeVisible({
      timeout: 3000,
    });
    await page.getByRole('button', { name: '管理标签', exact: true }).click();
    const manager = page.getByRole('dialog', { name: '任务标签', exact: true });
    for (const [name, color] of [
      ['排障', 'red'],
      ['本周', 'blue'],
    ]) {
      await manager.getByLabel('标签名称', { exact: true }).fill(name);
      await manager.getByLabel('标签颜色', { exact: true }).selectOption(color);
      await manager.getByRole('button', { name: '创建标签', exact: true }).click();
      await expect(
        manager.getByRole('button', { name: `编辑标签 ${name}`, exact: true }),
      ).toBeVisible();
    }
    await manager.getByLabel('关闭任务标签').click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    const combined = await page.evaluate(async () => {
      const tags = (await window.desktop.snapshot()).taskTags!;
      const red = tags.find((tag) => tag.name === '排障')!.id;
      const blue = tags.find((tag) => tag.name === '本周')!.id;
      let combined = '';
      for (const [title, tagIds] of [
        ['紧急排障', [red]],
        ['两类任务', [red, blue]],
        ['普通本周', [blue]],
      ] as const) {
        const result = await window.desktop.mutate({
          type: 'task.create',
          draft: {
            title,
            projectId: null,
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            markdown: '',
            tagIds: [...tagIds],
            dueAt:
              title === '紧急排障'
                ? { kind: 'time', value: Math.floor(Date.now() / 60000) * 60000 + 3600000 }
                : null,
          },
        });
        if (title === '两类任务') combined = result.createdId!;
      }
      return combined;
    });
    await page.getByRole('button', { name: '工作任务', exact: true }).click();
    await page.getByText('标签筛选', { exact: true }).click();
    await page.getByLabel('筛选标签 排障', { exact: true }).check();
    await page.getByLabel('筛选标签 本周', { exact: true }).check();
    await expect(page.locator('.task-title')).toHaveCount(3);
    await page.getByLabel('标签匹配方式').selectOption('all');
    await expect(page.locator('.task-title')).toHaveText(['两类任务']);
    await page.locator('.task-open').click();
    await page.getByLabel('标签 本周', { exact: true }).uncheck();
    await page.getByLabel('关闭详情').click();
    await expect(page.locator('.task-title')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async (id) => (await window.desktop.task(id)).tagIds?.length, combined),
      )
      .toBe(1);
    await page.getByRole('button', { name: '管理标签', exact: true }).click();
    await manager.getByRole('button', { name: '删除标签 本周', exact: true }).click();
    await manager.getByRole('button', { name: '确认删除标签', exact: true }).click();
    await expect(manager.getByRole('button', { name: '编辑标签 本周', exact: true })).toHaveCount(
      0,
    );
    await manager.getByLabel('关闭任务标签').click();
    await expect(page.locator('.task-title')).toHaveCount(2);
    expect(await page.evaluate(async () => (await window.desktop.snapshot()).tasks.length)).toBe(3);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('首页和实际台账入口共用紧迫排序及标签，完成后入口同步更新', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-related-urgency-'));
  const env: Record<string, string> = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const systemId = (await window.desktop.mutate({ type: 'system.save', name: '计划系统' }))
        .createdId!;
      const other = (await window.desktop.mutate({ type: 'system.save', name: '其他系统' }))
        .createdId!;
      const tagId = (
        await window.desktop.mutate({ type: 'task-tag.save', name: '发布', color: 'blue' })
      ).createdId!;
      const now = Math.floor(Date.now() / 60000) * 60000;
      for (const [title, due, scope, urgentAt, tagIds] of [
        ['普通计划', now + 2 * 86400000, systemId, null, []],
        [
          '自定义关注',
          now + 5 * 86400000,
          systemId,
          { kind: 'time', value: now - 3600000 },
          [tagId],
        ],
        ['其他系统逾期', now - 3600000, other, null, []],
      ] as const)
        await window.desktop.mutate({
          type: 'task.create',
          draft: {
            title,
            projectId: null,
            systemId: scope,
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            markdown: '',
            dueAt: { kind: 'time', value: due },
            urgentAt,
            tagIds: [...tagIds],
          },
        });
    });
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.locator('.home-task-open strong')).toHaveText([
      '其他系统逾期',
      '自定义关注',
      '普通计划',
    ]);
    await expect(page.locator('.home-task').filter({ hasText: '自定义关注' })).toContainText(
      '发布',
    );
    await page.getByRole('button', { name: '台账', exact: true }).click();
    await page.getByRole('button', { name: '切换系统', exact: true }).click();
    await page
      .getByRole('button', { name: /计划系统/ })
      .last()
      .click();
    await page.getByRole('button', { name: '相关工作', exact: true }).click();
    const related = page.getByRole('dialog', { name: '系统相关工作' });
    await related.getByText(/已有记录/).click();
    await expect(related.locator('.related-task-title')).toHaveText(['自定义关注', '普通计划']);
    await related.locator('.related-task').filter({ hasText: '自定义关注' }).click();
    await page.getByRole('button', { name: '标记完成', exact: true }).click();
    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.locator('.home-task-open strong')).toHaveText(['其他系统逾期', '普通计划']);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

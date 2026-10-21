import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const checker = path.resolve('scripts/check-operation-guidance.mjs');
const guidance = await import(
  new URL('../scripts/release-tools/guidance.mjs', import.meta.url).href
);
const feature = {
  schemaVersion: 1,
  kind: 'feature',
  id: 'application-update',
  revision: 1,
  title: '检查更新',
  purpose: '确认应用是否有新版本。',
  platforms: ['darwin'],
  placements: ['settings-about'],
  prerequisites: { items: ['打开应用。'], notApplicableReason: '' },
  entry: { label: '设置 → 关于', target: 'settings-about' },
  steps: [
    {
      id: 'check',
      title: '检查版本',
      action: '点击检查更新。',
      expectedResult: '显示最新状态。',
      image: { src: 'assets/missing.png', alt: '检查更新按钮' },
    },
  ],
  completion: '版本状态已显示。',
  faq: { items: [], notApplicableReason: '没有其他准备事项。' },
};

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guidance-release-'));
  await fs.mkdir(path.join(root, 'content/guidance/features'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'content/guidance/features/update.json'),
    JSON.stringify(feature),
  );
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('相同内容在独立 Node 检查入口与本地发布得到一致警告，报告保留可用正文且退出成功', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.root, 'content/guidance/pending.json'), '{ invalid');
    const output = path.join(f.root, 'reports/guidance.json');
    const summary = path.join(f.root, 'reports/summary.md');
    await fs.mkdir(path.dirname(summary));
    const stdout = execFileSync(
      process.execPath,
      [checker, '--directory', f.root, '--output', output, '--github'],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      },
    );
    const report = JSON.parse(await fs.readFile(output, 'utf8'));
    expect(report.catalog.features.map((item: any) => item.id)).toEqual(['application-update']);
    expect(report.content).toBeNull();
    expect(report.warnings.map((item: any) => item.code)).toEqual(
      expect.arrayContaining(['invalid-json', 'missing-image', 'missing-release-guidance']),
    );
    expect(report.warnings).toEqual((await guidance.inspectOperationGuidance(f.root)).warnings);
    expect(stdout).toContain('::warning file=content/guidance/pending.json');
    expect(stdout).toContain('修正建议');
    expect(await fs.readFile(summary, 'utf8')).toContain('仅警告，不阻止发布');
    const invalidInvocation = spawnSync(
      process.execPath,
      [checker, '--directory', path.join(f.root, 'missing')],
      { encoding: 'utf8' },
    );
    expect(invalidInvocation.status).not.toBe(0);
  } finally {
    await f.cleanup();
  }
});

test('核对记录的失效步骤、未覆盖变化和错误通过状态只警告，并保留真实结果与缺项', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(
      path.join(f.root, 'content/guidance/pending.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'release-draft',
        operationChange: 'changed',
        summary: '增加更新入口说明。',
        changes: [{ id: 'update', summary: '可以检查更新。', guideIds: ['application-update'] }],
        review: {
          status: 'completed',
          reviewer: '核对维护者',
          checkedAt: '2026-10-22T00:00:00+08:00',
          source: 'a'.repeat(40),
          environment: 'macOS 隔离测试资料',
          checks: [
            {
              guideId: 'application-update',
              stepIds: ['removed-step'],
              result: 'failed',
              evidence: '旧入口已移除。',
            },
          ],
          knownGaps: ['新版步骤尚未核对。'],
        },
      }),
    );
    const report = await guidance.inspectOperationGuidance(f.root, { sourceSha: 'b'.repeat(40) });
    expect(report.warnings.map((item: any) => item.code)).toEqual(
      expect.arrayContaining([
        'unknown-review-step',
        'unreviewed-step',
        'review-status-conflict',
        'review-source-mismatch',
      ]),
    );
    expect(report.content.review.status).toBe('completed');
    expect(report.content.review.checks[0].result).toBe('failed');
    expect(guidance.formatOperationGuidance(report)).toContain('新版步骤尚未核对');
  } finally {
    await f.cleanup();
  }
});

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { loadGuidanceCatalog } from '../../src/guidance/catalog';
import { guidanceTarget } from '../../src/guidance/registry';
import type { FeatureGuide } from '../../src/guidance/types';

/** Read authored expectations from the tested app, including app.asar, never another checkout. */
export async function expectedFeatureGuide(app: ElectronApplication, id: string) {
  const { sources, platform } = await app.evaluate(({ app }) => {
    const fs = process.getBuiltinModule('node:fs');
    const path = process.getBuiltinModule('node:path');
    const root = path.join(
      app.getAppPath(),
      app.isPackaged ? 'dist-electron/guidance' : 'content/guidance',
    );
    if (app.isPackaged && !fs.existsSync(root))
      throw Error(
        '被测安装包尚未提供指引原始内容目录，不能用当前源码代替该包的内容期望。请使用包含此机制的安装包验收。',
      );
    const sources: { file: string; text: string }[] = [];
    const visit = (relative: string) => {
      const directory = path.join(root, relative);
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile() && file.endsWith('.json'))
          sources.push({ file, text: fs.readFileSync(path.join(root, file), 'utf8') });
      }
    };
    visit('');
    return { sources, platform: process.platform };
  });
  return loadGuidanceCatalog(sources).features.find(
    (guide) => guide.id === id && guide.platforms.includes(platform as 'darwin'),
  );
}
export const expectedUpdateGuide = (app: ElectronApplication) =>
  expectedFeatureGuide(app, 'application-update');

/** A bad authored guide must exercise the unavailable UI, not silently skip a product failure. */
export async function verifyUnavailableOrNoTarget(page: Page, guide?: FeatureGuide) {
  if (guide && guidanceTarget(guide.entry.target)) return false;
  const dialog = page.getByRole('dialog', { name: guide?.title ?? '使用指引', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText(
    guide ? '此功能入口已移除或暂不可用' : '此指引暂不可用',
  );
  if (guide)
    await expect(dialog.getByRole('button', { name: '前往功能', exact: true })).toBeDisabled();
  test.info().annotations.push({
    type: 'guidance-content-warning',
    description: '该包的指引或入口不可用：已验证降级反馈与关闭；本用例的正常导航路径未覆盖。',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return true;
}

export async function expectGuidanceDestination(page: Page, guide: FeatureGuide) {
  const destination = guidanceTarget(guide.entry.target)!;
  const names: Record<string, string> = {
    home: '工作台',
    ledger: '台账',
    archive: '项目档案',
    tasks: '工作任务',
    documents: '文档',
    review: '工作回顾',
    trash: '回收站',
    settings: '设置',
    tools: '工具',
  };
  await expect(
    page
      .getByRole('navigation')
      .getByRole('button', { name: names[destination.module], exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  if (destination.module === 'settings' && destination.section === 'about')
    await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
}

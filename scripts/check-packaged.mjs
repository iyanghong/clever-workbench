import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clever-workbench-packaged-'));
const env = { ...process.env, CLEVER_WORKBENCH_DATA_DIR: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.resolve('release/mac-arm64/Clever Workbench.app/Contents/MacOS/Clever Workbench'),
  args: [],
  env,
});
try {
  const page = await app.firstWindow();
  await expect(page.getByLabel('快速新增任务')).toBeVisible();
  await page.getByLabel('快速新增任务').fill('验证安装包实际运行');
  await page.getByLabel('快速新增任务').press('Enter');
  await expect(page.getByRole('button', { name: /验证安装包实际运行.*未分类/ })).toBeVisible();
  await page.getByRole('button', { name: /验证安装包实际运行.*未分类/ }).click();
  await page
    .getByRole('textbox', { name: '工作内容' })
    .fill('已验证打包后的编辑器、预加载和 SQLite。');
  await page.getByLabel('关闭详情').click();
  console.log('Packaged macOS application: launch, capture and editing passed.');
} finally {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}

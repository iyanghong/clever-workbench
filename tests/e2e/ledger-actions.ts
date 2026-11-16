import type { Page } from '@playwright/test';
export async function openLedgerRecord(page: Page, category: string, name?: string, edit = false) {
  const detail = page.getByRole('complementary', { name: '台账详情' });
  if (await detail.count())
    await detail.getByRole('button', { name: '返回清单', exact: true }).click();
  await page.getByRole('tab', { name: category, exact: true }).click();
  let row = page.locator('.workspace-list tbody tr:not(.ant-table-measure-row)');
  if (name) row = row.filter({ hasText: name });
  await row.first().locator('td').first().getByRole('button').click();
  if (edit)
    await page
      .getByRole('complementary', { name: '台账详情' })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
}

export async function openSystemAction(page: Page, action: '系统信息' | '导出资料') {
  await page.getByRole('button', { name: '当前系统更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

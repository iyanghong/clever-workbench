import type { Page } from '@playwright/test';
export async function openLedgerRecord(page: Page, category: string, name?: string, edit = false) {
  await page.getByRole('button', { name: category, exact: true }).click();
  let row = page.locator('.workspace-list tbody tr');
  if (name) row = row.filter({ hasText: name });
  await row.first().locator('td').first().getByRole('button').click();
  if (edit)
    await page
      .getByRole('complementary', { name: '台账详情' })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
}

import { expect, type Locator } from '@playwright/test';

async function options(control: Locator) {
  if ((await control.getAttribute('aria-expanded')) !== 'true') {
    await control
      .locator(
        'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]',
      )
      .click();
  }
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  const list = await control.getAttribute('aria-controls');
  return control
    .page()
    .locator('.ant-select-dropdown')
    .filter({ has: control.page().locator(`[id=${JSON.stringify(list)}]`) });
}

export async function selectChoice(
  control: Locator,
  value: string | { label: string },
  clickOptions?: { timeout?: number },
) {
  const popup = await options(control);
  const option =
    typeof value === 'string'
      ? popup.locator(`.ant-select-item-option[data-value=${JSON.stringify(value)}]`)
      : popup.locator('.ant-select-item-option').filter({ hasText: value.label });
  await option.click(clickOptions);
  await expect(popup).toBeHidden();
}

export async function expectSelectValue(control: Locator, value: string) {
  const popup = await options(control);
  await expect(
    popup.locator(`.ant-select-item-option[data-value=${JSON.stringify(value)}]`),
  ).toHaveClass(/ant-select-item-option-selected/);
  await control.press('Escape');
  await expect(popup).toBeHidden();
}

export async function fillDate(control: Locator, value: string) {
  await control.fill(value.replace('T', ' '));
  await control.press('Enter');
  await control.press('Tab');
}

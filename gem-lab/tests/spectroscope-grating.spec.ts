import { expect, test, type Page } from '@playwright/test';

// 光栅式狭缝和焦距固定：从棱镜式带过来的旧设置不能再影响光谱的亮度和模糊。
const spectrumFilter = (page: Page) =>
  page.getByTestId('spectroscope-spectrum-visual').locator('> div').first().evaluate((el) => (el as HTMLElement).style.filter);
const slider = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=../..').locator('input[type=range]');

test('grating view ignores slit and focus left over from the prism settings', async ({ page }) => {
  await page.goto('/demo/spectroscope?sample=ruby&mode=detection&qa=ready');
  await expect(slider(page, '狭缝宽度')).toBeVisible();

  await page.getByRole('button', { name: '光栅式', exact: true }).click();
  await expect(page.getByTestId('spectroscope-fixed-optics')).toBeVisible();
  const gratingBaseline = await spectrumFilter(page);

  await page.getByRole('button', { name: '棱镜式', exact: true }).click();
  const prismIdeal = await spectrumFilter(page);
  await slider(page, '狭缝宽度').fill('1');
  await slider(page, '焦距调节').fill('0');
  // 棱镜式下这两项确实影响画面，否则下面的对照没有意义。
  await expect.poll(() => spectrumFilter(page)).not.toBe(prismIdeal);

  await page.getByRole('button', { name: '光栅式', exact: true }).click();
  await expect(page.getByTestId('spectroscope-fixed-optics')).toBeVisible();
  await expect.poll(() => spectrumFilter(page)).toBe(gratingBaseline);
});

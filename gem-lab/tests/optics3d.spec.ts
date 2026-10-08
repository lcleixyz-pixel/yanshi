import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({ state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], totalPoints: 0 }, version: 1 }));
  });
});

const canvas = (page: Page) => page.getByTestId('optics3d-canvas');
const caseInfo = async (page: Page) => JSON.parse(await canvas(page).getAttribute('data-case') ?? '{}');

for (const [knowledge, ids] of [['spectroscope', ['prism-spectroscope', 'grating-spectroscope']], ['refractometer', ['refractometer']]] as const) {
  for (const id of ids) {
    test(`知识库进入 ${id} 3D，示例切换与拆解暂停光路`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`/knowledge/${knowledge}`);
      await page.getByTestId(`optics-link-${id}`).click();
      await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
      await expect(canvas(page)).toHaveAttribute('data-asset-version', 'paper-optics-v1');
      expect((await caseInfo(page)).visiblePathCount).toBeGreaterThan(0);
      const select = page.getByRole('combobox', { name: '光路示例' });
      const values = await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
      await select.selectOption(values[values.length - 1]);
      expect((await caseInfo(page)).id).toBe(values[values.length - 1]);
      await page.getByRole('slider', { name: '连续拆解' }).fill('50');
      expect((await caseInfo(page)).suspended).toBe(true);
      await page.getByRole('button', { name: '全部复位' }).click();
      expect((await caseInfo(page)).suspended).toBe(false);
      await expect(page.locator('canvas')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
}

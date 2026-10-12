import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // 外部字体服务不属于仪器回归范围；固定使用系统备用字体，保留全部本地资源和控制台错误检查。
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({ state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], totalPoints: 0 }, version: 1 }));
  });
});

const canvas = (page: Page) => page.getByTestId('optics3d-canvas');
const caseInfo = async (page: Page) => JSON.parse(await canvas(page).getAttribute('data-case') ?? '{}');

// 分光镜两个 3D 页已迁入仿真外壳（认识屏），旧地址重定向到 /sim/spectroscope/learn。
for (const [machine, instrument] of [['prism', 'prism-spectroscope'], ['grating', 'grating-spectroscope']] as const) {
  test(`知识库进入 ${instrument}：旧地址转到认识屏，示例切换与拆解暂停光路`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/knowledge/spectroscope`);
    await page.getByTestId(`optics-link-${instrument}`).click();
    await expect(page).toHaveURL(new RegExp(`/sim/spectroscope/learn\\?machine=${machine}$`));
    await expect(canvas(page)).toHaveAttribute('data-instrument', instrument, { timeout: 60_000 });
    await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
    await expect(canvas(page)).toHaveAttribute('data-asset-version', 'paper-optics-v1');
    expect((await caseInfo(page)).visiblePathCount).toBeGreaterThan(0);
    const select = page.getByTestId('sim-spectro-case-select');
    const values = await select.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    await select.selectOption(values[values.length - 1]);
    expect((await caseInfo(page)).id).toBe(values[values.length - 1]);
    // 连续拆解暂停光路；全部重置（只恢复本屏）后恢复。
    await page.getByRole('slider', { name: '连续拆解' }).fill('50');
    expect((await caseInfo(page)).suspended).toBe(true);
    await page.getByTestId('sim-reset').click();
    expect((await caseInfo(page)).suspended).toBe(false);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

for (const [knowledge, ids] of [['refractometer', ['refractometer']]] as const) {
  for (const id of ids) {
    test(`知识库进入 ${id} 3D，示例切换与拆解暂停光路`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`/knowledge/${knowledge}`);
      await page.getByTestId(`optics-link-${id}`).click();
      await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
      await expect(canvas(page)).toHaveAttribute('data-asset-version', id==='refractometer'?'paper-optics-v2':'paper-optics-v1');
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

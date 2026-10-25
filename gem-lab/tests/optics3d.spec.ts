import { expect, test, type Page } from '@playwright/test';

/** 原理计算卡默认收起；要用里面的示例下拉框或读数时先展开。 */
const openCase = async (page: Page, id: string) => {
  const card = page.getByTestId(id);
  if ((await card.getAttribute('data-open')) === 'false') await card.locator('.sim-readout__head').click();
};

test.beforeEach(async ({ page }) => {
  // 外部字体服务不属于仪器回归范围；固定使用系统备用字体，保留全部本地资源和控制台错误检查。
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({ state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], totalPoints: 0 }, version: 1 }));
  });
});

const canvas = (page: Page) => page.getByTestId('optics3d-canvas');
const caseInfo = async (page: Page) => JSON.parse(await canvas(page).getAttribute('data-case') ?? '{}');

// 知识库只有一个仿真入口：进认识屏后在「仪器」面板里切换棱镜式 / 光栅式。
for (const [machine, instrument] of [['prism', 'prism-spectroscope'], ['grating', 'grating-spectroscope']] as const) {
  test(`知识库进入分光镜认识屏并切到 ${instrument}：示例切换与拆解暂停光路`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/knowledge/spectroscope`);
    await page.getByTestId('knowledge-structure-sim').click();
    await expect(page).toHaveURL(/\/sim\/spectroscope\/learn$/);
    if (machine === 'grating') await page.getByTestId('sim-machine-grating').click();
    await expect(canvas(page)).toHaveAttribute('data-instrument', instrument, { timeout: 60_000 });
    await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
    await expect(canvas(page)).toHaveAttribute('data-asset-version', 'paper-optics-v1');
    expect((await caseInfo(page)).visiblePathCount).toBeGreaterThan(0);
    await openCase(page, 'sim-spectro-case');
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
      await page.getByTestId('knowledge-structure-sim').click();
      // 折射仪已迁入仿真（阶段 3a）：知识库入口落到认识屏。
      await expect(page).toHaveURL(new RegExp('/sim/refractometer/learn$'));
      await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
      await expect(canvas(page)).toHaveAttribute('data-asset-version', 'paper-optics-v2');
      expect((await caseInfo(page)).visiblePathCount).toBeGreaterThan(0);
      await openCase(page, 'sim-refracto-case');
      const select = page.getByTestId('sim-refracto-case-select');
      const values = await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
      await select.selectOption(values[values.length - 1]);
      expect((await caseInfo(page)).id).toBe(values[values.length - 1]);
      await page.getByRole('slider', { name: '连续拆解' }).fill('50');
      expect((await caseInfo(page)).suspended).toBe(true);
      await page.getByTestId('sim-reset').click();
      expect((await caseInfo(page)).suspended).toBe(false);
      await expect(page.locator('canvas')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
}

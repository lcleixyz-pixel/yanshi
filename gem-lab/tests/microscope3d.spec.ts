import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // 外部字体服务不属于仪器回归范围；固定使用系统备用字体，保留全部本地资源和控制台错误检查。
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({ state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], totalPoints: 0 }, version: 1 }));
  });
});

const canvas = (page: Page) => page.getByTestId('microscope3d-canvas');
const incident = async (page: Page) => JSON.parse(await canvas(page).getAttribute('data-incident') ?? '{}');
const bottom = async (page: Page) => JSON.parse(await canvas(page).getAttribute('data-illumination') ?? '{}');

test('首页进入显微镜 3D，三路照明独立开关，离开时释放画布', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByTestId('home-microscope-link').click();
  await expect(page.getByTestId('microscope-explore-page')).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-part-count', '44');

  expect((await bottom(page)).ringActiveCount).toBeGreaterThan(0);
  await page.getByRole('button', { name: '顶光 关' }).click();
  await page.getByRole('button', { name: '侧光 关' }).click();
  await page.getByRole('group', { name: '底光模式' }).getByRole('button', { name: '关灯' }).click();
  const lit = await incident(page);
  expect(lit.lights.every((light: { intensity: number }) => light.intensity > 0)).toBe(true);
  expect((await bottom(page)).activeLightCount).toBe(0);

  await page.getByRole('slider', { name: '连续拆解' }).fill('40');
  expect((await incident(page)).lights.every((light: { intensity: number }) => light.intensity === 0)).toBe(true);
  await page.getByRole('button', { name: '全部复位' }).click();
  expect((await incident(page)).topActive).toBe(false);

  await page.getByRole('link', { name: /宝石检测实训系统/ }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

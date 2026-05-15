import { expect, test } from '@playwright/test';

const progressStorage = {
  state: {
    onboarded: true,
    visitedKnowledgeBases: [],
    completedDemos: [],
    detectionHistory: [],
    totalPoints: 0,
  },
  version: 1,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify(value));
  }, progressStorage);
});

test('home page renders the teaching workbench', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('宝石检测')).toBeVisible();
  await expect(page.getByText('实验工作台')).toBeVisible();
});

test.describe('instrument knowledge pages', () => {
  const pages = [
    { path: '/knowledge/refractometer', name: '折射仪' },
    { path: '/knowledge/polariscope', name: '偏光镜' },
    { path: '/knowledge/spectroscope', name: '分光镜' },
  ];

  for (const item of pages) {
    test(`${item.name} knowledge page renders`, async ({ page }) => {
      await page.goto(item.path);

      await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '基本介绍' })).toBeVisible();
    });
  }
});

test.describe('instrument demo pages', () => {
  const pages = [
    { path: '/demo/refractometer', name: '折射仪互动演示' },
    { path: '/demo/polariscope', name: '偏光镜互动演示' },
    { path: '/demo/spectroscope', name: '分光镜互动演示' },
  ];

  for (const item of pages) {
    test(`${item.name} renders in learning mode`, async ({ page }) => {
      await page.goto(item.path);

      await expect(page.getByText(item.name)).toBeVisible();
      await expect(page.getByText('学习模式').first()).toBeVisible();
    });
  }
});

test('detection workflow renders difficulty selection', async ({ page }) => {
  await page.goto('/detection');

  await expect(page.getByText('检测流程')).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择检测难度' })).toBeVisible();
});

test('assessment route guides users without an active detection session', async ({ page }) => {
  await page.goto('/assessment');

  await expect(page.getByRole('heading', { name: '尚未开始检测' })).toBeVisible();
  await expect(page.getByText('即将带你回到检测流程')).toBeVisible();
});

test('knowledge page bottom instrument links switch pages without crashing', async ({ page }) => {
  await page.goto('/knowledge/refractometer');

  await page.getByTestId('other-instrument-link-polariscope').click();

  await expect(page).toHaveURL(/\/knowledge\/polariscope$/);
  await expect(page.getByRole('heading', { name: '偏光镜', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '基本介绍' })).toBeVisible();
});

test('detection-mode instrument demos hide the real unknown sample name', async ({ page }) => {
  await page.goto('/demo/refractometer?sample=agate&mode=detection');
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByText('玛瑙')).toHaveCount(0);

  await page.goto('/demo/polariscope?sample=agate&mode=detection');
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByText('玛瑙')).toHaveCount(0);

  await page.goto('/demo/spectroscope?sample=agate&mode=detection');
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByText('玛瑙')).toHaveCount(0);

  await page.goto('/demo/spectroscope?sample=jadeite&mode=detection&qa=ready');
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByText('翡翠')).toHaveCount(0);

  await page.goto('/demo/spectroscope?sample=ruby&mode=detection&qa=ready');
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByText('红宝石')).toHaveCount(0);
});

test('spectroscope can save a no-absorption observation', async ({ page }) => {
  await page.goto('/demo/spectroscope?sample=agate&mode=detection&qa=ready');

  await page.getByTestId('spectroscope-no-absorption').click();

  await expect(page.getByTestId('spectroscope-save')).toBeEnabled();
  await expect(page.getByTestId('spectroscope-no-absorption-summary')).toBeVisible();
});

test('refractometer spot reading uses the same two-decimal value across boundary and record data', async ({ page }) => {
  await page.goto('/demo/refractometer?sample=agate&mode=detection&qa=ready');

  await expect(page.getByTestId('refractometer-spot-reading')).toContainText('1.54');
  await expect(page.getByTestId('refractometer-spot-reading')).toContainText('nD');
  await expect(page.getByTestId('refractometer-record-ri')).toHaveValue('1.54');
});

test('refractometer qa-ready facet samples can be submitted after guided observation', async ({ page }) => {
  await page.goto('/demo/refractometer?sample=ruby&mode=detection&qa=ready');

  await expect(page.getByTestId('refractometer-record-ri')).toBeVisible();
  await expect(page.getByTestId('refractometer-save')).toBeEnabled();
});

test('refractometer can submit over-oil samples after observing the boundary limit', async ({ page }) => {
  await page.goto('/demo/refractometer?sample=diamond&mode=detection&qa=ready');

  await expect(page.getByTestId('refractometer-over-oil-note')).toContainText('> 1.780');
  await expect(page.getByTestId('refractometer-save')).toBeEnabled();
});

test('polariscope can submit opaque samples as not applicable in detection mode', async ({ page }) => {
  await page.goto('/demo/polariscope?sample=pearl&mode=detection&qa=ready');

  await expect(page.getByTestId('polariscope-opaque-note')).toBeVisible();
  await expect(page.getByTestId('polariscope-save')).toBeEnabled();

  await page.getByTestId('polariscope-save').click();
  await expect(page.getByTestId('polariscope-detection-recorded')).toBeVisible();
});

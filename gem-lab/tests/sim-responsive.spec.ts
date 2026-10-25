import { expect, test, type Page } from '@playwright/test';

const instruments = ['polariscope', 'refractometer', 'spectroscope'] as const;
type Instrument = typeof instruments[number];
const sizes = [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1024, height: 768 }];

const panel = (page: Page, instrument: Instrument) => page.locator(instrument === 'polariscope' ? '.sim-polari-obs' : '.sim-obs');
const body = (page: Page, instrument: Instrument) => page.locator(instrument === 'polariscope' ? '.sim-polari-obs__body' : '.sim-obs__body');
const toggle = (page: Page, instrument: Instrument) => page.getByTestId(instrument === 'polariscope' ? 'sim-polari-obs-toggle' : 'sim-obs-toggle');

async function openLab(page: Page, instrument: Instrument, guided = false) {
  await page.goto(`/sim/${instrument}/lab${guided ? '?mode=student' : ''}`);
  const target = page.getByTestId(instrument === 'polariscope' ? 'polariscope-scene' : instrument === 'refractometer' ? 'optics3d-canvas' : 'spectroscope-bench-canvas');
  await expect(target).toHaveAttribute(instrument === 'polariscope' ? 'data-status' : 'data-loaded', instrument === 'polariscope' ? 'ready' : 'true', { timeout: 60_000 });
  await expect(panel(page, instrument)).toBeVisible();
}

async function fitsHorizontally(page: Page, instrument: Instrument) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), '页面不横向溢出').toBeLessThanOrEqual(1);
  expect(await body(page, instrument).evaluate((element) => element.scrollWidth - element.clientWidth), '观察面板内部不横向滚动或裁掉内容').toBeLessThanOrEqual(1);
  const conditions = page.locator('.sim-obs__conditions, .sim-polari-obs__conditions');
  if (await conditions.isVisible()) {
    expect(await conditions.evaluate((element) => element.scrollWidth - element.clientWidth), '条件区内部不横向溢出').toBeLessThanOrEqual(1);
  }
  if (instrument !== 'spectroscope') {
    const eye = page.locator(instrument === 'refractometer' ? '.sim-refracto-eye > div > div' : '.sim-polari-obs .pol-eyepiece__ring').first();
    const beside = page.locator(instrument === 'refractometer' ? '.sim-obs__beside' : '.sim-polari-poe');
    const a = (await eye.boundingBox())!, b = (await beside.boundingBox())!;
    expect(a.x + a.width <= b.x + 1 || a.y + a.height <= b.y + 1, '目镜本体与说明或记录区不重叠，不能仅检查外层滚动宽度').toBe(true);
  }
}

for (const size of sizes) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size, isMobile: size.width < 681, hasTouch: size.width < 681 });
    test.beforeEach(async ({ page }) => {
      test.setTimeout(120_000);
      await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
    });

    for (const instrument of instruments) {
      test(`${instrument}：自由练习和引导模式的观察面板收起后均可正常点开`, async ({ page }) => {
        for (const guided of [false, true]) {
          await openLab(page, instrument, guided);
          await toggle(page, instrument).click();
          await expect(panel(page, instrument)).toHaveAttribute('data-open', 'false');
          // 普通点击验证真实命中，不能靠 force 绕过任务条遮挡。
          await toggle(page, instrument).click({ timeout: 5_000 });
          await expect(panel(page, instrument)).toHaveAttribute('data-open', 'true');
        }
      });

      test(`${instrument}：观察内容和记录适配视口，任务与控制抽屉均可操作`, async ({ page }, testInfo) => {
        await openLab(page, instrument);
        if (instrument === 'refractometer') {
          for (const name of ['打开电源', '滴一小滴接触液', '台面朝下放样', '轻推贴合']) {
            await page.getByRole('button', { name, exact: true }).click();
          }
        } else if (instrument === 'spectroscope') {
          await page.getByTestId('sim-bench-place').click();
          await page.getByRole('slider', { name: '狭缝宽度' }).fill('3.2');
          await page.getByRole('slider', { name: '目镜焦距' }).fill('5');
        }
        await fitsHorizontally(page, instrument);
        if (size.width < 681) {
          await page.getByTestId('sim-task-open').click();
          const card = page.getByTestId('sim-task');
          await expect(card).toBeVisible();
          const cardBox = (await card.boundingBox())!, panelBox = (await panel(page, instrument).boundingBox())!;
          expect(cardBox.y + cardBox.height, '任务卡与观察面板分开，收起入口不互挡').toBeLessThanOrEqual(panelBox.y + 1);
          await page.getByTestId('sim-controls-toggle').click();
          await expect(card).toBeHidden();
          await expect(page.getByRole('complementary', { name: '控制面板' })).toBeVisible();
          await page.getByTestId('sim-controls-toggle').click();
          await expect(card).toBeVisible();
          await card.getByRole('button', { name: '收起 ▾', exact: true }).click();
        }
        if (instrument !== 'polariscope') {
          const id = instrument === 'refractometer' ? 'sim-refracto-record' : 'sim-record';
          await page.getByTestId(instrument === 'refractometer' ? 'sim-refracto-record-open' : 'sim-spectro-record-open').click();
          await expect(page.getByTestId(id)).toBeVisible();
          if (instrument === 'refractometer') await page.getByTestId('sim-refracto-reading').fill('1.718');
          else {
            await page.getByTestId('sim-record-line').fill('694');
            await page.getByTestId('sim-record-add-line').click();
          }
          await fitsHorizontally(page, instrument);
          expect(await page.getByTestId(id).evaluate((element) => element.scrollWidth - element.clientWidth), '记录内容不横向裁切').toBeLessThanOrEqual(1);
          if (size.width < 681) {
            await page.getByTestId('sim-controls-toggle').click();
            if (instrument === 'spectroscope') await expect(page.getByTestId(id)).toBeHidden();
            await page.getByTestId('sim-controls-toggle').click();
            await expect(page.getByTestId(id)).toBeVisible();
          }
          if (instrument === 'refractometer') await expect(page.getByTestId('sim-refracto-reading')).toHaveValue('1.718');
          if (instrument === 'spectroscope' && size.width < 681) {
            const review = page.getByTestId('sim-record-review');
            await review.scrollIntoViewIfNeeded();
            const reviewBox = (await review.boundingBox())!, controlBox = (await page.getByTestId('sim-controls-toggle').boundingBox())!;
            expect(reviewBox.y + reviewBox.height, '记录按钮完整露出，不被控制入口遮挡').toBeLessThanOrEqual(controlBox.y);
          }
          const screenshot = testInfo.outputPath('record-layout.png');
          await page.screenshot({ path: screenshot });
          await testInfo.attach('记录与观察布局', { path: screenshot, contentType: 'image/png' });
          if (instrument === 'refractometer') {
            await page.getByTestId('sim-refracto-save').click();
            await expect(page.getByTestId(id)).toHaveCount(0);
            await expect(page.getByTestId('sim-refracto-saved')).toContainText('1.718');
          } else {
            await page.getByTestId('sim-record-review').click();
            await page.getByTestId('sim-record-save').click();
            await expect(page.getByTestId('sim-record-saved')).toHaveAttribute('data-stale', 'false');
            await page.getByTestId(`${id}-close`).click();
          }
          // 保存后再次收展观察面板，记录入口仍然可点击，记录也仍在。
          await toggle(page, instrument).click();
          await toggle(page, instrument).click({ timeout: 5_000 });
          await page.getByTestId(instrument === 'refractometer' ? 'sim-refracto-record-open' : 'sim-spectro-record-open').click();
          await expect(page.getByTestId(id)).toBeVisible();
          await expect(page.getByTestId(instrument === 'refractometer' ? 'sim-refracto-saved' : 'sim-record-saved')).toBeVisible();
          await fitsHorizontally(page, instrument);
          await page.getByTestId(`${id}-close`).click();
          await expect(page.getByTestId(id)).toHaveCount(0);
        } else {
          await page.getByTestId('sim-polari-predict-demo').click();
          await page.getByTestId('sim-polari-stage-plus').click();
          const screenshot = testInfo.outputPath('observation-layout.png');
          await page.screenshot({ path: screenshot });
          await testInfo.attach('观察与转动布局', { path: screenshot, contentType: 'image/png' });
        }
        await fitsHorizontally(page, instrument);
      });
    }
  });
}

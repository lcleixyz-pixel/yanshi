import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

async function openPolariscopeDetection(page: Page) {
  await page.goto('/detection');
  await page.getByTestId('difficulty-beginner').click();
  await page.getByRole('button', { name: '🎲 抽取样品' }).click();
  await page.getByRole('button', { name: /偏光镜/ }).click();
  await expect(page.getByTestId('polariscope-detection-3d')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

test('3D detection unlocks steps in order and saves the same record as the 2D detection mode', async ({ page }) => {
  // 样品库全部名称（取自 2D 演示的样品选择器），用于确认检测页不泄露样品名。
  await page.goto('/demo/polariscope');
  const sampleNames = (await page.locator('select option').allInnerTexts()).map((name) => name.trim()).filter(Boolean);
  expect(sampleNames.length).toBeGreaterThan(20);
  await openPolariscopeDetection(page);
  const detection = page.getByTestId('polariscope-detection-3d');
  await expect(detection).toHaveAttribute('data-step', 'power');
  // 不出现讲解、揭晓或动作提示。
  await expect(page.getByTestId('sample-reveal')).toHaveCount(0);
  await expect(page.getByTestId('scene-coach')).toHaveCount(0);
  await expect(page.getByTestId('detection-place-sample')).toBeDisabled();

  await page.getByRole('switch', { name: '电源开关' }).click();
  await expect(detection).toHaveAttribute('data-step', 'crossed');
  await page.getByRole('slider', { name: '上偏光片角度' }).fill('90');
  await page.getByTestId('detection-place-sample').click();
  await expect(detection).toHaveAttribute('data-step', 'rotate');
  // 未知样品：视场标注不给名称，页面上也找不到抽到的样品名。
  await expect(page.getByTestId('eyepiece-view')).toContainText('未知样品');
  const panelText = await detection.innerText();
  const leaked = sampleNames.filter((name) => panelText.includes(name));
  expect(leaked).toEqual([]);
  await expect(page.getByLabel('四明四暗（非均质体）')).toBeDisabled();
  // 用滑块一次跳到 360° 不算连续观察，记录仍不可用。
  await page.getByRole('slider', { name: '载物台角度' }).fill('360');
  await expect(page.getByLabel('四明四暗（非均质体）')).toBeDisabled();
  await page.getByTestId('detection-auto-rotate').click();
  await expect(detection).toHaveAttribute('data-step', 'record', { timeout: 20_000 });

  await expect(page.getByTestId('detection-submit')).toBeDisabled();
  await page.getByLabel('四明四暗（非均质体）').check();
  await page.getByRole('combobox', { name: '光性判断' }).selectOption('anisotropic');
  await page.getByTestId('detection-submit').click();
  await expect(page.getByTestId('polariscope-detection-3d')).toHaveCount(0);
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1') ?? '{}').state);
  expect(session.instrumentsUsed).toContain('polariscope');
  expect(session.polariscope).toMatchObject({ phenomenon: 'four-bright-four-dark', optical: 'anisotropic' });
});

test('3D detection can record an opaque sample as not applicable, and can switch to the 2D version', async ({ page }) => {
  await openPolariscopeDetection(page);
  await page.getByRole('switch', { name: '电源开关' }).click();
  await page.getByRole('slider', { name: '上偏光片角度' }).fill('90');
  await page.getByTestId('detection-place-sample').click();
  await page.getByTestId('detection-auto-rotate').click();
  await expect(page.getByTestId('polariscope-detection-3d')).toHaveAttribute('data-step', 'record', { timeout: 20_000 });
  await page.getByLabel('几乎不透光（透射法不适用）').check();
  await expect(page.getByRole('combobox', { name: '光性判断' })).toHaveCount(0);
  await expect(page.getByTestId('detection-submit')).toBeEnabled();

  await page.getByTestId('detection-use-2d').click();
  await expect(page.getByTestId('polariscope-detection-3d')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-detection-main-guide')).toBeVisible();
});

test('without WebGL the detection flow falls back to the 2D polariscope', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(original, this, [type, ...rest]);
    } as typeof original;
  });
  await page.goto('/detection');
  await page.getByTestId('difficulty-beginner').click();
  await page.getByRole('button', { name: '🎲 抽取样品' }).click();
  await page.getByRole('button', { name: /偏光镜/ }).click();
  await expect(page.getByTestId('polariscope-detection-3d')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-detection-main-guide')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { SAMPLES } from '../src/data/samples';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({
      state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], sampleMastery: {}, totalPoints: 0 },
      version: 2,
    }));
  });
});

test('从检测流程进入分光镜不能切学习揭示身份，独立演示仍可切换模式', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('gem-lab-detection-v1', JSON.stringify({
      state: {
        difficulty: 'intermediate', sampleId: 'tourmaline', instrumentsUsed: [],
        refractometer: { method: null, riMin: null, riMax: null, birefringence: null, opticalCharacter: null, notes: '' },
        polariscope: { rotation: 0, phenomenon: null, optical: null, notes: '' },
        spectroscope: { method: null, markedLines: [], bandRanges: [], notes: '' },
        startedAt: 1000, assessment: null, assessmentAttemptCount: 0,
      },
      version: 1,
    }));
  });
  await page.goto('/detection');
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toBeVisible();
  await page.getByRole('button', { name: /分光镜/ }).click();
  // 检测流程的分光镜一步现在是仿真外壳里的挑战屏（内联，不显示屏幕导航）。
  await expect(page.getByTestId('sim-shell')).toHaveAttribute('data-screen', 'challenge');
  await expect(page.getByTestId('sim-screen-learn')).toHaveCount(0);
  await expect(page.getByTestId('sim-spectro-unknown')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('碧玺');
  await page.getByTestId('detection-use-2d').click();
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /学习模式/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /检测模式/ })).toBeDisabled();
  await expect(page.getByTestId('spectroscope-unverified-spectrum')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('碧玺');

  await page.goto('/demo/spectroscope');
  await page.getByRole('button', { name: /检测模式/ }).click();
  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await page.getByRole('button', { name: /学习模式/ }).click();
  await expect(page.getByRole('combobox', { name: '分光镜演示样品' })).toBeVisible();
  await expect(page.getByTestId('unknown-sample-label')).toHaveCount(0);
});

for (const dispersion of ['prism', 'grating'] as const) {
  test(`${dispersion}: 未核定谱图不能伪装成无特征吸收，待核记录保留且不计完成`, async ({ page }) => {
    await page.goto('/demo/spectroscope?sample=tourmaline&mode=detection&qa=ready');
    if (dispersion === 'grating') await page.getByRole('button', { name: '光栅式', exact: true }).click();
    await expect(page.getByTestId('spectroscope-unverified-spectrum')).toBeVisible();
    await expect(page.getByTestId('spectroscope-spectrum-visual')).toHaveCount(0);
    await expect(page.getByTestId('spectroscope-no-absorption')).toBeDisabled();
    await expect(page.getByTestId('spectroscope-no-absorption')).not.toBeChecked();
    await expect(page.locator('body')).not.toContainText('碧玺');
    await page.getByTestId('spectroscope-save').click();
    const saved = await page.evaluate(() => ({
      session: JSON.parse(window.sessionStorage.getItem('gem-lab-detection-v1')!).state,
      progress: JSON.parse(window.localStorage.getItem('gem-lab-progress-v1')!).state,
    }));
    expect(saved.session.spectroscope.notes).toBe('教学谱图未核定，无法判断吸收情况');
    expect(saved.session.spectroscope.markedLines).toEqual([]);
    expect(saved.session.instrumentsUsed).toContain('spectroscope');
    expect(saved.progress.completedDemos).toEqual([]);
  });

  test(`${dispersion}: 全部样品可选，不特征样品可完成观察记录`, async ({ page }) => {
    await page.goto('/demo/spectroscope?qa=ready');
    const picker = page.getByRole('combobox', { name: '分光镜演示样品' });
    await expect(picker.locator('option')).toHaveCount(SAMPLES.length);
    await expect(picker.locator('option[value="tourmaline"]')).toHaveCount(1);
    await expect(picker.locator('option[value="opal"]')).toHaveCount(1);
    await picker.selectOption('amethyst');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    if (dispersion === 'grating') await page.getByRole('button', { name: '光栅式', exact: true }).click();
    await expect(page.getByTestId('spectroscope-spectrum-strip')).toHaveAttribute('data-dispersion', dispersion);
    await expect(page.getByTestId('spectroscope-reference')).toContainText('一般无特征吸收光谱');
    await expect(page.getByTestId('spectroscope-spectrum-visual').locator('[data-wavelength]')).toHaveCount(0);
    await expect(page.getByTestId('spectroscope-save')).toBeDisabled();
    await page.getByTestId('spectroscope-no-absorption').check();
    await page.getByTestId('spectroscope-save').click();
    await expect(page.getByText('✓ 已完成观察。可切换样品继续练习。', { exact: true })).toBeVisible();
  });

  test(`${dispersion}: 无特征检测保留未知样品身份并保存本次观察`, async ({ page }) => {
    await page.goto('/demo/spectroscope?sample=amethyst&mode=detection&qa=ready');
    if (dispersion === 'grating') await page.getByRole('button', { name: '光栅式', exact: true }).click();
    await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('紫水晶');
    await expect(page.getByTestId('spectroscope-save')).toBeDisabled();
    await page.getByTestId('spectroscope-no-absorption').check();
    await page.getByTestId('spectroscope-save').click();
    const saved = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('gem-lab-detection-v1')!).state);
    expect(saved.spectroscope.markedLines).toEqual([]);
    expect(saved.spectroscope.notes).toBe('无明显特征吸收');
    expect(saved.instrumentsUsed).toContain('spectroscope');
  });
}

test('观察条件失效后重新调清，须重新确认无特征结果', async ({ page }) => {
  await page.goto('/demo/spectroscope?sample=amethyst&mode=detection&qa=ready');
  const noAbsorption = page.getByTestId('spectroscope-no-absorption');
  await noAbsorption.check();
  await expect(page.getByTestId('spectroscope-save')).toBeEnabled();
  const focus = page.getByRole('slider', { name: '焦距调节' });
  await focus.press('Home');
  await expect(noAbsorption).not.toBeChecked();
  for (let i = 0; i < 50; i++) await focus.press('ArrowRight');
  await expect(noAbsorption).toBeEnabled();
  await expect(page.getByTestId('spectroscope-save')).toBeDisabled();
});

test('切换机型改变显示位置，已记录的 nm 波长不变', async ({ page }) => {
  await page.goto('/demo/spectroscope?sample=ruby&mode=detection&qa=ready');
  const visual = page.getByTestId('spectroscope-spectrum-visual');
  const box = await visual.boundingBox();
  expect(box).not.toBeNull();
  // 棱镜视场中 550 nm 的位置，作为点击反算与换型保留记录的回归。
  await visual.click({ position: { x: box!.width * (1 - Math.sqrt(0.5)), y: box!.height / 2 } });
  const prismPosition = await visual.locator('[data-wavelength="580"]').getAttribute('style');
  const markedText = await page.getByText(/^\d+ nm ✕$/).textContent();
  const markedWavelength = Number(markedText!.match(/\d+/)![0]);
  // 浏览器点击落在整数 CSS 像素，允许反算有 1 nm 取整差；换型后必须精确保留同一数值。
  expect(Math.abs(markedWavelength - 550)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '光栅式', exact: true }).click();
  await expect(page.getByTestId('spectroscope-spectrum-strip')).toHaveAttribute('data-dispersion', 'grating');
  await expect(page.getByText(`${markedWavelength} nm ✕`, { exact: true })).toBeVisible();
  const gratingPosition = await visual.locator('[data-wavelength="580"]').getAttribute('style');
  expect(gratingPosition).not.toBe(prismPosition);
  await page.getByTestId('spectroscope-save').click();
  const marks = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('gem-lab-detection-v1')!).state.spectroscope.markedLines);
  expect(marks).toEqual([markedWavelength]);
});

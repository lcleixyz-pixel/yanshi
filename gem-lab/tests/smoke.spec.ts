import { expect, test, type Page } from '@playwright/test';

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

test('polariscope detection mode carries spatial locator through setup and rotation', async ({ page }) => {
  await page.goto('/demo/polariscope?sample=amethyst&mode=detection');

  await expect(page.getByTestId('unknown-sample-label').first()).toBeVisible();
  await expect(page.getByText('紫水晶')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-detection-spatial-guide')).toHaveCount(0);

  await page.getByRole('button', { name: 'LED 开关' }).click();
  await expect(page.getByTestId('polariscope-detection-spatial-guide')).toBeVisible();
  await expect(page.getByTestId('polariscope-instrument-locator')).toHaveAttribute('data-active-part', 'upper-polar');
  await expect(page.getByTestId('polariscope-instrument-locator')).toContainText('正在调整：上偏光片');
  await expect(page.getByTestId('polariscope-locator-arrow-cue')).toHaveAttribute('data-arrow-count', '3');

  await page.getByRole('button', { name: /上偏光片/ }).click();
  await expect(page.getByTestId('polariscope-instrument-locator')).toHaveAttribute('data-active-part', 'sample-gap');
  await expect(page.getByTestId('polariscope-instrument-locator')).toContainText('放置样品：载物台中心');

  await page.getByRole('button', { name: '载物台' }).click();
  await expect(page.getByTestId('polariscope-instrument-locator')).toHaveAttribute('data-active-part', 'stage');
  await expect(page.getByTestId('polariscope-instrument-locator')).toContainText('正在旋转：载物台');
  await expect(page.getByTestId('polariscope-detection-sample-transfer-cue')).toBeVisible();
  await expect(page.getByTestId('polariscope-detection-sample-transfer-cue')).toContainText('未知样品');
  await expect(page.getByTestId('polariscope-save')).toBeDisabled();
  await expect(page.getByTestId('polariscope-detection-direct-stage-control')).toBeVisible();
  await expect(page.getByTestId('polariscope-detection-direct-stage-control')).toHaveAttribute(
    'data-sample-shape',
    'faceted-rectangle',
  );
  await expect(page.getByText('旋转旋钮带动样品')).toHaveCount(0);

  const stageRing = page.getByTestId('polariscope-stage-ring-control');
  const stageBox = await stageRing.boundingBox();
  expect(stageBox).not.toBeNull();
  const stageCenter = {
    x: stageBox!.x + stageBox!.width / 2,
    y: stageBox!.y + stageBox!.height / 2,
  };
  const stageRadius = stageBox!.width * 0.42;
  const initialStageAngle = await page
    .getByTestId('polariscope-detection-direct-stage-control')
    .getAttribute('data-stage-angle');
  await page.mouse.move(stageCenter.x, stageCenter.y - stageRadius);
  await page.mouse.down();
  await page.mouse.move(stageCenter.x + stageRadius, stageCenter.y, { steps: 8 });
  await page.mouse.move(stageCenter.x, stageCenter.y + stageRadius, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(() => page.getByTestId('polariscope-detection-direct-stage-control').getAttribute('data-stage-angle'))
    .not.toBe(initialStageAngle);
  await expect(page.getByTestId('polariscope-save')).toBeDisabled();
  await page.getByRole('checkbox', { name: '四明四暗（非均质体）' }).check();
  await page.getByRole('combobox').selectOption('anisotropic');
  await expect(page.getByTestId('polariscope-save')).toBeEnabled();
  await expect(page.getByText('紫水晶')).toHaveCount(0);
  await expect(page.getByText('拖动')).toHaveCount(0);
});

test('polariscope learning mode uses a live use state with direct stage rotation', async ({ page }) => {
  await page.goto('/demo/polariscope');

  await expect(page.getByTestId('polariscope-overview-state')).toBeVisible();

  await page.getByTestId('polariscope-start-learning').click();
  await expect(page.getByTestId('polariscope-align-upper-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-transition-cue')).toContainText('开始调整上偏光片');
  await expect(page.getByTestId('polariscope-focus-transition')).toBeVisible();
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'data-focus-transition',
    'overview-to-align-upper-polar',
  );
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'data-focus-target',
    'upper-polar',
  );
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'aria-label',
    '视线移至上偏光片操作区',
  );
  await expect(page.getByTestId('polariscope-instrument-locator')).toBeVisible();
  await expect(page.getByTestId('polariscope-instrument-locator')).toHaveAttribute('data-active-part', 'upper-polar');
  await expect(page.getByTestId('polariscope-instrument-locator')).toContainText('正在调整：上偏光片');
  await expect(page.getByTestId('polariscope-locator-arrow-cue')).toHaveAttribute('data-arrow-count', '3');
  await expectPolariscopeFocusTransitionStageScoped(page);
  await expectPolariscopeLocatorImageFrameClean(page);
  await expect(page.getByTestId('polariscope-upper-alignment-observation')).toContainText('校准观察视域');
  await expect(page.getByTestId('polariscope-align-upper-state')).not.toContainText('拖动');
  await expect(page.getByTestId('polariscope-upper-brightness-state')).toContainText('透光');
  await expect(page.getByTestId('polariscope-confirm-upper-polar')).toBeDisabled();

  const upperRing = page.getByTestId('polariscope-upper-ring-control');
  const upperBox = await upperRing.boundingBox();
  expect(upperBox).not.toBeNull();
  const upperObservationBox = await page.getByTestId('polariscope-upper-alignment-observation').boundingBox();
  expect(upperObservationBox).not.toBeNull();
  expect(upperObservationBox!.width).toBeGreaterThan(upperBox!.width * 0.62);

  await page.mouse.move(upperBox!.x + upperBox!.width / 2, upperBox!.y + 8);
  await page.mouse.down();
  await page.mouse.move(upperBox!.x + upperBox!.width - 12, upperBox!.y + upperBox!.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('polariscope-align-upper-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-upper-brightness-state')).toContainText('接近全暗');
  await expect(page.getByTestId('polariscope-confirm-upper-polar')).toBeEnabled();
  await page.getByTestId('polariscope-confirm-upper-polar').click();
  await expect(page.getByTestId('polariscope-place-sample-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-transition-cue')).toContainText('已正交，进入放样');
  await expect(page.getByTestId('polariscope-focus-transition')).toBeVisible();
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'data-focus-transition',
    'align-upper-polar-to-place-sample',
  );
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'data-focus-target',
    'sample-gap',
  );
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'aria-label',
    '视线沿光路落到放样位置',
  );
  await expect(page.getByTestId('polariscope-instrument-locator')).toBeVisible();
  await expect(page.getByTestId('polariscope-instrument-locator')).toHaveAttribute('data-active-part', 'sample-gap');
  await expect(page.getByTestId('polariscope-instrument-locator')).toContainText('放置样品：载物台中心');
  await expect(page.getByTestId('polariscope-locator-arrow-cue')).toHaveAttribute('data-arrow-count', '3');
  await expectPolariscopeFocusTransitionStageScoped(page);
  await expectPolariscopeLocatorImageFrameClean(page);

  await page.getByTestId('polariscope-place-sample').click();
  await expect(page.getByTestId('polariscope-place-sample-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-place-sample-state')).toContainText('样品已进入光路');
  await expect(page.getByTestId('polariscope-place-sample-state')).toContainText('点击载物台开始旋转观察');
  await expect(page.getByTestId('polariscope-sample-transfer-cue')).toBeVisible();
  await expect(page.getByTestId('polariscope-live-use-state')).toHaveCount(0);

  await page.getByTestId('polariscope-stage-start-rotation').click();
  await expect(page.getByTestId('polariscope-live-use-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-transition-cue')).toContainText('样品已进入光路');
  await expect(page.getByTestId('polariscope-focus-transition')).toBeVisible();
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'data-focus-transition',
    'place-sample-to-live-use',
  );
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'data-focus-target',
    'live-observation',
  );
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveAttribute(
    'aria-label',
    '视线切换到上层圆形观察视域',
  );
  await expect(page.getByTestId('polariscope-sample-transfer-cue')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'dark');
  await expect(page.getByTestId('polariscope-instrument-locator')).toBeVisible();
  await expect(page.getByTestId('polariscope-instrument-locator')).toHaveAttribute('data-active-part', 'stage');
  await expect(page.getByTestId('polariscope-instrument-locator')).toContainText('正在旋转：载物台');
  await expect(page.getByTestId('polariscope-locator-arrow-cue')).toHaveAttribute('data-arrow-count', '3');
  await expectPolariscopeFocusTransitionStageScoped(page);
  await expectPolariscopeLocatorImageFrameClean(page);
  await expect(page.getByTestId('polariscope-instrument-locator-image')).toHaveAttribute(
    'src',
    '/assets/instruments/polariscope.png',
  );
  await expect(page.getByTestId('polariscope-side-cutaway')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-live-layer-feedback')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-live-observed')).toHaveCount(0);
  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute(
    'data-sample-shape',
    'faceted-rectangle',
  );
  await expect(page.getByTestId('polariscope-live-observation')).not.toContainText('°');
  await expect(page.getByTestId('polariscope-live-observation')).not.toContainText('同步观察');
  await expect(page.getByTestId('polariscope-live-use-state')).not.toContainText('拖动');

  const stageRing = page.getByTestId('polariscope-stage-ring-control');
  const stageBox = await stageRing.boundingBox();
  expect(stageBox).not.toBeNull();
  const locatorImageInitialBox = await page.getByTestId('polariscope-instrument-locator-image').boundingBox();
  expect(locatorImageInitialBox).not.toBeNull();

  const stageCenter = {
    x: stageBox!.x + stageBox!.width / 2,
    y: stageBox!.y + stageBox!.height / 2,
  };
  const stageDragRadius = stageBox!.width * 0.42;
  await page.mouse.move(stageCenter.x, stageCenter.y - stageDragRadius);
  await page.mouse.down();
  await page.mouse.move(
    stageCenter.x + Math.sin((24 * Math.PI) / 180) * stageDragRadius,
    stageCenter.y - Math.cos((24 * Math.PI) / 180) * stageDragRadius,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute('data-stage-angle', /2[3-6]/);
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'bright');
  await expect(page.getByTestId('polariscope-phenomenon-status')).toContainText('亮位');
  await expect(page.getByTestId('polariscope-first-observation-cue')).toContainText('已见亮位');
  const locatorImageMiddleBrightnessBox = await page.getByTestId('polariscope-instrument-locator-image').boundingBox();
  expect(locatorImageMiddleBrightnessBox).not.toBeNull();
  expect(Math.abs(locatorImageMiddleBrightnessBox!.y - locatorImageInitialBox!.y)).toBeLessThan(1);

  const initialStageAngle = await page.getByTestId('polariscope-live-observation').getAttribute('data-stage-angle');
  await page.mouse.move(stageBox!.x + stageBox!.width / 2, stageBox!.y + 10);
  await page.mouse.down();
  await page.mouse.move(stageBox!.x + stageBox!.width - 14, stageBox!.y + stageBox!.height / 2, { steps: 8 });
  await page.mouse.move(stageBox!.x + stageBox!.width / 2, stageBox!.y + stageBox!.height - 10, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(() => page.getByTestId('polariscope-live-observation').getAttribute('data-stage-angle'))
    .not.toBe(initialStageAngle);
  await expect(page.getByTestId('polariscope-live-progress')).toContainText(/已见|继续旋转/);
  await page.getByRole('button', { name: '完成本轮观察' }).click();
  await expect(page.getByTestId('polariscope-result-summary-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-focus-transition')).toHaveCount(0);
});

async function expectPolariscopeLocatorImageFrameClean(page: Page) {
  const locatorImageFrame = page.getByTestId('polariscope-instrument-locator-image').locator('xpath=..');
  await expect(locatorImageFrame.locator('svg')).toHaveCount(0);
  const locatorImageBox = await page.getByTestId('polariscope-instrument-locator-image').boundingBox();
  expect(locatorImageBox).not.toBeNull();
  expect(locatorImageBox!.height).toBeGreaterThanOrEqual(158);
  await expect(locatorImageFrame).not.toContainText('拖动这里');
  await expect(locatorImageFrame).not.toContainText('样品进入');
  await expect(locatorImageFrame).not.toContainText('同步旋转');
  await expect(locatorImageFrame).not.toContainText('使上下偏光片');
}

async function expectPolariscopeFocusTransitionStageScoped(page: Page) {
  const focusBox = await page.getByTestId('polariscope-focus-transition').boundingBox();
  const locatorBox = await page.getByTestId('polariscope-instrument-locator').boundingBox();
  expect(focusBox).not.toBeNull();
  expect(locatorBox).not.toBeNull();
  expect(focusBox!.x + focusBox!.width).toBeLessThan(locatorBox!.x - 8);
}

test('polariscope upper polar can confirm at repeated crossed dark positions', async ({ page }) => {
  await page.goto('/demo/polariscope');

  await page.getByTestId('polariscope-start-learning').click();
  await expect(page.getByTestId('polariscope-align-upper-state')).toBeVisible();

  const upperRing = page.getByTestId('polariscope-upper-ring-control');
  const upperBox = await upperRing.boundingBox();
  expect(upperBox).not.toBeNull();

  await page.mouse.move(upperBox!.x + upperBox!.width / 2, upperBox!.y + 8);
  await page.mouse.down();
  await page.mouse.move(upperBox!.x + 12, upperBox!.y + upperBox!.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId('polariscope-upper-brightness-state')).toContainText('接近全暗');
  await expect(page.getByTestId('polariscope-confirm-upper-polar')).toBeEnabled();
  await page.getByTestId('polariscope-confirm-upper-polar').click();
  await expect(page.getByTestId('polariscope-place-sample-state')).toBeVisible();
});

test('polariscope uses oval cabochon view for jade aggregate samples', async ({ page }) => {
  await enterPolariscopeLiveUse(page, 'jadeite');

  await expect(page.getByTestId('polariscope-live-use-state')).toBeVisible();
  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute(
    'data-sample-shape',
    'cabochon-oval',
  );
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'bright');
  await expect(page.getByTestId('polariscope-phenomenon-status')).toContainText('持续亮');
  await expect(page.getByTestId('polariscope-live-progress')).toContainText('样品持续透亮');
  await expect(page.getByTestId('polariscope-live-hint')).toContainText('样品区域持续透亮');
  await expect(page.getByTestId('polariscope-live-hint')).not.toContainText('视场呈全亮状态');
  await expectAggregateSampleResponseToReadBright(page);
});

test('polariscope learning mode treats opaque samples as transmitted-light not applicable', async ({ page }) => {
  await enterPolariscopeLiveUse(page, 'pearl');

  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute(
    'data-sample-shape',
    'cabochon-oval',
  );
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'dark');
  await expect(page.getByTestId('polariscope-phenomenon-status')).toContainText('不适用');
  await expect(page.getByTestId('polariscope-live-progress')).toContainText('无有效透射响应');
  await expect(page.getByTestId('polariscope-live-progress')).not.toContainText('持续透亮');
  await expect(page.getByTestId('polariscope-live-hint')).toContainText('标准透射偏光镜不适用');
  await expect(page.getByTestId('polariscope-live-hint')).not.toContainText('样品区域持续透亮');
  await expect(page.getByRole('button', { name: '完成本轮观察' })).toBeEnabled();
});

test('polariscope learning mode explains isotropic samples as continuously dark', async ({ page }) => {
  await enterPolariscopeLiveUse(page, 'garnet', 90);

  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute(
    'data-sample-shape',
    'faceted-rectangle',
  );
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'dark');
  await expect(page.getByTestId('polariscope-phenomenon-status')).toContainText('持续全暗');
  await expect(page.getByTestId('polariscope-live-progress')).toContainText('无亮位');
  await expect(page.getByTestId('polariscope-live-progress')).not.toContainText('继续旋转找亮位');
  await expect(page.getByTestId('polariscope-live-hint')).toContainText('始终保持全暗');
  await expect(page.getByRole('button', { name: '完成本轮观察' })).toBeEnabled();
});

test('polariscope learning mode maps cabochon samples to oval silhouettes', async ({ page }) => {
  await enterPolariscopeLiveUse(page, 'moonstone', 45);

  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute(
    'data-sample-shape',
    'cabochon-oval',
  );
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'bright');
  await expect(page.getByTestId('polariscope-phenomenon-status')).toContainText('亮位');

  await enterPolariscopeLiveUse(page, 'opal', 90);

  await expect(page.getByTestId('polariscope-live-observation')).toHaveAttribute(
    'data-sample-shape',
    'cabochon-oval',
  );
  await expect(page.getByTestId('polariscope-phenomenon-status')).toHaveAttribute('data-phenomenon', 'dark');
  await expect(page.getByTestId('polariscope-phenomenon-status')).not.toContainText('持续亮');
});

async function enterPolariscopeLiveUse(page: Page, sampleId: string, stageAngle = 45) {
  await page.goto('/demo/polariscope');
  await page.locator('select').selectOption(sampleId);
  await page.getByTestId('polariscope-start-learning').click();

  const upperRing = page.getByTestId('polariscope-upper-ring-control');
  const upperBox = await upperRing.boundingBox();
  expect(upperBox).not.toBeNull();

  await page.mouse.move(upperBox!.x + upperBox!.width / 2, upperBox!.y + 8);
  await page.mouse.down();
  await page.mouse.move(upperBox!.x + upperBox!.width - 12, upperBox!.y + upperBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId('polariscope-confirm-upper-polar').click();
  await page.getByTestId('polariscope-place-sample').click();
  await page.getByTestId('polariscope-stage-start-rotation').click();

  await expect(page.getByTestId('polariscope-live-use-state')).toBeVisible();

  const stageRing = page.getByTestId('polariscope-stage-ring-control');
  const stageBox = await stageRing.boundingBox();
  expect(stageBox).not.toBeNull();
  const stageCenter = {
    x: stageBox!.x + stageBox!.width / 2,
    y: stageBox!.y + stageBox!.height / 2,
  };
  const stageDragRadius = stageBox!.width * 0.42;
  await page.mouse.move(stageCenter.x, stageCenter.y - stageDragRadius);
  await page.mouse.down();
  await page.mouse.move(
    stageCenter.x + Math.sin((stageAngle * Math.PI) / 180) * stageDragRadius,
    stageCenter.y - Math.cos((stageAngle * Math.PI) / 180) * stageDragRadius,
    { steps: 8 },
  );
  await page.mouse.up();
}

async function expectAggregateSampleResponseToReadBright(page: Page) {
  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="polariscope-live-observation"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const sample = { green: 0, luminance: 0, count: 0 };
    const background = { green: 0, luminance: 0, count: 0 };

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const nx = (x - width / 2) / (width / 2);
        const ny = (y - height / 2) / (height / 2);
        const distance = Math.sqrt(nx * nx + ny * ny);
        const i = (y * width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const bucket =
          Math.abs(nx) < 0.22 && Math.abs(ny) < 0.16
            ? sample
            : distance > 0.46 && distance < 0.56
              ? background
              : null;
        if (!bucket) continue;
        bucket.green += g;
        bucket.luminance += luminance;
        bucket.count += 1;
      }
    }

    return {
      sampleGreen: sample.green / sample.count,
      sampleLuminance: sample.luminance / sample.count,
      backgroundLuminance: background.luminance / background.count,
      deltaLuminance: sample.luminance / sample.count - background.luminance / background.count,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.sampleLuminance).toBeGreaterThan(85);
  expect(metrics!.sampleGreen).toBeGreaterThan(105);
  expect(metrics!.deltaLuminance).toBeGreaterThan(60);
}

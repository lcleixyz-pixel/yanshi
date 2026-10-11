import { expect, test, type Page } from '@playwright/test';
import { SAMPLES } from '../src/data/samples';

const canvas = (page: Page) => page.getByTestId('spectroscope-bench-canvas');
const workbench = (page: Page) => page.getByTestId('spectroscope-practice-3d');
async function slider(page: Page, label: string, value: number) {
  await page.getByRole('slider', { name: label, exact: true }).fill(String(value));
}
async function openBench(page: Page, query = '') {
  await page.goto(`/explore/spectroscope-bench${query}`);
  await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 30000 });
}
async function prepare(page: Page) {
  await page.getByRole('switch', { name: '光源电源' }).click();
  await page.getByTestId('bench-place-sample').click();
}
async function seedDetection(page: Page, id: string) {
  await page.addInitScript((sampleId) => {
    sessionStorage.setItem('gem-lab-detection-v1', JSON.stringify({ state: {
      difficulty: 'intermediate', sampleId, instrumentsUsed: [],
      refractometer: { method: null, riMin: null, riMax: null, birefringence: null, opticalCharacter: null, notes: '' },
      polariscope: { rotation: 0, phenomenon: null, optical: null, notes: '' },
      spectroscope: { method: null, markedLines: [], bandRanges: [], notes: '' },
      startedAt: 1000, assessment: null, assessmentAttemptCount: 0,
    }, version: 1 }));
  }, id);
  await page.goto('/detection');
  await page.getByRole('button', { name: /分光镜/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-loaded', 'true', { timeout: 30000 });
}

test('三维姿态、对光条件和视场同步，未夹样的白光不能记为不特征', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openBench(page);
  await expect(canvas(page)).toHaveAttribute('data-asset-version', 'simple-v2');
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'off');
  await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
  await page.getByRole('switch', { name: '光源电源' }).click();
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'bypass');
  await expect(page.getByTestId('bench-review-record')).toBeDisabled();
  await page.getByTestId('bench-place-sample').click();
  await expect(workbench(page)).toHaveAttribute('data-light-path', /aligned|weak/);
  await expect(canvas(page)).toHaveAttribute('data-tweezers-visible', 'true');
  await expect(canvas(page)).toHaveAttribute('data-table-visible', 'false');
  await expect(page.getByTestId('spectroscope-spectrum-visual').locator('[data-wavelength]')).not.toHaveCount(0);
  await slider(page, '灯头横移', 0.8);
  await expect(canvas(page)).toHaveAttribute('data-lamp-x', '0.088000');
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'missed');
  await slider(page, '灯头横移', 0);
  await page.getByTestId('bench-place-sample').click();
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'bypass');
  await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
  await page.getByTestId('bench-place-sample').click();
  await slider(page, '样品横移', 1);
  await expect(canvas(page)).toHaveAttribute('data-sample-x', '0.035000');
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'missed');
  expect(errors).toEqual([]);
});

test('两种真实仪器切换：棱镜控制真实移动，光栅固定且波长仍为 nm', async ({ page }) => {
  await openBench(page, '?sample=prehnite');
  await prepare(page);
  const firstGap = Number(await canvas(page).getAttribute('data-slit-gap'));
  const firstFocus = Number(await canvas(page).getAttribute('data-focus-z'));
  await slider(page, '狭缝宽度', .7);
  expect(Number(await canvas(page).getAttribute('data-slit-gap'))).toBeGreaterThan(firstGap);
  await slider(page, '调焦位置', .9);
  expect(Number(await canvas(page).getAttribute('data-focus-z'))).toBeGreaterThan(firstFocus);
  await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
  await page.getByRole('button', { name: '光栅式', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-rendered-instrument', 'grating');
  await expect(canvas(page)).toHaveAttribute('data-focus-z', 'fixed');
  await expect(page.getByRole('slider', { name: '狭缝宽度' })).toHaveCount(0);
  await expect(page.getByTestId('spectroscope-spectrum-strip')).toHaveAttribute('data-dispersion', 'grating');
  await expect(page.getByTestId('bench-no-absorption')).toBeEnabled();
  await page.getByRole('button', { name: '样品', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-focus-view', 'sample');
  await page.getByTestId('bench-reset').click();
  await expect(canvas(page)).toHaveAttribute('data-focus-view', 'whole');
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'off');
});

test('反射照明在样品两侧上方布置，缺少方法证据只保存布置说明', async ({ page }) => {
  await openBench(page, '?sample=turquoise');
  await prepare(page);
  await expect(workbench(page)).toHaveAttribute('data-light-path', 'blocked');
  await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
  await page.getByRole('button', { name: /03.*表面反射观察/ }).click();
  await expect(page.getByTestId('spectroscope-spectrum-visual')).toHaveCount(0);
  await slider(page, '灯头俯角（相对台面）', 45);
  await slider(page, '灯头横移', 0);
  await expect(canvas(page)).toHaveAttribute('data-lamp-z', '-0.090000');
  await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
  await expect(page.getByText(/本次不显示反射吸收谱/)).toBeVisible();
  await page.getByTestId('bench-review-record').click();
  await page.getByTestId('bench-confirm-save').click();
  await expect(page.getByTestId('bench-saved')).toContainText('未作有效吸收观察');
  await page.getByRole('combobox', { name: '三维分光镜样品' }).selectOption('ruby');
  await page.getByRole('button', { name: /02.*内反射观察/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-sample-placed', 'true');
  await expect(canvas(page)).toHaveAttribute('data-lamp-z', '-0.090000');
  await expect(canvas(page)).toHaveAttribute('data-tweezers-visible', 'false');
  await expect(canvas(page)).toHaveAttribute('data-table-visible', 'true');
  const tableTop = Number(await canvas(page).getAttribute('data-table-top-y'));
  const specimenBottom = Number(await canvas(page).getAttribute('data-sample-bottom-y'));
  expect(Math.abs(tableTop - specimenBottom)).toBeLessThanOrEqual(0.0002);
  await expect(page.getByTestId('spectroscope-spectrum-visual')).toHaveCount(0);
});

test('先记录后对照，改变条件保留旧记录但不能自动恢复确认', async ({ page }) => {
  await openBench(page, '?sample=amethyst');
  await expect(page.getByRole('combobox', { name: '三维分光镜样品' }).locator('option')).toHaveCount(SAMPLES.length);
  await expect(page.getByTestId('bench-reference')).toHaveCount(0);
  await prepare(page);
  await page.getByTestId('bench-no-absorption').check();
  await page.getByRole('textbox', { name: '观察补充说明' }).fill('换向后仍需复核');
  await page.getByTestId('bench-review-record').click();
  await page.getByTestId('bench-confirm-save').click();
  await expect(page.getByTestId('bench-saved')).toHaveAttribute('data-stale', 'false');
  await expect(page.getByTestId('bench-reference')).toBeVisible();
  await slider(page, '光源亮度', .3);
  await expect(page.getByTestId('bench-saved')).toHaveAttribute('data-stale', 'true');
  await expect(page.getByTestId('bench-saved')).toContainText('换向后仍需复核');
  await slider(page, '光源亮度', .82);
  await expect(page.getByTestId('bench-no-absorption')).not.toBeChecked();
  await expect(page.getByTestId('bench-review-record')).toBeDisabled();
  await expect(page.getByRole('textbox', { name: '观察补充说明' })).toHaveValue('换向后仍需复核');
  await expect(page.getByTestId('bench-reference')).toHaveCount(0);
});

test('从内反射方法链接进入时，灯头直接处于斜上方示意位置', async ({ page }) => {
  await openBench(page, '?sample=ruby&method=internal-reflection');
  await expect(canvas(page)).toHaveAttribute('data-lamp-z', '-0.090000');
  await expect(page.getByRole('slider', { name: '灯头俯角（相对台面）', exact: true })).toHaveValue('45');
  expect(Number(await canvas(page).getAttribute('data-lamp-y'))).toBeGreaterThan(0.2);
  await expect(canvas(page)).toHaveAttribute('data-lamp-x', '0.000000');
  await expect(canvas(page)).toHaveAttribute('data-table-visible', 'true');
  await expect(canvas(page)).toHaveAttribute('data-tweezers-visible', 'false');
  await expect(page.getByTestId('spectroscope-spectrum-visual')).toHaveCount(0);
});

test('未知样品不泄露身份，谱线与谱带和条件可经过核对写回检测记录', async ({ page }) => {
  await seedDetection(page, 'ruby');
  await expect(page.locator('body')).not.toContainText('红宝石');
  await expect(page.getByRole('combobox', { name: '三维分光镜样品' })).toHaveCount(0);
  await prepare(page);
  await page.getByRole('spinbutton', { name: '吸收线波长' }).fill('694');
  await page.getByRole('button', { name: '添加线', exact: true }).click();
  await page.getByRole('spinbutton', { name: '吸收带起点' }).fill('535');
  await page.getByRole('spinbutton', { name: '吸收带终点' }).fill('575');
  await page.getByRole('button', { name: '添加带', exact: true }).click();
  await page.getByTestId('bench-review-record').click();
  const before = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1')!).state);
  expect(before.instrumentsUsed).not.toContain('spectroscope');
  await page.getByTestId('bench-confirm-save').click();
  await expect(workbench(page)).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1')!).state);
  expect(saved.spectroscope.markedLines).toEqual([694]);
  expect(saved.spectroscope.bandRanges).toEqual([{ start: 535, end: 575 }]);
  expect(saved.spectroscope.notes).toContain('三维教学观察');
  expect(saved.instrumentsUsed).toEqual(['spectroscope']);
});

test('未核谱保留练习范围和待核记录，不显示假空白、不计有效观察', async ({ page }) => {
  await seedDetection(page, 'tourmaline');
  await expect(page.locator('body')).not.toContainText('碧玺');
  await expect(page.getByTestId('spectroscope-unverified-spectrum')).toBeVisible();
  await expect(page.getByTestId('spectroscope-spectrum-visual')).toHaveCount(0);
  await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
  await page.getByTestId('bench-review-record').click();
  await page.getByTestId('bench-confirm-save').click();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1')!).state);
  expect(saved.spectroscope.notes).toContain('教学谱图未核定，无法判断吸收情况');
  expect(saved.spectroscope.markedLines).toEqual([]);
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toBeVisible();
});

test('三维资产故障可回退 2D，待核样品仍不泄露身份', async ({ page }) => {
  await page.route('**/spectroscope-workbench/simple-v2/model.glb', (route) => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('gem-lab-detection-v1', JSON.stringify({ state: {
    difficulty: 'intermediate', sampleId: 'tourmaline', instrumentsUsed: [],
    refractometer: { method: null, riMin: null, riMax: null, birefringence: null, opticalCharacter: null, notes: '' },
    polariscope: { rotation: 0, phenomenon: null, optical: null, notes: '' },
    spectroscope: { method: null, markedLines: [], bandRanges: [], notes: '' },
    startedAt: 1000, assessment: null, assessmentAttemptCount: 0,
  }, version: 1 })));
  await page.goto('/detection');
  await page.getByRole('button', { name: /分光镜/ }).click();
  await expect(page.getByRole('alert')).toContainText('三维视图暂不可用');
  await page.getByRole('button', { name: '改用 2D 检测', exact: true }).click();
  await expect(page.getByTestId('spectroscope-unverified-spectrum')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('碧玺');
});

test('已有透射资料的样品，反射布置记录也不能计入有效观察或用于命名', async ({ page }) => {
  await seedDetection(page, 'ruby');
  await page.getByRole('button', { name: /02.*内反射观察/ }).click();
  await page.getByTestId('bench-review-record').click();
  await page.getByTestId('bench-confirm-save').click();
  const result = await page.evaluate(async () => {
    const state = JSON.parse(sessionStorage.getItem('gem-lab-detection-v1')!).state;
    return { state };
  });
  expect(result.state.spectroscope.observationStatus).toBe('setup-only');
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toBeVisible();
  await page.goto('/assessment');
  await expect(page.getByText(/当前已完成 0 项有效观察/)).toBeVisible();
});

test('窄屏可以看到场景、视场与操作，页面没有横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBench(page);
  await prepare(page);
  // 手机上三维区另叠一条只读小光谱；这里检查可标记的完整光谱。
  await expect(page.getByRole('region', { name: '目镜观察与波长标记' }).getByTestId('spectroscope-spectrum-strip')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId('bench-no-absorption').check();
  await expect(page.getByTestId('bench-review-record')).toBeEnabled();
});

for (const instrument of ['prism', 'grating']) {
  test(`${instrument}: 两反射法的真实节点形成上方 V 形，样品落台，出光点属于正确部位`, async ({ page }) => {
    await openBench(page, `?sample=ruby&instrument=${instrument}`);
    await prepare(page);
    const value = async (key: string) => {
      const actual = await canvas(page).getAttribute(`data-${key}`);
      expect(actual).not.toBeNull();
      expect(actual).not.toBe('none');
      expect(Number.isFinite(Number(actual))).toBe(true);
      return Number(actual);
    };
    for (const method of ['internal', 'surface']) {
      if (method === 'surface') await page.getByRole('combobox', { name: '三维分光镜样品' }).selectOption('turquoise');
      await page.getByRole('button', { name: method === 'internal' ? /02.*内反射观察/ : /03.*表面反射观察/ }).click();
      await expect(canvas(page)).toHaveAttribute('data-table-visible', 'true');
      await expect(canvas(page)).toHaveAttribute('data-tweezers-visible', 'false');
      expect(Math.abs(await value('table-top-y') - await value('sample-bottom-y'))).toBeLessThan(0.0002);
      expect(await value('lamp-y')).toBeGreaterThan(await value('incident-hit-y') + 0.04);
      expect(await value('lamp-z')).toBeLessThan(await value('incident-hit-z'));
      expect(await value('scope-entry-y')).toBeGreaterThan(await value('sample-exit-y') + 0.02);
      expect(await value('scope-entry-z')).toBeGreaterThan(await value('sample-exit-z'));
      expect(await value('lamp-dir-y')).toBeLessThan(-0.65);
      expect(await value('lamp-dir-z')).toBeGreaterThan(0.65);
      expect(await value('scope-axis-y')).toBeGreaterThan(0.65);
      expect(await value('scope-axis-z')).toBeGreaterThan(0.65);
      expect(await value('scope-elevation')).toBeCloseTo(45, 1);
      if (method === 'internal') {
        expect(await value('internal-bounce-y')).toBeGreaterThan(await value('table-top-y'));
        expect(await value('internal-bounce-y')).toBeLessThan(await value('table-top-y') + 0.002);
        expect(await value('sample-exit-z')).toBeGreaterThan(await value('incident-hit-z'));
      } else {
        for (const axis of ['x', 'y', 'z']) expect(await value(`sample-exit-${axis}`)).toBeCloseTo(await value(`incident-hit-${axis}`), 5);
        await slider(page, '灯头俯角（相对台面）', 5);
        await expect(workbench(page)).toHaveAttribute('data-light-path', /missed|blocked/);
        await slider(page, '灯头俯角（相对台面）', 45);
      }
      await expect(page.getByTestId('spectroscope-spectrum-visual')).toHaveCount(0);
      await expect(page.getByTestId('bench-no-absorption')).toBeDisabled();
    }
  });
}

test('透射时镊子竖向夹住腰棱两侧，不挡灯口到入光口的光路', async ({ page }) => {
  // 每种外形各取一颗：刻面、弧面、异形、雕件。
  for (const id of ['ruby', 'opal', 'jadeite', 'amber']) {
    await openBench(page, `?sample=${id}`);
    await prepare(page);
    await expect(canvas(page)).toHaveAttribute('data-sample-placed', 'true');
    await expect(canvas(page), id).toHaveAttribute('data-tweezers-in-beam', 'false');
    await expect(canvas(page)).toHaveAttribute('data-tweezer-grip', 'vertical');
    const gap = Number(await canvas(page).getAttribute('data-tweezer-gap'));
    expect(gap, `${id} 镊尖应贴住样品`).toBeGreaterThan(0.004);
  }
  await page.getByTestId('bench-place-sample').click();
  await expect(canvas(page)).toHaveAttribute('data-tweezer-grip', 'resting');
});

test('在三维中直接拖动狭缝调节环、目镜套筒和灯头，滑杆与模型同步', async ({ page }) => {
  await openBench(page, '?sample=ruby');
  await prepare(page);
  await page.getByRole('button', { name: '分光镜', exact: true }).click();
  await page.waitForTimeout(600);
  const handle = async (id: string) => {
    await canvas(page).scrollIntoViewIfNeeded();
    const box = (await canvas(page).boundingBox())!;
    const handles = JSON.parse((await canvas(page).getAttribute('data-handles')) ?? '{}');
    return [box.x + handles[id][0], box.y + handles[id][1]] as const;
  };
  const dragBy = async (id: string, dx: number) => {
    const [x, y] = await handle(id);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await expect(canvas(page)).toHaveAttribute('data-dragging', id);
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };
  const slit = page.getByRole('slider', { name: '狭缝宽度', exact: true });
  const gapBefore = Number(await canvas(page).getAttribute('data-slit-gap'));
  await dragBy('slitControl', 60);
  await expect.poll(async () => Number(await slit.inputValue())).toBeGreaterThan(0.5);
  expect(Number(await canvas(page).getAttribute('data-slit-gap'))).toBeGreaterThan(gapBefore);
  const focus = page.getByRole('slider', { name: '调焦位置', exact: true });
  await dragBy('focusTube', -60);
  await expect.poll(async () => Number(await focus.inputValue())).toBeLessThan(0.4);
  await page.getByRole('button', { name: '全景', exact: true }).click();
  await page.waitForTimeout(600);
  await dragBy('lampHead', 40);
  await expect.poll(async () => Number(await page.getByRole('slider', { name: '灯头横移', exact: true }).inputValue())).toBeGreaterThan(0.2);
  await expect(canvas(page)).toHaveAttribute('data-dragging', '');
});

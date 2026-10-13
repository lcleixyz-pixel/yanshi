import { expect, test, polariscopeUrl, type Page } from './fixtures/polariscope';

/** 由 polariscope3d.spec.ts 改写：同一组结构、机械与容错检查，改在仿真认识屏上做。 */
const scene = (page: Page) => page.getByTestId('polariscope-scene');
const canvas = (page: Page) => page.getByTestId('polariscope-canvas');
const MODEL = '**/assets/3d/polariscope/structure-v1/repaired.glb';
const partIds = ['base', 'frame', 'light', 'polarizer', 'stage', 'analyzer', 'conoscope', 'powerSwitch'];
const route = '/sim/polariscope/learn';

test.setTimeout(60_000);

async function openLearn(page: Page) {
  await page.goto(polariscopeUrl(route));
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(canvas(page)).toHaveAttribute('data-loaded', 'true');
}

test('knowledge entry keeps the original diagram and opens the learn screen in structure mode with all eight parts', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  await page.getByTestId('polariscope-reference-diagram').locator('summary').click();
  await expect(page.getByTestId('polariscope-reference-diagram').locator('img')).toBeVisible();
  await page.getByTestId('knowledge-structure-sim').click();
  await expect(page).toHaveURL(/\/sim\/polariscope\/learn$/);
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('sim-polari-mode-structure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sim-polari-mode-explode')).toBeVisible();
  for (const id of partIds) await expect(page.getByTestId(`sim-part-${id}`)).toBeVisible();
});

test('the old 3D page redirects to the matching sim screen and keeps lesson, course and quality parameters', async ({ page }) => {
  await page.goto('/explore/polariscope?lesson=path&quality=standard');
  await expect(page).toHaveURL(/\/sim\/polariscope\/learn\?lesson=path&quality=standard$/);
  await expect(canvas(page)).toHaveAttribute('data-quality', 'standard', { timeout: 30_000 });
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-lesson', 'path');
  await page.goto('/explore/polariscope?lesson=conoscope');
  await expect(page).toHaveURL(/\/sim\/polariscope\/lab\?lesson=conoscope$/);
  await page.goto('/explore/polariscope?course=basic&mode=student&step=rotate');
  await expect(page).toHaveURL(/\/sim\/polariscope\/lab\?mode=student&step=rotate$/);
  await expect(page.getByTestId('sim-task')).toContainText('放样旋转');
});

test('mechanical keyboard angles and power controls share the scene state', async ({ page }) => {
  await openLearn(page);
  const analyzer = page.getByRole('slider', { name: '上偏光片角度', exact: true });
  const stage = page.getByRole('slider', { name: '载物台角度', exact: true });
  await analyzer.press('End');
  await expect(analyzer).toHaveValue('360');
  await expect(canvas(page)).toHaveAttribute('data-analyzer-angle', '360');
  await expect(stage).toHaveValue('0');
  await stage.press('ArrowRight');
  await expect(stage).toHaveValue('1');
  await expect(canvas(page)).toHaveAttribute('data-stage-angle', '1');
  await analyzer.press('Home');
  await expect(canvas(page)).toHaveAttribute('data-analyzer-angle', '0');
  const power = page.getByRole('switch', { name: '电源开关', exact: true });
  const pressedPosition = await canvas(page).getAttribute('data-power-switch-position');
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-emitter-intensity'))).toBeGreaterThan(0);
  await power.click();
  await expect(power).toHaveAttribute('aria-checked', 'false');
  await expect(canvas(page)).toHaveAttribute('data-power', 'false');
  await expect(canvas(page)).toHaveAttribute('data-emitter-intensity', '0');
  await expect(canvas(page)).not.toHaveAttribute('data-power-switch-position', pressedPosition!);
  await power.click();
  await expect(canvas(page)).toHaveAttribute('data-power', 'true');
  await expect(canvas(page)).toHaveAttribute('data-power-switch-position', pressedPosition!);
});

test('selection and isolation synchronize, while internal light stays in its base context', async ({ page }) => {
  await openLearn(page);
  await page.getByTestId('sim-part-analyzer').click();
  await expect(page.locator('.polariscope-hotspot[data-part-id="analyzer"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sim-polari-isolate').click();
  await expect(page.getByTestId('sim-polari-isolation')).toContainText('单独查看 · 上偏光片');
  await page.getByTestId('sim-part-stage').click();
  await expect(page.getByTestId('sim-polari-isolation')).toContainText('单独查看 · 载物台');
  await page.getByTestId('sim-part-light').click();
  await expect(page.getByTestId('sim-polari-internal')).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas(page)).toHaveAttribute('data-internal-view', 'true');
  await expect(canvas(page)).toHaveAttribute('data-shell-outline', 'true');
  await expect(page.getByTestId('sim-polari-isolation')).toHaveCount(0);
  await page.getByTestId('sim-polari-internal').click();
  await expect(canvas(page)).toHaveAttribute('data-internal-view', 'false');
  await expect(canvas(page)).toHaveAttribute('data-shell-outline', 'false');
});

test('continuous explode and reset-all restore the assembled learn scene', async ({ page }) => {
  await openLearn(page);
  await page.getByTestId('sim-polari-mode-explode').click();
  const explosion = page.getByRole('slider', { name: '拆解程度', exact: true });
  await explosion.press('End');
  await expect(explosion).toHaveValue('1');
  await expect(canvas(page)).toHaveAttribute('data-explosion', /^1(?:\.0+)?$/);
  await explosion.press('Home');
  await expect(canvas(page)).toHaveAttribute('data-explosion', /^0(?:\.0+)?$/);
  await page.getByTestId('sim-part-light').click();
  await page.getByRole('switch', { name: '电源开关', exact: true }).click();
  await page.getByRole('slider', { name: '载物台角度', exact: true }).press('End');
  await page.getByTestId('sim-reset').click();
  await expect(page.getByTestId('sim-polari-mode-structure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('switch', { name: '电源开关', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toHaveValue('0');
  await expect(page.getByRole('slider', { name: '载物台角度', exact: true })).toHaveValue('0');
  await expect(canvas(page)).toHaveAttribute('data-explosion', /^0(?:\.0+)?$/);
  await expect(canvas(page)).toHaveAttribute('data-internal-view', 'false');
});

test('camera presets and projection remain keyboard accessible', async ({ page }) => {
  await openLearn(page);
  const preset = page.getByRole('combobox', { name: '观察视角', exact: true });
  await preset.selectOption('03-top');
  await expect(canvas(page)).toHaveAttribute('data-view-preset', '03-top');
  await page.getByTestId('sim-polari-reset-view').click();
  await expect(preset).toHaveValue('free');
  await page.getByRole('combobox', { name: '三维画质', exact: true }).selectOption('standard');
  await page.getByRole('button', { name: '进入投屏模式', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出投屏模式', exact: true })).toBeFocused();
  await page.getByRole('slider', { name: '上偏光片角度', exact: true }).press('End');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '进入投屏模式', exact: true })).toBeFocused();
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toHaveValue('360');
});

test('failed model loading preserves a fallback image and can retry the same model', async ({ page }) => {
  await page.route(MODEL, (r) => r.abort('failed'));
  await page.goto(polariscopeUrl(route));
  await expect(scene(page)).toHaveAttribute('data-status', 'error', { timeout: 30_000 });
  await expect(scene(page).locator('img')).toBeVisible();
  await expect(page.getByTestId('sim-polari-fallback-2d')).toHaveAttribute('href', '/demo/polariscope');
  await page.unroute(MODEL);
  await page.getByRole('button', { name: '重新加载三维场景', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
});

test('lost graphics context falls back without losing the panel controls or the 2D link', async ({ page }) => {
  await openLearn(page);
  await canvas(page).dispatchEvent('webglcontextlost');
  await expect(scene(page)).toHaveAttribute('data-status', 'error');
  await expect(page.getByRole('alert')).toContainText('三维显示已中断');
  await expect(page.getByRole('button', { name: '重新加载三维场景', exact: true })).toBeEnabled();
  await expect(page.getByTestId('sim-polari-mode-explode')).toBeEnabled();
  await expect(page.getByTestId('sim-polari-fallback-2d')).toBeVisible();
});

test('free structure exploration does not access learning or detection storage', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__polariscopeStorageCalls', { value: calls });
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: function (this: Storage, ...args: string[]) {
        if (args[0]?.startsWith('gem-lab-')) calls.push(`${method}:${args[0]}`);
        return Reflect.apply(original, this, args);
      } });
    }
  });
  await openLearn(page);
  await page.getByTestId('sim-part-light').click();
  await page.getByRole('switch', { name: '电源开关', exact: true }).click();
  await page.getByTestId('sim-polari-mode-explode').click();
  await page.getByRole('slider', { name: '拆解程度', exact: true }).press('End');
  await page.getByTestId('sim-reset').click();
  const calls = await page.evaluate(() => (window as unknown as { __polariscopeStorageCalls: string[] }).__polariscopeStorageCalls);
  expect(calls).toEqual([]);
});

test('leaving and re-entering removes old canvases and starts a fresh learn scene', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openLearn(page);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await expect(canvas(page)).toHaveCount(1);
    await page.getByTestId('sim-polari-mode-explode').click();
    await page.getByTestId('sim-part-light').click();
    await page.getByRole('switch', { name: '电源开关', exact: true }).click();
    await page.getByTestId('sim-home').click();
    await expect(canvas(page)).toHaveCount(0);
    await page.goto('/knowledge/polariscope');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=1280, initial-scale=1');
    await page.getByTestId('knowledge-structure-sim').click();
    await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('sim-polari-mode-structure')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas(page)).toHaveAttribute('data-power', 'true');
    await expect(canvas(page)).toHaveAttribute('data-internal-view', 'false');
  }
  expect(pageErrors).toEqual([]);
});

test('narrow viewport keeps the canvas, drawer controls and the home link usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1');
  await expect(canvas(page)).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-quality', 'standard');
  await page.getByTestId('sim-controls-toggle').click();
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toBeVisible();
  const quality = page.getByRole('combobox', { name: '三维画质', exact: true });
  await expect(quality).toHaveValue('standard');
  await quality.selectOption('high');
  await page.getByRole('slider', { name: '上偏光片角度', exact: true }).press('ArrowRight');
  await expect(quality).toHaveValue('high');
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
  await expect(page.getByTestId('sim-home')).toBeVisible();
});

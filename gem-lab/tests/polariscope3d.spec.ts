import { expect, test, type Page } from '@playwright/test';

const scene = (page: Page) => page.getByTestId('polariscope-scene');
const canvas = (page: Page) => page.getByTestId('polariscope-canvas');
const MODEL = '**/assets/3d/polariscope/structure-v1/repaired.glb';
const partIds = ['base', 'frame', 'light', 'polarizer', 'stage', 'analyzer', 'conoscope', 'powerSwitch'];

test.setTimeout(60_000);

async function openExplore(page: Page) {
  await page.goto('/explore/polariscope');
  await expect(page.getByRole('heading', { name: '偏光镜', exact: true })).toBeVisible();
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(canvas(page)).toHaveAttribute('data-loaded', 'true');
}

test('knowledge entry preserves the original diagram and opens only structure and explode modes', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  // 原仪器图保留在「辅助参考」中，展开后可见；3D 讲解是主入口。
  await page.getByTestId('polariscope-reference-diagram').locator('summary').click();
  await expect(page.getByTestId('polariscope-reference-diagram').locator('img')).toBeVisible();
  await page.getByTestId('polariscope-explore-link').click();
  await expect(page).toHaveURL(/\/explore\/polariscope(\?lesson=components)?$/);
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('explore-mode-structure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('explore-mode-explode')).toBeVisible();
  await expect(page.getByTestId('explore-mode-practice')).toHaveCount(0);
  await expect(page.getByTestId('explore-sample-toggle')).toHaveCount(0);
  await expect(page.getByTestId('explore-optical-reading')).toHaveCount(0);
  await expect(page.getByTestId('explore-workflow')).toHaveCount(0);
  for (const id of partIds) await expect(page.getByTestId(`explore-part-${id}`)).toBeVisible();
});

test('mechanical keyboard angles and power controls share the scene state', async ({ page }) => {
  await openExplore(page);
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
  await openExplore(page);
  await page.getByTestId('explore-part-analyzer').click();
  await expect(page.locator('.polariscope-hotspot[data-part-id="analyzer"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '单独查看', exact: true }).click();
  await expect(page.getByText('单独查看 · 上偏光片', { exact: true })).toBeVisible();
  await page.getByTestId('explore-part-stage').click();
  await expect(page.getByText('单独查看 · 载物台', { exact: true })).toBeVisible();
  await page.getByTestId('explore-part-light').click();
  await expect(page.getByTestId('explore-internal-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas(page)).toHaveAttribute('data-internal-view', 'true');
  await expect(canvas(page)).toHaveAttribute('data-shell-outline', 'true');
  await expect(page.locator('.pol-explore__isolation')).toHaveCount(0);
  await page.getByTestId('explore-internal-toggle').click();
  await expect(canvas(page)).toHaveAttribute('data-internal-view', 'false');
  await expect(canvas(page)).toHaveAttribute('data-shell-outline', 'false');
});

test('continuous explode and reset restore assembled local state', async ({ page }) => {
  await openExplore(page);
  await page.getByTestId('explore-mode-explode').click();
  const explosion = page.getByRole('slider', { name: '拆解程度', exact: true });
  await explosion.press('End');
  await expect(explosion).toHaveValue('1');
  await expect(canvas(page)).toHaveAttribute('data-explosion', /^1(?:\.0+)?$/);
  await explosion.press('Home');
  await expect(canvas(page)).toHaveAttribute('data-explosion', /^0(?:\.0+)?$/);
  await page.getByTestId('explore-part-light').click();
  await page.getByRole('switch', { name: '电源开关', exact: true }).click();
  await page.getByRole('slider', { name: '载物台角度', exact: true }).press('End');
  await page.getByTestId('explore-reset-all').click();
  await expect(page.getByTestId('explore-mode-structure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('switch', { name: '电源开关', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toHaveValue('0');
  await expect(page.getByRole('slider', { name: '载物台角度', exact: true })).toHaveValue('0');
  await expect(canvas(page)).toHaveAttribute('data-explosion', /^0(?:\.0+)?$/);
  await expect(canvas(page)).toHaveAttribute('data-internal-view', 'false');
});

test('camera presets and projection remain keyboard accessible without adding optical readings', async ({ page }) => {
  await openExplore(page);
  const preset = page.getByRole('combobox', { name: '观察视角', exact: true });
  await preset.selectOption('03-top');
  await expect(preset).toHaveValue('03-top');
  await page.getByRole('button', { name: '恢复三维视角', exact: true }).click();
  await expect(preset).toHaveValue('free');
  await page.getByRole('combobox', { name: '三维画质', exact: true }).selectOption('standard');
  await page.getByRole('button', { name: '进入投屏模式', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出投屏模式', exact: true })).toBeFocused();
  await expect(page.getByRole('complementary', { name: '仪器部件', exact: true })).toBeHidden();
  await page.getByRole('slider', { name: '投屏检偏器角度', exact: true }).press('End');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '进入投屏模式', exact: true })).toBeFocused();
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toHaveValue('360');
  await expect(page.getByTestId('explore-optical-reading')).toHaveCount(0);
});

test('failed model loading preserves a fallback image and can retry the same model', async ({ page }) => {
  await page.route(MODEL, route => route.abort('failed'));
  await page.goto('/explore/polariscope');
  await expect(scene(page)).toHaveAttribute('data-status', 'error', { timeout: 30_000 });
  await expect(scene(page).locator('img')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新加载三维场景', exact: true })).toBeVisible();
  await page.unroute(MODEL);
  await page.getByRole('button', { name: '重新加载三维场景', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
});

test('lost graphics context falls back without losing page controls or the original learning link', async ({ page }) => {
  await openExplore(page);
  await canvas(page).dispatchEvent('webglcontextlost');
  await expect(scene(page)).toHaveAttribute('data-status', 'error');
  await expect(page.getByRole('alert')).toContainText('三维显示已中断');
  await expect(page.getByRole('button', { name: '重新加载三维场景', exact: true })).toBeEnabled();
  await expect(page.getByTestId('explore-mode-explode')).toBeEnabled();
  await expect(page.locator('a[href="/demo/polariscope"]').first()).toBeVisible();
});

test('structure exploration does not access existing learning or detection storage', async ({ page }) => {
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
  await openExplore(page);
  await page.getByTestId('explore-part-light').click();
  await page.getByRole('switch', { name: '电源开关', exact: true }).click();
  await page.getByTestId('explore-mode-explode').click();
  await page.getByRole('slider', { name: '拆解程度', exact: true }).press('End');
  await page.getByTestId('explore-reset-all').click();
  const calls = await page.evaluate(() => (window as unknown as { __polariscopeStorageCalls: string[] }).__polariscopeStorageCalls);
  expect(calls).toEqual([]);
});

test('back navigation returns to the knowledge structure section; teaching link uses the existing learning flow', async ({ page }) => {
  await openExplore(page);
  await page.locator('a[href="/knowledge/polariscope#structure"]').first().click();
  await expect(page).toHaveURL(/\/knowledge\/polariscope#structure$/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=1280, initial-scale=1');
  await expect(page.locator('#structure')).toBeInViewport();
  await expect(page.getByTestId('polariscope-canvas')).toHaveCount(0);
  await page.getByTestId('polariscope-explore-link').click();
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.locator('a[href="/demo/polariscope"]').first().click();
  await expect(page).toHaveURL(/\/demo\/polariscope$/);
  await expect(page.getByTestId('polariscope-start-learning')).toBeVisible();
  await expect(page.getByTestId('polariscope-canvas')).toHaveCount(0);
  await page.getByTestId('polariscope-start-learning').click();
  await expect(page.getByTestId('polariscope-align-upper-state')).toBeVisible();
});

test('repeated route entry removes old canvases and resets only the structure page state', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openExplore(page);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await expect(canvas(page)).toHaveCount(1);
    await page.getByTestId('explore-mode-explode').click();
    await page.getByTestId('explore-part-light').click();
    await page.getByRole('switch', { name: '电源开关', exact: true }).click();
    await page.locator('a[href="/knowledge/polariscope#structure"]').first().click();
    await expect(canvas(page)).toHaveCount(0);
    await page.getByTestId('polariscope-explore-link').click();
    await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('explore-mode-structure')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas(page)).toHaveAttribute('data-power', 'true');
    await expect(canvas(page)).toHaveAttribute('data-internal-view', 'false');
  }
  expect(pageErrors).toEqual([]);
});

test('narrow viewport keeps the canvas, controls and a knowledge return link usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExplore(page);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1');
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toBeVisible();
  await expect(page.getByTestId('explore-back-to-knowledge')).toBeVisible();
  const quality = page.getByRole('combobox', { name: '三维画质', exact: true });
  await expect(quality).toHaveValue('standard');
  await quality.selectOption('high');
  await page.getByRole('slider', { name: '上偏光片角度', exact: true }).press('ArrowRight');
  await expect(quality).toHaveValue('high');
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
  await page.getByTestId('explore-back-to-knowledge').click();
  await expect(page).toHaveURL(/\/knowledge\/polariscope#structure$/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=1280, initial-scale=1');
});

import { expect, test, type Page } from '@playwright/test';

const ROUTE = '/explore/polariscope';

async function waitForScene(page: Page) {
  await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('polariscope-canvas')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(async () => Number(await page.getByTestId('polariscope-canvas').getAttribute('data-frames'))).toBeGreaterThan(5);
}

async function stableCamera(page: Page) {
  let previous = '';
  let unchanged = 0;
  await expect.poll(async () => {
    const next = await page.getByTestId('polariscope-canvas').getAttribute('data-camera') ?? '';
    unchanged = next && next === previous ? unchanged + 1 : 0;
    previous = next;
    return unchanged;
  }).toBeGreaterThanOrEqual(3);
  return previous;
}

async function angles(page: Page) {
  return page.getByTestId('polariscope-canvas').evaluate(canvas => ({
    analyzer: Number(canvas.getAttribute('data-analyzer-angle')),
    stage: Number(canvas.getAttribute('data-stage-angle')),
  }));
}

/** Use projected part position plus actual raycast hover; no fixed asset/screen coordinates. */
async function surfacePoint(page: Page, part: 'analyzer' | 'stage' | 'powerSwitch') {
  const canvas = page.getByTestId('polariscope-canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const marker = await page.locator(`.polariscope-hotspot[data-part-id="${part}"]`).boundingBox();
  expect(marker).not.toBeNull();
  const projected = { x: marker!.x + marker!.width / 2, y: marker!.y + marker!.height / 2 };
  const offsets = [0, 8, -8, 16, -16, 28, -28, 44, -44, 64, -64];
  for (const dy of offsets) {
    for (const dx of offsets) {
      const x = projected.x + dx;
      const y = projected.y + dy;
      if (x < bounds!.x + 4 || x > bounds!.x + bounds!.width - 90 || y < bounds!.y + 4 || y > bounds!.y + bounds!.height - 4) continue;
      const receivesPointer = await canvas.evaluate((element, point) => document.elementFromPoint(point.x, point.y) === element, { x, y });
      if (!receivesPointer) continue;
      // The scene intentionally throttles mesh hover raycasts for the dense source rings.
      await page.waitForTimeout(60);
      await page.mouse.move(x, y);
      if (await canvas.getAttribute('data-hovered-part') === part) return { x, y };
    }
  }
  throw new Error(`No visible, directly draggable ${part} surface near its projected hotspot`);
}

async function backgroundPoint(page: Page) {
  const canvas = page.getByTestId('polariscope-canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  for (const fraction of [0.55, 0.4, 0.7, 0.25]) {
    const point = { x: bounds!.x + 20, y: bounds!.y + bounds!.height * fraction };
    await page.waitForTimeout(60);
    await page.mouse.move(point.x, point.y);
    if (await canvas.getAttribute('data-hovered-part') === '') return point;
  }
  throw new Error('No clear scene background available for orbit gesture');
}

test.describe('native polariscope scene', () => {
  test.setTimeout(60_000);

  test('direct ring drags update the shared angle without moving the camera or the other ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ROUTE);
    await waitForScene(page);
    await page.getByTestId('explore-mode-structure').click();
    await stableCamera(page);
    const canvas = page.getByTestId('polariscope-canvas');

    for (const part of ['analyzer', 'stage'] as const) {
      const point = await surfacePoint(page, part);
      const before = await angles(page);
      const beforeCamera = await stableCamera(page);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 60, point.y, { steps: 12 });
      const duringCamera = await canvas.getAttribute('data-camera');
      await page.mouse.up();
      await expect.poll(async () => (await angles(page))[part]).not.toBe(before[part]);
      expect(duringCamera).toBe(beforeCamera);
      expect(await stableCamera(page)).toBe(beforeCamera);
      // Read after the final pointermove has reached the render loop, not the penultimate frame.
      const after = await angles(page);
      expect(after[part === 'analyzer' ? 'stage' : 'analyzer']).toBe(before[part === 'analyzer' ? 'stage' : 'analyzer']);
      await expect(page.getByLabel(part === 'analyzer' ? '上偏光片角度' : '载物台角度', { exact: true }))
        .toHaveAttribute('aria-valuetext', `${Math.round(after[part])} 度`);
    }
  });

  test('orbit and zoom change the camera while preserving both mechanical angles', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ROUTE);
    await waitForScene(page);
    await page.getByTestId('explore-mode-structure').click();
    const initialCamera = await stableCamera(page);
    const initialAngles = await angles(page);
    const point = await backgroundPoint(page);
    await page.mouse.down();
    await page.mouse.move(point.x + 105, point.y + 30, { steps: 14 });
    await page.mouse.up();
    const orbitedCamera = await stableCamera(page);
    expect(orbitedCamera).not.toBe(initialCamera);
    expect(await angles(page)).toEqual(initialAngles);
    await page.mouse.wheel(0, -160);
    expect(await stableCamera(page)).not.toBe(orbitedCamera);
    expect(await angles(page)).toEqual(initialAngles);
  });

  test('a direct ring drag preserves the chosen fixed camera view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ROUTE);
    await waitForScene(page);
    await page.getByTestId('explore-mode-structure').click();
    await page.getByRole('combobox', { name: '观察视角', exact: true }).selectOption('05-analyzer-close');
    const beforeCamera = await stableCamera(page);
    const beforeAngles = await angles(page);
    const point = await surfacePoint(page, 'analyzer');
    await page.mouse.down();
    await page.mouse.move(point.x + 60, point.y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => (await angles(page)).analyzer).not.toBe(beforeAngles.analyzer);
    expect((await angles(page)).stage).toBe(beforeAngles.stage);
    await expect(page.getByRole('combobox', { name: '观察视角', exact: true })).toHaveValue('05-analyzer-close');
    expect(await stableCamera(page)).toBe(beforeCamera);
  });

  test('switching to a fixed view clears residual orbit damping without changing mechanical angles', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ROUTE);
    await waitForScene(page);
    const canvas = page.getByTestId('polariscope-canvas');
    const viewSelect = page.getByRole('combobox', { name: '观察视角', exact: true });
    await page.getByLabel('上偏光片角度', { exact: true }).press('ArrowRight');
    await page.getByLabel('载物台角度', { exact: true }).press('ArrowRight');
    await expect.poll(() => angles(page)).toEqual({ analyzer: 1, stage: 1 });
    const initialAngles = await angles(page);
    // Measure this viewport and pose's fitted preset, instead of using the old asset's metre-scale camera.
    await viewSelect.selectOption('02-side');
    const expectedCamera = await stableCamera(page);
    await page.getByRole('button', { name: '恢复三维视角', exact: true }).click();
    await stableCamera(page);
    const initialCamera = await stableCamera(page);
    const point = await backgroundPoint(page);
    await page.mouse.down();
    await page.mouse.move(point.x + 105, point.y + 30, { steps: 8 });
    await expect(canvas).not.toHaveAttribute('data-camera', initialCamera);
    // Leave fresh angular momentum, then select without waiting for orbit damping to settle.
    await page.mouse.move(point.x + 155, point.y + 45);
    await page.mouse.up();
    await viewSelect.selectOption('02-side');
    await expect(canvas).toHaveAttribute('data-camera', expectedCamera);
    expect(await stableCamera(page)).toBe(expectedCamera);
    expect(await angles(page)).toEqual(initialAngles);
  });

  test('physical power button toggles the shared switch but an out-and-back camera drag does not', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ROUTE);
    await waitForScene(page);
    await page.getByTestId('explore-part-powerSwitch').click();
    await stableCamera(page);
    const canvas = page.getByTestId('polariscope-canvas');
    const power = page.getByRole('switch', { name: '电源开关', exact: true });
    const initialPower = await power.getAttribute('aria-checked');
    let point = await surfacePoint(page, 'powerSwitch');
    await page.mouse.down();
    await page.mouse.move(point.x + 35, point.y, { steps: 6 });
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.mouse.up();
    await stableCamera(page);
    await expect(canvas).toHaveAttribute('data-pointer-max-move', /buttons=1/);
    await expect(power).toHaveAttribute('aria-checked', initialPower!);
    // Re-select after orbiting so that the button has a verified visible mesh hit.
    await page.getByRole('button', { name: '恢复三维视角', exact: true }).click();
    await page.getByTestId('explore-part-powerSwitch').click();
    await stableCamera(page);
    point = await surfacePoint(page, 'powerSwitch');
    await page.mouse.click(point.x, point.y);
    await expect(power).toHaveAttribute('aria-checked', initialPower === 'true' ? 'false' : 'true');
    await expect(canvas).toHaveAttribute('data-power', initialPower === 'true' ? 'false' : 'true');
  });

  test('a buttons-zero hover during a physical switch press does not become a held drag', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ROUTE);
    await waitForScene(page);
    await page.getByTestId('explore-part-powerSwitch').click();
    const beforeCamera = await stableCamera(page);
    const canvas = page.getByTestId('polariscope-canvas');
    const power = page.getByRole('switch', { name: '电源开关', exact: true });
    const initialPower = await power.getAttribute('aria-checked');
    const point = await surfacePoint(page, 'powerSwitch');
    await page.mouse.down();
    // Preserve the browser's real pointer id so OrbitControls still receives a normal down/up pair.
    const pointerDescription = await canvas.getAttribute('data-pointer-down-position');
    const pointerMatch = pointerDescription?.match(/mouse#(\d+)/);
    expect(pointerMatch).toBeTruthy();
    await canvas.dispatchEvent('pointermove', {
      pointerId: Number(pointerMatch![1]), pointerType: 'mouse', isPrimary: true,
      button: -1, buttons: 0, clientX: point.x + 100, clientY: point.y + 50,
      bubbles: true, cancelable: true,
    });
    await expect(canvas).toHaveAttribute('data-pointer-ignored-hover', /buttons=0$/);
    await expect(canvas).toHaveAttribute('data-pointer-max-move', '0 px');
    await page.mouse.up();
    await expect(power).toHaveAttribute('aria-checked', initialPower === 'true' ? 'false' : 'true');
    await expect(canvas).toHaveAttribute('data-power', initialPower === 'true' ? 'false' : 'true');
    expect(await stableCamera(page)).toBe(beforeCamera);
  });

  test('internal light and side switch remain at their base positions throughout explode', async ({ page }) => {
    await page.goto(ROUTE);
    await waitForScene(page);
    const canvas = page.getByTestId('polariscope-canvas');
    await page.getByTestId('explore-part-light').click();
    await expect(canvas).toHaveAttribute('data-internal-view', 'true');
    const lightPosition = await canvas.getAttribute('data-light-position');
    const switchPosition = await canvas.getAttribute('data-power-switch-position');
    expect(lightPosition).toBeTruthy();
    expect(switchPosition).toBeTruthy();
    await page.getByTestId('explore-mode-explode').click();
    const explosion = page.getByRole('slider', { name: '拆解程度', exact: true });
    await explosion.press('End');
    await expect(canvas).toHaveAttribute('data-explosion', /^1(?:\.0+)?$/);
    await expect(canvas).toHaveAttribute('data-light-position', lightPosition!);
    await expect(canvas).toHaveAttribute('data-power-switch-position', switchPosition!);
    await explosion.press('Home');
    await expect(canvas).toHaveAttribute('data-explosion', /^0(?:\.0+)?$/);
    await expect(canvas).toHaveAttribute('data-light-position', lightPosition!);
    await expect(canvas).toHaveAttribute('data-power-switch-position', switchPosition!);
  });

  test('SPA exits stop old render loops and dispose WebGL resources on every visit', async ({ page }) => {
    await page.addInitScript(() => {
      type Audit = { canvas: HTMLCanvasElement; deletes: Record<string, number>; lossRequests: number; framesAtLoss: string | undefined };
      const audit: Audit[] = [];
      (window as unknown as { __polariscopeGpuAudit: Audit[] }).__polariscopeGpuAudit = audit;
      const seen = new WeakSet<object>();
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        const context = Reflect.apply(original, this, [kind, ...args]);
        if (context && (kind === 'webgl' || kind === 'webgl2') && !seen.has(context)) {
          seen.add(context);
          const entry: Audit = { canvas: this, deletes: {}, lossRequests: 0, framesAtLoss: undefined };
          audit.push(entry);
          for (const name of ['deleteBuffer', 'deleteTexture', 'deleteProgram']) {
            const originalDelete = context[name].bind(context);
            context[name] = (...parameters: unknown[]) => {
              if (parameters[0]) entry.deletes[name] = (entry.deletes[name] ?? 0) + 1;
              return originalDelete(...parameters);
            };
          }
          const originalExtension = context.getExtension.bind(context);
          let wrapped = false;
          context.getExtension = (name: string) => {
            const extension = originalExtension(name);
            if (extension && name === 'WEBGL_lose_context' && !wrapped) {
              wrapped = true;
              const lose = extension.loseContext.bind(extension);
              extension.loseContext = () => {
                entry.lossRequests++;
                entry.framesAtLoss = entry.canvas.dataset.frames;
                lose();
              };
            }
            return extension;
          };
        }
        return context;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ROUTE);
    const memoryCounts: string[] = [];
    for (let visit = 0; visit < 3; visit++) {
      await waitForScene(page);
      const canvas = page.getByTestId('polariscope-canvas');
      await expect.poll(async () => Number(await canvas.getAttribute('data-geometries'))).toBeGreaterThan(0);
      await expect.poll(async () => Number(await canvas.getAttribute('data-triangles'))).toBeGreaterThan(1000);
      memoryCounts.push(`${await canvas.getAttribute('data-geometries')}/${await canvas.getAttribute('data-textures')}`);
      await page.getByTestId('explore-back-to-knowledge').click();
      await expect(page).toHaveURL(/\/knowledge\/polariscope#structure$/);
      await expect(page.getByTestId('polariscope-canvas')).toHaveCount(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const disposed = await page.evaluate(() => {
        const entries = (window as unknown as { __polariscopeGpuAudit: {
          canvas: HTMLCanvasElement; deletes: Record<string, number>; lossRequests: number; framesAtLoss?: string;
        }[] }).__polariscopeGpuAudit;
        return entries.filter(entry => entry.canvas.dataset.loaded === 'true').map(entry => ({
          connected: entry.canvas.isConnected, stopped: entry.canvas.dataset.frames === entry.framesAtLoss,
          lossRequests: entry.lossRequests, deletes: entry.deletes,
        }));
      });
      expect(disposed).toHaveLength(visit + 1);
      for (const entry of disposed) {
        expect(entry.connected).toBe(false);
        expect(entry.stopped).toBe(true);
        expect(entry.lossRequests).toBe(1);
        for (const name of ['deleteBuffer', 'deleteTexture', 'deleteProgram']) expect(entry.deletes[name], name).toBeGreaterThan(0);
      }
      if (visit < 2) await page.getByTestId('polariscope-explore-link').click();
    }
    expect(new Set(memoryCounts).size).toBe(1);
    expect(errors).toEqual([]);
  });

  test('mobile viewport keeps the live scene, controls and projection exit within the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE);
    await waitForScene(page);
    const canvas = page.getByTestId('polariscope-canvas');
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(300);
    expect(bounds!.height).toBeGreaterThanOrEqual(380);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByLabel('上偏光片角度', { exact: true }).press('ArrowRight');
    await expect(canvas).toHaveAttribute('data-analyzer-angle', '1');
    await page.getByRole('switch', { name: '电源开关', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-power', 'false');
    await page.getByTestId('explore-internal-toggle').click();
    await expect(canvas).toHaveAttribute('data-internal-view', 'true');
    await page.getByRole('button', { name: '进入投屏模式', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出投屏模式', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: '退出投屏模式', exact: true }).click();
    await expect(page.getByTestId('explore-mode-structure')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready');
  });
});

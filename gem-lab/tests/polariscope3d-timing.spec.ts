import { expect, test } from './fixtures/polariscope';

test('standard quality keeps the real model and restores the high-quality renderer', async ({ page }) => {
  await page.goto('/explore/polariscope?quality=standard');
  const canvas = page.getByTestId('polariscope-canvas');
  await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await expect(canvas).toHaveAttribute('data-parts', '8');
  await expect(canvas).toHaveAttribute('data-shadows', 'false');
  expect(Number(await canvas.getAttribute('data-buffer-pixels'))).toBeLessThanOrEqual(192_000);
  await page.getByRole('combobox', { name: '三维画质' }).selectOption('high');
  await expect(canvas).toHaveAttribute('data-quality', 'high');
  await expect(canvas).toHaveAttribute('data-shadows', 'true');
  await expect(canvas).toHaveAttribute('data-transmission-scale', '1');
  expect(Number(await canvas.getAttribute('data-buffer-pixels'))).toBeGreaterThan(192_000);
  await page.getByRole('combobox', { name: '三维画质' }).selectOption('standard');
  await expect(canvas).toHaveAttribute('data-quality', 'standard');
  await expect(canvas).toHaveAttribute('data-transmission-scale', '0.4');
  await expect(canvas).toHaveAttribute('data-parts', '8');
});

test('foreground animation remains usable with deliberately slow animation frames', async ({ page }) => {
  test.setTimeout(60_000);
  // Slow only the scheduling of real frames. No time travel, mocked model,
  // simulated optics, forced clicks or bypassed course completion conditions.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    let sequence = 0;
    const pending = new Map<number, { timer: number; frame: number | null }>();
    window.requestAnimationFrame = (callback) => {
      const id = ++sequence;
      const entry = { timer: 0, frame: null as number | null };
      entry.timer = window.setTimeout(() => {
        entry.frame = request(time => { pending.delete(id); callback(time); });
      }, 200);
      pending.set(id, entry);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      if (entry.frame !== null) cancel(entry.frame);
      pending.delete(id);
    };
  });
  await page.goto('/explore/polariscope?quality=standard&lesson=conoscope');
  const canvas = page.getByTestId('polariscope-canvas');
  await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.getByTestId('conoscope-toggle').click();
  await expect(canvas).toHaveAttribute('data-conoscope-progress', '1.000', { timeout: 4_000 });
  await page.getByTestId('explore-lesson-sample').click();
  await page.getByTestId('sample-demo-mode').click();
  await page.getByTestId('sample-auto-rotate').click();
  await expect(page.getByTestId('rotation-trace')).toHaveAttribute('data-coverage', '100', { timeout: 15_000 });
  await expect(page.getByTestId('sample-reveal')).toBeVisible();
});

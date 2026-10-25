import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

async function controls(page: Page, open: boolean) {
  const toggle = page.getByTestId('sim-controls-toggle');
  if (await toggle.isVisible()) {
    if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open) await toggle.click();
  }
}

async function labelLayout(page: Page) {
  return page.locator('[data-named="true"]:visible').evaluateAll(elements => {
    const canvas = document.querySelector('[data-testid="optics3d-canvas"]')!.getBoundingClientRect();
    const boxes = elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { id: (element as HTMLElement).dataset.testid!, label: element.textContent!, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${a.label} / ${b.label}`);
    }
    return {
      boxes, overlaps,
      outside: boxes.filter(box => box.left < canvas.left || box.right > canvas.right || box.top < canvas.top || box.bottom > canvas.bottom).map(box => box.label),
    };
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 1024, height: 768 }]) {
  for (const [machine, instrument, labelCount] of [
    ['prism', 'prism-spectroscope', 5],
    ['grating', 'grating-spectroscope', 4],
    ['refractometer', 'refractometer', 15],
  ] as const) {
    test(`${viewport.width}×${viewport.height} ${instrument}：全部名称不相交且可逐一点击（整机与内部光路）`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.goto(`/sim/${machine === 'refractometer' ? 'refractometer' : 'spectroscope'}/learn`);
      const canvas = page.getByTestId('optics3d-canvas');
      await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
      await controls(page, true);
      if (machine === 'grating') await page.getByTestId('sim-machine-grating').click();
      await expect(canvas).toHaveAttribute('data-instrument', instrument, { timeout: 60_000 });
      await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
      await page.getByTestId('sim-check-names').check();
      await controls(page, false);
      for (const view of ['whole', 'optics']) {
        if (view === 'optics') {
          await controls(page, true);
          await page.getByRole('button', { name: '内部光路', exact: true }).click();
          await controls(page, false);
        }
        await expect(page.locator('[data-named="true"]:visible')).toHaveCount(labelCount);
        // 场景逐帧放置标签；等待真实布局就绪，不删除拥挤标签或强制点击。
        await expect.poll(async () => {
          const layout = await labelLayout(page);
          return { overlaps: layout.overlaps, outside: layout.outside };
        }, { message: `${instrument} ${view} 名称布局` }).toEqual({ overlaps: [], outside: [] });
        const { boxes } = await labelLayout(page);
        for (const box of boxes) {
          await page.getByTestId(box.id).click();
          await expect(canvas).toHaveAttribute('data-selected-part', box.id.replace('hotspot-', ''));
        }
      }
    });
  }
}

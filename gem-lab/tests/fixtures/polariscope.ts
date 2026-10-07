import { test as base, expect, type Page } from '@playwright/test';

/** Exercise the public lightweight mode on software-rendered CI machines.
 * The real GLB, WebGL canvas, raycasting and all optical assertions stay active. */
export function polariscopeUrl(path = '/explore/polariscope') {
  const url = new URL(path, 'http://localhost');
  if (process.env.CI) url.searchParams.set('quality', 'standard');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** SPA navigation from the knowledge page intentionally uses the original link. */
export async function useCiSceneQuality(page: Page) {
  if (!process.env.CI) return;
  await page.getByRole('combobox', { name: '三维画质', exact: true }).selectOption('standard');
}

export const test = base.extend<{ sceneDiagnostics: void }>({
  sceneDiagnostics: [async ({ page }, use, testInfo) => {
    await use();
    if (page.isClosed()) return;
    const diagnostics = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="polariscope-canvas"]');
      return canvas ? { url: location.href, width: canvas.width, height: canvas.height, ...canvas.dataset } : null;
    }).catch(() => null);
    if (diagnostics) {
      await testInfo.attach('scene-rendering', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' });
      console.log('[scene-rendering]', JSON.stringify(diagnostics));
    }
  }, { auto: true }],
});

export { expect, type Page };

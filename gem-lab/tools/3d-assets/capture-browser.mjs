/** Run with a Vite/preview server already listening. Captures the actual React route. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../node_modules/@playwright/test/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'assets-source/polariscope/validation/browser');
const baseURL = process.env.POLARISCOPE_PREVIEW_URL || 'http://127.0.0.1:5178';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const setRange = (target, label, value) => target.getByLabel(label, { exact: true }).evaluate((element, next) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next)); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, value);
const ready = () => page.locator('[data-testid="polariscope-scene"][data-status="ready"]').waitFor();
const waitFrames = async (count = 30) => {
  const initial = Number(await page.locator('canvas').getAttribute('data-frames'));
  await page.waitForFunction(({ initial, count }) => Number(document.querySelector('canvas')?.dataset.frames) >= initial + count, { initial, count });
};
await page.goto(`${baseURL}/explore/polariscope`); await ready(); await waitFrames(60);
await page.screenshot({ path: path.join(output, 'chrome-desktop.png') });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/assets/3d/polariscope/manifest.json'), 'utf8'));
const evidence = { date: new Date().toISOString(), browser: await browser.version(), headless: false, viewport: [1920, 1080], deviceScaleFactor: 1, assetSha256: manifest.sha256, errors, performance: [] };
// Continuous scene interaction: angle changes, exploded interpolation and orbit.
for (const quality of ['high', 'standard']) {
  await page.getByLabel('三维画质', { exact: true }).selectOption(quality);
  await page.getByTestId('explore-mode-explode').click();
  await waitFrames(30);
  const measurements = [];
  for (let i = 0; i < 12; i++) {
    await setRange(page, '拆解程度', i / 11);
    await waitFrames(20);
    measurements.push(await page.locator('canvas').evaluate(canvas => ({ fps: Number(canvas.dataset.fps), geometries: Number(canvas.dataset.geometries), textures: Number(canvas.dataset.textures), calls: Number(canvas.dataset.calls) })));
  }
  evidence.performance.push({ quality, interaction: 'continuous exploded movement', samples: measurements, averageFps: measurements.reduce((n, s) => n + s.fps, 0) / measurements.length, minimumSampleFps: Math.min(...measurements.map(s => s.fps)) });
}
await page.getByLabel('三维画质', { exact: true }).selectOption('high');
await page.screenshot({ path: path.join(output, 'chrome-exploded.png') });
await page.getByTestId('explore-mode-practice').click(); await waitFrames(45);
await page.screenshot({ path: path.join(output, 'chrome-practice.png') });
await page.getByTestId('explore-mode-structure').click();
// Identical orthographic camera and square resolution to the Blender renders.
await page.setViewportSize({ width: 1500, height: 1500 });
await page.addStyleTag({ content: '.pol-explore__workbench{display:block!important}.pol-explore__parts,.pol-explore__panel{display:none!important}.pol-explore__viewport{width:1200px!important;height:1200px!important;min-height:1200px!important;max-height:none!important}.pol-explore__scene{height:100%!important}.pol-explore__scene-caption,.pol-explore__viewport-tools,.polariscope-hotspot{visibility:hidden!important}' });
for (const camera of manifest.renders) {
  await page.getByLabel('观察视角', { exact: true }).selectOption(camera.id, { force: true });
  await waitFrames(12);
  await page.locator('canvas').screenshot({ path: path.join(output, `${camera.id}.png`) });
}
await fs.writeFile(path.join(output, 'chrome-evidence.json'), JSON.stringify(evidence, null, 2));
await context.close();
// A short recording of the delivered web viewer, independent of offline rendering.
const recording = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: output, size: { width: 1440, height: 1080 } } });
const videoPage = await recording.newPage();
await videoPage.goto(`${baseURL}/explore/polariscope`);
await videoPage.locator('[data-testid="polariscope-scene"][data-status="ready"]').waitFor();
await videoPage.waitForTimeout(1000);
for (const view of ['01-front', '02-side', '03-top', '04-three-quarter']) {
 await videoPage.getByLabel('观察视角', { exact: true }).selectOption(view);
 await videoPage.waitForTimeout(1200);
}
await videoPage.getByLabel('恢复三维视角', { exact: true }).click();
await videoPage.getByTestId('explore-mode-explode').click();
for (let i=0;i<=20;i++) { await setRange(videoPage, '拆解程度', i/20); await videoPage.waitForTimeout(70); }
await videoPage.waitForTimeout(1000);
await videoPage.getByRole('button', {name:'收回装配',exact:true}).click(); await videoPage.waitForTimeout(1200);
await videoPage.getByTestId('explore-mode-practice').click();
await videoPage.getByRole('button',{name:'将上偏光片调至 0 度',exact:true}).click(); await videoPage.waitForTimeout(800);
await videoPage.getByRole('button',{name:'将上偏光片调至 90 度',exact:true}).click(); await videoPage.waitForTimeout(800);
const video = videoPage.video();
await recording.close();
await video.saveAs(path.join(output, 'web-exploration.webm'));
await video.delete();
await browser.close();
console.log(JSON.stringify({ output, errors, performance: evidence.performance.map(({quality,averageFps,minimumSampleFps})=>({quality,averageFps,minimumSampleFps})) }, null, 2));

import { expect, test, polariscopeUrl, type Page } from './fixtures/polariscope';

/** 由 polariscope3d-lessons.spec.ts 改写：五讲的光学现象与判断规则，部件 / 光路改在认识屏，样品 / 干涉图改在实验屏。 */

const scene = (page: Page) => page.getByTestId('polariscope-scene');
const canvas = (page: Page) => page.getByTestId('polariscope-canvas');

test.setTimeout(90_000);

async function openLesson(page: Page, lesson: string) {
  const screen = lesson === 'sample' || lesson === 'conoscope' ? 'lab' : 'learn';
  await page.goto(polariscopeUrl(`/sim/polariscope/${screen}?lesson=${lesson}`));
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(canvas(page)).toHaveAttribute('data-loaded', 'true');
}

/** 目镜画布中心区域的平均亮度（0–255）。 */
async function eyepieceCentreBrightness(page: Page, fraction = .18) {
  // Wait for the requested optical state to be painted, not a fixed wall-clock delay.
  await expect.poll(() => page.getByTestId('eyepiece-view').locator('canvas').evaluate(element =>
    !!element.getAttribute('data-rendered-frame') && element.getAttribute('data-rendered-frame') === element.getAttribute('data-requested-frame'),
  )).toBe(true);
  return page.getByTestId('eyepiece-view').locator('canvas').evaluate((element: HTMLCanvasElement, f: number) => {
    const context = element.getContext('2d')!, n = element.width, r = Math.max(2, Math.round(n * f)), c = n / 2;
    const data = context.getImageData(c - r, c - r, 2 * r, 2 * r).data;
    let sum = 0; for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return sum / (data.length / 4);
  }, fraction);
}

test('the frame is one shell with the base: it stays in place when the instrument is disassembled', async ({ page }) => {
  await openLesson(page, 'components');
  const framePosition = () => canvas(page).getAttribute('data-frame-position');
  const before = await framePosition();
  await page.getByTestId('sim-part-frame').click();
  await expect(page.getByTestId('sim-part-note')).toContainText('支架（与底座一体）');
  await page.getByTestId('sim-polari-mode-explode').click();
  await page.getByRole('slider', { name: '拆解程度', exact: true }).press('End');
  await expect(canvas(page)).toHaveAttribute('data-explosion', '1.0000');
  expect(await framePosition()).toBe(before);
  // 单独查看支架时，一体的底座随之显示。
  await page.getByTestId('sim-polari-isolate').click();
  await expect(page.getByTestId('sim-polari-isolation')).toContainText('单独查看 · 支架');
});

test('sample lesson: predict, rotate one full turn, and the explanation is revealed only after the turn', async ({ page }) => {
  await openLesson(page, 'sample');
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'field');
  await expect(canvas(page)).toHaveAttribute('data-sample', 'tourmaline');
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toHaveValue('90');
  await page.getByRole('button', { name: '四明四暗', exact: true }).click();
  // 用 End 从 0° 跳到 360°：中间角度没有被观察，不算完成。
  const stage = page.getByRole('slider', { name: '载物台角度', exact: true });
  await stage.focus(); await stage.press('End');
  await expect(page.getByTestId('rotation-trace')).not.toHaveAttribute('data-coverage', '100');
  await expect(page.getByTestId('sim-polari-reveal')).toHaveCount(0);
  await stage.press('Home');
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('rotation-trace')).toHaveAttribute('data-coverage', '100', { timeout: 15_000 });
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-observation', 'four-bright-four-dark');
  await expect(page.getByText('与预测一致')).toBeVisible();
  // 全部重置：预测、记录与揭晓全部清空，回到先预测。
  await page.getByTestId('sim-reset').click();
  await expect(page.getByTestId('sim-polari-reveal')).toHaveCount(0);
  await expect(page.getByTestId('sim-polari-poe')).toHaveAttribute('data-phase', 'predict');
});

test('sample lesson: quartz along the optic axis is explained as optical activity, not as darkness', async ({ page }) => {
  await openLesson(page, 'sample');
  await page.getByTestId('sim-polari-sample-citrine').click();
  await page.getByTestId('sim-polari-orientation').click();
  await page.getByTestId('sim-polari-predict-demo').click();
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-observation', 'axis-rotation', { timeout: 15_000 });
  expect(await eyepieceCentreBrightness(page)).toBeGreaterThan(40);
});

test('projection mode offers prediction and a teacher demo so the loop can be completed', async ({ page }) => {
  await openLesson(page, 'sample');
  await page.getByRole('button', { name: '进入投屏模式' }).click();
  // 投屏时观察框（预测、转一周、揭晓）仍在操作区里。
  await page.getByTestId('sim-polari-predict-demo').click();
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('sim-polari-poe')).toContainText('教师演示', { timeout: 15_000 });
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-observation', 'four-bright-four-dark');
});

test('conoscope lesson keeps one orientation for the ordinary view and the interference figure', async ({ page }) => {
  await openLesson(page, 'conoscope');
  // 默认光轴直立：放球前正光下近于全暗（同一块晶体、同一个方向）。
  await expect(page.getByTestId('sim-polari-conoscope-orientation').getByRole('button', { name: '光轴直立' })).toHaveAttribute('aria-pressed', 'true');
  expect(await eyepieceCentreBrightness(page)).toBeLessThan(45);
  await page.getByTestId('sim-polari-conoscope-orientation').getByRole('button', { name: '一般方向' }).click();
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'conoscope');
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'field');
  await expect(page.getByTestId('sim-polari-conoscope-orientation').getByRole('button', { name: '一般方向' })).toHaveAttribute('aria-pressed', 'true');
});

test('sample lesson: singly refractive spinel stays dark while tourmaline blinks in the eyepiece', async ({ page }) => {
  await openLesson(page, 'sample');
  const stage = page.getByRole('slider', { name: '载物台角度', exact: true });
  const samples: number[] = [];
  for (const angle of [0, 15, 30, 45, 60, 75]) {
    await stage.fill(String(angle));
    samples.push(await eyepieceCentreBrightness(page));
  }
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(25);
  await page.getByTestId('sim-polari-sample-spinel').click();
  const dark: number[] = [];
  for (const angle of [0, 30, 60]) { await stage.fill(String(angle)); dark.push(await eyepieceCentreBrightness(page)); }
  expect(Math.max(...dark)).toBeLessThan(45);
  expect(Math.max(...samples)).toBeGreaterThan(Math.max(...dark) + 25);
});

test('sample lesson: the ADR parallel check separates strain from true double refraction', async ({ page }) => {
  await openLesson(page, 'sample');
  await page.getByTestId('sim-polari-sample-almandine').click();
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toContainText('异常双折射');
  await expect(page.getByRole('slider', { name: '上偏光片角度', exact: true })).toHaveValue('0');
  await page.getByTestId('sim-polari-sample-tourmaline').click();
  await page.getByRole('button', { name: '90° 正交', exact: true }).click();
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toContainText('真正的双折射');
});

test('conoscope lesson: inserting the sphere animates it over the stone and switches the eyepiece to an interference figure', async ({ page }) => {
  await openLesson(page, 'conoscope');
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'field');
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(canvas(page)).toHaveAttribute('data-conoscope-progress', '1.000', { timeout: 8_000 });
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'conoscope');
  // 一轴晶居中：黑十字交点暗；水晶牛眼：中心为彩色亮斑。
  const uniaxialCentre = await eyepieceCentreBrightness(page, .04);
  expect(uniaxialCentre).toBeLessThan(50);
  await page.getByTestId('sim-polari-sample-citrine').click();
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'conoscope');
  expect(await eyepieceCentreBrightness(page, .04)).toBeGreaterThan(uniaxialCentre + 60);
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(canvas(page)).toHaveAttribute('data-conoscope-progress', '0.000', { timeout: 8_000 });
});

test('path lesson shows animated vibration vectors and power off stops them', async ({ page }) => {
  await openLesson(page, 'path');
  await page.getByTestId('sim-polari-path-4').click();
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-field-vectors'))).toBeGreaterThan(40);
  await page.getByRole('switch', { name: '电源开关' }).click();
  await expect(canvas(page)).toHaveAttribute('data-field-vectors', '0');
});

test('sample lesson: turning before predicting is not recorded, and the reveal survives the parallel check', async ({ page }) => {
  await openLesson(page, 'sample');
  const stage = page.getByRole('slider', { name: '载物台角度', exact: true });
  await stage.focus();
  for (let i = 0; i < 12; i++) await stage.press('PageUp');
  await page.getByRole('button', { name: '四明四暗', exact: true }).click();
  // 预测之前转过的不计入记录：预测后曲线从 0% 开始。
  await expect(page.getByTestId('rotation-trace')).toHaveAttribute('data-coverage', '0');
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('sim-polari-reveal')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toHaveAttribute('data-verdict', 'double-refraction');
  await expect(page.getByTestId('sim-polari-reveal')).toBeVisible();
});

test('sample lesson: parallel check does not misjudge dark fields', async ({ page }) => {
  await openLesson(page, 'sample');
  await page.getByTestId('sim-polari-sample-spinel').click();
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toHaveAttribute('data-verdict', 'dark-no-check');
  await page.getByTestId('sim-polari-sample-tourmaline').click();
  await page.getByTestId('sim-polari-orientation').click();
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toHaveAttribute('data-verdict', 'along-axis');
});

test('Brazil twin set in the conoscope lesson carries over, and the sample verdict follows it', async ({ page }) => {
  await openLesson(page, 'conoscope');
  await page.getByTestId('sim-polari-sample-citrine').click();
  await page.getByRole('button', { name: /巴西律双晶示意/ }).click();
  await page.getByTestId('sim-polari-lesson-sample').click();
  await expect(page.getByTestId('sim-polari-twin')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sim-polari-orientation').click();
  await page.getByRole('button', { name: '始终暗', exact: true }).click();
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-observation', 'axis-twin-dark', { timeout: 15_000 });
  await expect(page.getByText('与预测一致')).toBeVisible();
  // 关掉双晶：同一方向变为旋光的恒定颜色，结论随之改变（预测仍是「始终暗」，所以与预测不同）。
  await page.getByTestId('sim-polari-twin').click();
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-observation', 'axis-rotation', { timeout: 15_000 });
  await expect(page.getByText('与预测不同')).toBeVisible();
});

test('acceptance repro: ruby along the optic axis is judged dark, not optically active', async ({ page }) => {
  await openLesson(page, 'sample');
  await page.getByRole('combobox', { name: '从样品库选择' }).selectOption({ label: '红宝石' });
  await page.getByTestId('sim-polari-orientation').click();
  await page.getByRole('button', { name: '始终暗', exact: true }).click();
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-observation', 'axis-dark', { timeout: 15_000 });
  await expect(page.getByText('与预测一致')).toBeVisible();
  await expect(page.getByTestId('sim-polari-poe')).not.toContainText('旋光');
});

test('acceptance repro: opal without strain is not reported as ADR by the parallel check', async ({ page }) => {
  await openLesson(page, 'sample');
  await page.getByRole('combobox', { name: '从样品库选择' }).selectOption({ label: '欧泊' });
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toHaveAttribute('data-verdict', 'dark-no-check');
  await expect(page.getByTestId('sim-polari-adr-result')).toContainText('散射');
  await page.getByRole('switch', { name: '电源开关' }).click();
  await expect(page.getByTestId('sim-polari-adr')).toBeDisabled();
});

test('gemology audit repro: twin figure text follows analyzer, orientation and power', async ({ page }) => {
  await openLesson(page, 'conoscope');
  await page.getByTestId('sim-polari-sample-citrine').click();
  await page.getByRole('button', { name: /巴西律双晶示意/ }).click();
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'conoscope');
  const panel = page.getByTestId('sim-polari-conoscope-note');
  await expect(panel).toContainText('中心消光');
  await expect(panel).not.toContainText('中心是彩色圆斑');
  expect(await eyepieceCentreBrightness(page, .03)).toBeLessThan(25);
  await page.getByRole('button', { name: '0° 平行', exact: true }).click();
  await expect(panel).toContainText('两片平行时视场中心明亮');
  await expect(panel).not.toContainText('中心消光');
  await expect.poll(() => eyepieceCentreBrightness(page, .03)).toBeGreaterThan(180);
  await page.getByRole('button', { name: '45° 斜交', exact: true }).click();
  await expect(panel).toContainText('当前为斜交偏光');
  await expect(panel).not.toContainText('中心消光');
  await page.getByRole('button', { name: '90° 正交', exact: true }).click();
  await page.getByRole('button', { name: '光轴偏斜', exact: true }).click();
  await expect(panel).toContainText('光轴出露点已离开视场中心');
  await expect(panel).toContainText('视场中心不一定暗');
  await expect.poll(() => eyepieceCentreBrightness(page, .03)).toBeGreaterThan(25);
  await page.getByRole('switch', { name: '电源开关', exact: true }).click();
  await expect(panel).toContainText('电源关闭');
  await expect(panel).toContainText('当前暗场不能用于判断样品是否消光');
  await expect.poll(() => eyepieceCentreBrightness(page, .03)).toBeLessThan(1);
  await page.getByRole('switch', { name: '电源开关', exact: true }).click();
  await page.getByRole('button', { name: '光轴直立', exact: true }).click();
  await expect(panel).toContainText('中心消光');
  await page.getByTestId('sim-polari-conoscope').click();
  await expect(page.getByTestId('eyepiece-view')).toHaveAttribute('data-kind', 'field');
  await expect(panel).toContainText('把干涉球放到样品上方');
  await expect(panel).not.toContainText('中心消光');
});

test('focusing a part ghosts the other parts; isolating or clearing the selection restores them', async ({ page }) => {
  await openLesson(page, 'components');
  await expect(canvas(page)).toHaveAttribute('data-ghosted-parts', '');
  await page.getByTestId('sim-part-polarizer').click();
  await expect(canvas(page)).toHaveAttribute('data-ghosted-parts', 'base,frame,light,stage,analyzer,conoscope,powerSwitch');
  await expect(page.locator('.polariscope-hotspot[data-part-id="stage"]')).toHaveClass(/is-ghosted/);
  // 支架与底座是同一外壳：选中支架时底座保留。
  await page.getByTestId('sim-part-frame').click();
  await expect(canvas(page)).not.toHaveAttribute('data-ghosted-parts', /base/);
  await page.getByTestId('sim-polari-isolate').click();
  await expect(canvas(page)).toHaveAttribute('data-ghosted-parts', '');
  await page.getByTestId('sim-polari-isolate').click();
  // 再点一次已选部件即清除选择。
  await page.getByTestId('sim-part-frame').click();
  await expect(canvas(page)).toHaveAttribute('data-ghosted-parts', '');
});

test('part labels are callouts anchored on the part surface; the frame anchor sits on its wall, away from the analyzer', async ({ page }) => {
  await openLesson(page, 'components');
  // 仿真里部件标注默认不显示，勾「显示名称」后才有标注。
  await page.getByTestId('sim-check-names').check();
  const anchor = async (id: string) => (await page.locator(`.polariscope-hotspot[data-part-id="${id}"]`).getAttribute('data-anchor'))!.split(',').map(Number);
  await expect(page.locator('.polariscope-hotspot[data-part-id="frame"]')).toHaveAttribute('data-anchor', /\d/);
  const [frameX] = await anchor('frame'), [analyzerX] = await anchor('analyzer');
  expect(analyzerX - frameX).toBeGreaterThan(80);
  await expect(page.locator('[data-anchor-dot="frame"]')).toBeVisible();
});

test('the schematic light sits low in the hollow base, leaving a visible gap below the lower polarizer', async ({ page }) => {
  await openLesson(page, 'path');
  const [, y] = (await canvas(page).getAttribute('data-light-position'))!.split(',').map(Number);
  // 下偏光片玻璃约在 0.457；外壳底面约 0.067。
  expect(y).toBeLessThan(.25);
  expect(y).toBeGreaterThan(.1);
});

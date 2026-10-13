import { expect, test, polariscopeUrl, type Page } from './fixtures/polariscope';

/**
 * 由 polariscope3d-course.spec.ts 与 polariscope3d-student.spec.ts 改写：引导课程的规则、学员提示、
 * 讲师演示不写入、跳步只算复习、进阶内容与投屏不遮挡，改在仿真三屏的任务卡上做。
 */
const scene = (page: Page) => page.getByTestId('polariscope-scene');
const canvas = (page: Page) => page.getByTestId('polariscope-canvas');
const task = (page: Page) => page.getByTestId('sim-task');
const stage = (page: Page) => page.getByTestId('sim-polari-stage');
const coach = (page: Page) => page.getByTestId('scene-coach');
const poe = (page: Page) => page.getByTestId('sim-polari-poe');
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('gem-lab-progress-v1'));

test.setTimeout(180_000);

async function ready(page: Page) {
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}
async function turn(page: Page, observation: string) {
  if (await page.getByTestId('sim-polari-predict-demo').isVisible()) await page.getByTestId('sim-polari-predict-demo').click();
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(stage(page)).toHaveAttribute('data-observation', observation, { timeout: 20_000 });
}
async function learnSteps(page: Page) {
  for (const part of ['polarizer', 'stage', 'analyzer']) await page.locator(`.polariscope-hotspot[data-part-id="${part}"]`).click();
  await page.getByTestId('sim-task-next').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('sim-polari-path-next').click();
  await page.getByTestId('sim-task-next').click();
  await expect(page.getByTestId('sim-polari-transmission')).toHaveAttribute('data-value', '1');
  await page.getByTestId('sim-polari-analyzer-90').click();
  await expect(page.getByTestId('sim-polari-transmission')).toHaveAttribute('data-value', '0');
  await page.getByTestId('sim-task-next-screen').getByRole('button').click();
  await ready(page);
}
async function labSteps(page: Page) {
  await expect(task(page)).toContainText('放样旋转');
  await turn(page, 'all-dark');
  await page.getByTestId('sim-polari-pick-tourmaline').click();
  await turn(page, 'four-bright-four-dark');
  await page.getByTestId('sim-polari-pick-jadeite').click();
  await turn(page, 'all-bright');
  await page.getByTestId('sim-task-next').click();
  await expect(canvas(page)).toHaveAttribute('data-sample', 'tourmaline');
  await turn(page, 'axis-dark');
  await page.getByTestId('sim-polari-reorient').click();
  await expect(page.getByTestId('sim-polari-orientation')).toHaveText('沿光轴方向放置');
  await turn(page, 'four-bright-four-dark');
  await page.getByTestId('sim-task-next').click();
}
const question = (page: Page, id: string) => page.getByTestId(`sim-polari-question-${id}`);
async function answerAll(page: Page) {
  await question(page, 'why-crossed').getByLabel(/样品造成的明暗变化才能看清/).check();
  await question(page, 'why-crossed').getByRole('button', { name: '提交' }).click();
  await question(page, 'why-reorient').getByLabel(/看起来和均质体一样暗/).check();
  await question(page, 'why-reorient').getByRole('button', { name: '提交' }).click();
  for (const text of [/电源关闭/, /没转到正交/, /只在一个方向/, /样品不透明/]) await question(page, 'no-conclusion').getByLabel(text).check();
  await question(page, 'no-conclusion').getByRole('button', { name: '提交' }).click();
}

test('teacher course: all six steps, wrong answers get feedback, nothing is recorded, then an advanced topic opens', async ({ page }) => {
  await page.goto(polariscopeUrl('/sim/polariscope/learn?mode=teacher'));
  await ready(page);
  // 讲师演示：没有「点这里」提示；部件标注仍给出三个关键部件。
  await expect(coach(page)).toHaveCount(0);
  await learnSteps(page);
  await labSteps(page);
  await expect(task(page)).toContainText('解释');
  await question(page, 'why-crossed').getByLabel(/样品造成的明暗变化才能看清/).check();
  await question(page, 'why-crossed').getByRole('button', { name: '提交' }).click();
  await question(page, 'why-reorient').getByLabel(/灯光不够亮/).check();
  await question(page, 'why-reorient').getByRole('button', { name: '提交' }).click();
  await expect(question(page, 'why-reorient')).toContainText('有选项不对');
  await question(page, 'why-reorient').getByLabel(/看起来和均质体一样暗/).check();
  await question(page, 'why-reorient').getByRole('button', { name: '提交' }).click();
  for (const text of [/电源关闭/, /没转到正交/, /只在一个方向/]) await question(page, 'no-conclusion').getByLabel(text).check();
  await question(page, 'no-conclusion').getByRole('button', { name: '提交' }).click();
  await expect(question(page, 'no-conclusion')).toContainText('还有遗漏');
  await expect(page.getByTestId('sim-task-finish')).toHaveCount(0);
  await question(page, 'no-conclusion').getByLabel(/样品不透明/).check();
  await question(page, 'no-conclusion').getByRole('button', { name: '提交' }).click();
  await expect(task(page)).toContainText('引导任务 · 6 / 6');
  await page.getByTestId('sim-task-finish').getByRole('button').click();
  await expect(page.getByTestId('sim-task-save-status')).toHaveText('讲师演示结束，不写入学习进度。');
  expect(await stored(page)).toBeNull();
  await page.getByTestId('sim-task-topic-adr').click();
  await expect(canvas(page)).toHaveAttribute('data-sample', 'almandine');
  await expect(page.getByTestId('sim-polari-lesson-sample')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sim-polari-adr').click();
  await expect(page.getByTestId('sim-polari-adr-result')).toContainText('异常双折射');
});

test('student who enters at a later step (deep link) finishes everything but only gets a review, not a learning record', async ({ page }) => {
  await page.goto(polariscopeUrl('/sim/polariscope/learn?mode=student&step=crossed'));
  await ready(page);
  await expect(task(page)).toContainText('空载调正');
  // 回头补齐前两步：仍记为跳步。
  await page.getByTestId('sim-polari-lesson-components').click();
  for (const part of ['polarizer', 'stage', 'analyzer']) await page.getByTestId(`sim-part-${part}`).click();
  await page.getByTestId('sim-polari-lesson-path').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('sim-polari-path-next').click();
  await page.getByTestId('sim-polari-lesson-principle').click();
  await page.getByTestId('sim-polari-analyzer-0').click();
  await page.getByTestId('sim-polari-analyzer-90').click();
  await expect(task(page)).toContainText('引导任务 · 3 / 6');
  await page.getByTestId('sim-task-next-screen').getByRole('button').click();
  await ready(page);
  await labSteps(page);
  await answerAll(page);
  await page.getByTestId('sim-task-finish').getByRole('button').click();
  await expect(page.getByTestId('sim-task-save-status')).toHaveText('本次使用过跳步，已完成复习，不写入学习进度。');
  expect(await stored(page)).toBeNull();
});

test('student coach points at the next part, then at the analyzer until the empty field is dark', async ({ page }) => {
  await page.goto(polariscopeUrl('/sim/polariscope/learn?mode=student'));
  await ready(page);
  await expect(coach(page)).toHaveAttribute('data-part', 'polarizer');
  await expect(coach(page)).toBeVisible();
  await page.locator('.polariscope-hotspot[data-part-id="polarizer"]').click();
  await expect(coach(page)).toHaveAttribute('data-part', 'stage');
  await expect(page.getByTestId('sim-part-note')).toContainText('下偏光片');
  await page.locator('.polariscope-hotspot[data-part-id="stage"]').click();
  await page.locator('.polariscope-hotspot[data-part-id="analyzer"]').click();
  // 做完一步停在结果上：提示收起，等「下一步」。
  await expect(coach(page)).toHaveCount(0);
  await page.getByTestId('sim-task-next').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('sim-polari-path-next').click();
  await page.getByTestId('sim-task-next').click();
  await expect(coach(page)).toHaveAttribute('data-part', 'analyzer');
  await expect(coach(page)).toContainText('转到 90°');
  await page.getByRole('slider', { name: '上偏光片角度', exact: true }).fill('90');
  await expect(task(page)).toContainText('本屏已完成');
});

test('student observation: no coach while predicting, the stage is pointed at after predicting; an uncrossed analyzer is corrected in place', async ({ page }) => {
  await page.goto(polariscopeUrl('/sim/polariscope/lab?mode=student'));
  await ready(page);
  await expect(poe(page)).toHaveAttribute('data-phase', 'predict');
  await expect(coach(page)).toHaveCount(0);
  await page.getByTestId('sim-polari-predict-all-dark').click();
  await expect(coach(page)).toHaveAttribute('data-part', 'stage');
  await page.getByTestId('sim-polari-auto-rotate').click();
  await expect(stage(page)).toHaveAttribute('data-observation', 'all-dark', { timeout: 20_000 });
  await expect(poe(page)).toContainText('与预测一致');
  await expect(task(page).locator('li[data-done="true"]')).toContainText('尖晶石');
  await page.getByTestId('sim-polari-pick-tourmaline').click();
  await page.getByTestId('sim-polari-analyzer-45').click();
  await expect(coach(page)).toHaveAttribute('data-part', 'analyzer');
  await expect(poe(page)).toContainText('不在 90° 正交');
  await page.getByTestId('sim-polari-cross').click();
  await expect(poe(page)).toHaveAttribute('data-phase', 'predict');
});

test('student reorient: after the optic-axis turn the coach says to place it another way', async ({ page }) => {
  await page.goto(polariscopeUrl('/sim/polariscope/lab?mode=student&step=reorient'));
  await ready(page);
  await expect(page.getByTestId('sim-polari-orientation')).toHaveText('换个方向放置');
  await turn(page, 'axis-dark');
  await expect(coach(page)).toContainText('换个方向放置');
  await page.getByTestId('sim-polari-reorient').click();
  await expect(poe(page)).toHaveAttribute('data-phase', 'observe');
  await turn(page, 'four-bright-four-dark');
  await expect(task(page)).toContainText('换方向复核 · 已完成');
});

test('changing orientation stops the previous turn and requires a fresh full observation', async ({ page }) => {
  await page.goto(polariscopeUrl('/sim/polariscope/lab?lesson=sample'));
  await ready(page);
  await page.getByTestId('sim-polari-predict-demo').click();
  const rotation = page.getByTestId('sim-polari-auto-rotate');
  await rotation.click();
  await expect(rotation).toHaveText('停止转动');
  await page.getByTestId('sim-polari-orientation').click();
  // 换方向应立即结束旧一轮，不能等它自然转完（约 9 秒）。
  await expect(rotation).toHaveText('自动转一周', { timeout: 1_500 });
  await expect(page.getByTestId('sim-polari-reveal')).toHaveCount(0);
  await rotation.click();
  await expect(rotation).toHaveText('停止转动');
  await expect(stage(page)).toHaveAttribute('data-observation', 'axis-dark', { timeout: 20_000 });
});

for (const width of [1280, 1440, 1920]) test(`projection at ${width} px: the task card does not cover the observation box`, async ({ page }) => {
  await page.setViewportSize({ width, height: Math.round(width * 9 / 16) });
  await page.goto(polariscopeUrl('/sim/polariscope/lab?mode=student'));
  await ready(page);
  await page.getByRole('button', { name: '进入投屏模式' }).click();
  const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;
  const card = await box(task(page)), field = await box(page.getByTestId('sim-polari-field')), exit = await box(page.getByRole('button', { name: '退出投屏模式' }));
  const overlaps = (a: typeof card, b: typeof card) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps(card, field), 'observation').toBe(false);
  expect(overlaps(field, exit), 'exit button').toBe(false);
});

test('course on a 390 px phone keeps the layout without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(polariscopeUrl('/sim/polariscope/lab?mode=student'));
  await ready(page);
  await page.getByTestId('sim-task-open').click();
  await expect(task(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

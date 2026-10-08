import { expect, test, polariscopeUrl, type Page } from './fixtures/polariscope';

const scene = (page: Page) => page.getByTestId('polariscope-scene');
const canvas = (page: Page) => page.getByTestId('polariscope-canvas');
const guide = (page: Page) => page.getByTestId('course-guide');
const coach = (page: Page) => page.getByTestId('scene-coach');
const card = (page: Page) => page.getByTestId('student-card');

test.setTimeout(120_000);

async function openStudent(page: Page) {
  await page.goto(polariscopeUrl('/explore/polariscope'));
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.getByTestId('explore-student-start').click();
  await expect(page).toHaveURL(/mode=student/);
}

async function rotateWithCard(page: Page, observation: string) {
  await page.getByTestId('student-predict-skip').click();
  await expect(card(page)).toHaveAttribute('data-phase', 'observe');
  await page.getByTestId('student-auto-rotate').click();
  await expect(page.getByTestId('sample-reveal')).toHaveAttribute('data-observation', observation, { timeout: 20_000 });
  await expect(card(page)).toHaveAttribute('data-phase', 'explain');
}

test('student mode: side panels fold away and the coach points at the next part to click', async ({ page }) => {
  await openStudent(page);
  await expect(page.locator('.pol-explore__panel')).toBeHidden();
  await expect(page.locator('.pol-explore__parts')).toBeHidden();
  await expect(coach(page)).toHaveAttribute('data-part', 'polarizer');
  await expect(coach(page)).toBeVisible();
  await page.locator('.polariscope-hotspot[data-part-id="polarizer"]').click();
  await expect(page.getByTestId('student-toast')).toContainText('下偏光片');
  await expect(coach(page)).toHaveAttribute('data-part', 'stage');
  // 学员模式选中部件不推近镜头，下一个部件仍在画面中；部件说明显示在展台内。
  await expect(coach(page)).toBeVisible();
  await expect(page.getByTestId('projection-explainer')).toContainText('下偏光片');
  await page.locator('.polariscope-hotspot[data-part-id="stage"]').click();
  await page.locator('.polariscope-hotspot[data-part-id="analyzer"]').click();
  await expect(coach(page)).toHaveAttribute('data-tone', 'done');
  await expect(page.getByTestId('course-next')).toBeEnabled();
});

test('student mode: crossed step coaches the analyzer until the empty field is dark', async ({ page }) => {
  await openStudent(page);
  for (let i = 0; i < 2; i++) await page.getByTestId('course-skip').click();
  await expect(guide(page)).toHaveAttribute('data-step', 'crossed');
  await expect(coach(page)).toHaveAttribute('data-part', 'analyzer');
  await expect(coach(page)).toContainText('转到 90°');
  const slider = page.getByRole('slider', { name: '投屏检偏器角度' });
  await slider.fill('90');
  await expect(coach(page)).toHaveAttribute('data-tone', 'done');
  await expect(page.getByTestId('course-next')).toBeEnabled();
});

test('student mode: observation happens beside an enlarged eyepiece, with in-stage prediction and reveal', async ({ page }) => {
  await openStudent(page);
  for (let i = 0; i < 3; i++) await page.getByTestId('course-skip').click();
  await expect(guide(page)).toHaveAttribute('data-step', 'rotate');
  await expect(page.getByTestId('student-observe')).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-view-shift', '0.200', { timeout: 5_000 });
  await expect(card(page)).toHaveAttribute('data-phase', 'predict');
  await expect(coach(page)).toHaveCount(0);
  await page.getByTestId('student-predict-all-dark').click();
  await expect(coach(page)).toHaveAttribute('data-part', 'stage');
  await page.getByTestId('student-auto-rotate').click();
  await expect(page.getByTestId('sample-reveal')).toHaveAttribute('data-observation', 'all-dark', { timeout: 20_000 });
  await expect(card(page)).toContainText('与预测一致');
  await expect(guide(page).locator('li[data-done="true"]')).toContainText('尖晶石');
});

test('student mode: an uncrossed analyzer is corrected in place before observing', async ({ page }) => {
  await openStudent(page);
  for (let i = 0; i < 3; i++) await page.getByTestId('course-skip').click();
  // 切到讲师模式改动检偏器，再切回学员模式。
  await page.getByTestId('course-mode-teacher').click();
  await page.getByRole('button', { name: '45° 斜交' }).click();
  await page.getByTestId('course-mode-student').click();
  await expect(coach(page)).toHaveAttribute('data-part', 'analyzer');
  await expect(card(page)).toContainText('不在 90° 正交');
  await card(page).getByRole('button', { name: '转到 90° 正交' }).click();
  await expect(card(page)).toHaveAttribute('data-phase', 'predict');
});

test('student mode: reorient step is completed from the card after the optic-axis rotation', async ({ page }) => {
  await openStudent(page);
  for (let i = 0; i < 4; i++) await page.getByTestId('course-skip').click();
  await expect(guide(page)).toHaveAttribute('data-step', 'reorient');
  await rotateWithCard(page, 'axis-dark');
  await expect(coach(page)).toContainText('换个方向放置');
  await page.getByTestId('student-reorient').click();
  await expect(card(page)).toHaveAttribute('data-phase', 'observe');
  await page.getByTestId('student-auto-rotate').click();
  await expect(page.getByTestId('sample-reveal')).toHaveAttribute('data-observation', 'four-bright-four-dark', { timeout: 20_000 });
  await expect(page.getByTestId('course-next')).toBeEnabled();
});

test('switching to teacher mode restores the side panels and the standard eyepiece dock', async ({ page }) => {
  await openStudent(page);
  for (let i = 0; i < 3; i++) await page.getByTestId('course-skip').click();
  await page.getByTestId('course-mode-teacher').click();
  await expect(page).not.toHaveURL(/mode=student/);
  await expect(page.locator('.pol-explore__panel')).toBeVisible();
  await expect(page.getByTestId('student-observe')).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-view-shift', '0.000', { timeout: 5_000 });
  await expect(coach(page)).toHaveCount(0);
});

test('student mode on a 390 px phone keeps the stacked layout without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(polariscopeUrl('/explore/polariscope?course=basic&mode=student'));
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  for (let i = 0; i < 3; i++) await page.getByTestId('course-skip').click();
  await expect(page.getByTestId('student-observe')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('student mode: a full run without skipping records one polariscope learning completion', async ({ page }) => {
  await openStudent(page);
  for (const part of ['polarizer', 'stage', 'analyzer']) await page.locator(`.polariscope-hotspot[data-part-id="${part}"]`).click();
  await page.getByTestId('course-next').click();

  await expect(guide(page)).toHaveAttribute('data-step', 'path');
  // 学员模式侧栏收起，光路步骤用展台下方的投屏控制条。
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '投屏下一步' }).click();
  await page.getByTestId('course-next').click();

  await expect(guide(page)).toHaveAttribute('data-step', 'crossed');
  await page.getByRole('slider', { name: '投屏检偏器角度' }).fill('90');
  await page.getByTestId('course-next').click();

  await expect(guide(page)).toHaveAttribute('data-step', 'rotate');
  await rotateWithCard(page, 'all-dark');
  await guide(page).getByRole('button', { name: '碧玺转一周' }).click();
  await rotateWithCard(page, 'four-bright-four-dark');
  await guide(page).getByRole('button', { name: '翡翠转一周' }).click();
  await rotateWithCard(page, 'all-bright');
  await page.getByTestId('course-next').click();

  await expect(guide(page)).toHaveAttribute('data-step', 'reorient');
  await rotateWithCard(page, 'axis-dark');
  await page.getByTestId('student-reorient').click();
  await page.getByTestId('student-auto-rotate').click();
  await expect(page.getByTestId('sample-reveal')).toHaveAttribute('data-observation', 'four-bright-four-dark', { timeout: 20_000 });
  await page.getByTestId('course-next').click();

  const quiz = page.getByTestId('course-quiz');
  const question = (id: string) => quiz.getByTestId(`course-question-${id}`);
  await question('why-crossed').getByLabel(/样品造成的明暗变化才能看清/).check();
  await question('why-crossed').getByRole('button', { name: '提交' }).click();
  await question('why-reorient').getByLabel(/看起来和均质体一样暗/).check();
  await question('why-reorient').getByRole('button', { name: '提交' }).click();
  for (const text of [/电源关闭/, /没转到正交/, /只在一个方向/, /样品不透明/]) await question('no-conclusion').getByLabel(text).check();
  await question('no-conclusion').getByRole('button', { name: '提交' }).click();
  expect(await page.evaluate(() => localStorage.getItem('gem-lab-progress-v1'))).toBeNull();
  await page.getByTestId('course-finish').click();

  await expect(page.getByTestId('course-complete')).toHaveAttribute('data-skipped', '0');
  await expect(page.getByTestId('course-save-status')).toHaveText('已记录本次学习完成。');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gem-lab-progress-v1') ?? '{}').state?.completedDemos ?? []))
    .toEqual([expect.objectContaining({ instrumentId: 'polariscope', mode: 'learning' })]);
});

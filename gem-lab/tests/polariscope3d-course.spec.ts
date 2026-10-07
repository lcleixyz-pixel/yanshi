import { expect, test, type Page } from '@playwright/test';

const scene = (page: Page) => page.getByTestId('polariscope-scene');
const canvas = (page: Page) => page.getByTestId('polariscope-canvas');
const guide = (page: Page) => page.getByTestId('course-guide');

test.setTimeout(150_000);

async function rotateOnce(page: Page, observation: string) {
  await page.getByTestId('sample-demo-mode').click();
  await page.getByTestId('sample-auto-rotate').click();
  await expect(page.getByTestId('sample-reveal')).toHaveAttribute('data-observation', observation, { timeout: 20_000 });
}

test('basic guided course: parts → path → crossed → rotate → reorient → explain, then advanced topics', async ({ page }) => {
  await page.goto('/explore/polariscope');
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.getByTestId('explore-course-start').click();
  await expect(page).toHaveURL(/course=basic/);
  await expect(guide(page)).toHaveAttribute('data-step', 'parts');
  await expect(page.getByTestId('explore-lesson-path')).toHaveCount(0);
  await expect(page.getByTestId('course-next')).toBeDisabled();

  // 1 认识部件
  for (const part of ['polarizer', 'stage', 'analyzer']) await page.getByTestId(`explore-part-${part}`).click();
  await expect(page.getByTestId('course-why')).toBeVisible();
  await page.getByTestId('course-next').click();

  // 2 跟随光路
  await expect(guide(page)).toHaveAttribute('data-step', 'path');
  await expect(page.getByTestId('polariscope-explore-page')).toHaveAttribute('data-lesson', 'path');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '光路下一步' }).click();
  await page.getByTestId('course-next').click();

  // 3 空载调正：0° 已是平行最亮，转到 90° 正交才算完成
  await expect(guide(page)).toHaveAttribute('data-step', 'crossed');
  await expect(page.getByTestId('principle-transmission')).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('course-next')).toBeDisabled();
  await page.getByRole('button', { name: '90° 正交', exact: true }).click();
  await expect(page.getByTestId('principle-transmission')).toHaveAttribute('data-value', '0');
  await page.getByTestId('course-next').click();

  // 4 放样旋转：三种典型反应
  await expect(guide(page)).toHaveAttribute('data-step', 'rotate');
  await expect(canvas(page)).toHaveAttribute('data-sample', 'spinel');
  await rotateOnce(page, 'all-dark');
  await guide(page).getByRole('button', { name: '碧玺转一周' }).click();
  await rotateOnce(page, 'four-bright-four-dark');
  await guide(page).getByRole('button', { name: '翡翠转一周' }).click();
  await rotateOnce(page, 'all-bright');
  await page.getByTestId('course-next').click();

  // 5 换方向复核：同一块碧玺沿光轴全暗，换方向后四明四暗
  await expect(guide(page)).toHaveAttribute('data-step', 'reorient');
  await expect(canvas(page)).toHaveAttribute('data-sample', 'tourmaline');
  await rotateOnce(page, 'axis-dark');
  await expect(page.getByTestId('course-next')).toBeDisabled();
  // 换方向的操作直接放在课程条上，不必去右侧面板底部找。
  await page.getByTestId('course-reorient').click();
  await expect(page.getByTestId('sample-orientation')).toHaveText('沿光轴方向放置');
  await page.getByTestId('sample-auto-rotate').click();
  await expect(page.getByTestId('sample-reveal')).toHaveAttribute('data-observation', 'four-bright-four-dark', { timeout: 20_000 });
  await page.getByTestId('course-next').click();

  // 6 解释
  await expect(guide(page)).toHaveAttribute('data-step', 'explain');
  const quiz = page.getByTestId('course-quiz');
  const question = (id: string) => quiz.getByTestId(`course-question-${id}`);
  await question('why-crossed').getByLabel(/样品造成的明暗变化才能看清/).check();
  await question('why-crossed').getByRole('button', { name: '提交' }).click();
  await question('why-reorient').getByLabel(/灯光不够亮/).check();
  await question('why-reorient').getByRole('button', { name: '提交' }).click();
  await expect(question('why-reorient')).toContainText('有选项不对');
  await question('why-reorient').getByLabel(/看起来和均质体一样暗/).check();
  await question('why-reorient').getByRole('button', { name: '提交' }).click();
  for (const text of [/电源关闭/, /没转到正交/, /只在一个方向/]) await question('no-conclusion').getByLabel(text).check();
  await question('no-conclusion').getByRole('button', { name: '提交' }).click();
  await expect(question('no-conclusion')).toContainText('还有遗漏');
  await expect(page.getByTestId('course-finish')).toBeDisabled();
  await question('no-conclusion').getByLabel(/样品不透明/).check();
  await question('no-conclusion').getByRole('button', { name: '提交' }).click();
  for (const id of ['why-crossed', 'why-reorient', 'no-conclusion']) await expect(question(id)).toHaveAttribute('data-correct', 'true');
  await page.getByTestId('course-finish').click();

  const complete = page.getByTestId('course-complete');
  await expect(complete).toBeVisible();
  expect(Number(await complete.getAttribute('data-total-ms'))).toBeGreaterThan(0);
  await expect(complete).toHaveAttribute('data-skipped', '0');
  await page.getByTestId('course-advanced-adr').click();
  await expect(page).not.toHaveURL(/course=/);
  await expect(page.getByTestId('course-guide')).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-sample', 'garnet');
  await expect(page.getByTestId('explore-lesson-sample')).toHaveAttribute('aria-pressed', 'true');
});

test('opening ?course=basic directly starts the course at step 1, and exit restores free exploration', async ({ page }) => {
  await page.goto('/explore/polariscope?lesson=sample&course=basic');
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(guide(page)).toHaveAttribute('data-step', 'parts');
  await expect(page.getByTestId('polariscope-explore-page')).toHaveAttribute('data-lesson', 'components');
  // 未完成的步骤可以跳过，但后面没到达的步骤不能直接点。
  await expect(page.getByTestId('course-step-explain')).toBeDisabled();
  await page.getByTestId('course-skip').click();
  await expect(guide(page)).toHaveAttribute('data-step', 'path');
  await page.getByTestId('course-step-parts').click();
  await expect(guide(page)).toHaveAttribute('data-step', 'parts');
  await page.getByTestId('course-exit').click();
  await expect(page.getByTestId('course-guide')).toHaveCount(0);
  await expect(page.getByTestId('explore-lesson-components')).toBeVisible();
});

test('course in projection mode keeps the step bar and its controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/explore/polariscope?course=basic');
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.getByRole('button', { name: '进入投屏模式' }).click();
  await expect(guide(page)).toBeVisible();
  await expect(page.getByRole('combobox', { name: '投屏讲解内容' })).toHaveCount(0);
  await page.getByTestId('course-skip').click();
  await page.getByRole('button', { name: '投屏下一步' }).click();
  await expect(page.getByLabel('投屏光路步骤').getByText('2 / 5')).toBeVisible();
  // 课程条与右上角退出按钮、目镜视场不重叠。
  const bar = await guide(page).boundingBox(), exit = await page.getByRole('button', { name: '退出投屏模式' }).boundingBox();
  expect(bar && exit && bar.x + bar.width < exit.x).toBeTruthy();
});

for (const width of [1280, 1440, 1920]) test(`projection at ${width} px: the course bar does not cover the explainer or the eyepiece`, async ({ page }) => {
  await page.setViewportSize({ width, height: Math.round(width * 9 / 16) });
  await page.goto('/explore/polariscope?course=basic');
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  for (let i = 0; i < 3; i++) await page.getByTestId('course-skip').click();
  await page.getByRole('button', { name: '进入投屏模式' }).click();
  const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;
  const bar = await box(guide(page)), explainer = await box(page.getByTestId('projection-explainer')), eyepiece = await box(page.locator('.pol-explore__eyepiece-dock'));
  const overlaps = (a: typeof bar, b: typeof bar) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps(bar, explainer), 'explainer').toBe(false);
  expect(overlaps(bar, eyepiece), 'eyepiece').toBe(false);
});

test('course bar fits a 390 px phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore/polariscope?course=basic');
  await expect(guide(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('projection: the reorient step can be completed with projection controls only', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/explore/polariscope?course=basic');
  await expect(scene(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  for (let i = 0; i < 4; i++) await page.getByTestId('course-skip').click();
  await expect(guide(page)).toHaveAttribute('data-step', 'reorient');
  await page.getByRole('button', { name: '进入投屏模式' }).click();
  // 投屏时工作区占满整屏高度。
  expect((await page.locator('.pol-explore__viewport').boundingBox())!.height).toBeGreaterThan(1000);
  await page.getByRole('combobox', { name: '投屏预测' }).selectOption('demo');
  await page.getByRole('button', { name: '转动一周' }).click();
  await expect(page.getByTestId('projection-explainer')).toContainText('全暗', { timeout: 20_000 });
  await page.getByRole('button', { name: '投屏样品方向' }).click();
  await page.getByRole('button', { name: '转动一周' }).click();
  await expect(page.getByTestId('projection-explainer')).toContainText('一周四明四暗', { timeout: 20_000 });
  await expect(page.getByTestId('course-next')).toBeEnabled();
});

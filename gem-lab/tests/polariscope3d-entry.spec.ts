import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

test('polariscope knowledge page leads with the 3D course; the 2D demo is a secondary fallback', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  await expect(page.getByTestId('knowledge-start-course')).toHaveAttribute('href', '/explore/polariscope?course=basic&mode=student');
  await expect(page.getByTestId('knowledge-teacher-course')).toHaveAttribute('href', '/explore/polariscope?course=basic');
  await expect(page.getByTestId('knowledge-cta-learning')).toHaveAttribute('href', '/explore/polariscope?course=basic&mode=student');
  await expect(page.getByTestId('knowledge-classic-demo')).toHaveAttribute('href', '/demo/polariscope');
  // 2D 演示只剩「交互演示」一节里的次要链接。
  await expect(page.locator('a[href="/demo/polariscope"]')).toHaveCount(1);
  await page.getByRole('button', { name: /多色性观察/ }).click();
  await expect(page.getByTestId('method-practice-pleochroism')).toContainText('暂无 3D 练习');
});

test('a method practice link opens the 3D course at the matching step', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  await page.getByTestId('method-practice-optical-character').getByRole('link').click();
  await expect(page.getByTestId('course-guide')).toHaveAttribute('data-step', 'crossed', { timeout: 30_000 });
  await expect(page).toHaveURL(/mode=student/);
  await expect(page).not.toHaveURL(/step=/);
  await expect(page.getByTestId('course-step-parts')).toBeEnabled();
});

test('a course with skipped steps does not count as a completed lesson', async ({ page }) => {
  await page.goto('/explore/polariscope?course=basic');
  await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByTestId('course-skip').click();
  const quiz = page.getByTestId('course-quiz');
  await quiz.getByTestId('course-question-why-crossed').getByLabel(/样品造成的明暗变化/).check();
  await quiz.getByTestId('course-question-why-crossed').getByRole('button', { name: '提交' }).click();
  await quiz.getByTestId('course-question-why-reorient').getByLabel(/看起来和均质体一样暗/).check();
  await quiz.getByTestId('course-question-why-reorient').getByRole('button', { name: '提交' }).click();
  for (const text of [/电源关闭/, /没转到正交/, /只在一个方向/, /样品不透明/]) await quiz.getByTestId('course-question-no-conclusion').getByLabel(text).check();
  await quiz.getByTestId('course-question-no-conclusion').getByRole('button', { name: '提交' }).click();
  await page.getByTestId('course-finish').click();
  await expect(page.getByTestId('course-complete')).toHaveAttribute('data-skipped', '5');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => localStorage.getItem('gem-lab-progress-v1'))).toBeNull();
});

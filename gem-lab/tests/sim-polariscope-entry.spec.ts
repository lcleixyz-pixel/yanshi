import { expect, test } from '@playwright/test';

/** 由 polariscope3d-entry.spec.ts 改写：知识库入口与方法练习改指仿真；跳步不算完成课程见 sim-polariscope-course。 */

test.setTimeout(90_000);

test('polariscope knowledge page has one simulation entry; the 2D demo is a secondary fallback', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  // 知识库只留一个仿真入口；引导课程（学员 / 讲师）在仿真里的任务卡中选择。
  await expect(page.getByTestId('knowledge-open-sim')).toHaveAttribute('href', '/sim/polariscope/learn');
  await expect(page.getByTestId('knowledge-structure-sim')).toHaveAttribute('href', '/sim/polariscope/learn');
  await expect(page.getByTestId('knowledge-cta-learning')).toHaveAttribute('href', '/sim/polariscope/learn');
  await expect(page.getByTestId('knowledge-start-course')).toHaveCount(0);
  await expect(page.getByTestId('knowledge-classic-demo')).toHaveAttribute('href', '/demo/polariscope');
  // 2D 演示只剩「交互演示」一节里的次要链接。
  await expect(page.locator('a[href="/demo/polariscope"]')).toHaveCount(1);
  await page.getByRole('button', { name: /多色性观察/ }).click();
  await expect(page.getByTestId('method-practice-pleochroism')).toContainText('暂无 3D 练习');
});

test('a method practice link opens the 3D course at the matching step', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  await page.getByTestId('method-practice-optical-character').getByRole('link').click();
  await expect(page).toHaveURL(/\/sim\/polariscope\/learn\?mode=student&step=crossed$/);
  await expect(page.getByTestId('sim-task')).toContainText('空载调正', { timeout: 30_000 });
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-lesson', 'principle');
});

test('the interference-figure practice link opens the lab screen on the conoscope lesson', async ({ page }) => {
  await page.goto('/knowledge/polariscope');
  await page.getByRole('button', { name: /干涉图/ }).first().click();
  await page.getByRole('link', { name: '在 3D 仪器上观察干涉图' }).click();
  await expect(page).toHaveURL(/\/sim\/polariscope\/lab\?lesson=conoscope$/);
  await expect(page.getByTestId('sim-polari-stage')).toHaveAttribute('data-lesson', 'conoscope', { timeout: 30_000 });
});

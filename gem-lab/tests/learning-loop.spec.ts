import { expect, test, type Page } from '@playwright/test';

const seededSession = {
  difficulty: 'beginner',
  sampleId: 'ruby',
  instrumentsUsed: ['refractometer', 'polariscope'],
  refractometer: {
    method: 'facet', riMin: 1.762, riMax: 1.770, birefringence: 0.008,
    opticalCharacter: 'uniaxial-negative', notes: '',
  },
  polariscope: { rotation: 360, phenomenon: 'four-bright-four-dark', optical: 'anisotropic', notes: '' },
  spectroscope: { method: null, markedLines: [], bandRanges: [], notes: '' },
  startedAt: Date.now() - 120_000,
  assessment: null,
  assessmentAttemptCount: 0,
};

async function openSeededAssessment(page: Page) {
  await page.goto('/');
  await page.evaluate((session) => {
    window.sessionStorage.setItem('gem-lab-detection-v1', JSON.stringify({ state: session, version: 1 }));
  }, seededSession);
  await page.goto('/assessment');
  await expect(page.getByRole('heading', { name: '请根据检测数据对样品进行命名' })).toBeVisible();
}

test('detection difficulty and drawn sample survive refresh, and restart clears the session', async ({ page }) => {
  await page.goto('/detection');
  await page.getByTestId('difficulty-beginner').click();
  await expect(page.getByRole('button', { name: '🎲 抽取样品' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '🎲 抽取样品' })).toBeVisible();
  await page.getByRole('button', { name: '🎲 抽取样品' }).click();
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '重新开始' }).click();
  await expect(page.getByRole('heading', { name: '选择检测难度' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '选择检测难度' })).toBeVisible();
});

test('touch sized home exposes direct instrument and detection links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({
    version: 2,
    state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], sampleMastery: {}, totalPoints: 0 },
  })));
  await page.goto('/');
  const quickNav = page.getByRole('navigation', { name: '触屏快速入口' });
  await expect(quickNav).toBeVisible();
  await expect(quickNav.getByRole('link', { name: /折射仪/ })).toBeVisible();
  await quickNav.getByRole('link', { name: /开始检测/ }).click();
  await expect(page).toHaveURL(/\/detection$/);
});

test('legacy progress migrates into the mastery atlas', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({
      version: 1,
      state: {
        onboarded: true, visitedKnowledgeBases: [], completedDemos: [], totalPoints: 20,
        detectionHistory: [
          { id: '2', sampleId: 'ruby', difficulty: 'beginner', userAnswer: '红宝石', correct: true, attempts: 1, score: 10, completedAt: 2 },
          { id: '1', sampleId: 'ruby', difficulty: 'beginner', userAnswer: '红宝石', correct: true, attempts: 1, score: 10, completedAt: 1 },
        ],
      },
    }));
  });
  await page.goto('/progress');
  await expect(page.getByRole('progressbar', { name: '样品掌握进度' })).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByText('答对 2 / 2 次')).toBeVisible();
  await page.getByRole('button', { name: /已掌握 1/ }).click();
  await expect(page.getByText('当前显示 1 种')).toBeVisible();
});

test('assessment saves the reasoning choice, survives refresh and prints a local report', async ({ page }) => {
  await openSeededAssessment(page);
  await page.locator('[data-testid="answer-option"][data-sample-id="ruby"]').click();
  await expect(page.getByRole('button', { name: '✈ 提交答案' })).toBeDisabled();
  await page.getByRole('radio', { name: /折射率/ }).check();
  await page.getByRole('button', { name: '✈ 提交答案' }).click();
  await expect(page.getByText('回答正确！🎉')).toBeVisible();
  await expect(page.getByTestId('practice-print-report')).toContainText('宝石检测课堂练习记录');
  await expect(page.getByRole('button', { name: '打印练习记录' })).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gem-lab-progress-v1') || '{}').state.totalPoints);
  await page.reload();
  await expect(page.getByText('回答正确！🎉')).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gem-lab-progress-v1') || '{}').state.totalPoints);
  expect(after).toBe(before);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('practice-print-report')).toBeVisible();
  await expect(page.getByTestId('practice-print-report')).toContainText('教学模拟资料');
});

test('retry after answer reveal earns no points and remains a review item', async ({ page }) => {
  await openSeededAssessment(page);
  await page.locator('[data-testid="answer-option"]:not([data-sample-id="ruby"])').first().click();
  await page.getByRole('radio', { name: /折射率/ }).check();
  await page.getByRole('button', { name: '✈ 提交答案' }).click();
  await expect(page.getByText('回答错误')).toBeVisible();
  await page.getByRole('button', { name: '🔄 原题复盘（不计分）' }).click();
  await page.locator('[data-testid="answer-option"][data-sample-id="ruby"]').click();
  await page.getByRole('radio', { name: /折射率/ }).check();
  await page.getByRole('button', { name: '✈ 提交答案' }).click();
  await expect(page.getByText('回答正确！🎉')).toBeVisible();
  await expect(page.getByText('本次为答案揭晓后的复盘练习，不再计分或提升掌握度。')).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gem-lab-progress-v1') || '{}').state);
  expect(progress.totalPoints).toBe(0);
  expect(progress.sampleMastery.ruby.correct).toBe(0);
  expect(progress.sampleMastery.ruby.attempts).toBe(2);
});

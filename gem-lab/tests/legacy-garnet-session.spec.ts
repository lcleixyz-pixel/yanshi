import { expect, test, type Page } from '@playwright/test';

const legacySession = {
  difficulty: 'beginner',
  sampleId: 'garnet',
  instrumentsUsed: ['refractometer', 'polariscope', 'spectroscope'],
  refractometer: { method: 'facet', riMin: 1.74, riMax: 1.74, birefringence: 0, opticalCharacter: 'isotropic', notes: '保留旧折射率记录' },
  polariscope: { rotation: 180, phenomenon: 'anomalous', optical: 'isotropic', notes: '保留旧异常消光观察' },
  spectroscope: { method: 'transmission', markedLines: [504, 520, 573], bandRanges: [{ start: 500, end: 509 }], notes: '保留旧光谱备注' },
  startedAt: 1_760_000_000_000,
  assessment: null as Record<string, unknown> | null,
  assessmentAttemptCount: 0,
};

const historicalProgress = {
  onboarded: true, visitedKnowledgeBases: [], completedDemos: [], totalPoints: 20,
  detectionHistory: [{ id: 'legacy-garnet-result', sampleId: 'garnet', difficulty: 'beginner', userAnswer: '石榴石', correct: true, attempts: 1, score: 10, completedAt: 1_760_000_010_000 }],
  sampleMastery: { garnet: { attempts: 2, correct: 2, lastPracticedAt: 1_760_000_010_000, lastCorrect: true } },
};

async function seed(page: Page, session: Record<string, unknown> = legacySession, path = '/detection') {
  await page.goto('/');
  await page.evaluate(({ session, progress }) => {
    sessionStorage.setItem('gem-lab-detection-v1', JSON.stringify({ state: session, version: 1 }));
    localStorage.setItem('gem-lab-progress-v1', JSON.stringify({ state: progress, version: 2 }));
  }, { session, progress: historicalProgress });
  await page.goto(path);
}

async function savedSession(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1') || '{}').state);
}

test('unassessed legacy garnet stays readable across reloads and cannot be scored', async ({ page }) => {
  await seed(page);
  await expect(page.getByTestId('legacy-sample-notice')).toContainText('铁铝榴石和镁铝榴石');
  await expect(page.getByTestId('legacy-record-details')).toContainText('保留旧折射率记录');
  await expect(page.getByTestId('legacy-record-details')).toContainText('500–509 nm');
  await expect(page.getByTestId('legacy-record-details')).toContainText('保留旧光谱备注');
  await expect(page.getByRole('button', { name: '查看已有评估 →' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toHaveCount(0);
  await page.reload();
  expect(await savedSession(page)).toEqual(legacySession);
  await page.goto('/assessment');
  await expect(page.getByTestId('legacy-sample-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: '✈ 提交答案' })).toHaveCount(0);
  await expect(page.getByTestId('answer-option')).toHaveCount(0);
  expect(await savedSession(page)).toEqual(legacySession);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('gem-lab-progress-v1') || '{}').state);
  expect(progress).toEqual(historicalProgress);
});

test('legacy assessment is preserved for review with no retry that erases it', async ({ page }) => {
  const session = {
    ...legacySession,
    assessment: { selectedSampleId: 'ruby', evidence: 'spectrum', confidence: 70, hintUsed: false, attemptNumber: 1, score: 0, completedAt: 1_760_000_010_000 },
    assessmentAttemptCount: 1,
  };
  await seed(page, session);
  await page.getByRole('button', { name: '查看已有评估 →' }).click();
  await expect(page.getByRole('heading', { name: '历史评估结果（旧版数据）' })).toBeVisible();
  await expect(page.getByText('回答错误', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '🔄 原题复盘（不计分）' })).toHaveCount(0);
  await page.reload();
  expect(await savedSession(page)).toEqual(session);
  await expect(page.getByRole('button', { name: '打印练习记录' })).toBeVisible();
});

test('only explicit restart replaces legacy records and the split species do not inherit mastery', async ({ page }) => {
  await seed(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '使用新样品重新练习' }).click();
  expect(await savedSession(page)).toEqual(legacySession);
  await page.goto('/progress');
  await expect(page.getByRole('progressbar', { name: '样品掌握进度' })).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: /待探索/ }).click();
  await expect(page.getByRole('heading', { name: '铁铝榴石', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '镁铝榴石', exact: true })).toBeVisible();
  await page.goto('/detection');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '使用新样品重新练习' }).click();
  await expect(page.getByRole('heading', { name: '选择检测难度' })).toBeVisible();
  expect((await savedSession(page)).sampleId).toBeNull();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('gem-lab-progress-v1') || '{}').state);
  expect(progress).toEqual(historicalProgress);
});

test('confusion feedback does not claim a non-diagnostic spectrum distinguishes samples', async ({ page }) => {
  await seed(page, {
    ...legacySession,
    sampleId: 'opal',
    assessment: { selectedSampleId: 'chalcedony', evidence: 'spectrum', confidence: 70, hintUsed: false, attemptNumber: 1, score: 0, completedAt: 1_760_000_010_000 },
    assessmentAttemptCount: 1,
  }, '/assessment');
  await expect(page.getByText(/仅该项不足以区分/)).toBeVisible();
  await expect(page.getByText(/光谱.*有明显不同/)).toHaveCount(0);
});

test('unverified spectra cannot be a primary naming basis but other observations remain usable', async ({ page }) => {
  await seed(page, {
    ...legacySession,
    sampleId: 'tourmaline',
    difficulty: 'intermediate',
    spectroscope: { ...legacySession.spectroscope, markedLines: [], bandRanges: [], notes: '教学谱图未核定，无法判断吸收情况' },
  }, '/assessment');
  await expect(page.getByRole('radio', { name: /吸收光谱/ })).toBeDisabled();
  await expect(page.getByText('本次观察所需的教学谱图尚未核定，不能将待核状态当作已观察到无吸收。请选用本次其他仪器的有效记录作为主要依据。')).toBeVisible();
  await page.locator('[data-testid="answer-option"][data-sample-id="tourmaline"]').click();
  await expect(page.getByRole('button', { name: '✈ 提交答案' })).toBeDisabled();
  await page.getByRole('radio', { name: /折射率/ }).check();
  await page.getByRole('button', { name: '✈ 提交答案' }).click();
  await expect(page.getByText('回答正确！🎉', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '教学谱图未核定', exact: true })).toBeVisible();
});

test('known non-diagnostic spectra remain selectable as limited observation evidence', async ({ page }) => {
  await seed(page, { ...legacySession, sampleId: 'opal', difficulty: 'advanced' }, '/assessment');
  await expect(page.getByRole('radio', { name: /吸收光谱/ })).toBeEnabled();
  await expect(page.getByText('不特征也是观察信息，但该项不足以单独判断')).toBeVisible();
});

test('an unverified spectrum does not satisfy the two-observation gate and a recorded polariscope observation unlocks it', async ({ page }) => {
  test.setTimeout(90_000);
  const session = {
    ...legacySession,
    sampleId: 'tourmaline',
    difficulty: 'intermediate',
    instrumentsUsed: ['refractometer', 'spectroscope'],
    polariscope: { rotation: 0, phenomenon: null, optical: null, notes: '' },
    spectroscope: { method: 'transmission', markedLines: [], bandRanges: [], notes: '教学谱图未核定，无法判断吸收情况' },
  };
  await seed(page, session);
  await expect(page.getByRole('button', { name: '进入命名评估 →' })).toBeDisabled();
  await expect(page.getByText('还需完成 1 项有效观察才能进入评估')).toBeVisible();
  await expect(page.getByText('已记录，待核定', { exact: true })).toBeVisible();
  await page.goto('/assessment');
  await expect(page.getByRole('heading', { name: '检测数据尚不充分' })).toBeVisible();
  await expect(page.getByText('当前已完成 1 项有效观察，请先完成至少两项，再根据记录进行命名。')).toBeVisible();
  expect(await savedSession(page)).toEqual(session);
  await page.getByRole('link', { name: '返回检测流程' }).click();
  await page.getByRole('button', { name: /偏光镜/ }).click();
  await expect(page.getByTestId('polariscope-scene')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await page.getByRole('switch', { name: '电源开关' }).click();
  await page.getByRole('slider', { name: '上偏光片角度' }).fill('90');
  await page.getByTestId('detection-place-sample').click();
  await page.getByTestId('detection-auto-rotate').click();
  await expect(page.getByTestId('polariscope-detection-3d')).toHaveAttribute('data-step', 'record', { timeout: 20_000 });
  await page.getByLabel('四明四暗（非均质体）').check();
  await page.getByRole('combobox', { name: '光性判断' }).selectOption('anisotropic');
  await page.getByTestId('detection-submit').click();
  await expect(page.getByRole('button', { name: '进入命名评估 →' })).toBeEnabled();
  await expect(page.getByText('已完成 2 / 3 项有效观察')).toBeVisible();
  const completed = await savedSession(page);
  expect(completed.instrumentsUsed).toEqual(['refractometer', 'spectroscope', 'polariscope']);
  expect(completed.spectroscope).toEqual(session.spectroscope);
  await page.getByRole('button', { name: '进入命名评估 →' }).click();
  await expect(page.getByRole('heading', { name: '请根据检测数据对样品进行命名' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /吸收光谱/ })).toBeDisabled();
});

for (const sample of [
  { id: 'prehnite', expected: '438 nm 弱吸收带（不单独作诊断）' },
  { id: 'pyrope', expected: '564 nm 中等吸收带' },
]) {
  test(`assessment reference preserves weaker features for ${sample.id}`, async ({ page }) => {
    await seed(page, {
      ...legacySession,
      sampleId: sample.id,
      assessment: { selectedSampleId: sample.id, evidence: 'ri', confidence: 70, hintUsed: false, attemptNumber: 1, score: 10, completedAt: 1_760_000_010_000 },
      assessmentAttemptCount: 1,
    }, '/assessment');
    await expect(page.getByRole('cell').filter({ hasText: sample.expected })).toBeVisible();
  });
}

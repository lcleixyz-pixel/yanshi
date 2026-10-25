import { expect, test, type Page } from "@playwright/test";

const labRoute = "/sim/spectroscope/lab";
const canvas = (page: Page) => page.getByTestId("spectroscope-bench-canvas");
const task = (page: Page) => page.getByTestId("sim-task");
const record = (page: Page) => page.getByTestId("sim-record");
const saved = (page: Page) => page.getByTestId("sim-record-saved");
const slider = (page: Page, name: string) => page.getByRole("slider", { name });

async function ready(page: Page, machine: "prism" | "grating" = "prism") {
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", machine);
}

async function learnReady(page: Page, machine: "prism" | "grating" = "prism") {
  const model = page.getByTestId("optics3d-canvas");
  await expect(model).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(model).toHaveAttribute("data-instrument", `${machine}-spectroscope`);
}

async function expectProgress(page: Page, count: number) {
  await expect(task(page).locator("header")).toContainText(`引导任务 · ${count} / 6`);
}

async function answer(page: Page, id: string, option: number) {
  const question = page.getByTestId(`question-${id}`);
  await question.getByRole("radio").nth(option).check();
  await question.getByRole("button", { name: "提交" }).click();
}

async function completeLight(page: Page) {
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await expect(task(page)).toContainText("记录：只见连续光谱（已完成）");
  await page.getByTestId("sim-bench-place").click();
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "true");
  await answer(page, "continuous", 1);
  await expectProgress(page, 1);
  await expect(task(page)).toContainText("调节狭缝与焦距");
}

async function completeTune(page: Page) {
  await slider(page, "狭缝宽度").fill("3.2");
  await expect(slider(page, "狭缝宽度")).toHaveValue("3.2");
  await slider(page, "目镜焦距").fill("5");
  await expect(page.getByTestId("sim-spectro-stage")).toHaveAttribute("data-problems", "");
  await answer(page, "slit", 1);
  await expectProgress(page, 2);
  await expect(task(page)).toContainText("标记吸收特征");
}

async function openRecord(page: Page) {
  await page.getByTestId("sim-spectro-record-open").click();
  await expect(record(page)).toBeVisible();
}

async function closeRecord(page: Page) {
  await page.getByTestId("sim-record-close").click();
  await expect(record(page)).toHaveCount(0);
}

async function addTeachingMarks(page: Page) {
  for (const wavelength of [694, 580, 476]) {
    await page.getByTestId("sim-record-line").fill(String(wavelength));
    await page.getByTestId("sim-record-add-line").click();
    await expect(page.getByTestId("sim-record-chips")).toContainText(`${wavelength} nm 线`);
  }
}

async function review(page: Page) {
  await page.getByTestId("sim-record-review").click();
  await expect(page.getByTestId("sim-record-confirm")).toBeVisible();
}

async function save(page: Page) {
  await page.getByTestId("sim-record-save").click();
  await expect(saved(page)).toHaveAttribute("data-stale", "false");
}

async function expectReferencesClosed(page: Page) {
  await expect(page.getByTestId("marks-feedback")).toHaveCount(0);
  await expect(page.getByTestId("sim-record-reference")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
});

test("在认识屏切换机型也使实验屏原记录过期，返回原机型不自动恢复对照资料", async ({ page }) => {
  await page.goto(`${labRoute}?sample=amethyst`);
  await ready(page);
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await expect(page.getByTestId("sim-spectro-stage")).toHaveAttribute("data-problems", "");
  await openRecord(page);
  await page.getByTestId("sim-record-no-absorption").check();
  await page.getByTestId("sim-record-notes").fill("实验屏原记录，应原文保留");
  await review(page);
  await save(page);
  const originalNotes = await saved(page).locator("p").first().innerText();
  await expect(page.getByTestId("sim-record-reference")).toBeVisible();
  await closeRecord(page);

  await page.getByTestId("sim-screen-learn").click();
  await learnReady(page);
  await page.getByTestId("sim-machine-grating").click();
  await learnReady(page, "grating");
  await page.getByTestId("sim-screen-lab").click();
  await ready(page, "grating");
  await openRecord(page);
  await expect(saved(page)).toHaveAttribute("data-stale", "true");
  await expect(saved(page).locator("p").first()).toHaveText(originalNotes);
  await expectReferencesClosed(page);
  await closeRecord(page);

  await page.getByTestId("sim-screen-learn").click();
  await learnReady(page, "grating");
  await page.getByTestId("sim-machine-prism").click();
  await learnReady(page);
  await page.getByTestId("sim-screen-lab").click();
  await ready(page);
  await openRecord(page);
  await expect(saved(page)).toHaveAttribute("data-stale", "true");
  await expect(saved(page).locator("p").first()).toHaveText(originalNotes);
  await expectReferencesClosed(page);
});

test("在实验屏切换机型也使挑战屏原记录过期，收回答案并保留原记录", async ({ page }) => {
  await page.goto("/sim/spectroscope/challenge");
  await ready(page);
  await page.getByTestId("sim-challenge-beginner").click();
  await expect(page.getByTestId("sim-spectro-idle")).toHaveCount(0);
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await slider(page, "狭缝宽度").fill("3.2");
  await slider(page, "目镜焦距").fill("5");
  await openRecord(page);
  await expect(page.getByTestId("sim-record-no-absorption")).toBeEnabled();
  await page.getByTestId("sim-record-no-absorption").check();
  await page.getByTestId("sim-record-notes").fill("挑战屏原记录，应原文保留");
  await review(page);
  await save(page);
  const originalNotes = await saved(page).locator("p").first().innerText();
  await expect(page.getByTestId("sim-record-reference")).toBeVisible();
  await closeRecord(page);
  await expect(page.getByTestId("sim-spectro-answer")).toBeVisible();

  await page.getByTestId("sim-screen-lab").click();
  await ready(page);
  await page.getByTestId("sim-machine-grating").click();
  await ready(page, "grating");
  await page.getByTestId("sim-screen-challenge").click();
  await ready(page, "grating");
  await expect(page.getByTestId("sim-challenge-beginner")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sim-spectro-answer")).toHaveCount(0);
  await openRecord(page);
  await expect(saved(page)).toHaveAttribute("data-stale", "true");
  await expect(saved(page).locator("p").first()).toHaveText(originalNotes);
  await expectReferencesClosed(page);
});

test("对光步骤：记录连续谱、夹样之后才出现问答，答对完成本步，立即全部重置仍保留 1 / 6", async ({ page }) => {
  await page.goto(`${labRoute}?mode=student`);
  await ready(page);
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await expect(task(page)).toContainText("记录：只见连续光谱（已完成）");
  // 先动手再回答：夹样之前不出题。
  await expect(page.getByTestId("question-continuous")).toHaveCount(0);
  await expectProgress(page, 0);
  await page.getByTestId("sim-bench-place").click();
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "true");
  await answer(page, "continuous", 1);
  await expectProgress(page, 1);
  await page.getByTestId("sim-reset").click();
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "false");
  await expectProgress(page, 1);
});

test("调节步骤：狭缝和焦距都调好之后才出现狭缝题，答对完成本步，立即全部重置仍保留 2 / 6", async ({ page }) => {
  await page.goto(`${labRoute}?mode=student`);
  await ready(page);
  await completeLight(page);
  await expect(page.getByTestId("question-slit")).toHaveCount(0);
  await slider(page, "狭缝宽度").fill("3.2");
  await expect(page.getByTestId("sim-spectro-stage")).toHaveAttribute("data-problems", "defocus");
  await expect(page.getByTestId("question-slit")).toHaveCount(0);
  await expectProgress(page, 1);
  await slider(page, "目镜焦距").fill("5");
  await expect(page.getByTestId("sim-spectro-stage")).toHaveAttribute("data-problems", "");
  await answer(page, "slit", 1);
  await expectProgress(page, 2);
  await page.getByTestId("sim-reset").click();
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "false");
  await expectProgress(page, 2);
});

test("认识屏重新开始任务后再选学员和点部件，不继承上一轮有效观察的完成证据", async ({ page }) => {
  await page.goto(`${labRoute}?mode=student`);
  await ready(page);
  await completeLight(page);
  await completeTune(page);
  await openRecord(page);
  await addTeachingMarks(page);
  await review(page);
  await save(page);
  await closeRecord(page);
  await expectProgress(page, 3);

  await page.getByTestId("sim-screen-learn").click();
  await learnReady(page);
  await expectProgress(page, 3);
  await page.getByTestId("sim-task-restart").click();
  await expect(page.getByTestId("sim-task-student")).toBeVisible();
  await page.getByTestId("sim-task-student").click();
  await expectProgress(page, 0);
  await page.getByTestId("sim-part-slitHousing").click();
  await expect(task(page)).toContainText("点选关键部件 1 / 5");
  await expectProgress(page, 0);
  await page.getByTestId("sim-screen-lab").click();
  await ready(page);
  await expectProgress(page, 0);
  await expect(page.getByTestId("sim-task-finish")).toHaveCount(0);
});

// 挑战身份不受「重新开始任务」影响已有专门回归：
// sim-spectroscope-challenge.spec.ts 的「重新开始任务不清掉抽样身份」。此处不重复抽样流程。

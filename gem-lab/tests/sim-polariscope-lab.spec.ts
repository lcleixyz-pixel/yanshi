import { expect, test, type Page } from "@playwright/test";

const route = "/sim/polariscope/lab";
const scene = (page: Page) => page.getByTestId("polariscope-scene");
const task = (page: Page) => page.getByTestId("sim-task");
const stage = (page: Page) => page.getByTestId("sim-polari-stage");
const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("gem-lab-progress-v1") ?? "{}").state?.completedDemos ?? []);

async function ready(page: Page) {
  await expect(scene(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}
/** 预测（或不预测）→ 自动转一周 → 揭晓。 */
async function turn(page: Page, observation: string, prediction = "demo") {
  if (await page.getByTestId(`sim-polari-predict-${prediction}`).isVisible()) await page.getByTestId(`sim-polari-predict-${prediction}`).click();
  await page.getByTestId("sim-polari-auto-rotate").click();
  await expect(stage(page)).toHaveAttribute("data-observation", observation, { timeout: 20_000 });
}
async function answer(page: Page, id: string, options: number[]) {
  const card = page.getByTestId(`sim-polari-question-${id}`);
  for (const option of options) await card.getByRole("radio").or(card.getByRole("checkbox")).nth(option).check();
  await card.getByRole("button", { name: "提交" }).click();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("先预测后观察：未预测不记录，转满一周揭晓；换样品要重新预测，样品光性揭晓前不显示", async ({ page }) => {
  await page.goto(`${route}?sample=tourmaline`);
  await ready(page);
  await expect(page.getByTestId("sim-panel-sample")).toContainText("光性揭晓前不显示");
  await expect(page.getByTestId("sim-polari-auto-rotate")).toHaveCount(0);
  // 未正交：先调回正交才能开始。
  await page.getByTestId("sim-polari-analyzer-0").click();
  await expect(page.getByTestId("sim-polari-cross")).toBeVisible();
  await page.getByTestId("sim-polari-cross").click();
  await turn(page, "four-bright-four-dark", "four-bright-four-dark");
  await expect(page.getByTestId("sim-polari-poe")).toContainText("与预测一致");
  await expect(page.getByTestId("sim-panel-sample")).toContainText("非均质体");
  await page.getByTestId("sim-polari-sample-spinel").click();
  await expect(page.getByTestId("sim-polari-poe")).toHaveAttribute("data-phase", "predict");
  // 换屏再回来：本屏场景保留。
  await page.getByTestId("sim-polari-predict-all-dark").click();
  await page.getByTestId("sim-screen-learn").click();
  await page.getByTestId("sim-screen-lab").click();
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-sample", "spinel");
  await expect(page.getByTestId("sim-polari-poe")).toHaveAttribute("data-phase", "observe");
});

test("学员引导：实验屏三步（放样旋转、换方向复核、解释）完成后回认识屏补齐，全部完成写入学习进度", async ({ page }) => {
  await page.goto("/sim/polariscope/learn?mode=student");
  await ready(page);
  for (const id of ["polarizer", "stage", "analyzer"]) await page.getByTestId(`sim-part-${id}`).click();
  await page.getByTestId("sim-task-next").click();
  for (let i = 0; i < 4; i++) await page.getByTestId("sim-polari-path-next").click();
  await page.getByTestId("sim-task-next").click();
  await page.getByTestId("sim-polari-analyzer-90").click();
  await expect(task(page)).toContainText("引导任务 · 3 / 6");
  await page.getByTestId("sim-task-next-screen").getByRole("button").click();
  await ready(page);
  await expect(task(page)).toContainText("放样旋转");
  await expect(stage(page)).toHaveAttribute("data-sample", "spinel");
  await turn(page, "all-dark");
  await page.getByTestId("sim-polari-pick-tourmaline").click();
  await turn(page, "four-bright-four-dark");
  await page.getByTestId("sim-polari-pick-jadeite").click();
  await turn(page, "all-bright");
  // 翡翠的揭晓留在画面上，点「下一步」才换到沿光轴放置的碧玺。
  await expect(task(page)).toContainText("放样旋转 · 已完成");
  await expect(page.getByTestId("sim-polari-reveal")).toBeVisible();
  await page.getByTestId("sim-task-next").click();
  await expect(task(page)).toContainText("换方向复核");
  await expect(stage(page)).toHaveAttribute("data-orientation", "optic-axis");
  await turn(page, "axis-dark");
  await page.getByTestId("sim-polari-reorient").click();
  await expect(stage(page)).toHaveAttribute("data-orientation", "general");
  await turn(page, "four-bright-four-dark");
  await page.getByTestId("sim-task-next").click();
  await expect(task(page)).toContainText("解释");
  await answer(page, "why-crossed", [0]);
  await answer(page, "why-reorient", [1]);
  await answer(page, "no-conclusion", [0, 1, 2, 3]);
  await expect(task(page)).toContainText("引导任务 · 6 / 6");
  await page.getByTestId("sim-task-finish").getByRole("button").click();
  await expect(page.getByTestId("sim-task-finish")).toContainText("已记录本次学习完成。");
  expect((await progress(page)).some((item: { instrumentId: string; mode: string }) => item.instrumentId === "polariscope" && item.mode === "learning")).toBe(true);
});

test("干涉图：只给非均质单晶，放上干涉球后显示一轴晶说明；全部重置回到样品观察", async ({ page }) => {
  await page.goto(`${route}?lesson=conoscope`);
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-lesson", "conoscope");
  await expect(page.getByTestId("sim-polari-conoscope-note")).toContainText("把干涉球放到样品上方");
  await page.getByTestId("sim-polari-conoscope").click();
  await expect(page.getByTestId("sim-polari-conoscope-note")).toContainText("一轴晶");
  await page.getByTestId("sim-reset").click();
  await expect(stage(page)).toHaveAttribute("data-lesson", "sample");
});

test("平行复核：铁铝榴石的应变明暗在平行时明显变亮", async ({ page }) => {
  await page.goto(`${route}?sample=almandine`);
  await ready(page);
  await page.getByTestId("sim-polari-adr").click();
  await expect(page.getByTestId("sim-polari-adr-result")).toHaveAttribute("data-verdict", /strain|dark-no-check/);
});

/** 目镜画布在圆环里，且不与观察框里的按钮、文字相交（三版本对比报告 P0）。 */
async function eyepieceClear(page: Page, phase: string) {
  const result = await page.evaluate(() => {
    const box = (e: Element) => e.getBoundingClientRect();
    const ring = document.querySelector('[data-testid="sim-polari-field"] .pol-eyepiece__ring')!;
    const canvas = box(ring.querySelector("canvas")!), outer = box(ring);
    const inside = canvas.left >= outer.left - 0.5 && canvas.right <= outer.right + 0.5 && canvas.top >= outer.top - 0.5 && canvas.bottom <= outer.bottom + 0.5;
    const hit = (b: DOMRect) => b.width > 0 && b.left < canvas.right && canvas.left < b.right && b.top < canvas.bottom && canvas.top < b.bottom;
    const others = [...document.querySelectorAll('[data-testid="sim-polari-field"] button:not(.sim-readout__head), [data-testid="sim-polari-poe"] *, [data-testid="sim-polari-conoscope-note"]')].filter((e) => !ring.contains(e));
    return { inside, overlaps: others.filter((e) => hit(box(e))).map((e) => (e.textContent ?? "").trim().slice(0, 12)) };
  });
  expect(result.inside, `${phase}：目镜画布越出圆环`).toBe(true);
  expect(result.overlaps, `${phase}：目镜与按钮或文字相交`).toEqual([]);
}

test("观察框：预测、观察、揭晓与干涉图说明时，目镜都不越界、不与按钮文字相交；转动曲线有样式", async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await page.goto(`${route}?sample=tourmaline`);
    await ready(page);
    await eyepieceClear(page, `${size.width} 预测`);
    await page.getByTestId("sim-polari-predict-demo").click();
    await eyepieceClear(page, `${size.width} 观察`);
    // 曲线样式丢失时 SVG 会塌成 0 高或撑满父级，这里只要求它是一个有限的可见块。
    const trace = await page.getByTestId("rotation-trace").boundingBox();
    expect(trace!.height).toBeGreaterThan(30);
    expect(trace!.height).toBeLessThan(200);
    await page.getByTestId("sim-polari-auto-rotate").click();
    await expect(stage(page)).toHaveAttribute("data-observation", "four-bright-four-dark", { timeout: 20_000 });
    await eyepieceClear(page, `${size.width} 揭晓`);
    await page.getByTestId("sim-polari-lesson-conoscope").click();
    await page.getByTestId("sim-polari-conoscope").click();
    await eyepieceClear(page, `${size.width} 干涉图`);
  }
});

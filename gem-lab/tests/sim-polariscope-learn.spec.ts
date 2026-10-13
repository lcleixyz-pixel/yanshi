import { expect, test, type Page } from "@playwright/test";

const route = "/sim/polariscope/learn";
const scene = (page: Page) => page.getByTestId("polariscope-scene");
const task = (page: Page) => page.getByTestId("sim-task");
const stage = (page: Page) => page.getByTestId("sim-polari-stage");

async function ready(page: Page) {
  await expect(scene(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("自由探索：部件名称默认不显示，勾选后显示短名称；点部件只在面板说明；偏振原理显示空载视场与透过率", async ({ page }) => {
  await page.goto(route);
  await ready(page);
  await expect(page.locator(".polariscope-hotspot:visible")).toHaveCount(0);
  await page.getByTestId("sim-check-names").check();
  await expect(page.locator(".polariscope-hotspot:visible").first()).toBeVisible();
  await expect(page.locator(".polariscope-hotspot", { hasText: "载物台" })).toBeVisible();
  await page.getByTestId("sim-part-stage").click();
  await expect(page.getByTestId("sim-part-note")).toContainText("可旋转载物台");
  await expect(page.getByTestId("sim-polari-field")).toHaveCount(0);
  await page.getByTestId("sim-polari-lesson-principle").click();
  await expect(stage(page)).toHaveAttribute("data-lesson", "principle");
  await expect(page.getByTestId("sim-polari-field")).toBeVisible();
  await page.getByTestId("sim-polari-analyzer-90").click();
  await expect(page.getByTestId("sim-polari-transmission")).toHaveAttribute("data-value", "0");
  await page.getByTestId("sim-polari-power").click();
  await expect(page.getByTestId("sim-polari-transmission")).toContainText("电源关闭");
  // 没选讲师 / 学员：自由探索不写任务进度。
  await expect(task(page)).toContainText("偏光镜基础课");
});

test("学员引导：认识部件、跟随光路、空载调正三步在本屏完成，换屏与全部重置都保留进度", async ({ page }) => {
  await page.goto(route);
  await ready(page);
  await page.getByTestId("sim-task-student").click();
  await expect(task(page)).toContainText("认识部件");
  // 认识部件一步：只给三个关键部件的名称标注，提示指向下一个要点的部件。
  await expect(page.getByTestId("scene-coach")).toHaveAttribute("data-part", "polarizer");
  for (const id of ["polarizer", "stage", "analyzer"]) await page.getByTestId(`sim-part-${id}`).click();
  // 做完一步先停在结果上，看「为什么」，点「下一步」再换场景。
  await expect(task(page)).toContainText("认识部件 · 已完成");
  await expect(page.getByTestId("sim-task-why")).toContainText("只有载物台和上偏光片能转动");
  await expect(stage(page)).toHaveAttribute("data-lesson", "components");
  await page.getByTestId("sim-task-next").click();
  await expect(task(page)).toContainText("跟随光路");
  await expect(stage(page)).toHaveAttribute("data-lesson", "path");
  for (let i = 0; i < 4; i++) await page.getByTestId("sim-polari-path-next").click();
  await page.getByTestId("sim-task-next").click();
  await expect(task(page)).toContainText("空载调正");
  await expect(stage(page)).toHaveAttribute("data-lesson", "principle");
  await expect(task(page)).toContainText("0° 平行：最亮（已完成）");
  await page.getByTestId("sim-polari-analyzer-90").click();
  await expect(task(page)).toContainText("引导任务 · 3 / 6");
  await expect(page.getByTestId("sim-task-why")).toContainText("正交时空载视场全暗");
  await expect(page.getByTestId("sim-task-next-screen")).toContainText("实验");
  // 换屏再回来：场景与进度都在，不重新套用开场场景。
  await page.getByTestId("sim-screen-lab").click();
  await page.getByTestId("sim-screen-learn").click();
  await ready(page);
  await expect(page.getByRole("slider", { name: "上偏光片角度" })).toHaveValue("90");
  await expect(task(page)).toContainText("引导任务 · 3 / 6");
  await page.getByTestId("sim-reset").click();
  await expect(stage(page)).toHaveAttribute("data-lesson", "components");
  await expect(task(page)).toContainText("引导任务 · 3 / 6");
});

test("深链：?lesson=path 直接打开跟随光路；?mode=student&step=crossed 直达空载调正", async ({ page }) => {
  await page.goto(`${route}?lesson=path`);
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-lesson", "path");
  await expect(page.getByTestId("sim-polari-path-note")).toContainText("底座内部光源");
  await page.goto(`${route}?mode=student&step=crossed`);
  await ready(page);
  await expect(task(page)).toContainText("空载调正");
  await expect(stage(page)).toHaveAttribute("data-lesson", "principle");
});

test("手机：任务卡在顶部，目镜视场贴底，两者不重叠", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${route}?lesson=principle`);
  await ready(page);
  await page.getByTestId("sim-task-open").click();
  const card = (await task(page).boundingBox())!;
  const field = (await page.getByTestId("sim-polari-field").boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(field.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

import { expect, test } from "@playwright/test";

const shell = (page: import("@playwright/test").Page) => page.getByTestId("sim-shell");

test.beforeEach(async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("仿真地址：未写屏幕时进入第一块屏幕，底部导航标出当前屏；不认识的仿真回首页", async ({ page }) => {
  await page.goto("/sim/spectroscope");
  await expect(page).toHaveURL(/\/sim\/spectroscope\/learn$/);
  await expect(shell(page)).toHaveAttribute("data-screen", "learn");
  await expect(page.getByTestId("sim-screen-learn")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "屏幕" }).getByRole("button")).toHaveCount(3);
  await page.goto("/sim/microscope/lab");
  await expect(page).toHaveURL(/\/sim\/microscope\/learn$/);
  await expect(page.getByRole("navigation", { name: "屏幕" }).getByRole("button")).toHaveCount(1);
  await page.goto("/sim/unknown/learn");
  await expect(page).toHaveURL(/\/$/);
});

test("换屏保留各屏场景与任务进度；全部重置只恢复当前屏；工具可拖入或点选后放置", async ({ page }) => {
  await page.goto("/sim/refractometer/learn");
  // 点选工具 → 点放置位（拖动替代）。
  await page.getByTestId("sim-tool-liquid").click();
  await expect(page.getByTestId("sim-toolbox")).toContainText("点操作区放置「接触液」");
  await page.getByTestId("sim-drop").click();
  await expect(page.getByTestId("sim-placed-liquid")).toBeVisible();
  await expect(page.getByTestId("sim-tool-liquid")).toBeDisabled();
  await page.getByTestId("sim-check-names").check();
  // 切到实验屏：URL 更新，实验屏是自己的初始场景。
  await page.getByTestId("sim-screen-lab").click();
  await expect(page).toHaveURL(/\/sim\/refractometer\/lab$/);
  await expect(page.getByTestId("sim-placed-liquid")).toHaveCount(0);
  await expect(page.getByTestId("sim-check-names")).not.toBeChecked();
  await page.getByTestId("sim-tool-sample").dragTo(page.getByTestId("sim-drop"));
  await expect(page.getByTestId("sim-placed-sample")).toBeVisible();
  await expect(page.getByTestId("sim-task")).toContainText("引导任务 · 3 / 3");
  // 回到认识屏：场景还在。
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("sim-placed-liquid")).toBeVisible();
  await expect(page.getByTestId("sim-check-names")).toBeChecked();
  // 全部重置只恢复认识屏；任务进度与实验屏不受影响。
  await page.getByTestId("sim-reset").click();
  await expect(page.getByTestId("sim-placed-liquid")).toHaveCount(0);
  await expect(page.getByTestId("sim-check-names")).not.toBeChecked();
  await expect(page.getByTestId("sim-task")).toContainText("引导任务 · 3 / 3");
  await page.getByTestId("sim-screen-lab").click();
  await expect(page.getByTestId("sim-placed-sample")).toBeVisible();
});

test("收起任务卡只隐藏、进度保留；重新开始任务只清任务，场景不动", async ({ page }) => {
  await page.goto("/sim/refractometer/learn");
  await page.getByTestId("sim-tool-liquid").click();
  await page.getByTestId("sim-drop").click();
  await expect(page.getByTestId("sim-task")).toContainText("1 / 3");
  await page.getByTestId("sim-task-close").click();
  await expect(page.getByTestId("sim-task")).toHaveCount(0);
  await expect(page.getByTestId("sim-task-open")).toContainText("引导任务 1 / 3");
  await page.getByTestId("sim-task-open").click();
  await page.getByTestId("sim-task-restart").click();
  await expect(page.getByTestId("sim-task")).toContainText("0 / 3");
  await expect(page.getByTestId("sim-placed-liquid")).toBeVisible();
});

test("各仿真主色随仪器；未迁入的屏幕指向现有页面", async ({ page }) => {
  const accent = () => shell(page).evaluate((el) => getComputedStyle(el).getPropertyValue("--iu-accent-strong").trim());
  await page.goto("/sim/refractometer/lab");
  expect(await accent()).toBe("#b45309");
  await expect(page.getByTestId("sim-placeholder").getByRole("link", { name: "2D 全样品读数" })).toHaveAttribute("href", "/demo/refractometer");
  await page.goto("/sim/spectroscope/lab");
  expect(await accent()).toBe("#0369a1");
  await expect(page.getByTestId("sim-placeholder").getByRole("link", { name: "照明与夹样练习" })).toHaveAttribute("href", "/explore/spectroscope-bench");
  await page.goto("/sim/polariscope/learn");
  expect(await accent()).toBe("#6d28d9");
  // 外壳按钮的字号不被全站按钮样式覆盖（橙色重置钮图标清晰可见）。
  expect(await page.getByTestId("sim-reset").evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
});

test("手机：控制面板收为底部抽屉，任务卡展开为底部抽屉，底栏与首页始终可用，无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sim/spectroscope/lab");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("sim-panel-display")).toBeHidden();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.getByTestId("sim-panel-display")).toBeVisible();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.getByTestId("sim-panel-display")).toBeHidden();
  // 手机上任务卡默认收起为顶部一行，点开为贴底抽屉。
  await expect(page.getByTestId("sim-task")).toHaveCount(0);
  await page.getByTestId("sim-task-open").click();
  const task = await page.getByTestId("sim-task").boundingBox();
  const play = await page.getByTestId("sim-play").boundingBox();
  expect(Math.abs(task!.y + task!.height - (play!.y + play!.height))).toBeLessThanOrEqual(2);
  // 任务抽屉打开时仍能打开控制抽屉，两者不叠放。
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.getByTestId("sim-task")).toBeHidden();
  await expect(page.getByTestId("sim-panel-display")).toBeVisible();
  await page.getByTestId("sim-controls-toggle").click();
  await page.getByTestId("sim-task-close").click();
  await expect(page.getByTestId("sim-task-open")).toBeVisible();
  await expect(page.getByTestId("sim-screen-challenge")).toBeVisible();
  await expect(page.getByTestId("sim-home")).toBeVisible();
});

test("阶段 1 不改旧入口：原有页面照常打开，不被重定向", async ({ page }) => {
  for (const path of ["/explore/spectroscope-bench", "/explore/optics/refractometer", "/explore/polariscope", "/demo/spectroscope"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path.replace(/[/?]/g, (c) => `\\${c}`)));
    await expect(page.getByTestId("sim-shell")).toHaveCount(0);
  }
});

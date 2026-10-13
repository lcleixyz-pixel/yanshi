import { expect, test, type Page } from "@playwright/test";

/** 第一次请求模型时中断，之后放行：用来检查「重新载入」是原地重试、不刷新整页。 */
async function failFirstModelLoad(page: Page, pattern: string) {
  let failed = false;
  await page.route(pattern, (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.abort();
  });
}
const markPage = (page: Page) => page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
const stillSamePage = (page: Page) => page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true);

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("工作台练习页模型载入失败后原地重新载入，不刷新整页（旧地址转到实验屏）", async ({ page }) => {
  await failFirstModelLoad(page, "**/spectroscope-workbench/simple-v2/model.glb**");
  await page.goto("/explore/spectroscope-bench");
  await expect(page).toHaveURL(/\/sim\/spectroscope\/lab$/);
  await expect(page.getByTestId("sim-spectro-retry")).toBeVisible({ timeout: 60_000 });
  await markPage(page);
  await page.getByTestId("sim-spectro-retry").click();
  await expect(page.getByTestId("spectroscope-bench-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  expect(await stillSamePage(page)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("各仪器页使用共用设计变量与仪器主色；课程入口讲师演示为主要按钮", async ({ page }) => {
  const accent = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).getPropertyValue("--iu-accent-strong").trim());
  // 折射仪已迁入仿真：知识库入口落到认识屏，主色仍取折射仪的 #b45309。
  await page.goto("/explore/optics/refractometer");
  await expect(page).toHaveURL(/\/sim\/refractometer\/learn$/);
  expect(await accent('[data-testid="sim-shell"]')).toBe("#b45309");
  await expect(page.getByRole("button", { name: "讲师演示", exact: true })).toHaveClass(/iu-button--primary/);
  // 分光镜已迁入仿真：旧地址转到新外壳，主色仍取分光镜的 #0369a1。
  await page.goto("/explore/optics/grating-spectroscope");
  await expect(page).toHaveURL(/\/sim\/spectroscope\/learn\?machine=grating$/);
  expect(await accent('[data-testid="sim-shell"]')).toBe("#0369a1");
  await page.goto("/explore/spectroscope-bench");
  expect(await accent('[data-testid="sim-shell"]')).toBe("#0369a1");
});

test("手机上实验屏按手机布局显示，操作区与面板都在一屏内", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sim/spectroscope/lab?sample=ruby");
  await expect(page.getByTestId("spectroscope-bench-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content"))).toContain("width=device-width");
  await expect(page.getByTestId("sim-spectro-field")).toBeVisible();
  // 手机上控制面板默认收起为底部抽屉（内含光源开关）。
  await expect(page.getByTestId("sim-panel-light")).toBeHidden();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.getByTestId("sim-panel-light")).toBeVisible();
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await expect(page.getByTestId("sim-spectro-status")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("三维查看器遵守减少动效；视图按钮标出当前视图", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sim/refractometer/learn");
  const canvas = page.getByTestId("optics3d-canvas");
  await expect(canvas).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(canvas).toHaveAttribute("data-reduced-motion", "true");
  await expect(page.getByRole("button", { name: "整机结构", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "内部光路", exact: true }).click();
  await expect(page.getByRole("button", { name: "内部光路", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/sim/spectroscope/lab");
  await expect(page.getByTestId("spectroscope-bench-canvas")).toHaveAttribute("data-reduced-motion", "true", { timeout: 60_000 });
});

test("手机上三维场景默认流畅画质", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sim/spectroscope/lab");
  await expect(page.getByTestId("spectroscope-bench-canvas")).toHaveAttribute("data-quality", "smooth", { timeout: 60_000 });
  await page.goto("/sim/refractometer/learn");
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-quality", "smooth", { timeout: 60_000 });
});

test("认识屏显示部件短名称标签：勾选后出现、与部件目录一致、可关闭", async ({ page }) => {
  await page.goto("/sim/refractometer/learn");
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  // 默认不显示名称（阶段 0 已确认：短标签默认关闭，取代满屏编号）。
  await expect(page.locator(".opt-hotspot")).toHaveCount(0);
  await page.getByTestId("sim-check-names").check();
  const labels = await page.locator("[data-named='true']").allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);
  const parts = page.locator(".sim-parts button");
  await expect(parts.filter({ hasText: labels[0] })).toHaveCount(1);
  await page.getByTestId("sim-check-names").uncheck();
  await expect(page.locator(".opt-hotspot")).toHaveCount(0);
});

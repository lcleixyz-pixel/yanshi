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

test("自由探索页模型载入失败后原地重新载入，不刷新整页", async ({ page }) => {
  await failFirstModelLoad(page, "**/refractometer/paper-optics-v2/model.glb**");
  await page.goto("/explore/optics/refractometer");
  await expect(page.getByRole("alert")).toContainText("三维模型载入失败");
  await markPage(page);
  await page.getByTestId("optics-retry").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  expect(await stillSamePage(page)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("工作台练习页模型载入失败后原地重新载入，不刷新整页", async ({ page }) => {
  await failFirstModelLoad(page, "**/spectroscope-workbench/simple-v2/model.glb**");
  await page.goto("/explore/spectroscope-bench");
  await expect(page.getByTestId("bench-retry")).toBeVisible({ timeout: 60_000 });
  await markPage(page);
  await page.getByTestId("bench-retry").click();
  await expect(page.getByTestId("spectroscope-bench-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  expect(await stillSamePage(page)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("各仪器页使用共用设计变量与仪器主色；课程入口讲师演示为主要按钮", async ({ page }) => {
  const accent = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).getPropertyValue("--iu-accent-strong").trim());
  await page.goto("/explore/optics/refractometer");
  expect(await accent('[data-testid="optics-explore-page"]')).toBe("#b45309");
  await expect(page.getByRole("button", { name: "讲师演示", exact: true })).toHaveClass(/iu-button--primary/);
  await page.goto("/explore/optics/grating-spectroscope");
  expect(await accent('[data-testid="optics-explore-page"]')).toBe("#0369a1");
  await page.goto("/explore/spectroscope-bench");
  expect(await accent('[data-testid="spectroscope-practice-3d"]')).toBe("#0369a1");
  await page.goto("/explore/optics/refractometer?course=basic&mode=student");
  expect(await accent('[data-testid="refractometer-course"]')).toBe("#b45309");
});

test("手机上工作台练习页按手机布局显示，三维区吸附顶部并叠小光谱", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore/spectroscope-bench?sample=ruby");
  await expect(page.getByTestId("spectroscope-bench-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content"))).toContain("width=device-width");
  await page.getByRole("switch", { name: "光源电源" }).click();
  await page.getByTestId("bench-place-sample").click();
  const slit = page.getByRole("slider", { name: "狭缝宽度", exact: true });
  await slit.scrollIntoViewIfNeeded();
  await slit.fill("0.6");
  await expect(page.getByTestId("bench-mini-spectrum")).toBeInViewport();
  expect(Math.abs((await page.locator(".sb-viewport-card").boundingBox())!.y)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("课程模型载入失败后原地重新载入，进度与地址保留", async ({ page }) => {
  await failFirstModelLoad(page, "**/refractometer/paper-optics-v2/model.glb**");
  await page.goto("/explore/optics/refractometer?course=basic&mode=student");
  await expect(page.getByRole("alert")).toContainText("模型载入失败");
  await markPage(page);
  await page.getByTestId("course-retry").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  expect(await stillSamePage(page)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByTestId("refractometer-course")).toHaveAttribute("data-mode", "student");
});

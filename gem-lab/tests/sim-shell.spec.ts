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

test("各仿真主色随仪器", async ({ page }) => {
  const accent = () => shell(page).evaluate((el) => getComputedStyle(el).getPropertyValue("--iu-accent-strong").trim());
  await page.goto("/sim/refractometer/lab");
  expect(await accent()).toBe("#b45309");
  await page.goto("/sim/spectroscope/learn");
  expect(await accent()).toBe("#0369a1");
  await page.goto("/sim/polariscope/challenge");
  expect(await accent()).toBe("#6d28d9");
  // 外壳按钮的字号不被全站按钮样式覆盖（橙色重置钮图标清晰可见）。
  expect(await page.getByTestId("sim-reset").evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
});

test("手机：控制面板收为底部抽屉，底栏与首页始终可用，无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sim/microscope/learn");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("sim-panel-display")).toBeHidden();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.getByTestId("sim-panel-display")).toBeVisible();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.getByTestId("sim-panel-display")).toBeHidden();
  await expect(page.getByTestId("sim-screen-learn")).toBeVisible();
  await expect(page.getByTestId("sim-home")).toBeVisible();
});
test("四台仪器的旧入口都重定向到仿真，2D 演示照常打开", async ({ page }) => {
  // 已迁完的仪器：旧地址转到新屏（保留参数）。
  for (const [from, target] of [
    ["/explore/optics/prism-spectroscope", /\/sim\/spectroscope\/learn\?machine=prism$/],
    ["/explore/optics/prism-spectroscope?course=basic&mode=student&step=tune", /\/sim\/spectroscope\/lab\?machine=prism&mode=student&step=tune$/],
    ["/explore/optics/grating-spectroscope?course=basic&mode=student", /\/sim\/spectroscope\/learn\?machine=grating&mode=student$/],
    ["/explore/spectroscope-bench?sample=ruby&method=internal-reflection", /\/sim\/spectroscope\/lab\?sample=ruby&method=internal-reflection$/],
    ["/explore/optics/refractometer", /\/sim\/refractometer\/learn$/],
    ["/explore/optics/refractometer?course=basic&mode=student&step=observe", /\/sim\/refractometer\/lab\?mode=student&step=observe$/],
    ["/explore/optics/refractometer?sample=ruby", /\/sim\/refractometer\/lab\?sample=ruby$/],
    // 尾斜杠也是同一个地址，不能漏到旧页面。
    ["/explore/spectroscope-bench/", /\/sim\/spectroscope\/lab$/],
    ["/explore/optics/prism-spectroscope/", /\/sim\/spectroscope\/learn\?machine=prism$/],
    ["/explore/optics/refractometer/", /\/sim\/refractometer\/learn$/],
    ["/explore/polariscope", /\/sim\/polariscope\/learn$/],
    ["/explore/polariscope?lesson=sample", /\/sim\/polariscope\/lab\?lesson=sample$/],
    ["/explore/microscope", /\/sim\/microscope\/learn$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(target);
    await expect(page.getByTestId("sim-shell")).toHaveCount(1);
  }
  // 2D 演示：原页面照常，不被重定向（设备较旧时使用）。
  for (const path of ["/demo/polariscope", "/demo/refractometer", "/demo/spectroscope"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path.replace(/[/?]/g, (c) => `\\${c}`)));
    await expect(page.getByTestId("sim-shell")).toHaveCount(0);
  }
});

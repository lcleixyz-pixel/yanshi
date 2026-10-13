import { expect, test, type Page } from "@playwright/test";

const route = "/sim/polariscope/challenge";
const bench = (page: Page) => page.getByTestId("polariscope-detection-3d");

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("挑战屏：抽样前不能放样；抽到未知样品后按五步完成，保存前不露品种名，保存后揭示答案；不写检测记录", async ({ page }) => {
  await page.goto(route);
  await expect(page.getByTestId("polariscope-scene")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await page.getByRole("switch", { name: "电源开关" }).click();
  await page.getByRole("slider", { name: "上偏光片角度" }).fill("90");
  await expect(page.getByTestId("detection-place-sample")).toBeDisabled();
  await page.getByTestId("sim-challenge-beginner").click();
  // 抽样会换一个新场景：从头开电源、调正交。
  await expect(bench(page)).toHaveAttribute("data-step", "power");
  await page.getByRole("switch", { name: "电源开关" }).click();
  await page.getByRole("slider", { name: "上偏光片角度" }).fill("90");
  await page.getByTestId("detection-place-sample").click();
  await expect(bench(page)).toHaveAttribute("data-step", "rotate");
  await expect(page.getByTestId("eyepiece-view")).toContainText("未知样品");
  await page.getByTestId("detection-auto-rotate").click();
  await expect(bench(page)).toHaveAttribute("data-step", "record", { timeout: 20_000 });
  await expect(page.getByTestId("sim-challenge-answer")).toHaveCount(0);
  await page.getByLabel("转动 360° 全暗（均质体）").check();
  await page.getByRole("combobox", { name: "光性判断" }).selectOption("isotropic");
  await page.getByTestId("detection-submit").click();
  await expect(page.getByTestId("sim-challenge-answer")).toBeVisible();
  await expect(page.getByTestId("detection-submit")).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("gem-lab-detection-v1") ?? "{}").state?.polariscope ?? null)).toBeNull();
  // 全部重置：同一颗样品回到起点，旧记录标为过期。
  await page.getByTestId("sim-reset").click();
  await expect(bench(page)).toHaveAttribute("data-step", "power");
  await expect(page.getByTestId("sim-challenge-answer")).toHaveCount(0);
});

test("检测流程：偏光镜一步改用仿真外壳的挑战台，不显示底部屏幕导航", async ({ page }) => {
  await page.goto("/detection");
  await page.getByTestId("difficulty-beginner").click();
  await page.getByRole("button", { name: "🎲 抽取样品" }).click();
  await page.getByRole("button", { name: /偏光镜/ }).click();
  await expect(bench(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sim-shell")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "屏幕" })).toHaveCount(0);
  await expect(page.getByTestId("sim-polari-back")).toHaveAttribute("href", "/detection");
});

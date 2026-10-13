import { expect, test, type Page } from "@playwright/test";

/**
 * 折射仪迁入仿真后的入口、进度与资源生命周期（阶段 3a）。
 * 课程步骤、完成条件与学习记录规则的三屏行为见 `sim-refractometer.spec.ts`。
 * 旧课程页与旧自由探索页已重定向，旧组件不再可达，相关用例随之作废。
 */

const LEARN = "/sim/refractometer/learn";
const LAB = "/sim/refractometer/lab";
const canvas = (page: Page) => page.getByTestId("optics3d-canvas");

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("知识库以 3D 读数课为主线，地址可直接打开学员或讲师课程", async ({ page }) => {
  await page.goto("/knowledge/refractometer");
  await expect(page.getByTestId("knowledge-start-course")).toHaveAttribute("href", `${LEARN}?mode=student`);
  await expect(page.getByTestId("knowledge-teacher-course")).toHaveAttribute("href", `${LEARN}?mode=teacher`);
  await expect(page.getByTestId("knowledge-cta-learning")).toHaveAttribute("href", `${LEARN}?mode=student`);
  await expect(page.getByTestId("knowledge-classic-demo")).toHaveAttribute("href", "/demo/refractometer");
  await expect(page.getByTestId("method-practice-facet").getByRole("link")).toHaveAttribute("href", `${LEARN}?mode=student`);
  // 直接打开学员课程：任务卡已选学员身份，并停在第一步。
  await page.goto(`${LEARN}?mode=student`);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(page.getByTestId("sim-task")).toContainText("认识部件");
  await page.goto(`${LAB}?mode=teacher&step=observe`);
  await expect(page.getByTestId("sim-task")).toContainText("第一次读数");
});

test("自由探索与未完成课程不访问学习存储；重复进入不累积 canvas", async ({ page }) => {
  const audits: { method: string; key: string }[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __refStorage: { method: string; key: string }[] }).__refStorage = [];
    for (const method of ["getItem", "setItem"] as const) {
      const original = Storage.prototype[method] as (...args: string[]) => unknown;
      Object.defineProperty(Storage.prototype, method, {
        value: function (key: string, ...args: string[]) {
          (window as unknown as { __refStorage: { method: string; key: string }[] }).__refStorage.push({ method, key });
          return original.apply(this, [key, ...args] as [string, string]);
        },
      });
    }
  });
  for (let i = 0; i < 2; i++) {
    await page.goto(LEARN);
    await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByTestId("sim-screen-lab").click();
    await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByTestId("sim-screen-learn").click();
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  audits.push(...(await page.evaluate(() => (window as unknown as { __refStorage: { method: string; key: string }[] }).__refStorage)));
  expect(audits.filter((x) => x.key === "gem-lab-progress-v1")).toEqual([]);
});

test("进度页按仪器显示学习完成，并指向下一台未学完的仪器", async ({ page }) => {
  await page.goto("/progress");
  await page.evaluate(() => localStorage.setItem("gem-lab-progress-v1", JSON.stringify({
    state: { completedDemos: [{ instrumentId: "refractometer", mode: "learning", completedAt: 1 }], visitedKnowledgeBases: ["refractometer"] },
    version: 2,
  })));
  await page.reload();
  await expect(page.getByTestId("progress-instrument-refractometer")).toHaveAttribute("data-learned", "true");
  await expect(page.getByTestId("progress-instrument-polariscope")).toHaveAttribute("data-learned", "false");
  await expect(page.getByTestId("progress-next-instrument")).toHaveAttribute("href", "/knowledge/polariscope");
});

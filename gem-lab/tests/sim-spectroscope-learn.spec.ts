import { expect, test, type Page } from "@playwright/test";

/** 原理计算卡默认收起；要用里面的示例下拉框或读数时先展开。 */
const openCase = async (page: Page, id: string) => {
  const card = page.getByTestId(id);
  if ((await card.getAttribute("data-open")) === "false") await card.locator(".sim-readout__head").click();
};

const route = "/sim/spectroscope/learn";
const canvas = (page: Page) => page.getByTestId("optics3d-canvas");
const task = (page: Page) => page.getByTestId("sim-task");
const note = (page: Page) => page.getByTestId("sim-part-note");
const hotspot = (page: Page, id: string) => page.getByTestId(`hotspot-${id}`);
const state = async (page: Page) => JSON.parse((await canvas(page).getAttribute("data-state")) ?? "{}");

/** 等模型与光路就绪（棱镜式 / 光栅式切换后重新载入）。 */
async function ready(page: Page, instrument = "prism-spectroscope") {
  await expect(canvas(page)).toHaveAttribute("data-instrument", instrument, { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("认识屏：先选讲师演示 / 学员自学，再进入本步清单", async ({ page }) => {
  await page.goto(route);
  await ready(page);
  await expect(task(page)).toContainText("分光镜基础观察课");
  await expect(page.getByTestId("sim-machine-prism")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sim-task-student").click();
  await expect(task(page)).toContainText("认识部件");
  await expect(task(page)).toContainText("点选关键部件 0 / 5");
});

test("部件名称默认不显示；勾选后显示短名称；讲师演示下点热点只高亮并说明", async ({ page }) => {
  await page.goto(`${route}?mode=teacher`);
  await ready(page);
  // 讲师演示不显示指引，也不显示名称：模型上没有热点标签。
  await expect(page.locator(".opt-hotspot")).toHaveCount(0);
  await page.getByTestId("sim-check-names").check();
  await expect(hotspot(page, "slitHousing")).toHaveText("狭缝");
  await expect(hotspot(page, "prismTrain")).toHaveText("棱镜组");
  await expect(hotspot(page, "focusTube")).toHaveText("目镜套筒");
  await expect(page.locator(".opt-hotspot[data-named='true']")).toHaveCount(5);
  // 点热点只高亮：视图不切换、只有这一个部件处于选中态，面板说明取自课程文案。
  await hotspot(page, "slitHousing").click();
  await expect(page.locator(".opt-hotspot[data-selected='true']")).toHaveCount(1);
  expect((await state(page)).view).toBe("whole");
  expect((await state(page)).selectedId).toBe("slitHousing");
  await expect(note(page)).toContainText("光从狭缝进入");
  await hotspot(page, "collimator").click();
  await expect(page.locator(".opt-hotspot[data-selected='true']")).toHaveCount(1);
  expect((await state(page)).selectedId).toBe("collimator");
  await expect(note(page)).toContainText("教学示意");
  // 关掉名称：热点一起收起。
  await page.getByTestId("sim-check-names").uncheck();
  await expect(page.locator(".opt-hotspot")).toHaveCount(0);
});

test("学员做「认识部件」：显示短名称与「点这里」，点过的部件打勾并推进清单", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  await expect(page.getByTestId("optics-coach")).toHaveText("点这里：狭缝");
  await hotspot(page, "slitHousing").click();
  await expect(hotspot(page, "slitHousing")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("optics-coach")).toHaveText("点这里：狭缝环");
  await expect(task(page)).toContainText("点选关键部件 1 / 5");
  // 面板列表点部件与热点走同一条路。
  await page.getByTestId("sim-part-prismTrain").click();
  await expect(task(page)).toContainText("点选关键部件 2 / 5");
  await expect(page.getByTestId("sim-part-prismTrain")).toHaveAttribute("aria-pressed", "true");
});

test("光路示例：切换示例改读数与图例，关掉「显示数值」只隐藏数值行", async ({ page }) => {
  await page.goto(`${route}?mode=teacher`);
  await ready(page);
  // 原理计算卡默认收起，展开后才看读数。
  await expect(page.getByTestId("sim-spectro-case")).toHaveAttribute("data-open", "false");
  await openCase(page, "sim-spectro-case");
  const readout = page.getByTestId("sim-spectro-readout");
  const first = () => readout.locator("dd").first().textContent();
  await expect(readout).toBeVisible();
  await expect(page.getByTestId("sim-spectro-condition")).not.toBeEmpty();
  const white = await first();
  await openCase(page, "sim-spectro-case");
  await page.getByTestId("sim-spectro-case-select").selectOption("wavelength-550");
  await expect(page.getByTestId("sim-spectro-case")).toContainText("550 nm");
  await expect(page.getByTestId("sim-spectro-case")).toContainText("单色光");
  expect(await first()).not.toBe(white);
  // 白光示例列出各波长，单色光只有一条：图例随之只剩一项。
  await expect(page.locator(".sim-legend span")).toHaveCount(1);
  await page.getByTestId("sim-check-values").uncheck();
  await expect(readout).toHaveCount(0);
  await page.getByTestId("sim-check-rays").uncheck();
  expect(await canvas(page).getAttribute("data-display-paths")).toBe("[]");
});

test("视图：内部光路与整机结构互切，完整视野可复位", async ({ page }) => {
  await page.goto(`${route}?mode=teacher`);
  await ready(page);
  await expect(canvas(page)).toHaveAttribute("data-display-paths", /prism-550-after-dispersion/);
  await page.getByTestId("sim-panel-view").getByRole("button", { name: "内部光路" }).click();
  await expect.poll(async () => (await state(page)).view).toBe("optics");
  await page.getByTestId("sim-panel-view").getByRole("button", { name: "整机结构" }).click();
  await expect.poll(async () => (await state(page)).view).toBe("whole");
  await page.getByTestId("sim-panel-view").getByRole("button", { name: "完整视野" }).click();
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true");
});

test("机型三屏共用：切到光栅式换模型与部件，两个机型的进度各自保留", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  await hotspot(page, "slitHousing").click();
  await hotspot(page, "collimator").click();
  await expect(task(page)).toContainText("点选关键部件 2 / 5");
  // 光栅式：另一套模型、另一组部件，进度从零开始。
  await page.getByTestId("sim-machine-grating").click();
  await ready(page, "grating-spectroscope");
  await expect(page.getByTestId("sim-machine-grating")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".opt-hotspot")).toHaveCount(4);
  await expect(hotspot(page, "grating")).toHaveText("光栅");
  await expect(task(page)).toContainText("点选关键部件 0 / 4");
  await hotspot(page, "grating").click();
  await expect(task(page)).toContainText("点选关键部件 1 / 4");
  // 切回棱镜式：之前的两个部件仍在。
  await page.getByTestId("sim-machine-prism").click();
  await ready(page);
  await expect(task(page)).toContainText("点选关键部件 2 / 5");
  await expect(hotspot(page, "slitHousing")).toHaveAttribute("data-done", "true");
});

test("换屏与全部重置：认识屏的场景各屏独立，重置不动任务进度", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  await page.getByTestId("sim-check-names").check();
  await hotspot(page, "slitHousing").click();
  await page.getByTestId("sim-screen-learn").click();
  await expect(page).toHaveURL(/\/sim\/spectroscope\/learn$/);
  await expect(page.getByTestId("sim-check-names")).toBeChecked();
  await page.getByTestId("sim-reset").click();
  await expect(page.getByTestId("sim-check-names")).not.toBeChecked();
  // 重置只恢复当前屏场景；已点过的部件（任务进度）不丢。
  await expect(task(page)).toContainText("点选关键部件 1 / 5");
});

test("自由探索不会被当成学员课：点部件、看光路都还留在身份选择前", async ({ page }) => {
  await page.goto(route);
  await ready(page);
  await expect(page.getByTestId("sim-task-student")).toBeVisible();
  await page.getByTestId("sim-part-slitHousing").click();
  await openCase(page, "sim-spectro-case");
  await page.getByTestId("sim-spectro-case-select").selectOption("wavelength-550");
  // 身份没选，就不进入引导任务：选择仍在，任务卡不出现步骤清单。
  await expect(page.getByTestId("sim-task-student")).toBeVisible();
  await expect(page.getByTestId("sim-task")).not.toContainText("点选关键部件");
  // 实验屏也照旧是自由练习（样品可选、观察方式可换）。
  await page.getByTestId("sim-screen-lab").click();
  await expect(page.getByTestId("sim-sample-select")).toBeVisible();
  await expect(page.getByTestId("sim-method-surface-reflection")).toBeEnabled();
});

test("窄屏：认识屏无横向溢出，控制面板与任务卡收为抽屉且不叠放", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${route}?mode=student`);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("sim-panel-parts")).toBeHidden();
  // 任务卡默认收起为一行，展开为贴底抽屉；此时打开控制抽屉，任务抽屉让开。
  await page.getByTestId("sim-task-open").click();
  await expect(task(page)).toBeVisible();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(task(page)).toBeHidden();
  await expect(page.getByTestId("sim-panel-parts")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("学员引导：顶部步骤条；跟随光路在任务卡里切示例并切到内部光路，原理计算卡不必展开；名称标签互不重叠", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  await expect(page.getByTestId("sim-stepbar").locator("li")).toHaveCount(6);
  await expect(page.getByTestId("sim-spectro-case")).toHaveAttribute("data-open", "false");
  // 名称标签（学员认识部件时显示）两两不相交。
  const boxes = await page.locator("[data-named='true']:visible").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  expect(boxes.length).toBeGreaterThan(1);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    expect(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3], `标签 ${i} 与 ${j} 重叠`).toBe(false);
  }
  // 点一个等一次，避免连点丢状态（同实验屏用例）。
  for (const [index, id] of ["slitHousing", "slitControl", "collimator", "prismTrain"].entries()) {
    await page.getByTestId(`sim-part-${id}`).click();
    await expect(task(page)).toContainText(`点选关键部件 ${index + 1} / 5`);
  }
  await page.getByTestId("sim-part-focusTube").click();
  await expect(task(page)).toContainText("查看光路 0 / 4");
  for (const [index, id] of ["white-light", "wavelength-400", "wavelength-550", "wavelength-700"].entries()) {
    await page.getByTestId(`sim-spectro-path-${id}`).click();
    await expect(task(page)).toContainText(`查看光路 ${index + 1} / 4`);
  }
  await expect(page.getByRole("button", { name: "内部光路" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sim-spectro-case")).toHaveAttribute("data-open", "false");
});

import { expect, test, type Page } from "@playwright/test";

const route = "/sim/spectroscope/lab";
const canvas = (page: Page) => page.getByTestId("spectroscope-bench-canvas");
const stage = (page: Page) => page.getByTestId("sim-spectro-stage");
const task = (page: Page) => page.getByTestId("sim-task");
const record = (page: Page) => page.getByTestId("sim-record");
const slider = (page: Page, name: string) => page.getByRole("slider", { name });
const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("gem-lab-progress-v1") ?? "{}").state?.completedDemos ?? []);

async function ready(page: Page) {
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
}
/** 点光谱条标记一条吸收线（棱镜式刻度：x = 1 - sqrt((wl - 400) / 300)）。 */
async function mark(page: Page, wavelength: number) {
  const strip = page.getByTestId("spectroscope-spectrum-visual");
  const box = (await strip.boundingBox())!;
  await strip.click({ position: { x: box.width * (1 - Math.sqrt((wavelength - 400) / 300)), y: box.height / 2 } });
}
const openRecord = (page: Page) => page.getByTestId("sim-spectro-record-open").click();
const answer = async (page: Page, id: string, option: number) => {
  const q = page.getByTestId(`question-${id}`);
  await q.getByRole("radio").nth(option).check();
  await q.getByRole("button", { name: "提交" }).click();
};

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("自由练习：摆好光路、标记吸收特征、记录并保存后才开放对照资料，改条件后旧记录过期", async ({ page }) => {
  await page.goto(route);
  await ready(page);
  // 本屏从课程起点开始：光源已开、未夹样，光绕过样品。
  await expect(stage(page)).toHaveAttribute("data-problems", "not-through-sample");
  await expect(page.getByTestId("sim-record-reference")).toHaveCount(0);
  await page.getByTestId("sim-bench-place").click();
  // 品种资料的透明度为「透明-半透明」，工作台按有限透光演示：收光偏弱（可记录，但需改善条件复核）。
  await expect(stage(page)).toHaveAttribute("data-problems", "weak-light slit-wide defocus");
  // 相对刻度：狭缝 3.2 / 10、调焦 5.0 / 10（不出现毫米数）。
  await slider(page, "狭缝宽度").fill("3.2");
  await slider(page, "目镜焦距").fill("5");
  await expect(stage(page)).toHaveAttribute("data-problems", "weak-light");
  await page.getByTestId("sim-sample-select").selectOption("amethyst");
  await expect(stage(page)).toHaveAttribute("data-problems", "");
  await expect(page.getByTestId("sim-panel-optics")).toContainText("3.2 / 10");
  await expect(page.getByTestId("sim-panel-optics")).toContainText("5.0 / 10");
  await expect(page.getByTestId("sim-panel-optics")).not.toContainText("mm");
  await mark(page, 694);
  await mark(page, 580);
  await page.getByTestId("sim-spectro-record-open").click();
  await expect(record(page)).toBeVisible();
  await expect(record(page)).toContainText("695 nm 线");
  await expect(page.getByTestId("sim-record-notes")).toBeVisible();
  await page.getByTestId("sim-record-notes").fill("蓝紫区较暗");
  await page.getByTestId("sim-record-review").click();
  await expect(page.getByTestId("sim-record-confirm")).toContainText("观察条件可用");
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "false");
  await expect(page.getByTestId("sim-record-reference")).toBeVisible();
  // 条件一变：旧记录保留但标为过期，调回原设置也不会自动恢复。
  await page.getByTestId("sim-record-close").click();
  await slider(page, "光源亮度").fill("30");
  await page.getByTestId("sim-spectro-record-open").click();
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "true");
  await expect(page.getByTestId("sim-record-reference")).toHaveCount(0);
  await expect(page.getByTestId("sim-record-saved")).toContainText("蓝紫区较暗");
});

test("引导任务学员：对光、调狭缝焦距、标记核对、解释，完成后写一次学习记录", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  // 第一步：记录连续光谱，再把样品夹进光路。
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await page.getByTestId("sim-bench-place").click();
  await answer(page, "continuous", 1);
  await expect(task(page)).toContainText("调节与对准");
  // 第二步：调好狭缝与焦距。
  await slider(page, "狭缝宽度").fill("3.2");
  await slider(page, "目镜焦距").fill("5");
  await answer(page, "slit", 1);
  await expect(task(page)).toContainText("标记吸收特征");
  // 第三步：标出三组以上诊断特征并核对。
  for (const wl of [694, 580, 476]) await mark(page, wl);
  await page.getByTestId("sim-spectro-record-open").click();
  // 核对前不给答案：分组与参考都在核对之后才出现。
  await expect(page.getByTestId("marks-feedback")).toHaveCount(0);
  await page.getByTestId("sim-record-review").click();
  await expect(page.getByTestId("marks-feedback")).toContainText("找到 3 组诊断特征");
  await page.getByTestId("sim-record-save").click();
  await page.getByTestId("sim-record-close").click();
  await expect(task(page)).toContainText("解释与适用条件");
  // 第四步：解释与适用条件（含弱光对照）。
  await expect(page.getByTestId("weak-light-comparison")).toBeVisible();
  await answer(page, "dark", 1);
  await answer(page, "grating", 0);
  await answer(page, "evidence", 1);
  await expect(task(page)).toContainText("本屏已完成");
  await expect(page.getByTestId("sim-task-next-screen")).toContainText("认识");
  // 另外两屏未做，还不能完成课程；回认识屏做完部件与光路。
  await expect(page.getByTestId("sim-task-finish")).toHaveCount(0);
  await page.getByTestId("sim-screen-learn").click();
  await expect(canvas(page)).toHaveCount(0);
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  // 用面板里的部件列表（与模型热点同一条路，且不被读数框遮挡）；点一个等一次，避免连点丢状态。
  for (const [index, id] of ["slitHousing", "slitControl", "collimator", "prismTrain"].entries()) {
    await page.getByTestId(`sim-part-${id}`).click();
    await expect(page.getByTestId("sim-task")).toContainText(`点选关键部件 ${index + 1} / 5`);
  }
  await page.getByTestId("sim-part-focusTube").click();
  await expect(page.getByTestId("sim-task")).toContainText("查看光路 0 / 4");
  for (const id of ["white-light", "wavelength-400", "wavelength-550", "wavelength-700"]) await page.getByTestId("sim-spectro-case-select").selectOption(id);
  await answer(page, "dispersion", 0);
  await expect(page.getByTestId("sim-task-finish")).toBeVisible();
  await page.getByTestId("sim-task-finish").getByRole("button").click();
  await expect(page.getByTestId("sim-task-finish")).toContainText("已记录本次学习完成。");
  expect(await progress(page)).toEqual([expect.objectContaining({ instrumentId: "spectroscope", mode: "learning" })]);
});

test("引导任务讲师演示：完整做完也不写学习进度", async ({ page }) => {
  await page.goto(`${route}?mode=teacher`);
  await ready(page);
  await expect(task(page)).toContainText("对光与照明");
  // 课程起点：光源已开、未夹样，光绕过样品 —— 此时才能记录连续光谱；夹样后按钮收起。
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await page.getByTestId("sim-bench-place").click();
  await expect(page.getByTestId("sim-task-continuous").getByRole("button")).toBeDisabled();
  await answer(page, "continuous", 1);
  await slider(page, "狭缝宽度").fill("3.2");
  await slider(page, "目镜焦距").fill("5");
  await answer(page, "slit", 1);
  for (const wl of [694, 580, 476]) await mark(page, wl);
  await page.getByTestId("sim-spectro-record-open").click();
  await page.getByTestId("sim-record-review").click();
  await page.getByTestId("sim-record-save").click();
  await page.getByTestId("sim-record-close").click();
  await answer(page, "dark", 1);
  await answer(page, "grating", 0);
  await answer(page, "evidence", 1);
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  // 用面板里的部件列表（与模型热点同一条路，且不被读数框遮挡）；点一个等一次，避免连点丢状态。
  for (const [index, id] of ["slitHousing", "slitControl", "collimator", "prismTrain"].entries()) {
    await page.getByTestId(`sim-part-${id}`).click();
    await expect(page.getByTestId("sim-task")).toContainText(`点选关键部件 ${index + 1} / 5`);
  }
  await page.getByTestId("sim-part-focusTube").click();
  await expect(page.getByTestId("sim-task")).toContainText("查看光路 0 / 4");
  for (const id of ["white-light", "wavelength-400", "wavelength-550", "wavelength-700"]) await page.getByTestId("sim-spectro-case-select").selectOption(id);
  await answer(page, "dispersion", 0);
  await page.getByTestId("sim-task-finish").getByRole("button").click();
  await expect(page.getByTestId("sim-task-finish")).toContainText("讲师演示结束，不写入学习进度。");
  expect(await page.evaluate(() => localStorage.getItem("gem-lab-progress-v1"))).toBeNull();
});

test("光栅式：固定狭缝与焦距，排查靠亮度与对准，刻度换成光栅式", async ({ page }) => {
  await page.goto(`${route}?machine=grating`);
  await ready(page);
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", "grating");
  await expect(canvas(page)).toHaveAttribute("data-focus-z", "fixed");
  await expect(page.getByTestId("sim-panel-optics")).toContainText("狭缝与焦距固定");
  await expect(page.getByTestId("sim-spectro-field")).toContainText("光栅式刻度");
  // 光没有穿过样品：光谱条显示的是光源连续光谱，吸收特征一栏写「未显示」，不写「无」。
  await expect(page.getByTestId("sim-spectro-values")).toContainText("未显示");
  await expect(page.getByTestId("sim-spectro-status")).toContainText("样品尚未放入光路");
  await expect(page.getByRole("slider", { name: "狭缝宽度" })).toHaveCount(0);
  await expect(page.getByTestId("sim-panel-lamp")).toContainText("灯头横移");
  // 自由练习：换一颗透明样品、调亮、对准后可观察。
  await page.getByTestId("sim-sample-select").selectOption("amethyst");
  await page.getByTestId("sim-bench-place").click();
  await slider(page, "光源亮度").fill("82");
  await slider(page, "灯头横移").fill("0");
  await expect(stage(page)).toHaveAttribute("data-problems", "");
  await expect(canvas(page)).toHaveAttribute("data-lamp-x", "0.000000");
});

test("反射法只练布置：不显示谱图、保存为布置说明、不计有效观察", async ({ page }) => {
  await page.goto(route);
  await ready(page);
  await page.getByTestId("sim-method-surface-reflection").click();
  await page.getByTestId("sim-bench-place").click();
  await expect(stage(page)).toHaveAttribute("data-problems", "not-through-sample");
  await expect(page.getByTestId("spectrum-violet-dim")).toHaveCount(0);
  await page.getByTestId("sim-spectro-record-open").click();
  await page.getByTestId("sim-record-review").click();
  await expect(page.getByTestId("sim-record-confirm")).toContainText("仅作待核说明，不计有效观察");
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("sim-record-saved")).toContainText("未作有效吸收观察");
  await expect(page.getByTestId("sim-record-saved")).toContainText("仅保存布置条件");
});

test("全部重置只恢复实验屏：认识屏的部件与两机型的任务进度都不受影响", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  await page.getByTestId("sim-bench-place").click();
  await slider(page, "光源亮度").fill("20");
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await page.getByTestId("hotspot-slitHousing").click();
  await expect(page.getByTestId("sim-task")).toContainText("点选关键部件 1 / 5");
  await page.getByTestId("sim-screen-lab").click();
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await page.getByTestId("sim-reset").click();
  // 场景回到本机型的课程起点；任务进度（含认识屏已点过的部件）不受影响。
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "false");
  await expect(slider(page, "光源亮度")).toHaveValue("82");
  // 棱镜式课程起点：狭缝偏宽（刃口实测间距 0.0005872 m）。
  await expect(canvas(page)).toHaveAttribute("data-slit-gap", "0.0005872");
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("sim-task")).toContainText("点选关键部件 1 / 5");
});

test("完成课程的进度不被重置退回：做完后「全部重置」仍是 6 / 6，可以完成课程", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  // 实验屏四步：对光与照明 → 调节与对准 → 标记吸收特征 → 解释与适用条件。
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await page.getByTestId("sim-bench-place").click();
  await answer(page, "continuous", 1);
  await slider(page, "狭缝宽度").fill("3.2");
  await slider(page, "目镜焦距").fill("5");
  await answer(page, "slit", 1);
  for (const wl of [694, 580, 476]) await mark(page, wl);
  await openRecord(page);
  await page.getByTestId("sim-record-review").click();
  await page.getByTestId("sim-record-save").click();
  await page.getByTestId("sim-record-close").click();
  await answer(page, "dark", 1);
  await answer(page, "grating", 0);
  await answer(page, "evidence", 1);
  // 认识屏两步：认识部件 → 跟随光路。
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  // 点一个等一次：清单记上了才点下一个（连点会撞上同一次渲染的旧状态）。
  for (const [index, id] of ["slitHousing", "slitControl", "collimator", "prismTrain"].entries()) {
    await page.getByTestId(`sim-part-${id}`).click();
    await expect(page.getByTestId("sim-task")).toContainText(`点选关键部件 ${index + 1} / 5`);
  }
  await page.getByTestId("sim-part-focusTube").click();
  await expect(page.getByTestId("sim-task")).toContainText("查看光路 0 / 4");
  for (const id of ["white-light", "wavelength-400", "wavelength-550", "wavelength-700"]) await page.getByTestId("sim-spectro-case-select").selectOption(id);
  await expect(page.getByTestId("sim-task")).toContainText("查看光路 4 / 4");
  await answer(page, "dispersion", 0);
  await expect(page.getByTestId("sim-task")).toContainText("引导任务 · 6 / 6");
  // 回实验屏全部重置：画面回到课程起点，但做过的事情仍在，课程仍可完成。
  await page.getByTestId("sim-screen-lab").click();
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await page.getByTestId("sim-reset").click();
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "false");
  await expect(page.getByTestId("sim-task")).toContainText("6 / 6");
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("sim-task")).toContainText("6 / 6");
  await page.getByTestId("sim-task-finish").getByRole("button").click();
  await expect(page.getByTestId("sim-task-finish")).toContainText("已记录本次学习完成。");
});

test("换机型：三屏共用一个选择，工作台回到该机型的课程起点，各自的任务进度保留", async ({ page }) => {
  await page.goto(`${route}?mode=student`);
  await ready(page);
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await page.getByTestId("sim-bench-place").click();
  await answer(page, "continuous", 1);
  await expect(task(page)).toContainText("调节与对准");
  await page.getByTestId("sim-machine-grating").click();
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", "grating", { timeout: 60_000 });
  // 光栅式是另一门课：从自己的第一步开始，进度 0 / 6。
  await expect(page.getByTestId("sim-task")).toContainText("对光与照明");
  await expect(page.getByTestId("sim-task")).toContainText("引导任务 · 0 / 6");
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-instrument", "grating-spectroscope", { timeout: 60_000 });
  await page.getByTestId("sim-screen-lab").click();
  await expect(page.getByTestId("sim-machine-grating")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sim-machine-prism").click();
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", "prism", { timeout: 60_000 });
  // 棱镜式已做过的照旧保留（记录与答题都在），工作台回到棱镜式的课程起点。
  await expect(page.getByTestId("sim-task")).toContainText("记录：只见连续光谱（已完成）");
  await expect(page.getByTestId("sim-task")).toContainText("回答：连续光谱说明什么（已完成）");
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "false");
});

test("换机型与全部重置都会让已保存的记录过期：参考资料随之收起", async ({ page }) => {
  await page.goto(`${route}?sample=amethyst`);
  await ready(page);
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await openRecord(page);
  await page.getByTestId("sim-record-no-absorption").check();
  await page.getByTestId("sim-record-review").click();
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "false");
  await expect(record(page).getByTestId("sim-record-reference")).toBeVisible();
  await page.getByTestId("sim-record-close").click();
  // 换机型：刻度与可调部件都变了，旧记录保留但标为过期。
  await page.getByTestId("sim-machine-grating").click();
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", "grating", { timeout: 60_000 });
  await openRecord(page);
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "true");
  await expect(record(page).getByTestId("sim-record-reference")).toHaveCount(0);
  await page.getByTestId("sim-record-close").click();
  // 全部重置同样只是让记录过期，不清掉它。
  await page.getByTestId("sim-reset").click();
  await openRecord(page);
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "true");
  await expect(page.getByTestId("sim-record-saved")).toContainText("本次条件下未见明显特征吸收");
});

test("窄屏：实验屏无横向溢出，控制面板收为抽屉，光谱与记录都是抽屉", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("sim-panel-light")).toBeHidden();
  // 手机上任务卡默认收起为顶部一行，不占操作区。
  await expect(page.getByTestId("sim-task")).toHaveCount(0);
  await expect(page.getByTestId("sim-task-open")).toBeVisible();
  // 记录观察在手机上是底部抽屉；打开控制抽屉时它让开。
  await page.getByTestId("sim-spectro-record-open").click();
  await expect(record(page)).toBeVisible();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(record(page)).toBeHidden();
  await expect(page.getByTestId("sim-panel-light")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

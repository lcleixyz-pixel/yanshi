import { expect, test, type Page } from "@playwright/test";
import { SAMPLES } from "../src/data/samples";

const route = "/sim/spectroscope/lab";
const canvas = (page: Page) => page.getByTestId("spectroscope-bench-canvas");
const stage = (page: Page) => page.getByTestId("sim-spectro-stage");
const task = (page: Page) => page.getByTestId("sim-task");
const record = (page: Page) => page.getByTestId("sim-record");
const slider = (page: Page, name: string) => page.getByRole("slider", { name });
const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("gem-lab-progress-v1") ?? "{}").state?.completedDemos ?? []);
const attr = async (page: Page, key: string) => Number(await canvas(page).getAttribute(`data-${key}`));
const answer = async (page: Page, id: string, option: number) => {
  const q = page.getByTestId(`question-${id}`);
  await q.getByRole("radio").nth(option).check();
  await q.getByRole("button", { name: "提交" }).click();
};
/** 点光谱条标记一条吸收线；棱镜式刻度 x = 1 - sqrt((wl - 400) / 300)，光栅式近似线性。 */
async function mark(page: Page, wavelength: number, dispersion: "prism" | "grating" = "prism") {
  const strip = page.getByTestId("spectroscope-spectrum-visual");
  const box = (await strip.boundingBox())!;
  const x = dispersion === "prism" ? 1 - Math.sqrt((wavelength - 400) / 300) : 1 - (wavelength - 400) / 300;
  await strip.click({ position: { x: box.width * x, y: box.height / 2 } });
}
async function open(page: Page, query = "") {
  await page.goto(`${route}${query}`);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
}
async function prepare(page: Page) {
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
}
const openRecord = (page: Page) => page.getByTestId("sim-spectro-record-open").click();
const review = (page: Page) => page.getByTestId("sim-record-review").click();

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("三维姿态与对光条件同步：未开灯、旁路白光、偏轴都落在同一份判断上", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "?sample=ruby");
  await expect(canvas(page)).toHaveAttribute("data-asset-version", "simple-v2");
  await expect(canvas(page)).toHaveAttribute("data-light-path", "off");
  await page.getByTestId("sim-bench-power").click();
  await expect(canvas(page)).toHaveAttribute("data-light-path", "bypass");
  await page.getByTestId("sim-bench-place").click();
  await expect(canvas(page)).toHaveAttribute("data-light-path", /aligned|weak/);
  await expect(canvas(page)).toHaveAttribute("data-tweezers-visible", "true");
  await expect(canvas(page)).toHaveAttribute("data-table-visible", "false");
  await expect(page.getByTestId("spectroscope-spectrum-visual").locator("[data-wavelength]")).not.toHaveCount(0);
  await slider(page, "灯头横移").fill("8");
  await expect(canvas(page)).toHaveAttribute("data-lamp-x", "0.088000");
  await expect(canvas(page)).toHaveAttribute("data-light-path", "missed");
  await slider(page, "灯头横移").fill("0");
  await expect(canvas(page)).toHaveAttribute("data-light-path", /aligned|weak/);
  await slider(page, "样品横移").fill("10");
  await expect(canvas(page)).toHaveAttribute("data-sample-x", "0.035000");
  await expect(canvas(page)).toHaveAttribute("data-light-path", "missed");
  expect(errors).toEqual([]);
});

test("两种真实仪器切换：棱镜控制真实移动，光栅固定且波长仍为 nm", async ({ page }) => {
  await open(page, "?sample=prehnite");
  await prepare(page);
  const firstGap = await attr(page, "slit-gap");
  const firstFocus = await attr(page, "focus-z");
  await slider(page, "狭缝宽度").fill("7");
  expect(await attr(page, "slit-gap")).toBeGreaterThan(firstGap);
  await slider(page, "目镜焦距").fill("9");
  expect(await attr(page, "focus-z")).toBeGreaterThan(firstFocus);
  await page.getByTestId("sim-machine-grating").click();
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", "grating", { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-focus-z", "fixed");
  await expect(page.getByRole("slider", { name: "狭缝宽度" })).toHaveCount(0);
  await expect(page.getByTestId("spectroscope-spectrum-strip")).toHaveAttribute("data-dispersion", "grating");
  await page.getByTestId("sim-panel-display").getByRole("button", { name: "样品与镊子" }).click();
  await expect(canvas(page)).toHaveAttribute("data-focus-view", "sample");
  await page.getByTestId("sim-reset").click();
  await expect(canvas(page)).toHaveAttribute("data-focus-view", "whole");
  await expect(canvas(page)).toHaveAttribute("data-light-path", /off|bypass/);
});

test("反射照明在样品两侧上方布置，缺少方法证据只保存布置说明", async ({ page }) => {
  await open(page, "?sample=turquoise");
  await prepare(page);
  await expect(canvas(page)).toHaveAttribute("data-light-path", "blocked");
  await page.getByTestId("sim-method-surface-reflection").click();
  await expect(page.getByTestId("spectroscope-spectrum-visual").locator("[data-wavelength]")).toHaveCount(0);
  await slider(page, "灯头俯角（相对台面）").fill("45");
  await slider(page, "灯头横移").fill("0");
  await expect(canvas(page)).toHaveAttribute("data-lamp-z", "-0.090000");
  await openRecord(page);
  await expect(page.getByTestId("sim-record-no-absorption")).toBeDisabled();
  await page.getByTestId("sim-record-review").click();
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("sim-record-saved")).toContainText("未作有效吸收观察");
  await page.getByTestId("sim-record-close").click();
  // 换回内反射：样品直接放到黑色台面，出光点属于正确部位。
  await page.getByTestId("sim-sample-select").selectOption("ruby");
  await page.getByTestId("sim-method-internal-reflection").click();
  await expect(canvas(page)).toHaveAttribute("data-sample-placed", "true");
  await expect(canvas(page)).toHaveAttribute("data-lamp-z", "-0.090000");
  await expect(canvas(page)).toHaveAttribute("data-tweezers-visible", "false");
  await expect(canvas(page)).toHaveAttribute("data-table-visible", "true");
  expect(Math.abs((await attr(page, "table-top-y")) - (await attr(page, "sample-bottom-y")))).toBeLessThanOrEqual(0.0002);
});

test("先记录后对照：改变条件保留旧记录但不能自动恢复确认", async ({ page }) => {
  await open(page, "?sample=amethyst");
  await expect(page.getByTestId("sim-sample-select").locator("option")).toHaveCount(SAMPLES.length);
  await expect(page.getByTestId("sim-record-reference")).toHaveCount(0);
  await prepare(page);
  await openRecord(page);
  await page.getByTestId("sim-record-no-absorption").check();
  await page.getByTestId("sim-record-notes").fill("换向后仍需复核");
  await page.getByTestId("sim-record-review").click();
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "false");
  await expect(record(page).getByTestId("sim-record-reference")).toBeVisible();
  await page.getByTestId("sim-record-close").click();
  await slider(page, "光源亮度").fill("30");
  await openRecord(page);
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "true");
  await expect(page.getByTestId("sim-record-saved")).toContainText("换向后仍需复核");
  await expect(record(page).getByTestId("sim-record-reference")).toHaveCount(0);
  await expect(page.getByTestId("sim-record-no-absorption")).not.toBeChecked();
  await expect(page.getByTestId("sim-record-notes")).toHaveValue("换向后仍需复核");
});

test("从内反射方法链接进入时，灯头直接处于斜上方示意位置", async ({ page }) => {
  await open(page, "?sample=ruby&method=internal-reflection");
  await expect(canvas(page)).toHaveAttribute("data-lamp-z", "-0.090000");
  await expect(slider(page, "灯头俯角（相对台面）")).toHaveValue("45");
  expect(await attr(page, "lamp-y")).toBeGreaterThan(0.2);
  await expect(canvas(page)).toHaveAttribute("data-lamp-x", "0.000000");
  await expect(canvas(page)).toHaveAttribute("data-table-visible", "true");
  await expect(canvas(page)).toHaveAttribute("data-tweezers-visible", "false");
});

for (const instrument of ["prism", "grating"]) {
  test(`${instrument}: 两反射法的真实节点形成上方 V 形，样品落台，出光点属于正确部位`, async ({ page }) => {
    await open(page, `?sample=ruby&machine=${instrument}`);
    await prepare(page);
    const value = async (key: string) => {
      const actual = await canvas(page).getAttribute(`data-${key}`);
      expect(actual, key).not.toBeNull();
      expect(actual, key).not.toBe("none");
      expect(Number.isFinite(Number(actual)), key).toBe(true);
      return Number(actual);
    };
    for (const method of ["internal", "surface"]) {
      if (method === "surface") await page.getByTestId("sim-sample-select").selectOption("turquoise");
      await page.getByTestId(`sim-method-${method}-reflection`).click();
      await expect(canvas(page)).toHaveAttribute("data-table-visible", "true");
      await expect(canvas(page)).toHaveAttribute("data-tweezers-visible", "false");
      expect(Math.abs(await value("table-top-y") - await value("sample-bottom-y"))).toBeLessThanOrEqual(0.0002);
      expect(await value("lamp-y")).toBeGreaterThan((await value("incident-hit-y")) + 0.04);
      expect(await value("lamp-z")).toBeLessThan(await value("incident-hit-z"));
      expect(await value("scope-entry-y")).toBeGreaterThan((await value("sample-exit-y")) + 0.02);
      expect(await value("scope-entry-z")).toBeGreaterThan(await value("sample-exit-z"));
      expect(await value("lamp-dir-y")).toBeLessThan(-0.65);
      expect(await value("lamp-dir-z")).toBeGreaterThan(0.65);
      expect(await value("scope-axis-y")).toBeGreaterThan(0.65);
      expect(await value("scope-axis-z")).toBeGreaterThan(0.65);
      expect(await value("scope-elevation")).toBeCloseTo(45, 1);
      if (method === "internal") {
        expect(await value("internal-bounce-y")).toBeGreaterThan(await value("table-top-y"));
        expect(await value("internal-bounce-y")).toBeLessThan((await value("table-top-y")) + 0.002);
        expect(await value("sample-exit-z")).toBeGreaterThan(await value("incident-hit-z"));
      } else {
        for (const axis of ["x", "y", "z"]) expect(await value(`sample-exit-${axis}`)).toBeCloseTo(await value(`incident-hit-${axis}`), 5);
        await slider(page, "灯头俯角（相对台面）").fill("5");
        await expect(canvas(page)).toHaveAttribute("data-light-path", /missed|blocked/);
        await slider(page, "灯头俯角（相对台面）").fill("45");
      }
      await expect(page.getByTestId("spectroscope-spectrum-visual").locator("[data-wavelength]")).toHaveCount(0);
    }
  });
}

test("透射时镊子竖向夹住腰棱两侧，不挡灯口到入光口的光路", async ({ page }) => {
  // 每种外形各取一颗：刻面、弧面、异形、雕件。
  for (const id of ["ruby", "opal", "jadeite", "amber"]) {
    await open(page, `?sample=${id}`);
    await page.getByTestId("sim-bench-place").click();
    await expect(canvas(page), id).toHaveAttribute("data-sample-placed", "true");
    await expect(canvas(page), id).toHaveAttribute("data-tweezers-in-beam", "false");
    await expect(canvas(page), id).toHaveAttribute("data-tweezer-grip", "vertical");
    expect(Number(await canvas(page).getAttribute("data-tweezer-gap")), `${id} 镊尖应贴住样品`).toBeGreaterThan(0.004);
  }
  await page.getByTestId("sim-bench-place").click();
  await expect(canvas(page)).toHaveAttribute("data-tweezer-grip", "resting");
});

test("在三维中直接拖动狭缝调节环、目镜套筒和灯头，滑杆与模型同步", async ({ page }) => {
  await open(page, "?sample=ruby");
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await page.getByTestId("sim-panel-display").getByRole("button", { name: "分光镜" }).click();
  // 收起观察面板：它贴在操作区左侧，会挡住模型上的拖动点（收起后工作台也回中）。
  await page.getByTestId("sim-obs-toggle").click();
  await page.waitForTimeout(600);
  const handle = async (id: string) => {
    await canvas(page).scrollIntoViewIfNeeded();
    const box = (await canvas(page).boundingBox())!;
    const handles = JSON.parse((await canvas(page).getAttribute("data-handles")) ?? "{}");
    return [box.x + handles[id][0], box.y + handles[id][1]] as const;
  };
  // 部件在画面上的可抓点很窄：以回报坐标为中心扫一遍，用光标形状（ew-resize）找到真正抓得住的像素。
  const findGrab = async (id: string) => {
    const [x, y] = await handle(id);
    for (let radius = 0; radius <= 8; radius += 2) {
      for (const [ox, oy] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius], [-radius, -radius], [radius, -radius], [-radius, radius]]) {
        await page.mouse.move(x + ox, y + oy);
        if (await canvas(page).evaluate((el) => el.style.cursor) === "ew-resize") return [x + ox, y + oy] as const;
      }
    }
    throw new Error(`${id} 在画面里找不到可抓点`);
  };
  const dragBy = async (id: string, dx: number) => {
    const [x, y] = await findGrab(id);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await expect(canvas(page)).toHaveAttribute("data-dragging", id);
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };
  // 狭缝与调焦滑杆在已收起的观察面板里（隐藏时不在无障碍树中），直接读输入框的值。
  const slit = page.locator('input[aria-label="狭缝宽度"]');
  const gapBefore = await attr(page, "slit-gap");
  await dragBy("slitControl", 60);
  await expect.poll(async () => Number(await slit.inputValue())).toBeGreaterThan(2.2);
  expect(await attr(page, "slit-gap")).toBeGreaterThan(gapBefore);
  const focus = page.locator('input[aria-label="目镜焦距"]');
  await dragBy("focusTube", -60);
  await expect.poll(async () => Number(await focus.inputValue())).toBeLessThan(4);
  await page.getByTestId("sim-panel-display").getByRole("button", { name: "整体" }).click();
  await page.waitForTimeout(600);
  await dragBy("lampHead", 40);
  await expect.poll(async () => Number(await slider(page, "灯头横移").inputValue())).toBeGreaterThan(2);
  await expect(canvas(page)).toHaveAttribute("data-dragging", "");
});

test("光栅式引导任务学员：固定狭缝焦距，靠亮度与对准排查，线性刻度标记后写一次学习记录", async ({ page }) => {
  await page.goto(`${route}?machine=grating&mode=student`);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(task(page)).toContainText("对光与照明");
  await page.getByTestId("sim-task-continuous").getByRole("button").click();
  await page.getByTestId("sim-bench-place").click();
  await answer(page, "continuous", 1);
  await expect(task(page)).toContainText("调节与对准");
  await expect(task(page)).toContainText("亮度足够、灯头对准");
  await expect(page.getByRole("slider", { name: "狭缝宽度" })).toHaveCount(0);
  await expect(page.getByTestId("sim-spectro-hand")).toContainText("狭缝与焦距固定");
  await slider(page, "光源亮度").fill("80");
  await slider(page, "灯头横移").fill("0");
  await expect(stage(page)).toHaveAttribute("data-problems", "");
  await answer(page, "fixed", 1);
  await expect(task(page)).toContainText("标记吸收特征");
  for (const wl of [694, 580, 476]) await mark(page, wl, "grating");
  await openRecord(page);
  await review(page);
  await expect(page.getByTestId("marks-feedback")).toHaveCount(0);
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("marks-feedback")).toContainText("找到 3 组诊断特征");
  await page.getByTestId("sim-record-close").click();
  await expect(task(page)).toContainText("解释与适用条件");
  await expect(page.getByTestId("scale-comparison")).toBeVisible();
  await answer(page, "scale", 0);
  await answer(page, "dark", 1);
  await answer(page, "evidence", 1);
  // 认识屏两步未做：本屏做完也不能完成课程；做完认识屏才写记录。
  await expect(page.getByTestId("sim-task-finish")).toHaveCount(0);
  await page.getByTestId("sim-screen-learn").click();
  await expect(page.getByTestId("optics3d-canvas")).toHaveAttribute("data-instrument", "grating-spectroscope", { timeout: 60_000 });
  for (const id of ["slitHousing", "collimator", "grating", "eyepiece"]) {
    await page.getByTestId(`sim-part-${id}`).click();
    await expect(page.getByTestId(`sim-part-${id}`)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(task(page)).toContainText("查看光路 0 / 3");
  for (const id of ["order-0", "order-1", "order--1"]) await page.getByTestId("sim-spectro-case-select").selectOption(id);
  await expect(task(page)).toContainText("查看光路 3 / 3");
  await answer(page, "diffraction", 0);
  await page.getByTestId("sim-task-finish").getByRole("button").click();
  await expect(page.getByTestId("sim-task-finish")).toContainText("已记录本次学习完成。");
  expect(await progress(page)).toEqual([expect.objectContaining({ instrumentId: "spectroscope", mode: "learning" })]);
});

test("跳步后不能完成课程：直达解释步做完也不给完成课程", async ({ page }) => {
  await page.goto(`${route}?mode=student&step=explain`);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(task(page)).toContainText("解释与适用条件");
  await answer(page, "dark", 1);
  await answer(page, "grating", 0);
  await answer(page, "evidence", 1);
  await expect(page.getByTestId("sim-task-finish")).toHaveCount(0);
});

test("棱镜视场里 694 / 692 看成一条细线；保存不足三组的观察后给出口径说明", async ({ page }) => {
  await page.goto(`${route}?mode=student&step=observe`);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await page.getByTestId("sim-bench-place").click();
  await slider(page, "狭缝宽度").fill("3.2");
  await slider(page, "目镜焦距").fill("5");
  await mark(page, 694);
  await mark(page, 530);
  await openRecord(page);
  // 核对只预览自己的输入，确认保存后才给出分组与「附近没有吸收特征」。
  await expect(page.getByTestId("marks-feedback")).toHaveCount(0);
  await review(page);
  await expect(page.getByTestId("marks-feedback")).toHaveCount(0);
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("marks-feedback")).toContainText("至少需要 3 组");
  await expect(page.getByTestId("marks-feedback")).toContainText("附近没有吸收特征");
  await page.getByTestId("sim-record-close").click();
  const strip = page.getByTestId("spectroscope-spectrum-visual");
  await expect(strip.locator('[data-wavelength="694"]')).toHaveCount(1);
  await expect(strip.locator('[data-wavelength="692"]')).toHaveCount(0);
  const boxes = await strip.locator("[data-wavelength]").evaluateAll((els) =>
    els.map((el) => ({ wl: Number(el.getAttribute("data-wavelength")), ...el.getBoundingClientRect().toJSON() })).filter((box) => box.width < 8).sort((a, b) => a.left - b.left));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].left, `${boxes[i - 1].wl} / ${boxes[i].wl} nm 在画面上重叠`).toBeGreaterThanOrEqual(boxes[i - 1].right);
});

test("知识库只留一个仿真入口：进认识屏后从底部导航到实验屏", async ({ page }) => {
  await page.goto("/knowledge/spectroscope");
  await expect(page.getByTestId("knowledge-grating-course")).toHaveCount(0);
  await expect(page.getByTestId("knowledge-spectroscope-bench")).toHaveCount(0);
  await page.getByTestId("knowledge-open-sim").click();
  await expect(page).toHaveURL(/\/sim\/spectroscope\/learn$/);
  await page.getByTestId("sim-screen-lab").click();
  await expect(page).toHaveURL(new RegExp(`${route}$`));
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-screen", "lab");
});

import { expect, test, type Page } from "@playwright/test";

const route = "/explore/optics/grating-spectroscope";
const course = (page: Page) => page.getByTestId("spectroscope-course");
const field = (page: Page) => page.getByTestId("course-observation");
const canvas = (page: Page) => page.getByTestId("optics3d-canvas");
const bench = (page: Page) => page.getByTestId("spectroscope-bench-canvas");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const next = (page: Page) => page.getByTestId("course-next").click();
const question = async (page: Page, id: string, option: number) => {
  const q = page.getByTestId(`question-${id}`);
  await q.getByRole("radio").nth(option).check();
  await q.getByRole("button", { name: "提交" }).click();
};
const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("gem-lab-progress-v1") ?? "{}").state?.completedDemos ?? []);

/** 光栅式刻度：x = 1 - (wl - 400) / 300，红端在左，近似线性。 */
async function mark(page: Page, wavelength: number) {
  const strip = field(page).getByTestId("spectroscope-spectrum-visual");
  const box = (await strip.boundingBox())!;
  await strip.click({ position: { x: box.width * (1 - (wavelength - 400) / 300), y: box.height / 2 } });
}

async function open(page: Page, mode: "student" | "teacher") {
  await page.goto(`${route}?course=basic&mode=${mode}`);
  await expect(course(page)).toHaveAttribute("data-mode", mode);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
}

async function runCourse(page: Page) {
  for (const name of ["入光端与固定狭缝", "准直透镜", "透射复制光栅", "固定目镜"]) await button(page, name).click();
  await next(page);
  for (const name of ["零级", "+1 级", "−1 级"]) await button(page, name).click();
  await question(page, "diffraction", 0);
  await next(page);

  // 换到工作台，光栅式仪器；未放样只见连续光谱。夹样后灯头偏、亮度低：只剩“透光太弱”，没有狭缝 / 焦距问题。
  await expect(bench(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(bench(page)).toHaveAttribute("data-rendered-instrument", "grating");
  await expect(field(page)).toHaveAttribute("data-problems", "not-through-sample");
  await button(page, "记录：只见连续光谱").click();
  await question(page, "continuous", 1);
  await button(page, "用镊子夹样品放入光路").click();
  await expect(field(page)).toHaveAttribute("data-problems", "weak-light");
  await next(page);

  await expect(page.getByLabel("狭缝宽度")).toHaveCount(0);
  await expect(page.getByTestId("grating-fixed")).toBeVisible();
  await page.getByLabel("光源亮度").fill("80");
  await expect(field(page)).toHaveAttribute("data-problems", "weak-light");
  await page.getByLabel("灯头横移").fill("0");
  await expect(field(page)).toHaveAttribute("data-problems", "");
  await expect(bench(page)).toHaveAttribute("data-light-path", "aligned");
  await question(page, "fixed", 1);
  await next(page);

  await mark(page, 694);
  await mark(page, 580);
  await mark(page, 476);
  await button(page, "核对标记").click();
  await expect(page.getByTestId("marks-feedback")).toContainText("找到 3 组诊断特征");
  await next(page);

  await expect(page.getByTestId("scale-comparison").locator(".course-shell__spectrum[data-dispersion]")).toHaveCount(2);
  await question(page, "scale", 0);
  await question(page, "dark", 1);
  await question(page, "evidence", 1);
  await page.getByTestId("course-finish").click();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("光栅式学员课程：固定狭缝焦距，靠亮度与对准排查，线性刻度标记，完成后写一次学习记录", async ({ page }) => {
  await open(page, "student");
  await expect(page.getByRole("navigation", { name: "课程步骤" })).toContainText("对准与亮度");
  await runCourse(page);
  await expect(page.getByText("已记录本次学习完成。")).toBeVisible();
  expect(await progress(page)).toEqual([expect.objectContaining({ instrumentId: "spectroscope", mode: "learning" })]);
});

test("光栅式讲师演示完整完成也不写入学习进度", async ({ page }) => {
  await open(page, "teacher");
  await runCourse(page);
  await expect(page.getByText("讲师演示结束，不写入学习进度。")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("gem-lab-progress-v1"))).toBeNull();
});

test("知识库与光栅式三维页都能进入光栅式观察课；棱镜式课程不受影响", async ({ page }) => {
  await page.goto("/knowledge/spectroscope");
  await expect(page.getByTestId("knowledge-grating-course")).toHaveAttribute("href", `${route}?course=basic&mode=student`);
  await page.getByTestId("knowledge-grating-course").click();
  await expect(course(page)).toHaveAttribute("data-mode", "student");
  await expect(page.getByRole("heading", { name: "认识部件" })).toBeVisible();
  await page.goto("/explore/optics/prism-spectroscope?course=basic&mode=student");
  await expect(page.getByRole("navigation", { name: "课程步骤" })).toContainText("调节狭缝与焦距");
});

test("光栅式课程窄屏无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "student");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

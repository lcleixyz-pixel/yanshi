import { expect, test, type Page } from "@playwright/test";

const route = "/explore/optics/prism-spectroscope";
const course = (page: Page) => page.getByTestId("spectroscope-course");
const field = (page: Page) => page.getByTestId("course-observation");
const canvas = (page: Page) => page.getByTestId("optics3d-canvas");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const next = (page: Page) => button(page, "下一步").click();
const question = (page: Page, id: string, option: number) => page.getByTestId(`question-${id}`).getByRole("button").nth(option).click();
const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("gem-lab-progress-v1") ?? "{}").state?.completedDemos ?? []);

/** 棱镜式刻度：x = 1 - sqrt((wl - 400) / 300)，红端在左。 */
async function mark(page: Page, wavelength: number) {
  const strip = field(page).getByTestId("spectroscope-spectrum-visual");
  const box = (await strip.boundingBox())!;
  const x = 1 - Math.sqrt((wavelength - 400) / 300);
  await strip.click({ position: { x: box.width * x, y: box.height / 2 } });
}

async function open(page: Page, mode: "student" | "teacher") {
  await page.goto(`${route}?course=basic&mode=${mode}`);
  await expect(course(page)).toHaveAttribute("data-mode", mode);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
}

async function runCourse(page: Page) {
  for (const name of ["入光端与狭缝", "狭缝调节环", "准直透镜", "直视棱镜组", "目镜抽拉套筒"]) await button(page, name).click();
  await next(page);
  for (const name of ["白光", "400 nm", "550 nm", "700 nm"]) await button(page, name).click();
  await question(page, "dispersion", 0);
  await next(page);

  // 光绕过样品：连续光谱，不能下结论；改为透射后出现吸收特征，但狭缝过宽、失焦。
  await expect(field(page)).toHaveAttribute("data-problems", "not-through-sample");
  await expect(field(page).locator("[data-wavelength]")).toHaveCount(0);
  await button(page, "记录：只见连续光谱").click();
  await question(page, "continuous", 1);
  await button(page, "透射：光穿过样品").click();
  await expect(field(page)).toHaveAttribute("data-problems", "slit-wide defocus");
  await next(page);

  await page.getByLabel("狭缝宽度").fill("32");
  await expect(field(page)).toHaveAttribute("data-problems", "defocus");
  await page.getByLabel("目镜焦距").fill("50");
  await expect(field(page)).toHaveAttribute("data-problems", "");
  await expect(field(page).locator('[data-wavelength="468"]')).toHaveCount(1);
  await question(page, "slit", 1);
  await next(page);

  await mark(page, 694);
  await mark(page, 530);
  await button(page, "核对标记").click();
  await expect(page.getByTestId("marks-feedback")).toContainText("至少需要 3 组");
  await expect(page.getByTestId("marks-feedback")).toContainText("附近没有吸收特征");
  await mark(page, 580);
  await mark(page, 476);
  await button(page, "核对标记").click();
  await expect(page.getByTestId("marks-feedback")).toContainText("找到 3 组诊断特征");
  await next(page);

  await expect(page.getByTestId("weak-light-comparison")).toBeVisible();
  await question(page, "dark", 1);
  await question(page, "grating", 0);
  await question(page, "evidence", 1);
  await button(page, "完成课程").click();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("知识库以棱镜式观察课为主线；透射法直达课程", async ({ page }) => {
  const student = `${route}?course=basic&mode=student`;
  await page.goto("/knowledge/spectroscope");
  await expect(page.getByTestId("knowledge-start-course")).toHaveAttribute("href", student);
  await expect(page.getByTestId("knowledge-cta-learning")).toHaveAttribute("href", student);
  await expect(page.getByTestId("knowledge-classic-demo")).toHaveAttribute("href", "/demo/spectroscope");
  await page.getByTestId("knowledge-start-course").click();
  await expect(course(page)).toHaveAttribute("data-mode", "student");
});

test("学员完整课程：先识别连续光谱、调好狭缝焦距，再标记核对，完成后写一次学习记录", async ({ page }) => {
  await open(page, "student");
  await runCourse(page);
  await expect(page.getByText("已记录本次学习完成。")).toBeVisible();
  expect(await progress(page)).toEqual([expect.objectContaining({ instrumentId: "spectroscope", mode: "learning" })]);
});

test("讲师演示完整完成也不写入学习进度", async ({ page }) => {
  await open(page, "teacher");
  await runCourse(page);
  await expect(page.getByText("讲师演示结束，不写入学习进度。")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("gem-lab-progress-v1"))).toBeNull();
});

test("学员模式未完成的步骤不能点选；跳过的步骤没补完时不能完成课程", async ({ page }) => {
  await open(page, "student");
  const steps = page.getByRole("navigation", { name: "课程步骤" });
  await expect(steps.getByRole("button", { name: /标记吸收特征/ })).toBeDisabled();
  for (let i = 0; i < 5; i++) await button(page, "跳步复习").click();
  await expect(course(page)).toHaveAttribute("data-step", "explain");
  await question(page, "dark", 1);
  await question(page, "grating", 0);
  await question(page, "evidence", 1);
  await expect(button(page, "完成课程")).toBeDisabled();
});

test("窄屏课程无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "student");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

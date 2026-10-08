import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __refStorage: { method: string; key: string }[];
  }
}
const route = "/explore/optics/refractometer";
const course = (page: Page) => page.getByTestId("refractometer-course");
const field = (page: Page) => page.getByTestId("course-observation");
const canvas = (page: Page) => page.getByTestId("optics3d-canvas");
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const question = async (page: Page, id: string, option: number) =>
  page.getByTestId(`question-${id}`).getByRole("button").nth(option).click();
const next = async (page: Page) => button(page, "下一步").click();
const audits = async (page: Page) =>
  page.evaluate(() =>
    window.__refStorage.filter((x) => x.key === "gem-lab-progress-v1"),
  );

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.addInitScript(() => {
    window.__refStorage = [];
    for (const method of ["getItem", "setItem"] as const) {
      const original = Storage.prototype[method] as (
        ...args: string[]
      ) => unknown;
      Object.defineProperty(Storage.prototype, method, {
        value: function (key: string, ...args: string[]) {
          window.__refStorage.push({ method, key });
          return original.apply(this, [key, ...args] as [string, string]);
        },
      });
    }
  });
});
async function open(page: Page, mode: "student" | "teacher" = "student") {
  await page.goto(route);
  await button(
    page,
    mode === "student" ? "开始学习（学员）" : "讲师演示",
  ).click();
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", {
    timeout: 60_000,
  });
  await expect(canvas(page)).toHaveAttribute(
    "data-asset-version",
    "paper-optics-v2",
  );
}
async function noAnswerLeak(page: Page) {
  const html = await page.locator("body").evaluate((body) => {
    const copy = body.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll("input")
      .forEach((input) => input.removeAttribute("value"));
    return copy.outerHTML;
  });
  expect(html).not.toContain("1.718");
  expect(html).not.toContain("偏差 0.000");
  await expect(page.getByTestId("reading-feedback")).toHaveCount(0);
}
async function partsAndPath(page: Page) {
  for (const name of [
    "测台棱镜 / 接触窗口",
    "内部光源",
    "分划刻度",
    "目镜",
    "翻盖",
    "接触液",
  ])
    await button(page, name).click();
  await next(page);
  const stages = page.locator(".ref-course__path").getByRole("button");
  for (let i = 0; i < 7; i++) await stages.nth(i).click();
  await question(page, "boundary", 0);
  await next(page);
}
async function prepareAndRecover(page: Page) {
  await button(page, "打开电源").click();
  await expect(field(page)).toHaveAttribute("data-view", "scale-only");
  await button(page, "滴一小滴接触液").click();
  await expect(field(page)).toHaveAttribute("data-view", "oil-empty");
  await button(page, "台面朝下放样").click();
  await next(page);
  await page.getByLabel("显示代表光路（透视叠加）").check();
  expect(
    JSON.parse((await canvas(page).getAttribute("data-display-paths")) || "[]")
      .length,
  ).toBeGreaterThan(0);
  await expect(field(page)).toHaveAttribute("data-view", "scale-only");
  await expect(canvas(page)).toHaveAttribute("data-case", /spinel-air-gap/);
  await button(page, "记录：无法可靠读数").click();
  await question(page, "gap", 1);
  await button(page, "轻推贴合").click();
  await expect(field(page)).toHaveAttribute("data-view", "single");
  await expect(canvas(page)).toHaveAttribute("data-case", /spinel-good/);
  const operation = JSON.parse(
    (await canvas(page).getAttribute("data-operation")) || "{}",
  );
  expect(operation.partVisibility.contact_layer).toBe(true);
  expect(operation.partVisibility.isotropic_sample).toBe(true);
  await next(page);
}
async function read(page: Page, value = "1.718") {
  await page.getByLabel(/你的.*读数/).fill(value);
  await button(page, "提交读数").click();
}
async function rest(page: Page) {
  await noAnswerLeak(page);
  await read(page);
  await expect(page.getByTestId("reading-feedback")).toContainText(
    "参考 1.718",
  );
  await next(page);
  await button(page, "取下转向 90° 并放回").click();
  await noAnswerLeak(page);
  await expect(button(page, "提交读数")).toBeDisabled();
  await button(page, "轻推贴合").click();
  await noAnswerLeak(page);
  await read(page);
  await question(page, "repeat", 0);
  await next(page);
  await question(page, "critical", 1);
  await question(page, "air", 2);
  await question(page, "limit", 0);
  await next(page);
  await button(page, "取下样品").click();
  await button(page, "擦净测台").click();
  await button(page, "擦净样品").click();
  await button(page, "关闭电源").click();
  await button(page, "合上翻盖").click();
  await button(page, "完成课程").click();
}

test("完整学员课程：恢复、先输入后核对、换向复核、清洁后才写学习进度", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await open(page);
  await noAnswerLeak(page);
  await partsAndPath(page);
  await prepareAndRecover(page);
  expect(await audits(page)).toEqual([]);
  await rest(page);
  await expect(page.getByText("已记录本次学习完成。")).toBeVisible();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gem-lab-progress-v1")!).state,
  );
  expect(saved.completedDemos).toEqual([
    expect.objectContaining({
      instrumentId: "refractometer",
      mode: "learning",
    }),
  ]);
  expect(saved.detectionHistory).toEqual([]);
  expect(saved.totalPoints).toBe(0);
  expect(errors).toEqual([]);
});
test("无效条件和拆解不能提交，恢复装配与接触后才恢复；两次读数各自通过", async ({
  page,
}) => {
  await open(page, "teacher");
  await page
    .getByRole("navigation", { name: "课程步骤" })
    .getByRole("button", { name: "第一次读数" })
    .click();
  const submit = button(page, "提交读数");
  await expect(submit).toBeDisabled();
  await button(page, "打开电源").click();
  await expect(submit).toBeDisabled();
  await button(page, "台面朝下放样").click();
  await expect(submit).toBeDisabled();
  await button(page, "滴一小滴接触液").click();
  await expect(submit).toBeDisabled();
  await button(page, "轻推贴合").click();
  await expect(submit).toBeDisabled(); // Empty input still requires a learner value.
  await page.getByLabel("你的第一次读数").fill("1.700");
  await submit.click();
  await expect(page.getByTestId("reading-feedback")).toContainText(
    "请重新观察",
  );
  await expect(button(page, "下一步")).toBeDisabled();
  await read(page, "1.723");
  await expect(button(page, "下一步")).toBeEnabled();
  await page.getByText("部件与装配辅助", { exact: true }).click();
  await page.getByRole("slider", { name: "连续拆解" }).fill("50");
  await expect(submit).toBeDisabled();
  await expect(field(page)).toHaveAttribute("data-view", "off");
  await expect(canvas(page)).toHaveAttribute("data-case", /"suspended":true/);
  await button(page, "恢复装配").click();
  await expect(field(page)).toHaveAttribute("data-view", "single");
  await next(page);
  await question(page, "repeat", 0);
  await read(page);
  await expect(button(page, "下一步")).toBeDisabled();
  await button(page, "取下转向 90° 并放回").click();
  await button(page, "轻推贴合").click();
  await read(page, "1.700");
  await expect(button(page, "下一步")).toBeDisabled();
  await read(page, "1.713");
  await expect(button(page, "下一步")).toBeEnabled();
  expect(await audits(page)).toEqual([]);
});
test("跳步后返回补完，仍不写入进度", async ({ page }) => {
  await open(page);
  await button(page, "跳步复习").click();
  await page
    .getByRole("navigation", { name: "课程步骤" })
    .getByRole("button", { name: "认识部件" })
    .click();
  await partsAndPath(page);
  await prepareAndRecover(page);
  await rest(page);
  await expect(
    page.getByText("本次使用过跳步，已完成复习，不写入学习进度。"),
  ).toBeVisible();
  expect(await audits(page)).toEqual([]);
});
test("讲师可以自由跳转，完整演示也不访问学习存储", async ({ page }) => {
  await open(page, "teacher");
  await page
    .getByRole("navigation", { name: "课程步骤" })
    .getByRole("button", { name: "解释与适用条件" })
    .click();
  await page
    .getByRole("navigation", { name: "课程步骤" })
    .getByRole("button", { name: "认识部件" })
    .click();
  await partsAndPath(page);
  await prepareAndRecover(page);
  await rest(page);
  await expect(page.getByText("讲师演示结束，不写入学习进度。")).toBeVisible();
  expect(await audits(page)).toEqual([]);
});
test("自由探索与未完成课程不访问存储；重复进入不累积 canvas", async ({
  page,
}) => {
  await page.goto(route);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", {
    timeout: 60_000,
  });
  for (let i = 0; i < 2; i++) {
    await button(page, "开始学习（学员）").click();
    await expect(canvas(page)).toHaveAttribute("data-loaded", "true", {
      timeout: 60_000,
    });
    await expect(page.locator("canvas")).toHaveCount(1);
    await button(page, "返回自由探索").first().click();
    await expect(canvas(page)).toHaveAttribute("data-loaded", "true", {
      timeout: 60_000,
    });
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  expect(await audits(page)).toEqual([]);
});
test("窄屏课程无横向溢出，3D 与观察上下排列", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "teacher");
  await page
    .getByRole("navigation", { name: "课程步骤" })
    .getByRole("button", { name: "开灯与放样" })
    .click();
  await button(page, "打开电源").click();
  const model = await page.locator(".ref-course__model").boundingBox(),
    panel = await page.locator(".ref-course__panel").boundingBox();
  expect(model && panel && panel.y >= model.y + model.height).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("模型加载失败显示静态回退，不能伪造完成课程", async ({ page }) => {
  await page.route("**/refractometer/paper-optics-v2/model.glb?**", (route) =>
    route.abort(),
  );
  await page.goto(route);
  await button(page, "开始学习（学员）").click();
  await expect(page.getByRole("alert")).toContainText("模型载入失败");
  await expect(button(page, "下一步")).toBeDisabled();
  await expect(page.getByAltText("折射仪静态预览")).toBeVisible();
  expect(await audits(page)).toEqual([]);
});

test('桌面教学画面与手机操作留存，窄条测台和既有 2D 参考图对照', async ({ page }) => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const out = path.resolve('assets-source/refractometer/course-v2/visual');
  await fs.mkdir(out, {recursive:true});
  await page.setViewportSize({width:1440,height:950});
  await open(page, 'teacher');
  await page.getByRole('navigation', {name:'课程步骤'}).getByRole('button', {name:'第一次读数'}).click();
  await button(page,'打开电源').click();
  await button(page,'滴一小滴接触液').click();
  await button(page,'台面朝下放样').click();
  await button(page,'轻推贴合').click();
  await button(page,'内部光路').click();
  await expect(field(page)).toHaveAttribute('data-view','single');
  await noAnswerLeak(page);
  await page.screenshot({path:path.join(out,'desktop-reading.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'mobile-reading.png'),fullPage:true});
  const top = path.resolve('assets-source/refractometer/course-v2/narrow-stage-top.png');
  try {await fs.access(top);} catch {return;} // Local master render; not a dependency of CI browser checks.
  const reference = path.resolve('public/assets/instruments/refractometer.png');
  const [left,right] = await Promise.all([fs.readFile(reference),fs.readFile(top)]);
  await page.setViewportSize({width:1280,height:800});
  await page.setContent(`<html lang="zh"><meta charset="utf-8"><style>body{margin:0;background:#edf1f1;color:#243d46;font:16px system-ui}h1{font-size:24px;margin:24px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px}section{padding:18px;background:white;border-radius:10px}img{display:block;max-width:100%;width:100%;height:530px;object-fit:contain}p{margin:8px 0;line-height:1.6}</style><h1>窄条接触窗口 · 外形对照</h1><main><section><p>项目既有 2D 仪器图（只参考开口比例与方向）</p><img alt="原有2D参考图" src="data:image/png;base64,${left.toString('base64')}"></section><section><p>v2 同一母版 · 接触面正视近景</p><img alt="v2窄条测台" src="data:image/png;base64,${right.toString('base64')}"><p>直接露出棱镜，17 × 3.6 mm；下方退让腔为教学设计。</p></section></main></html>`);
  await expect(page.getByAltText('v2窄条测台')).toBeVisible();
  await page.getByAltText('v2窄条测台').evaluate(async(image:HTMLImageElement)=>image.decode());
  await page.screenshot({path:path.join(out,'window-comparison.png')});
});

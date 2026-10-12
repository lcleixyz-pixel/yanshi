import { expect, test, type Page } from "@playwright/test";
import { SAMPLES_BY_DIFFICULTY } from "../src/data/samples";

const canvas = (page: Page) => page.getByTestId("spectroscope-bench-canvas");
const stage = (page: Page) => page.getByTestId("sim-spectro-stage");
const record = (page: Page) => page.getByTestId("sim-record");
const detection = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("gem-lab-detection-v1") ?? "{}").state);

async function ready(page: Page) {
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
}
/** 用检测存储放一颗未知样品，并进入检测流程的分光镜一步。 */
async function detectionSample(page: Page, id: string, waitReady = true) {
  await page.addInitScript((sampleId) => {
    sessionStorage.setItem("gem-lab-detection-v1", JSON.stringify({ state: {
      difficulty: "intermediate", sampleId, instrumentsUsed: [],
      refractometer: { method: null, riMin: null, riMax: null, birefringence: null, opticalCharacter: null, notes: "" },
      polariscope: { rotation: 0, phenomenon: null, optical: null, notes: "" },
      spectroscope: { method: null, markedLines: [], bandRanges: [], notes: "" },
      startedAt: 1000, assessment: null, assessmentAttemptCount: 0,
    }, version: 1 }));
  }, id);
  await page.goto("/detection");
  await page.getByRole("button", { name: /分光镜/ }).click();
  if (waitReady) await ready(page);
}
const openRecord = (page: Page) => page.getByTestId("sim-spectro-record-open").click();
const review = (page: Page) => page.getByTestId("sim-record-review").click();

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
});

test("独立挑战：抽未知样品全程不显示品种名，保存核对后揭示答案", async ({ page }) => {
  await page.goto("/sim/spectroscope/challenge");
  await ready(page);
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-screen", "challenge");
  await expect(page.getByTestId("sim-spectro-unknown")).toBeVisible();
  // 还没抽样品：不显示目镜视场。
  await expect(page.getByTestId("sim-spectro-idle")).toBeVisible();
  await expect(page.getByTestId("sim-spectro-field")).toHaveCount(0);
  await page.getByTestId("sim-challenge-beginner").click();
  await expect(page.getByTestId("sim-spectro-idle")).toHaveCount(0);
  await expect(page.getByTestId("sim-challenge-beginner")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sim-spectro-answer")).toHaveCount(0);
  // 摆好光路并留下一笔观察，保存前不揭示答案。
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await page.getByRole("slider", { name: "狭缝宽度" }).fill("3.2");
  await page.getByRole("slider", { name: "目镜焦距" }).fill("5");
  await openRecord(page);
  await page.getByTestId("sim-record-no-absorption").check();
  await review(page);
  await page.getByTestId("sim-record-save").click();
  await expect(page.getByTestId("sim-record-saved")).toHaveAttribute("data-stale", "false");
  await page.getByTestId("sim-record-close").click();
  const answer = page.getByTestId("sim-spectro-answer");
  await expect(answer).toBeVisible();
  const name = (await answer.locator("strong").textContent())!;
  expect(SAMPLES_BY_DIFFICULTY.beginner.map((item) => item.name)).toContain(name);
  // 条件一变，旧记录过期，答案随之收起。
  await page.getByRole("slider", { name: "光源亮度" }).fill("30");
  await expect(answer).toHaveCount(0);
  // 本屏记录不进检测存储：独立挑战不碰检测会话。
  expect(await page.evaluate(() => sessionStorage.getItem("gem-lab-detection-v1"))).toBeNull();
  await expect(page.getByTestId("sim-challenge-detection")).toHaveAttribute("href", "/detection");
});

for (const sampleId of ["ruby", "amethyst"] as const) {
  test(`${sampleId}：重新开始任务不清掉抽样身份，挑战的样品与已保存记录始终对得上`, async ({ page }) => {
    const pool = SAMPLES_BY_DIFFICULTY.beginner;
    const index = pool.findIndex((sample) => sample.id === sampleId);
    expect(index).toBeGreaterThanOrEqual(0);
    const expected = pool[index];
    await page.goto("/sim/spectroscope/challenge");
    await ready(page);
    const beginner = page.getByTestId("sim-challenge-beginner");
    // 只固定本次点击触发的抽样随机数，随后立即恢复，避免影响三维模型等其他随机数用途。
    await beginner.evaluate((button, draw) => {
      button.addEventListener("click", () => {
        const random = Math.random;
        Math.random = () => { Math.random = random; return draw; };
      }, { capture: true, once: true });
    }, (index + 0.5) / pool.length);
    await beginner.click();
    await expect(page.getByTestId("sim-spectro-answer")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(expected.name);
    await page.getByTestId("sim-bench-power").click();
    await page.getByTestId("sim-bench-place").click();
    await openRecord(page);
    await page.getByTestId("sim-record-no-absorption").check();
    await review(page);
    await expect(page.locator("body")).not.toContainText(expected.name);
    await page.getByTestId("sim-record-save").click();
    await page.getByTestId("sim-record-close").click();
    const answerLabel = page.getByTestId("sim-spectro-answer").locator("strong");
    await expect(answerLabel).toHaveText(expected.name);
    const answer = (await answerLabel.textContent())!;
    // 去实验屏开始学员任务并「重新开始任务」：任务进度清空，挑战的抽样身份与记录照旧。
    await page.getByTestId("sim-screen-lab").click();
    await page.getByTestId("sim-task-student").click();
    await page.getByTestId("sim-task-restart").click();
    await page.getByTestId("sim-screen-challenge").click();
    await expect(beginner).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("sim-record-saved")).toHaveCount(0);
    await expect(answerLabel).toHaveText(answer);
    // 红宝石本来就能抽中并在保存后揭示；非红宝石案例额外防止串入默认教学样品。
    if (sampleId !== "ruby") await expect(page.locator("body")).not.toContainText("红宝石");
  });
}

test("检测流程内联：不显示屏幕导航、不揭示身份，保存逐字写回检测记录", async ({ page }) => {
  await detectionSample(page, "ruby");
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-screen", "challenge");
  await expect(page.getByTestId("sim-screen-learn")).toHaveCount(0);
  await expect(page.getByTestId("sim-home")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("红宝石");
  await expect(page.getByTestId("sim-spectro-unknown")).toBeVisible();
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await page.getByRole("slider", { name: "狭缝宽度" }).fill("3.2");
  await page.getByRole("slider", { name: "目镜焦距" }).fill("5");
  await openRecord(page);
  // 吸收线与吸收带与条件一起写回检测记录。
  await page.getByTestId("sim-record-line").fill("694");
  await page.getByTestId("sim-record-add-line").click();
  await page.getByTestId("sim-record-band-start").fill("535");
  await page.getByTestId("sim-record-band-end").fill("575");
  await page.getByTestId("sim-record-add-band").click();
  await review(page);
  const before = await detection(page);
  expect(before.instrumentsUsed).not.toContain("spectroscope");
  await page.getByTestId("sim-record-save").click();
  // 保存后回到检测流程的选择仪器一步。
  await expect(page.getByRole("heading", { name: "选择检测仪器" })).toBeVisible();
  const saved = await detection(page);
  expect(saved.spectroscope.observationStatus).toBe("observed");
  expect(saved.spectroscope.method).toBe("transmission");
  expect(saved.spectroscope.markedLines).toEqual([694]);
  expect(saved.spectroscope.bandRanges).toEqual([{ start: 535, end: 575 }]);
  expect(saved.spectroscope.notes).toContain("三维教学观察；棱镜式；透射观察");
  // 位置一律写 0–10 相对刻度，不再出现毫米。
  expect(saved.spectroscope.notes).toContain("狭缝 3.2 / 10");
  expect(saved.spectroscope.notes).not.toContain("mm");
  expect(saved.instrumentsUsed).toContain("spectroscope");
});

test("检测流程：未核定参考谱只保存待核说明，不计有效观察", async ({ page }) => {
  await detectionSample(page, "tourmaline");
  await expect(page.locator("body")).not.toContainText("碧玺");
  // 未开灯时说未开灯，不说「只看到连续光谱」；待核也写在状态行里。
  await expect(page.getByTestId("sim-spectro-status")).toContainText("光源尚未开启");
  await page.getByTestId("sim-bench-power").click();
  await expect(page.getByTestId("sim-spectro-status")).toContainText("样品尚未放入光路");
  await page.getByTestId("sim-bench-place").click();
  // 待核：读数框写明参考谱待核，不把空白写成「无特征」。
  await expect(page.getByTestId("sim-spectro-field")).toContainText("参考谱待核定");
  await expect(page.getByTestId("sim-spectro-nospectrum")).toContainText("参考谱尚未核定");
  await openRecord(page);
  await review(page);
  await expect(page.getByTestId("sim-record-confirm")).toContainText("仅作待核说明，不计有效观察");
  await page.getByTestId("sim-record-save").click();
  const saved = await detection(page);
  expect(saved.spectroscope.observationStatus).toBe("pending-reference");
  expect(saved.spectroscope.markedLines).toEqual([]);
  expect(saved.spectroscope.notes).toContain("教学谱图未核定，无法判断吸收情况");
  await page.goto("/assessment");
  await expect(page.getByText(/当前已完成 0 项有效观察/)).toBeVisible();
});

test("检测流程：反射法只练布置，保存为 setup-only", async ({ page }) => {
  await detectionSample(page, "ruby");
  await page.getByTestId("sim-method-internal-reflection").click();
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await openRecord(page);
  await review(page);
  await page.getByTestId("sim-record-save").click();
  const saved = await detection(page);
  expect(saved.spectroscope.observationStatus).toBe("setup-only");
  expect(saved.spectroscope.notes).toContain("未作有效吸收观察");
  await expect(page.getByRole("heading", { name: "选择检测仪器" })).toBeVisible();
  // 布置练习不计有效观察，也不能用于命名结论。
  await page.goto("/assessment");
  await expect(page.getByText(/当前已完成 0 项有效观察/)).toBeVisible();
});

test("检测流程：三维资产故障可回退 2D，待核样品仍不泄露身份", async ({ page }) => {
  await page.route("**/spectroscope-workbench/**/model.glb", (route) => route.abort());
  await detectionSample(page, "tourmaline", false);
  await expect(canvas(page)).toHaveAttribute("data-loaded", "false");
  await expect(page.getByRole("alert")).toContainText("工作台模型载入失败");
  await page.getByTestId("detection-use-2d").click();
  await expect(page.getByTestId("spectroscope-unverified-spectrum")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("碧玺");
});

test("检测流程的挑战屏也能用面板换机型，写回的方法随所选方式变化", async ({ page }) => {
  await detectionSample(page, "amethyst");
  await page.getByTestId("sim-machine-grating").click();
  await expect(canvas(page)).toHaveAttribute("data-rendered-instrument", "grating", { timeout: 60_000 });
  await page.getByTestId("sim-bench-power").click();
  await page.getByTestId("sim-bench-place").click();
  await page.getByRole("slider", { name: "光源亮度" }).fill("82");
  await page.getByRole("slider", { name: "灯头横移" }).fill("0");
  await expect(stage(page)).toHaveAttribute("data-problems", "");
  await openRecord(page);
  await page.getByTestId("sim-record-no-absorption").check();
  await review(page);
  await page.getByTestId("sim-record-save").click();
  const saved = await detection(page);
  expect(saved.spectroscope.notes).toContain("光栅式");
});

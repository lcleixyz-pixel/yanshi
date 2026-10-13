import { expect, test, type Page } from "@playwright/test";
import { SAMPLES_BY_ID } from "../src/data/samples";
import { requiredRefractometerMethod } from "../src/data/refractometerSampleMethod";

/**
 * 折射仪三屏（认识 / 实验 / 挑战）与旧入口重定向。
 * 引导任务的步骤、完成条件与学习记录规则沿用 `domain/refractometerCourse.ts`；
 * 三屏外壳与抽屉见 docs/折射仪迁入仿真外壳-2026-10-13.md。
 */

declare global {
  interface Window {
    __refStorage: { method: string; key: string }[];
    __loadMarker?: string;
  }
}

const LEARN = "/sim/refractometer/learn";
const LAB = "/sim/refractometer/lab";
const CHALLENGE = "/sim/refractometer/challenge";
const canvas = (page: Page) => page.getByTestId("optics3d-canvas");
const task = (page: Page) => page.getByTestId("sim-task");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const caseInfo = async (page: Page) => JSON.parse((await canvas(page).getAttribute("data-case")) ?? "{}");
const audits = async (page: Page) =>
  page.evaluate(() => window.__refStorage.filter((x) => x.key === "gem-lab-progress-v1"));

const ready = async (page: Page, version = "paper-optics-v2") => {
  await expect(canvas(page)).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-asset-version", version);
};

/** 引导任务：在任务卡里选身份（讲师演示 / 开始学习）。 */
const choose = async (page: Page, mode: "student" | "teacher") =>
  button(page, mode === "student" ? "开始学习（学员）" : "讲师演示").click();

/** 实验屏的操作台：开灯、滴液、放样、贴合。 */
async function benchReady(page: Page) {
  await button(page, "打开电源").click();
  await button(page, "滴一小滴接触液").click();
  await button(page, "台面朝下放样").click();
  await button(page, "轻推贴合").click();
}

/** 记录一次读数并保存（保存后记录页留在原位，显示已保存）。 */
async function record(page: Page, value: string, max?: string) {
  await page.getByTestId("sim-refracto-record-open").click();
  await page.getByTestId("sim-refracto-reading").fill(value);
  if (max !== undefined) await page.getByTestId("sim-refracto-reading-max").fill(max);
  await page.getByTestId("sim-refracto-save").click();
  await expect(page.getByTestId("sim-refracto-saved")).toContainText(value);
  await page.getByTestId("sim-refracto-record-close").click();
}

const answer = async (page: Page, id: string, option: number) => {
  const q = page.getByTestId(`question-${id}`);
  await q.getByRole("radio").nth(option).check();
  await q.getByRole("button", { name: "提交" }).click();
};

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await page.addInitScript(() => {
    window.__refStorage = [];
    for (const method of ["getItem", "setItem"] as const) {
      const original = Storage.prototype[method] as (...args: string[]) => unknown;
      Object.defineProperty(Storage.prototype, method, {
        value: function (key: string, ...args: string[]) {
          window.__refStorage.push({ method, key });
          return original.apply(this, [key, ...args] as [string, string]);
        },
      });
    }
  });
});

test("认识屏：结构、部件短名称、光路七段与引导任务前两步", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(LEARN);
  await ready(page);
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-sim", "refractometer");
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-screen", "learn");
  // 部件名称默认不显示；勾选后出现短名称标签。
  await expect(page.locator("[data-testid^='hotspot-']")).toHaveCount(0);
  await page.getByTestId("sim-check-names").check();
  await expect(page.locator("[data-named='true']").first()).toBeVisible();
  await page.getByTestId("sim-check-names").uncheck();
  // 拆解暂停光路，全部重置恢复。
  await page.getByRole("slider", { name: "连续拆解" }).fill("50");
  expect((await caseInfo(page)).suspended).toBe(true);
  await page.getByTestId("sim-reset").click();
  expect((await caseInfo(page)).suspended).toBe(false);
  // 引导任务：前两步（认识部件、跟随光路）。
  await choose(page, "student");
  await expect(task(page)).toContainText("认识部件");
  for (const id of ["test_prism", "internal_light", "internal_scale", "eyepiece", "cover", "oil_bottle"])
    await page.getByTestId(`sim-part-${id}`).click();
  await expect(task(page)).toContainText("跟随光路");
  for (let i = 0; i < 7; i++) await page.getByTestId(`sim-refracto-path-${i}`).click();
  await answer(page, "boundary", 0);
  await expect(task(page)).toContainText("本屏已完成");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await audits(page)).toEqual([]);
});

test("实验屏：操作条件决定案例与目镜视场，读数保存后记录归档", async ({ page }) => {
  await page.goto(LAB);
  await ready(page);
  const eyepiece = page.getByTestId("sim-refracto-eyepiece");
  // 未开灯：视场关闭，案例为空气间隙。
  await expect(eyepiece).toHaveAttribute("data-view", "off");
  await button(page, "打开电源").click();
  await expect(eyepiece).toHaveAttribute("data-view", "scale-only");
  await button(page, "滴一小滴接触液").click();
  await expect(eyepiece).toHaveAttribute("data-view", "oil-empty");
  await button(page, "台面朝下放样").click();
  await button(page, "轻推贴合").click();
  await expect(eyepiece).toHaveAttribute("data-view", "single");
  // 教学样品 1.718 的接触良好案例；操作条件同步三维。
  expect((await caseInfo(page)).id).toBe("sample-1.718");
  const operation = JSON.parse((await canvas(page).getAttribute("data-operation")) ?? "{}");
  expect(operation.partVisibility.contact_layer).toBe(true);
  expect(operation.partVisibility.isotropic_sample).toBe(true);
  // 记录读数：保存后条件不变，记录仍有效。
  await record(page, "1.718");
  // 转向后旧记录只标为过期，条件恢复后重新确认。
  await button(page, "取下转向 90° 并放回").click();
  await reviewSaved(page, "条件已变");
  await button(page, "轻推贴合").click();
  await record(page, "1.716", "1.720");
  await reviewSaved(page, "已保存");
  // 超接触液上限：只记「> 1.780」；换样品先取下，接触状态一并复位。
  await page.goto(`${LAB}?sample=diamond`);
  await ready(page);
  await expect(page.getByTestId("sim-sample-select")).toHaveValue("diamond");
  await benchReady(page);
  await expect(eyepiece).toHaveAttribute("data-view", "over-range");
  await page.getByTestId("sim-refracto-record-open").click();
  await expect(page.getByTestId("sim-refracto-over-oil")).toBeVisible();
  await page.getByTestId("sim-refracto-save").click();
  await expect(page.getByTestId("sim-refracto-saved")).toContainText("> 1.780");
});

const reviewSaved = async (page: Page, text: string) => {
  await page.getByTestId("sim-refracto-record-open").click();
  await expect(page.getByTestId("sim-refracto-saved")).toContainText(text);
  await page.getByTestId("sim-refracto-record-close").click();
};

test("挑战屏：抽未知样品不显示品种名，保存后揭示答案；记录只留本屏", async ({ page }) => {
  await page.goto(CHALLENGE);
  await ready(page);
  await expect(page.getByTestId("sim-refracto-unknown")).toBeVisible();
  const names = ["红宝石", "蓝宝石", "祖母绿", "紫水晶", "黄水晶", "铁铝榴石", "镁铝榴石", "橄榄石", "托帕石", "碧玺", "尖晶石", "坦桑石", "海蓝宝石", "锆石", "钻石", "月光石", "琥珀", "珍珠", "绿松石", "翡翠", "和田玉", "欧泊", "玛瑙", "玉髓", "大理石", "葡萄石", "岫玉", "金丝玉"];
  for (const difficulty of ["beginner", "intermediate", "advanced"] as const) {
    await page.getByTestId(`sim-challenge-${difficulty}`).click();
    await ready(page);
    const body = await page.locator("body").innerText();
    for (const name of names) expect(body, `${difficulty} 抽到样品后不得显示品种名`).not.toContain(name);
  }
  await benchReady(page);
  await record(page, "1.718");
  await expect(page.getByTestId("sim-refracto-answer")).toBeVisible();
  // 换难度重新抽样：记录与答案一并重置。
  await page.getByTestId("sim-challenge-beginner").click();
  await expect(page.getByTestId("sim-refracto-answer")).toHaveCount(0);
  expect(await audits(page)).toEqual([]);
});

test("操作条件不成立时不能记录；读错不进下一步，重读正确才继续", async ({ page }) => {
  // 讲师用 ?step= 直达第一次读数（跳步不写学习记录，便于单独检查读数门禁）。
  await page.goto(`${LAB}?mode=teacher&step=observe`);
  await ready(page);
  await expect(task(page)).toContainText("第一次读数");
  await page.getByTestId("sim-refracto-record-open").click();
  await expect(page.getByTestId("sim-refracto-save")).toBeDisabled();
  await page.getByTestId("sim-refracto-record-close").click();
  await button(page, "打开电源").click();
  // 只开灯（未滴液）也还不能读：视场只有空载刻度。
  await expect(page.getByTestId("sim-refracto-eyepiece")).toHaveAttribute("data-view", "scale-only");
  await button(page, "滴一小滴接触液").click();
  await button(page, "台面朝下放样").click();
  await button(page, "轻推贴合").click();
  await expect(page.getByTestId("sim-refracto-eyepiece")).toHaveAttribute("data-view", "single");
  // 读错：记录下来了，但引导任务的这一步不算完成。
  await record(page, "1.700");
  await expect(task(page)).toContainText("第一次读数");
  await expect(task(page)).toContainText("○独立读数并核对正确");
  // 读对：本步完成并顺延到换方向复核。
  await record(page, "1.718");
  await expect(task(page)).toContainText("换方向复核");
});

test("实验屏引导任务：学员走完八步才写入学习进度", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(LEARN);
  await ready(page);
  await choose(page, "student");
  for (const id of ["test_prism", "internal_light", "internal_scale", "eyepiece", "cover", "oil_bottle"])
    await page.getByTestId(`sim-part-${id}`).click();
  for (let i = 0; i < 7; i++) await page.getByTestId(`sim-refracto-path-${i}`).click();
  await answer(page, "boundary", 0);
  await page.getByTestId("sim-screen-lab").click();
  // 开灯、滴液、放样（含空载刻度）。
  await button(page, "打开电源").click();
  await button(page, "滴一小滴接触液").click();
  await button(page, "台面朝下放样").click();
  await expect(task(page)).toContainText("恢复光学接触");
  await button(page, "记录：无法可靠读数").click();
  await answer(page, "gap", 1);
  await button(page, "轻推贴合").click();
  await expect(task(page)).toContainText("第一次读数");
  await record(page, "1.718");
  await expect(task(page)).toContainText("换方向复核");
  await button(page, "取下转向 90° 并放回").click();
  await button(page, "轻推贴合").click();
  await record(page, "1.717", "1.719");
  await answer(page, "repeat", 0);
  await expect(task(page)).toContainText("解释与适用条件");
  await answer(page, "critical", 1);
  await answer(page, "air", 2);
  await answer(page, "limit", 0);
  await expect(task(page)).toContainText("清理复位");
  await button(page, "取下样品").click();
  await button(page, "擦净测台").click();
  await button(page, "擦净样品").click();
  await button(page, "关闭电源").click();
  await button(page, "合上翻盖").click();
  await expect(task(page)).toContainText("完成课程并记录");
  expect(await audits(page)).toEqual([]);
  await button(page, "完成课程并记录").click();
  await expect(page.getByText("已记录本次学习完成。")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gem-lab-progress-v1")!).state);
  expect(saved.completedDemos).toEqual([expect.objectContaining({ instrumentId: "refractometer", mode: "learning" })]);
  expect(saved.detectionHistory).toEqual([]);
  expect(errors).toEqual([]);
});

test("讲师演示与跳步都不写入学习进度", async ({ page }) => {
  // 认识屏：任务卡显示前两步；实验屏：显示本屏的步骤（同一任务的另两块）。
  await page.goto(LEARN);
  await ready(page);
  await choose(page, "teacher");
  await expect(task(page)).toContainText("认识部件");
  await page.getByTestId("sim-screen-lab").click();
  await ready(page);
  await expect(task(page)).toContainText("开灯与放样");
  await expect(task(page)).toHaveAttribute("data-suppressed", "false");
  // 重新开始任务：回到未选身份的状态，仍不写学习存储。
  await page.getByTestId("sim-task-restart").click();
  await expect(task(page)).toContainText("开始学习（学员）");
  expect(await audits(page)).toEqual([]);
});

test("模型载入失败后在原地重试，不刷新整页、不伪造完成", async ({ page }) => {
  let failed = false;
  await page.route("**/refractometer/paper-optics-v2/model.glb**", (route) => {
    if (!failed) { failed = true; return route.abort(); }
    return route.continue();
  });
  await page.goto(LAB);
  await expect(page.getByTestId("sim-refracto-retry")).toBeVisible({ timeout: 60_000 });
  const marker = await page.evaluate(() => (window.__loadMarker = "kept"));
  await page.getByTestId("sim-refracto-retry").click();
  await ready(page);
  expect(await page.evaluate(() => window.__loadMarker)).toBe(marker);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("投屏模式：隐藏顶栏、Esc 退出、焦点在页内循环并回到入口", async ({ page }) => {
  await page.goto(LAB);
  await ready(page);
  await page.getByTestId("sim-projection").click();
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-projection", "true");
  await expect(page.locator(".sim-shell__top")).toBeHidden();
  await expect(page.getByTestId("sim-projection-exit")).toBeFocused();
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="sim-shell"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sim-shell")).toHaveAttribute("data-projection", "false");
  await expect(page.getByTestId("sim-projection")).toBeFocused();
});

test("手机：控制面板收为底部抽屉，操作区与目镜视场都在屏幕内", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LAB);
  await ready(page);
  await expect(page.getByTestId("sim-controls-toggle")).toBeVisible();
  await page.getByTestId("sim-controls-toggle").click();
  await expect(page.locator(".sim-shell__panels")).toHaveAttribute("data-open", "true");
  await benchReady(page);
  await expect(page.getByTestId("sim-refracto-eyepiece")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});


// ── 检测流程接入（阶段 3a：折射仪检测改用三维外壳） ─────────────────────
test('检测流程里的折射仪走三维并写回记录', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.localStorage.setItem('gem-lab-progress-v1', JSON.stringify({ state: { onboarded: true, visitedKnowledgeBases: [], completedDemos: [], detectionHistory: [], totalPoints: 0 }, version: 1 }));
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/detection');
  await page.getByTestId('difficulty-beginner').click();
  await page.getByRole('button', { name: /抽取样品/ }).click();
  await page.getByRole('button', { name: /折射仪/ }).first().click();
  await expect(page.getByTestId('sim-shell')).toBeVisible();
  await expect(page.getByTestId('optics3d-canvas')).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
  const body = await page.locator('body').innerText();
  for (const n of ['红宝石', '蓝宝石', '尖晶石', '钻石', '翡翠', '玛瑙', '祖母绿'])
    expect(body, `不得显示品种名 ${n}`).not.toContain(n);
  for (const id of ['sim-refracto-power', 'sim-refracto-drop', 'sim-refracto-place', 'sim-refracto-recover']) await page.getByTestId(id).click();
  const view = await page.getByTestId('sim-refracto-eyepiece').getAttribute('data-view');
  expect(['single', 'double', 'spot', 'over-range']).toContain(view);
  // 抽样由页面随机完成；从检测会话取回样品，只为在测试侧算出该填的读数。
  const sampleId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1') ?? '{}')?.state?.sampleId) as string;
  const sample = SAMPLES_BY_ID[sampleId];
  const ri = sample.characteristics.refractiveIndex;
  await page.getByTestId('sim-refracto-record-open').click();
  if (ri === 'over-1.78' || Math.max(...(Array.isArray(ri) ? ri : [ri])) > 1.78) {
    expect(view).toBe('over-range');
    await page.getByTestId('sim-refracto-save').click();
  } else {
    const low = Array.isArray(ri) ? ri[0] : ri;
    const value = requiredRefractometerMethod(sample) === 'spot' ? (Math.round((Array.isArray(ri) ? (ri[0] + ri[1]) / 2 : ri) * 100) / 100).toFixed(2) : low.toFixed(3);
    await page.getByTestId('sim-refracto-reading').fill(value);
    await page.getByTestId('sim-refracto-save').click();
  }
  // 只做了一次观察：回到「选择仪器」继续，折射仪已计入已用仪器。
  await expect(page.getByRole('heading', { name: '选择检测仪器' })).toBeVisible({ timeout: 30_000 });
  const after = await page.locator('body').innerText();
  for (const n of ['红宝石', '蓝宝石', '尖晶石', '钻石']) expect(after).not.toContain(n);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gem-lab-detection-v1') ?? '{}')?.state);
  expect(saved.instrumentsUsed).toContain('refractometer');
  // 读数按 2D 检测同一份契约写回：刻面法记数值，超量程只记备注。
  if (saved.refractometer.riMin === null) expect(saved.refractometer.notes).toContain('> 1.780');
  else expect(saved.refractometer.riMin).toBeGreaterThan(1.3);
  expect(errors).toEqual([]);
});

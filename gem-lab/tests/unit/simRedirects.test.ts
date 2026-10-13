import test from "node:test";
import assert from "node:assert/strict";
import { legacySimRedirect, refractometerRedirect, spectroscopeRedirect } from "../../src/domain/simRedirects";

const to = (path: string, search = "") => spectroscopeRedirect(path, search);

test("两个 3D 探索页转入认识屏，并带上机型", () => {
  assert.equal(to("/explore/optics/prism-spectroscope"), "/sim/spectroscope/learn?machine=prism");
  assert.equal(to("/explore/optics/grating-spectroscope"), "/sim/spectroscope/learn?machine=grating");
});

test("课程入口保留讲师 / 学员与步骤，并落到该步骤所在的屏", () => {
  assert.equal(to("/explore/optics/prism-spectroscope", "?course=basic&mode=student"), "/sim/spectroscope/learn?machine=prism&mode=student");
  assert.equal(to("/explore/optics/prism-spectroscope", "?course=basic"), "/sim/spectroscope/learn?machine=prism&mode=teacher");
  assert.equal(to("/explore/optics/grating-spectroscope", "?course=basic&mode=student&step=parts"), "/sim/spectroscope/learn?machine=grating&mode=student&step=parts");
  assert.equal(to("/explore/optics/prism-spectroscope", "?course=basic&mode=teacher&step=tune"), "/sim/spectroscope/lab?machine=prism&mode=teacher&step=tune");
  assert.equal(to("/explore/optics/prism-spectroscope", "?course=basic&mode=student&step=explain"), "/sim/spectroscope/lab?machine=prism&mode=student&step=explain");
  // 不认识的步骤丢弃，仍进入认识屏。
  assert.equal(to("/explore/optics/prism-spectroscope", "?course=basic&mode=student&step=bogus"), "/sim/spectroscope/learn?machine=prism&mode=student");
});

test("照明夹样练习页转入实验屏，保留样品、观察方法与机型，未知值丢弃", () => {
  assert.equal(to("/explore/spectroscope-bench"), "/sim/spectroscope/lab");
  assert.equal(to("/explore/spectroscope-bench", "?sample=ruby&method=internal-reflection&instrument=grating"), "/sim/spectroscope/lab?sample=ruby&method=internal-reflection&machine=grating");
  assert.equal(to("/explore/spectroscope-bench", "?method=bogus&instrument=goniometer"), "/sim/spectroscope/lab");
});

test("尾斜杠按同一地址处理：旧练习页与两个探索页都照样重定向", () => {
  assert.equal(to("/explore/spectroscope-bench/"), "/sim/spectroscope/lab");
  assert.equal(to("/explore/spectroscope-bench//", "?sample=ruby"), "/sim/spectroscope/lab?sample=ruby");
  assert.equal(to("/explore/optics/prism-spectroscope/"), "/sim/spectroscope/learn?machine=prism");
  assert.equal(to("/explore/optics/grating-spectroscope/", "?course=basic&mode=student"), "/sim/spectroscope/learn?machine=grating&mode=student");
});

test("其他地址不改动：2D 演示与别的仪器照常", () => {
  assert.equal(to("/demo/spectroscope"), null);
  assert.equal(to("/knowledge/spectroscope"), null);
  assert.equal(to("/sim/spectroscope/learn"), null);
  // 折射仪由自己的映射处理，不落在分光镜映射里。
  assert.equal(to("/explore/optics/refractometer"), null);
});

// ── 折射仪（阶段 3a） ──────────────────────────────────────────────
const rTo = (path: string, search = "") => refractometerRedirect(path, search);

test("折射仪：自由探索与知识库入口进认识屏，带样品的入口进实验屏", () => {
  assert.equal(rTo("/explore/optics/refractometer"), "/sim/refractometer/learn");
  assert.equal(rTo("/explore/optics/refractometer/"), "/sim/refractometer/learn");
  assert.equal(rTo("/explore/optics/refractometer", "?sample=ruby"), "/sim/refractometer/lab?sample=ruby");
});

test("折射仪：课程入口保留讲师 / 学员与步骤，并落到该步骤所在的屏", () => {
  // 课程从第一步「认识部件」开始，未写步骤时进认识屏（与分光镜一致）。
  assert.equal(rTo("/explore/optics/refractometer", "?course=basic&mode=student"), "/sim/refractometer/learn?mode=student");
  assert.equal(rTo("/explore/optics/refractometer", "?course=basic"), "/sim/refractometer/learn?mode=teacher");
  assert.equal(rTo("/explore/optics/refractometer", "?course=basic&mode=student&step=parts"), "/sim/refractometer/learn?mode=student&step=parts");
  assert.equal(rTo("/explore/optics/refractometer", "?course=basic&mode=teacher&step=parts"), "/sim/refractometer/learn?mode=teacher&step=parts");
  assert.equal(rTo("/explore/optics/refractometer", "?course=basic&mode=student&step=observe"), "/sim/refractometer/lab?mode=student&step=observe");
  // 不认识的步骤丢弃，课程入口照常进认识屏。
  assert.equal(rTo("/explore/optics/refractometer", "?course=basic&mode=student&step=bogus"), "/sim/refractometer/learn?mode=student");
});

test("折射仪：其他地址与 2D 演示不改动", () => {
  assert.equal(rTo("/demo/refractometer"), null);
  assert.equal(rTo("/explore/optics/prism-spectroscope"), null);
  assert.equal(rTo("/sim/refractometer/lab"), null);
});

test("统一映射：分光镜与折射仪各走各的，两边都不误伤", () => {
  assert.equal(legacySimRedirect("/explore/optics/refractometer", ""), "/sim/refractometer/learn");
  assert.equal(legacySimRedirect("/explore/optics/prism-spectroscope", ""), "/sim/spectroscope/learn?machine=prism");
  assert.equal(legacySimRedirect("/demo/refractometer", ""), null);
});

test("偏光镜：五讲按屏落位并带上讲次，课程入口保留讲师 / 学员与步骤，画质参数保留", () => {
  const go = (path: string) => legacySimRedirect(path.split("?")[0], path.includes("?") ? `?${path.split("?")[1]}` : "");
  assert.equal(go("/explore/polariscope"), "/sim/polariscope/learn");
  assert.equal(go("/explore/polariscope/"), "/sim/polariscope/learn");
  assert.equal(go("/explore/polariscope?lesson=path"), "/sim/polariscope/learn?lesson=path");
  assert.equal(go("/explore/polariscope?lesson=sample"), "/sim/polariscope/lab?lesson=sample");
  assert.equal(go("/explore/polariscope?lesson=conoscope&quality=standard"), "/sim/polariscope/lab?lesson=conoscope&quality=standard");
  assert.equal(go("/explore/polariscope?course=basic"), "/sim/polariscope/learn?mode=teacher");
  assert.equal(go("/explore/polariscope?course=basic&mode=student&step=crossed"), "/sim/polariscope/learn?mode=student&step=crossed");
  assert.equal(go("/explore/polariscope?course=basic&mode=student&step=reorient"), "/sim/polariscope/lab?mode=student&step=reorient");
  assert.equal(go("/explore/polariscope?lesson=bogus&quality=ultra"), "/sim/polariscope/learn");
  assert.equal(go("/demo/polariscope"), null);
});

test("显微镜：3D 三路照明页转到认识屏（尾斜杠同一地址）", () => {
  assert.equal(legacySimRedirect("/explore/microscope", ""), "/sim/microscope/learn");
  assert.equal(legacySimRedirect("/explore/microscope/", ""), "/sim/microscope/learn");
});

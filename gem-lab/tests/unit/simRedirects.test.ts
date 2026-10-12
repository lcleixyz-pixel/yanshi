import test from "node:test";
import assert from "node:assert/strict";
import { spectroscopeRedirect } from "../../src/domain/simRedirects";

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

test("其他地址不改动：2D 演示与别的仪器照常", () => {
  assert.equal(to("/demo/spectroscope"), null);
  assert.equal(to("/explore/optics/refractometer"), null);
  assert.equal(to("/explore/polariscope"), null);
  assert.equal(to("/knowledge/spectroscope"), null);
  assert.equal(to("/sim/spectroscope/learn"), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLES_BY_ID } from "../../src/data/samples";
import { displaySpectrum, IDEAL_CONDITIONS, markMatches, resolvedApart, spectrumProblems } from "../../src/domain/spectrumDisplay";

const ruby = SAMPLES_BY_ID.ruby.spectrum.features;
const show = (patch: Partial<typeof IDEAL_CONDITIONS>) => displaySpectrum(ruby, { ...IDEAL_CONDITIONS, ...patch });
const weakCount = (d: ReturnType<typeof show>) => d.features.filter((f) => f.intensity === "weak").length;

// 参考光谱里相距不到 3 nm 的两对线：694 / 692、476 / 475，手持分光镜下各呈一条细线。
const IDEAL_COUNT = ruby.length - 2;

test("合适设置下与参考光谱一致：694 / 692、476 / 475 各显示为一条细线，其余特征都在", () => {
  const d = show({});
  assert.deepEqual(d.problems, []);
  assert.equal(d.features.length, IDEAL_COUNT);
  assert.deepEqual(d.features.filter((f) => f.wavelength >= 690).map((f) => [f.type, f.wavelength, f.intensity]), [["line", 694, "strong"]]);
  assert.deepEqual(d.features.filter((f) => f.wavelength >= 474 && f.wavelength <= 477).map((f) => [f.type, f.wavelength]), [["line", 476]]);
  assert.ok(!resolvedApart(d, 694, 692));
  assert.ok(resolvedApart(d, 668, 659));
  assert.equal(d.blurPx, 0);
});

test("狭缝过宽：668 / 659 也并成模糊的带，弱线先消失，恢复后与参考一致", () => {
  const d = show({ slit: 0.72 });
  assert.deepEqual(d.problems, ["slit-wide"]);
  assert.ok(!resolvedApart(d, 668, 659));
  assert.ok(d.features.some((f) => f.type === "band" && f.wavelength > 659 && f.wavelength < 668));
  assert.equal(weakCount(d), 0);
  assert.ok(d.features.some((f) => f.intensity === "strong"));
  assert.equal(show({ slit: 0.32 }).features.length, IDEAL_COUNT);
});

test("狭缝过窄：整体变暗、紫端更暗，弱线看不清", () => {
  const d = show({ slit: 0.08 });
  assert.deepEqual(d.problems, ["slit-narrow"]);
  assert.ok(d.brightness < 0.8);
  assert.ok(d.violetDim > 0.3);
  assert.equal(weakCount(d), 0);
});

test("焦距偏离只影响棱镜式：变模糊、弱线先消失；光栅式没有狭缝和焦距问题", () => {
  const d = show({ focus: 0.2 });
  assert.deepEqual(d.problems, ["defocus"]);
  assert.ok(d.blurPx > 3);
  assert.equal(weakCount(d), 0);
  const grating = show({ dispersion: "grating", focus: 0.2, slit: 0.9 });
  assert.deepEqual(grating.problems, []);
  assert.equal(grating.features.length, IDEAL_COUNT);
  assert.ok(grating.brightness < show({}).brightness);
});

test("透光太弱：整体变暗、蓝紫端先变黑；强特征仍在，「暗」不等于新的吸收", () => {
  const d = show({ light: "weak" });
  assert.deepEqual(d.problems, ["weak-light"]);
  assert.ok(d.brightness < 0.5 && d.violetDim >= 0.7);
  assert.ok(d.features.length < ruby.length);
  assert.ok(d.features.every((f) => ruby.some((r) => Math.abs(r.wavelength - f.wavelength) < 1)));
});

test("光没有穿过样品：只见连续光谱，没有任何吸收特征", () => {
  const d = show({ throughSample: false, slit: 0.9 });
  assert.deepEqual(spectrumProblems({ ...IDEAL_CONDITIONS, throughSample: false }), ["not-through-sample"]);
  assert.equal(d.features.length, 0);
});

test("标记匹配：线 ±4 nm，带在带宽内", () => {
  assert.ok(markMatches(691, { type: "line", wavelength: 694, intensity: "strong" }));
  assert.ok(!markMatches(688, { type: "line", wavelength: 694, intensity: "strong" }));
  assert.ok(markMatches(560, { type: "band", wavelength: 580, width: 80, intensity: "strong" }));
});

test("狭缝过宽且失焦同时出现时，强吸收带仍隐约可见，不会像连续光谱", () => {
  const d = show({ slit: 0.72, focus: 0.2 });
  assert.deepEqual(d.problems, ["slit-wide", "defocus"]);
  assert.ok(d.features.some((f) => f.wavelength === 580));
  assert.ok(d.features.length < ruby.length);
});

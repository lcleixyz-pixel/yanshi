import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLES_BY_ID } from "../../src/data/samples";
import { createBenchState, evaluateBench, type BenchState } from "../../src/domain/spectroscopeBench";
import { fieldChecks, yardstickStatus } from "../../src/domain/spectroscopeCopy";

const bench = (patch: Partial<BenchState> = {}) => ({ ...createBenchState("prism"), ...patch });
const of = (id: string, patch: Partial<BenchState> = {}) => {
  const sample = SAMPLES_BY_ID[id];
  const state = bench(patch);
  return { sample, state, evaluation: evaluateBench(sample, state) };
};

test("关灯时读数不写「吸收特征 无」，也不报 400–700 nm 的假范围", () => {
  const { evaluation } = of("ruby");
  const checks = fieldChecks(evaluation, "prism");
  assert.equal(checks.range, "—");
  assert.equal(checks.features, "未显示");
  assert.match(yardstickStatus(evaluation, "prism"), /光源尚未开启/);
});

test("光绕过样品时说样品没进光路，不说「只看到光源的连续光谱」是样品的观察结果", () => {
  const { evaluation } = of("ruby", { power: true });
  assert.equal(yardstickStatus(evaluation, "prism"), "样品尚未放入光路；当前连续光谱来自光源，不能作为样品的观察记录。");
  assert.equal(fieldChecks(evaluation, "prism").features, "未显示");
});

test("参考谱待核：写明待核，不显示空白谱，也不报特征数", () => {
  const { evaluation } = of("tourmaline", { power: true, samplePlaced: true });
  const checks = fieldChecks(evaluation, "prism");
  assert.equal(checks.showSpectrum, false);
  assert.equal(checks.features, "参考谱待核定");
  assert.match(checks.noSpectrumText, /参考谱尚未核定/);
  assert.match(yardstickStatus(evaluation, "prism"), /参考谱尚未核定/);
});

test("条件合适时才报范围与特征数；出问题时报对应的问题说明", () => {
  // amethyst 品种为透明，透射条件合适时是「参考谱照常显示、无特征可标」的情形。
  const good = of("amethyst", { power: true, samplePlaced: true, slit: 0.32, focus: 0.5 });
  const checks = fieldChecks(good.evaluation, "prism");
  assert.equal(checks.showSpectrum, true);
  assert.equal(checks.range, "400–700 nm");
  assert.equal(checks.features, "无");
  assert.equal(yardstickStatus(good.evaluation, "prism"), "光穿过样品，狭缝与焦距合适。");
  const wide = of("amethyst", { power: true, samplePlaced: true, slit: 0.9, focus: 0.5 });
  assert.match(yardstickStatus(wide.evaluation, "prism"), /狭缝过宽/);
});

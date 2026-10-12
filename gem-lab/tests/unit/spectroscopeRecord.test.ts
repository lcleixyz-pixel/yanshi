import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLES_BY_ID } from "../../src/data/samples";
import { createBenchState, evaluateBench } from "../../src/domain/spectroscopeBench";
import { canSaveRecord, observationText, recordData } from "../../src/domain/spectroscopeRecord";

/** 合适设置：光源已开、样品已放、棱镜式狭缝与焦距合适。 */
const ready = (sampleId: string, patch: Partial<ReturnType<typeof createBenchState>> = {}) => {
  const sample = SAMPLES_BY_ID[sampleId];
  const state = { ...createBenchState("prism"), power: true, samplePlaced: true, ...patch };
  return { sample, state, evaluation: evaluateBench(sample, state) };
};

test("透射且条件合适时按标记记录吸收线与吸收带", () => {
  const { sample, state, evaluation } = ready("ruby");
  const input = { state, evaluation, marks: [694], bands: [{ start: 535, end: 575 }], noAbsorption: false, notes: "" };
  assert.equal(observationText(input), "694 nm 线；535–575 nm 带");
  const data = recordData(input);
  assert.equal(data.observationStatus, "observed");
  assert.deepEqual(data.markedLines, [694]);
  assert.deepEqual(data.bandRanges, [{ start: 535, end: 575 }]);
  assert.match(data.notes, /三维教学观察；棱镜式；透射观察/);
  assert.ok(canSaveRecord(input, true));
  assert.equal(canSaveRecord(input, false), false, "观察器未就绪时不能保存");
});

test("未见明显特征按本轮条件记录，不写标记", () => {
  const { state, evaluation } = ready("ruby");
  const input = { state, evaluation, marks: [], bands: [], noAbsorption: true, notes: "" };
  assert.equal(observationText(input), "本次条件下未见明显特征吸收");
  const data = recordData(input);
  assert.equal(data.observationStatus, "observed");
  assert.deepEqual(data.markedLines, []);
  assert.ok(canSaveRecord(input, true));
});

test("条件不合适时不能保存，也没有可记录的内容", () => {
  const sample = SAMPLES_BY_ID.ruby;
  const state = { ...createBenchState("prism"), power: true, samplePlaced: false };
  const evaluation = evaluateBench(sample, state);
  const input = { state, evaluation, marks: [], bands: [], noAbsorption: false, notes: "" };
  assert.equal(canSaveRecord(input, true), false);
  assert.equal(evaluation.canRecord, false);
});

test("反射法只保存布置说明：不计有效观察，不写标记", () => {
  const { sample } = ready("ruby");
  const state = { ...createBenchState("prism"), power: true, samplePlaced: true, method: "internal-reflection" as const, lampAngle: 45 };
  const evaluation = evaluateBench(sample, state);
  const input = { state, evaluation, marks: [694], bands: [], noAbsorption: false, notes: "" };
  assert.equal(observationText(input), "照明布置练习：缺少该样品对应方法的参考谱，未作有效吸收观察");
  const data = recordData(input);
  assert.equal(data.observationStatus, "setup-only");
  assert.deepEqual(data.markedLines, []);
  assert.match(data.notes, /仅保存布置条件，未显示或推定该样品的反射光谱/);
  assert.ok(canSaveRecord(input, true), "布置练习仍可保存说明");
});

test("参考谱未核定的样品记为待核，不能当成未见吸收", () => {
  const { sample, state, evaluation } = ready("tourmaline");
  const input = { state, evaluation, marks: [], bands: [], noAbsorption: true, notes: "" };
  assert.equal(evaluation.referenceStatus, "unverified");
  assert.equal(observationText(input), "教学谱图未核定，无法判断吸收情况");
  const data = recordData(input);
  assert.equal(data.observationStatus, "pending-reference");
  assert.deepEqual(data.markedLines, []);
  assert.ok(canSaveRecord(input, true));
});

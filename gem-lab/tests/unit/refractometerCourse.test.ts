import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  allComplete,
  COURSE_RI,
  deriveCourse,
  initialCourse,
  isComplete,
  KEY_PARTS,
  maySaveProgress,
  navigateCourse,
  operate,
  PATH_STAGES,
  QUESTIONS,
  STEPS,
  submitReading,
  type CourseState,
} from "../../src/domain/refractometerCourse";
import { checkRI } from "../../src/domain/refractometerAssessment";

function valid(): CourseState {
  return {
    ...initialCourse("student"),
    step: "observe",
    power: true,
    liquid: "drop",
    sample: "placed",
    contact: "good",
  };
}

test("所有无效接触条件都不能接受数值；拆解也暂停读数", () => {
  for (const patch of [
    { power: false },
    { liquid: "none" as const },
    { sample: "none" as const },
    { contact: "air-gap" as const },
    { explode: 0.5 },
    { isolated: true },
  ]) {
    const s = { ...valid(), ...patch };
    assert.equal(deriveCourse(s).validReading, false);
    assert.deepEqual(submitReading(s, COURSE_RI), s);
  }
  for (const n of [NaN, Infinity, 1.2, 1.8])
    assert.deepEqual(submitReading(valid(), n), valid());
});
test("状态驱动示例、部件与观察视场；空气间隙无边界，贴合后有效", () => {
  let s = navigateCourse(initialCourse("student"), "prepare");
  s = operate(s, "power");
  assert.equal(deriveCourse(s).view, "scale-only");
  s = operate(s, "drop");
  assert.equal(deriveCourse(s).view, "oil-empty");
  s = operate(s, "place");
  assert.equal(isComplete(s, "prepare"), true);
  s = navigateCourse(s, "contact");
  s = { ...s, invalidRecorded: true, answers: { gap: 1 } };
  assert.equal(deriveCourse(s).caseId, "spinel-air-gap");
  assert.equal(deriveCourse(s).view, "scale-only");
  assert.equal(deriveCourse(s).partVisibility.isotropic_sample, true);
  s = operate(s, "recover");
  assert.equal(isComplete(s, "contact"), true);
  assert.equal(deriveCourse(s).view, "single");
  assert.equal(deriveCourse(s).caseId, "spinel-good");
});
test("复核必须独立读数且换到不同方向，换向需重新恢复接触", () => {
  let s = submitReading(valid(), COURSE_RI);
  s = { ...s, step: "verify", answers: { repeat: 0 } };
  assert.equal(isComplete(s, "verify"), false);
  s = submitReading(s, COURSE_RI);
  assert.equal(isComplete(s, "verify"), false);
  s = operate(s, "turn");
  assert.equal(deriveCourse(s).validReading, false);
  assert.equal(s.angle, 90);
  assert.equal(submitReading(s, COURSE_RI), s);
  s = operate(s, "recover");
  s = submitReading(s, 1.6);
  assert.equal(isComplete(s, "verify"), false);
  s = submitReading(s, COURSE_RI);
  assert.equal(isComplete(s, "verify"), true);
});
test("±0.005 的上下端点等价；超出容差仍不通过，双值规则也保留", () => {
  for (const ri of [1.713, 1.723])
    assert.equal(checkRI(ri, null, COURSE_RI, "facet"), true);
  for (const ri of [1.712999, 1.723001])
    assert.equal(checkRI(ri, null, COURSE_RI, "facet"), false);
  assert.equal(checkRI(1.535, 1.549, [1.54, 1.544], "facet"), true);
  assert.equal(checkRI(1.535, 1.55, [1.54, 1.544], "facet"), false);
});
test("完成门槛包括所有步骤，讲师与曾经跳步者均不得写进度", () => {
  const complete: CourseState = {
    ...valid(),
    partsSeen: KEY_PARTS.map((p) => p.id),
    pathSeen: PATH_STAGES.map((_, i) => i),
    answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, q.correct])),
    scaleSeen: true,
    placedCorrectly: true,
    invalidRecorded: true,
    recovered: true,
    readings: [
      { value: COURSE_RI, angle: 0, epoch: 1, correct: true },
      { value: COURSE_RI, angle: 90, epoch: 2, correct: true },
    ],
    sample: "none",
    liquid: "none",
    stageClean: true,
    sampleClean: true,
    power: false,
    cover: "closed",
  };
  assert.equal(allComplete(complete), true);
  assert.equal(maySaveProgress(complete), true);
  assert.equal(maySaveProgress({ ...complete, mode: "teacher" }), false);
  let skipped = navigateCourse(complete, "prepare", true);
  skipped = navigateCourse(skipped, "parts");
  assert.equal(skipped.hasSkipped, true);
  assert.equal(
    maySaveProgress({ ...complete, hasSkipped: skipped.hasSkipped }),
    false,
  );
  for (const step of STEPS) assert.equal(isComplete(complete, step.id), true);
  assert.equal(allComplete({ ...complete, sampleClean: false }), false);
});
test("翻盖不能压住样品；清洁前需取下；恢复动作不提前通过原因判断", () => {
  let s: CourseState = {
    ...valid(),
    step: "contact" as const,
    contact: "air-gap" as const,
  };
  assert.equal(operate(s, "cover"), s);
  assert.equal(operate(s, "clean-stage"), s);
  s = operate(s, "recover");
  assert.equal(s.recovered, false);
  s = operate(s, "remove");
  s = operate(s, "clean-stage");
  assert.equal(s.stageClean, true);
});
test("v2 的课程 RI 与原样品数据及观察使用值一致，四个 v1 案例原样保留", () => {
  const base = new URL(
    "../../public/assets/3d/refractometer/",
    import.meta.url,
  );
  const v2 = JSON.parse(
    fs.readFileSync(
      new URL("paper-optics-v2/optical-cases.json", base),
      "utf8",
    ),
  );
  const v1 = JSON.parse(
    fs.readFileSync(
      new URL("paper-optics-v1/optical-cases.json", base),
      "utf8",
    ),
  );
  for (const old of v1.cases)
    assert.deepEqual(
      v2.cases.find((c: { id: string }) => c.id === old.id),
      old,
    );
  const good = v2.cases.find((c: { id: string }) => c.id === "spinel-good");
  assert.equal(good.parameters.sampleIndex, COURSE_RI);
  assert.equal(Number(good.readout.sampleRI), deriveCourse(valid()).sampleRI);
  assert.equal(
    v2.cases.find((c: { id: string }) => c.id === "spinel-air-gap").readout
      .sampleRI,
    null,
  );
});

// Power affects illumination, not the already established material interfaces.
test("关灯不把良好接触改成空气间隙；观察和光线仍关闭", () => {
  const off = { ...valid(), power: false, rays: true };
  assert.equal(deriveCourse(off).caseId, "spinel-good");
  assert.equal(deriveCourse(off).view, "off");
  assert.equal(deriveCourse(off).rays, false);
});

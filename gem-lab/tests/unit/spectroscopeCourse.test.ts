import test from "node:test";
import assert from "node:assert/strict";
import { allComplete, checkMarks, display, initialCourse, isComplete, KEY_PARTS, maySaveProgress, navigateCourse, operate, PATH_CASES, QUESTIONS, STEPS, type CourseState, type Operation } from "../../src/domain/spectroscopeCourse";

const run = (s: CourseState, ...ops: Operation[]) => ops.reduce(operate, s);
const answer = (id: string): Operation => ({ type: "answer", id, option: QUESTIONS.find((q) => q.id === id)!.correct });

function completeAll(mode: "student" | "teacher" = "student") {
  let s = initialCourse(mode);
  s = run(s, ...KEY_PARTS.map((p) => ({ type: "see-part", id: p.id }) as Operation));
  s = run(s, ...PATH_CASES.map((c) => ({ type: "see-case", id: c.id }) as Operation), answer("dispersion"));
  s = run(s, { type: "record-continuous" }, { type: "through-sample", on: true }, answer("continuous"));
  s = run(s, { type: "slit", value: 0.32 }, { type: "focus", value: 0.5 }, answer("slit"));
  s = run(s, { type: "mark", wavelength: 693 }, { type: "mark", wavelength: 580 }, { type: "mark", wavelength: 476 }, { type: "check" });
  s = run(s, answer("dark"), answer("grating"), answer("evidence"));
  return s;
}

test("初始条件故意不合适：光绕过样品只见连续光谱，狭缝过宽且失焦", () => {
  const s = initialCourse("student");
  assert.equal(display(s).features.length, 0);
  assert.deepEqual(display(s).problems, ["not-through-sample"]);
  const through = operate(s, { type: "through-sample", on: true });
  assert.deepEqual(display(through).problems, ["slit-wide", "defocus"]);
});

test("只有光绕过样品时才能记录「连续光谱」；对光后才算完成照明步骤", () => {
  let s = operate(initialCourse("student"), { type: "through-sample", on: true });
  assert.equal(operate(s, { type: "record-continuous" }).continuousRecorded, false);
  s = run(initialCourse("student"), { type: "record-continuous" }, answer("continuous"));
  assert.equal(isComplete(s, "light"), false);
  assert.equal(isComplete(operate(s, { type: "through-sample", on: true }), "light"), true);
});

test("条件不合适时不能核对标记；改变条件会清除标记", () => {
  let s = run(initialCourse("student"), { type: "through-sample", on: true }, { type: "mark", wavelength: 580 }, { type: "check" });
  assert.equal(s.checked, false);
  s = run(s, { type: "slit", value: 0.32 }, { type: "focus", value: 0.5 });
  assert.deepEqual(s.marks, []);
  s = run(s, { type: "mark", wavelength: 580 }, { type: "check" });
  assert.equal(s.checked, true);
  assert.equal(operate(s, { type: "focus", value: 0.3 }).checked, false);
});

test("核对按诊断特征分组：至少找到三组，偏离的标记单独列出", () => {
  const r = checkMarks([693, 580, 476, 530]);
  assert.equal(r.foundCount, 3);
  assert.deepEqual(r.stray, [530]);
  assert.equal(checkMarks([694, 692]).foundCount, 1);
});

test("学员全部完成且未跳步才可写入；讲师或跳步都不写入", () => {
  const done = completeAll();
  assert.ok(STEPS.every((step) => isComplete(done, step.id)));
  assert.ok(allComplete(done));
  assert.equal(maySaveProgress(done), true);
  assert.equal(maySaveProgress(completeAll("teacher")), false);
  assert.equal(maySaveProgress(navigateCourse(done, "explain", true)), false);
});

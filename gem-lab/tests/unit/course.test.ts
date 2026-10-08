import test from "node:test";
import assert from "node:assert/strict";
import { mayRecordLearning, noRecordReason, stepLocked } from "../../src/domain/course";

const steps = [
  { id: "a", title: "A", task: "" },
  { id: "b", title: "B", task: "" },
  { id: "c", title: "C", task: "" },
] as const;

test("学员模式只能进入前面都已完成的步骤，讲师可以自由跳转", () => {
  const done = new Set(["a"]);
  const isComplete = (id: string) => done.has(id);
  assert.equal(stepLocked(steps, 1, 0, "student", isComplete), false);
  assert.equal(stepLocked(steps, 2, 0, "student", isComplete), true);
  assert.equal(stepLocked(steps, 2, 0, "teacher", isComplete), false);
  // 已经到达的步骤（不在当前步之后）不锁定，便于回看。
  assert.equal(stepLocked(steps, 2, 2, "student", isComplete), false);
});

test("只有学员、未跳步、全部完成才写入学习进度", () => {
  assert.equal(mayRecordLearning("student", false, true), true);
  assert.equal(mayRecordLearning("teacher", false, true), false);
  assert.equal(mayRecordLearning("student", true, true), false);
  assert.equal(mayRecordLearning("student", false, false), false);
  assert.match(noRecordReason("teacher"), /讲师演示/);
  assert.match(noRecordReason("student"), /跳步/);
});

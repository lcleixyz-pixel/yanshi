import test from "node:test";
import assert from "node:assert/strict";
import { mayRecordLearning, noRecordReason, stepLocked } from "../../src/domain/course";

test("与偏光镜一致：步骤条只能回到已到达过的最远一步，两种模式相同", () => {
  assert.equal(stepLocked(0, 0), false);
  assert.equal(stepLocked(1, 0), true);
  // 已经到达过的步骤可以回看。
  assert.equal(stepLocked(2, 3), false);
  assert.equal(stepLocked(3, 3), false);
  assert.equal(stepLocked(4, 3), true);
});

test("只有学员、未跳步、全部完成才写入学习进度", () => {
  assert.equal(mayRecordLearning("student", false, true), true);
  assert.equal(mayRecordLearning("teacher", false, true), false);
  assert.equal(mayRecordLearning("student", true, true), false);
  assert.equal(mayRecordLearning("student", false, false), false);
  assert.match(noRecordReason("teacher"), /讲师演示/);
  assert.match(noRecordReason("student"), /跳步/);
});

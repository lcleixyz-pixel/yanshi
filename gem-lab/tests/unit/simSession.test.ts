import test from "node:test";
import assert from "node:assert/strict";
import { createSimSession, parseSimScreen, simReducer, type SimAction, type SimSession } from "../../src/domain/simSession";

const run = (s: SimSession, ...actions: SimAction[]) => actions.reduce(simReducer, s);
const initial = { lamp: 0, placed: [] as string[] };
const start = () => createSimSession("learn", { learn: initial, lab: initial });

test("切换屏幕只换当前屏，各屏场景与任务进度都保留", () => {
  const s = run(start(),
    { type: "patch-scene", screen: "learn", patch: { lamp: 3 } },
    { type: "task-done", id: "a" },
    { type: "screen", screen: "lab" },
    { type: "patch-scene", screen: "lab", patch: { lamp: 7 } },
    { type: "screen", screen: "learn" });
  assert.equal(s.screen, "learn");
  assert.equal(s.scenes.learn?.lamp, 3);
  assert.equal(s.scenes.lab?.lamp, 7);
  assert.deepEqual(s.task.done, ["a"]);
});

test("全部重置只恢复当前屏场景，不动其他屏和任务进度、跳步、讲师记录", () => {
  const s = run(start(),
    { type: "patch-scene", screen: "learn", patch: { lamp: 3 } },
    { type: "patch-scene", screen: "lab", patch: { lamp: 7 } },
    { type: "task-done", id: "a" }, { type: "task-skip" }, { type: "task-teacher" },
    { type: "reset-scene", screen: "lab", initial });
  assert.equal(s.scenes.lab?.lamp, 0);
  assert.equal(s.scenes.learn?.lamp, 3);
  assert.deepEqual(s.task, { open: true, done: ["a"], hasSkipped: true, teacherUsed: true, data: {} });
});

test("重置得到初始场景的副本，之后修改不会改动初始值", () => {
  const s = run(start(), { type: "reset-scene", screen: "lab", initial });
  (s.scenes.lab!.placed as string[]).push("x");
  assert.deepEqual(initial.placed, []);
});

test("收起任务卡只隐藏，不清进度；重新开始任务清进度与跳步、保留讲师记录与场景", () => {
  let s = run(start(), { type: "task-done", id: "a" }, { type: "task-skip" }, { type: "task-teacher" }, { type: "patch-scene", screen: "learn", patch: { lamp: 5 } }, { type: "task-open", open: false });
  assert.equal(s.task.open, false);
  assert.deepEqual(s.task.done, ["a"]);
  s = simReducer(s, { type: "task-restart" });
  assert.deepEqual(s.task, { open: true, done: [], hasSkipped: false, teacherUsed: true, data: {} });
  assert.equal(s.scenes.learn?.lamp, 5);
});

test("会话选项与任务自有状态：换屏与全部重置都不动，重新开始任务清任务状态", () => {
  const s = run(createSimSession("learn", { learn: initial, lab: initial }, true, { options: { machine: "prism" }, taskData: { step: "parts" } }),
    { type: "patch-options", patch: { machine: "grating" } },
    { type: "task-patch", patch: { step: "path", answers: { q1: 0 } } },
    { type: "patch-scene", screen: "learn", patch: { lamp: 9 } },
    { type: "reset-scene", screen: "learn", initial });
  assert.equal(s.options.machine, "grating");
  assert.deepEqual(s.task.data, { step: "path", answers: { q1: 0 } });
  const restarted = simReducer(s, { type: "task-restart" });
  assert.deepEqual(restarted.task.data, {});
  assert.deepEqual(restarted.options, { machine: "grating" });
  assert.deepEqual(restarted.scenes.learn, initial);
});

test("初始场景与任务自有状态都是副本，之后修改不会改动传入值", () => {
  const taskData = { step: "parts" };
  const s = run(createSimSession("learn", { learn: initial }, true, { taskData }),
    { type: "task-patch", patch: { step: "path" } });
  assert.equal(taskData.step, "parts");
  assert.equal(s.task.data.step, "path");
});

test("地址里不认识或该仿真没有的屏幕，退回第一块可用屏幕", () => {
  assert.equal(parseSimScreen("lab", ["learn", "lab", "challenge"]), "lab");
  assert.equal(parseSimScreen("lab", ["learn"]), "learn");
  assert.equal(parseSimScreen(undefined, ["learn", "lab"]), "learn");
  assert.equal(parseSimScreen("unknown", ["learn", "lab"]), "learn");
});

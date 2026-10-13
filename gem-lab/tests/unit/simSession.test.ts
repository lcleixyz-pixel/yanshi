import test from "node:test";
import assert from "node:assert/strict";
import { createSimSession, parseSimScreen, simReducer, taskChecklist, type SimAction, type SimSession } from "../../src/domain/simSession";

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

test("任务卡清单：已在清单里的题不再另列「检查一下」，题目在它前面的操作做完后才出现", () => {
  // 分光镜「对光与照明」：记录与题目同 id，题目排在两项操作之后。
  const light = (recorded: boolean, placed: boolean) => taskChecklist(
    [{ id: "continuous", label: "记录：只见连续光谱", done: recorded }, { id: "placed", label: "夹样", done: placed }, { id: "continuous", label: "回答：连续光谱说明什么", done: false }],
    [{ id: "continuous", label: "连续光谱说明什么", done: false }],
  );
  assert.deepEqual(light(false, false).items.map((item) => item.label), ["记录：只见连续光谱", "夹样", "回答：连续光谱说明什么"]);
  assert.equal(light(false, false).ready("continuous"), false);
  assert.equal(light(true, false).ready("continuous"), false);
  assert.equal(light(true, true).ready("continuous"), true);
  // 折射仪「恢复接触」：题目夹在两项操作之间，只等前面的记录。
  const contact = taskChecklist(
    [{ id: "invalid", label: "记录：不能读数", done: true }, { id: "gap", label: "回答：为什么不能读", done: false }, { id: "recovered", label: "轻推恢复贴合", done: false }],
    [{ id: "gap", label: "为什么不能读", done: false }],
  );
  assert.equal(contact.ready("gap"), true);
  // 只有问答的一步直接出现；不在清单里的题另列一条，等本步操作全做完。
  assert.equal(taskChecklist([{ id: "dark", label: "透光太弱", done: false }], [{ id: "dark", label: "透光太弱", done: false }]).ready("dark"), true);
  const extra = taskChecklist([{ id: "cases", label: "查看光路", done: false }], [{ id: "q", label: "光谱怎样形成", done: false }]);
  assert.deepEqual(extra.items.map((item) => item.label), ["查看光路", "检查一下：光谱怎样形成"]);
  assert.equal(extra.ready("q"), false);
});

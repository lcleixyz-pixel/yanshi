import test from "node:test";
import assert from "node:assert/strict";
import { COURSE_CONFIG } from "../../src/domain/spectroscopeCourse";
import {
  applyOperation, changeLabMachine, changeLabSample, courseInitialLab, courseView, drawChallenge, emptyTaskData, labInitial, patchLab, readLabScene, readLearnScene, readTaskData,
} from "../../src/domain/spectroscopeSim";

const machine = "prism";
const parts = COURSE_CONFIG.prism.parts.map((item) => item.id);
const start = () => ({ task: emptyTaskData(), scene: labInitial(machine) });

test("任务状态：缺失或残缺的数据回落到初值，不认识的值不沿用", () => {
  const empty = readTaskData(undefined);
  assert.deepEqual(empty.byVariant.prism, { partsSeen: [], casesSeen: [], answers: {}, continuousRecorded: false, completed: [] });
  assert.equal(empty.mode, null);
  assert.equal(empty.step, "parts");
  const broken = readTaskData({ mode: "guest", step: "bogus", hasSkipped: "yes", byVariant: { prism: { partsSeen: [7, "slitHousing"] } } });
  assert.equal(broken.mode, null);
  assert.equal(broken.step, "parts");
  assert.equal(broken.hasSkipped, false);
  assert.deepEqual(broken.byVariant.prism.partsSeen, ["slitHousing"]);
  assert.deepEqual(broken.byVariant.grating.partsSeen, []);
});

test("场景读取：不认识的样品与观察方式回落到默认值", () => {
  const lab = readLabScene({ sampleId: "not-a-sample", method: "reflection-x" }, machine);
  assert.equal(lab.sampleId, "ruby");
  assert.equal(lab.method, "transmission");
  assert.equal(lab.bench.dispersion, machine);
  const learn = readLearnScene({ byVariant: { grating: { view: "optics", caseId: "order-1" } } });
  assert.deepEqual(learn.byVariant.grating, { view: "optics", caseId: "order-1" });
  assert.deepEqual(learn.byVariant.prism, { view: "whole", caseId: null });
});

test("操作写回正确的切片：部件与答案进任务状态，标记与工作台进场景", () => {
  let { task, scene } = start();
  for (const id of parts) ({ task, scene } = applyOperation(task, scene, machine, { type: "see-part", id }));
  ({ task, scene } = applyOperation(task, scene, machine, { type: "answer", id: "dispersion", option: 0 }));
  ({ task, scene } = applyOperation(task, scene, machine, { type: "mark", wavelength: 694 }));
  assert.deepEqual(task.byVariant.prism.partsSeen, parts);
  assert.equal(task.byVariant.prism.answers.dispersion, 0);
  assert.deepEqual(task.byVariant.prism.casesSeen, []);
  assert.deepEqual(scene.marks, [694]);
  assert.equal(scene.checked, false);
});

test("步骤按顺序顺延：本屏步骤做完后，当前步转到下一步", () => {
  let { task, scene } = start();
  assert.equal(courseView(task, scene, machine, "learn").state.step, "parts");
  for (const id of parts) ({ task, scene } = applyOperation(task, scene, machine, { type: "see-part", id }));
  assert.equal(task.step, "path");
  assert.equal(courseView(task, scene, machine, "learn").state.step, "path");
  // 实验屏显示的是本屏自己的第一步，而不是另一屏的当前步。
  assert.equal(courseView(task, scene, machine, "lab").state.step, "light");
});

test("两个机型各存一份进度，切换机型不丢已完成的步骤", () => {
  let { task, scene } = start();
  for (const id of parts) ({ task, scene } = applyOperation(task, scene, machine, { type: "see-part", id }));
  assert.deepEqual(task.byVariant.grating.partsSeen, []);
  assert.equal(courseView(task, scene, "grating", "learn").progress.done, 0);
  assert.equal(courseView(task, scene, machine, "learn").progress.done, 1);
  // 光栅式的部件少一个，切换后按光栅式的清单继续。
  let gratingTask = task;
  for (const id of COURSE_CONFIG.grating.parts.map((item) => item.id)) ({ task: gratingTask, scene } = applyOperation(gratingTask, scene, "grating", { type: "see-part", id }));
  assert.deepEqual(gratingTask.byVariant.grating.partsSeen, COURSE_CONFIG.grating.parts.map((item) => item.id));
  assert.deepEqual(gratingTask.byVariant.prism.partsSeen, parts);
});

test("任务卡条目与检查一下：认识屏给部件清单与光谱一题，实验屏给对光相关条目", () => {
  const { task, scene } = start();
  const learn = courseView(task, scene, machine, "learn");
  assert.equal(learn.items.length, 1);
  assert.equal(learn.items[0].done, false);
  assert.match(learn.items[0].label, /点选关键部件 0 \/ 5/);
  assert.deepEqual(learn.questions, []);
  assert.deepEqual(learn.progress, { done: 0, total: 6 });
  // 做完「认识部件」后本屏转到「跟随光路」，才出现光谱怎样形成一题。
  let task2 = task, scene2 = scene;
  for (const id of parts) ({ task: task2, scene: scene2 } = applyOperation(task2, scene2, machine, { type: "see-part", id }));
  assert.deepEqual(courseView(task2, scene2, machine, "learn").questions.map((item) => item.id), ["dispersion"]);
  const lab = courseView(task, scene, machine, "lab");
  assert.deepEqual(lab.questions.map((item) => item.id), ["continuous"]);
  assert.equal(lab.screenDone, false);
});

test("自由练习改条件会清掉旧标记与核对；样本与备注照常保留", () => {
  const marked = { ...labInitial(machine), marks: [694], notes: "蓝紫区较暗" };
  const changed = patchLab(marked, { slit: 0.8 });
  assert.deepEqual(changed.marks, []);
  assert.equal(changed.notes, "蓝紫区较暗");
  assert.equal(changed.bench.slit, 0.8);
  // 只改显示开关或备注不作废记录。
  const kept = patchLab(marked, { beams: false, names: true, notes: "再记一笔" });
  assert.deepEqual(kept.marks, [694]);
  assert.equal(kept.beams, false);
  assert.equal(kept.names, true);
});

test("实验屏场景：读回视角与已保存的记录，缺字段回落", () => {
  const saved = readLabScene({ view: "instrument", saved: { notes: "只记了一笔", stale: true } }, machine);
  assert.equal(saved.view, "instrument");
  assert.deepEqual(saved.saved, { notes: "只记了一笔", stale: true, pending: false });
  const broken = readLabScene({ view: "sideways", saved: { notes: 7 } }, machine);
  assert.equal(broken.view, "whole");
  assert.equal(broken.saved, null);
});

test("改条件才作废标记与核对：已保存的记录只标为过期，换视角与显示开关不算改条件", () => {
  const saved = { ...labInitial(machine), marks: [694], bands: [{ start: 540, end: 620 }], noAbsorption: false, checked: true, saved: { notes: "记一笔", stale: false, pending: false } };
  const changed = patchLab(saved, { brightness: 0.4 });
  assert.deepEqual(changed.marks, []);
  assert.deepEqual(changed.bands, []);
  assert.equal(changed.checked, false);
  assert.deepEqual(changed.saved, { notes: "记一笔", stale: true, pending: false });
  const viewed = patchLab(saved, { view: "lamp", beams: false, values: false });
  assert.deepEqual(viewed.marks, [694]);
  assert.deepEqual(viewed.bands, [{ start: 540, end: 620 }]);
  assert.equal(viewed.checked, true);
  assert.deepEqual(viewed.saved, { notes: "记一笔", stale: false, pending: false });
});

test("换样品清掉旧记录；课程起点按机型给出故意不合适的条件", () => {
  const marked = { ...labInitial(machine), marks: [694], notes: "蓝紫区较暗", saved: { notes: "旧记录", stale: false, pending: false } };
  const next = changeLabSample(marked, "amethyst");
  assert.equal(next.sampleId, "amethyst");
  assert.deepEqual(next.marks, []);
  assert.equal(next.notes, "");
  assert.equal(next.saved, null);
  const prism = courseInitialLab("prism");
  assert.equal(prism.bench.power, true);
  assert.equal(prism.bench.samplePlaced, false);
  assert.equal(prism.bench.slit, 0.72);
  assert.equal(prism.bench.focus, 0.2);
  const grating = courseInitialLab("grating");
  assert.equal(grating.bench.brightness, 0.35);
  assert.equal(grating.bench.lampLateral, 0.15);
  assert.equal(grating.bench.dispersion, "grating");
});

test("课程操作同时写回任务与场景；改条件后标带与已保存记录一并作废", () => {
  let { task, scene } = start();
  ({ task, scene } = applyOperation(task, scene, machine, { type: "mark", wavelength: 694 }));
  assert.deepEqual(scene.marks, [694]);
  scene = { ...scene, bands: [{ start: 540, end: 620 }], saved: { notes: "旧记录", stale: false, pending: false } };
  const next = applyOperation(task, scene, machine, { type: "slit", value: 0.8 });
  assert.deepEqual(next.scene.marks, []);
  assert.deepEqual(next.scene.bands, []);
  assert.deepEqual(next.scene.saved, { notes: "旧记录", stale: true, pending: false });
  // 答题不改条件，已保存的记录不受影响。
  const answered = applyOperation(task, scene, machine, { type: "answer", id: "dispersion", option: 0 });
  assert.deepEqual(answered.scene.saved, { notes: "旧记录", stale: false, pending: false });
});

test("自由探索不写身份：没选讲师 / 学员时操作不把 mode 变成 student", () => {
  let { task, scene } = start();
  ({ task, scene } = applyOperation(task, scene, machine, { type: "see-part", id: parts[0] }));
  assert.equal(task.mode, null, "点部件不该把自由探索变成学员课");
  ({ task, scene } = applyOperation(task, scene, machine, { type: "slit", value: 0.3 }));
  assert.equal(task.mode, null);
});

test("完成证据：重置画面前已完成的步骤算数，重新开始任务才清零", () => {
  let { task, scene } = start();
  for (const id of parts) ({ task, scene } = applyOperation(task, scene, machine, { type: "see-part", id }));
  for (const id of COURSE_CONFIG.prism.cases.map((item) => item.id)) ({ task, scene } = applyOperation(task, scene, machine, { type: "see-case", id }));
  ({ task, scene } = applyOperation(task, scene, machine, { type: "answer", id: "dispersion", option: 0 }));
  assert.deepEqual(courseView(task, scene, machine, "learn").progress, { done: 2, total: 6 });
  const wiped = { ...scene, bench: courseInitialLab(machine).bench, marks: [], checked: false };
  const afterReset = courseView(task, wiped, machine, "learn");
  assert.deepEqual(afterReset.progress, { done: 2, total: 6 }, "重置画面不该把做完的步骤退回去");
  assert.equal(afterReset.allComplete, false);
  const restarted = courseView(emptyTaskData(), wiped, machine, "learn");
  assert.deepEqual(restarted.progress, { done: 0, total: 6 }, "重新开始任务才清零");
});

test("换机型：旧记录保留但标为过期；引导任务回到该机型的课程起点", () => {
  const saved = { notes: "记一笔", stale: false, pending: false };
  const scene = { ...labInitial("prism"), marks: [694], saved };
  const free = changeLabMachine(scene, "grating");
  assert.equal(free.bench.dispersion, "grating");
  assert.deepEqual(free.marks, [694], "标记的 nm 波长不随机型改变");
  assert.deepEqual(free.saved, { notes: "记一笔", stale: true, pending: false });
  const guided = changeLabMachine(scene, "grating", true);
  assert.equal(guided.bench.slit, 0.32, "引导任务回到光栅式课程起点");
  assert.deepEqual(guided.saved, { notes: "记一笔", stale: true, pending: false });
});

test("挑战抽样存在场景里：换屏、换机型、任务重启都不丢；重置本屏才回到未抽取", () => {
  const drawn = drawChallenge(labInitial("prism"), "prism", { difficulty: "intermediate", sampleId: "amethyst" });
  assert.equal(drawn.difficulty, "intermediate");
  assert.equal(drawn.sampleId, "amethyst");
  const switched = changeLabMachine(drawn, "grating");
  assert.equal(switched.sampleId, "amethyst");
  assert.equal(switched.difficulty, "intermediate");
  const reset = labInitial("prism");
  assert.equal(reset.difficulty, null, "重置本屏回到未抽取");
});

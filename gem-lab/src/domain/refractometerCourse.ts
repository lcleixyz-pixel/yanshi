import { SAMPLES_BY_ID } from "../data/samples";
import { checkRI } from "./refractometerAssessment";
import type { RefractometerView } from "../components/refractometer/ObservationWindow";
import { mayRecordLearning, type ChoiceQuestion, type CourseCheckItem, type CourseMode, type CourseStep } from "./course";

export const COURSE_SAMPLE = SAMPLES_BY_ID.spinel;
export const COURSE_RI = COURSE_SAMPLE.characteristics
  .refractiveIndex as number;
export const CONTACT_INDEX = 1.78;
export type StepId =
  | "parts"
  | "path"
  | "prepare"
  | "contact"
  | "observe"
  | "verify"
  | "explain"
  | "cleanup";
export const STEPS: readonly CourseStep<StepId>[] = [
  {
    id: "parts",
    title: "认识部件",
    task: "点选六个关键部件，看清接触窗口和仪器内部的关系。",
    why: "明暗边界产生在测台棱镜与样品的接触面上；光源、分划刻度和目镜都在机身内，从外面只看得到接触窗口。",
  },
  {
    id: "path",
    title: "跟随光路",
    task: "跟随七段光路，再回答明暗边界的来源。此步展示预置的良好接触示例。",
    why: "光在棱镜与样品界面上超过临界角时全反射，低于临界角时部分折射出去；两侧亮度不同形成的分界，经光学系统映射成刻度上的折射率。",
  },
  {
    id: "prepare",
    title: "开灯与放样",
    task: "先开灯看空载刻度，再滴一小滴接触液，把样品平整台面朝下放在窗口中部。",
    why: "接触液排掉样品与棱镜之间的空气；台面朝下、放在窗口中部，接触面才完整，边界才对应样品。",
  },
  {
    id: "contact",
    title: "恢复光学接触",
    task: "本次故意保留空气间隙。先记录不能读数、判断原因，再轻推贴合。",
    why: "有空气间隙时，光先在玻璃—空气界面全反射，探测不到样品；看到的边界不是样品读数，必须恢复光学接触。",
  },
  {
    id: "observe",
    title: "第一次读数",
    task: "从目镜窗口估读明暗边界，输入你的读数，然后核对。",
    why: "先独立估读再核对，才能检验是否真正看懂了边界，而不是照着答案找边界。",
  },
  {
    id: "verify",
    title: "换方向复核",
    task: "取下并转到另一方向，重新贴合，再独立读数。观察边界是否移动。",
    why: "本课尖晶石是均质体，换方向边界不动；双折射样品转动时边界会移动或出现两条，所以实际检测要多方向复核。",
  },
  {
    id: "explain",
    title: "解释与适用条件",
    task: "回答三道问题，说明读数的依据和限制。",
    why: "读数来自给定波长与接触条件下的临界角；空气间隙使读数无效，超过接触液上限只能记为超量程。",
  },
  {
    id: "cleanup",
    title: "清理复位",
    task: "取下样品，分别擦净测台和样品，关灯并合上翻盖。",
    why: "接触液残留会污染棱镜并影响下一次读数；擦净测台与样品、关灯合盖，才能交给下一位使用。",
  },
];
export const KEY_PARTS = [
  {
    id: "test_prism",
    label: "测台棱镜 / 接触窗口",
    note: "样品的平整抛光面通过少量接触液贴在棱镜平面上。窗口直接露出棱镜。",
  },
  {
    id: "internal_light",
    label: "内部光源",
    note: "教学光路按 589 nm 单色光计算，光源装在机身内。",
  },
  {
    id: "internal_scale",
    label: "分划刻度",
    note: "把角度位置对应到折射率刻度。模型中的分划是教学计算，未按实物校准。",
  },
  {
    id: "eyepiece",
    label: "目镜",
    note: "通过目镜看刻度与明暗边界；旋转相机不会改变样品方向或读数。",
  },
  {
    id: "cover",
    label: "翻盖",
    note: "操作时打开，清洁复位后合上；不要盖住仍放在测台上的样品。",
  },
  {
    id: "oil_bottle",
    label: "接触液",
    note: "少量接触液排除空气间隙。不要重压样品；具体用液和清洁按实际设备说明。",
  },
] as const;
export const PATH_STAGES = [
  { part: "internal_light", text: "内置单色光源发光。" },
  { part: "first_mirror", text: "第一反射镜把角度范围内的光引向棱镜。" },
  {
    part: "test_prism",
    text: "光通过半圆柱进入高折射率棱镜，再到达平面接触区。",
  },
  {
    part: "contact_layer",
    text: "接触液排除空气间隙，使光到达样品；临界角两侧反射强度不同。",
  },
  { part: "internal_scale", text: "不同方向的反射光对应分划上的不同位置。" },
  {
    part: "lens_group",
    text: "中继透镜与第二反射镜把观察光引向目镜。本模型采用理想薄透镜。",
  },
  { part: "eyepiece", text: "目镜里能看到明暗分界和刻度，按边界位置读数。" },
] as const;
export const QUESTIONS = [
  {
    id: "boundary",
    prompt: "明暗边界从哪里来？",
    options: [
      "临界角两侧的反射强度变化，经光学系统映射到刻度",
      "样品颜色被直接投到刻度上",
      "样品外形在目镜里的影子",
    ],
    correct: 0,
    feedback: "边界对应样品的临界方向；低角度有部分反射，超过临界角时全反射。",
  },
  {
    id: "gap",
    prompt: "空气间隙为什么不能给出可靠的样品读数？",
    options: [
      "空气让样品的折射率变成零",
      "光先在玻璃—空气界面全反射，未有效探测样品",
      "只要刻度清楚就可以读样品",
    ],
    correct: 1,
    feedback: "玻璃—空气界面先全反射，不能把它当作样品的边界。需恢复光学接触。",
  },
  {
    id: "repeat",
    prompt: "同一台面换方向后边界不动，怎样解释？",
    options: [
      "在本课理想均质体示例中预期不变；单凭一次结果不能鉴定所有宝石",
      "证明所有透明宝石都只有一个折射率",
      "仪器一定坏了",
    ],
    correct: 0,
    feedback:
      "本例是均质体，方向变化不改变折射率。实际鉴定还须多方向复核并结合其他证据。",
  },
  {
    id: "critical",
    prompt: "读到的明暗边界对应什么？",
    options: ["样品颜色的深浅", "给定波长和接触条件下的临界角位置", "样品厚度"],
    correct: 1,
    feedback:
      "通过高折射率棱镜，临界角的位置映射为折射率读数。刻度不是等距角度标尺。",
  },
  {
    id: "air",
    prompt: "接触不良后应怎么做？",
    options: [
      "直接记录接触液的折射率作为样品值",
      "增加样品压力直到刻度移动",
      "取下检查平整面和清洁度，用少量液体重新轻推贴合",
    ],
    correct: 2,
    feedback:
      "空气间隙会切断有效探测。恢复接触后重新观察；不能靠硬压或猜测补出读数。",
  },
  {
    id: "limit",
    prompt: "样品折射率超过接触液上限时，如何记录？",
    options: [
      "记录超过可测上限，不能编出精确值",
      "把接触液上限当成样品精确值",
      "一直旋转样品就能读出任意高值",
    ],
    correct: 0,
    feedback: "本教学参数接触液上限为 1.78；超出时不能给出精确样品 RI。",
  },
] as const satisfies readonly ChoiceQuestion[];
export interface Reading {
  value: number;
  angle: number;
  epoch: number;
  correct: boolean;
  /** 刻面法双折射样品的上限读数；均质体与点测法不带。 */
  max?: number | null;
  /** 超接触液上限的记录：只表示「> 1.780」，value 仅作占位，不参与比较。 */
  overLimit?: boolean;
}
export interface CourseState {
  mode: CourseMode;
  step: StepId;
  hasSkipped: boolean;
  power: boolean;
  cover: "open" | "closed";
  liquid: "none" | "drop";
  sample: "none" | "placed";
  contact: "good" | "air-gap";
  angle: number;
  rays: boolean;
  explode: number;
  isolated: boolean;
  epoch: number;
  partsSeen: string[];
  pathSeen: number[];
  answers: Record<string, number>;
  scaleSeen: boolean;
  placedCorrectly: boolean;
  invalidRecorded: boolean;
  recovered: boolean;
  readings: Reading[];
  stageClean: boolean;
  sampleClean: boolean;
}
export function initialCourse(mode: CourseState["mode"]): CourseState {
  return {
    mode,
    step: "parts",
    hasSkipped: false,
    power: false,
    cover: "open",
    liquid: "none",
    sample: "none",
    contact: "air-gap",
    angle: 0,
    rays: false,
    explode: 0,
    isolated: false,
    epoch: 0,
    partsSeen: [],
    pathSeen: [],
    answers: {},
    scaleSeen: false,
    placedCorrectly: false,
    invalidRecorded: false,
    recovered: false,
    readings: [],
    stageClean: false,
    sampleClean: false,
  };
}
export const RULES = {
  off: ["电源关闭，视场无观察光。", "打开电源，先检查空载刻度。"],
  liquid: ["尚未滴加接触液。", "打开翻盖，在洁净窗口滴一小滴接触液。"],
  sample: ["尚未放置样品。", "把样品平整台面朝下放到窗口中部。"],
  gap: [
    "存在空气间隙，没有可靠的样品边界。",
    "检查平整面和清洁度，轻推贴合；不要用力压。",
  ],
  assembly: ["拆解或隔离中，暂停操作读数。", "恢复装配后重新观察。"],
} as const;
export function deriveCourse(s: CourseState) {
  const problem =
    s.explode > 0 || s.isolated
      ? "assembly"
      : !s.power
        ? "off"
        : s.liquid === "none"
          ? "liquid"
          : s.sample === "none"
            ? "sample"
            : s.contact === "air-gap"
              ? "gap"
              : null;
  const validReading = problem === null;
  const view: RefractometerView =
    !s.power || problem === "assembly"
      ? "off"
      : s.liquid === "none"
        ? "scale-only"
        : s.sample === "none"
          ? "oil-empty"
          : s.contact === "air-gap"
            ? "scale-only"
            : "single";
  const showcase = s.step === "path";
  return {
    validReading,
    view,
    reason: problem ? RULES[problem][0] : "接触良好，观察边界后记录。",
    recovery: problem ? RULES[problem][1] : "先记录，再核对参考。",
    caseId:
      showcase ||
      (s.liquid === "drop" && s.sample === "placed" && s.contact === "good")
        ? "spinel-good"
        : "spinel-air-gap",
    partVisibility: {
      contact_layer: showcase || (s.liquid === "drop" && s.contact === "good"),
      isotropic_sample: showcase || s.sample === "placed",
    },
    cover: s.cover,
    power: showcase || s.power,
    rays:
      s.rays &&
      (showcase || (s.power && s.sample === "placed" && s.liquid === "drop")),
    sampleRI: COURSE_RI,
  };
}
export function answerCorrect(s: CourseState, id: string) {
  const q = QUESTIONS.find((q) => q.id === id);
  return !!q && s.answers[id] === q.correct;
}
export function directionDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}
export function submitReading(s: CourseState, value: number): CourseState {
  if (
    !deriveCourse(s).validReading ||
    !Number.isFinite(value) ||
    value < 1.3 ||
    value > CONTACT_INDEX ||
    !["observe", "verify"].includes(s.step)
  )
    return s;
  return {
    ...s,
    readings: [
      ...s.readings,
      {
        value,
        angle: s.angle,
        epoch: s.epoch,
        correct: checkRI(value, null, COURSE_RI, "facet"),
      },
    ],
  };
}
export function isComplete(s: CourseState, id: StepId): boolean {
  const first = s.readings.find((r) => r.correct);
  switch (id) {
    case "parts":
      return KEY_PARTS.every((p) => s.partsSeen.includes(p.id));
    case "path":
      return (
        PATH_STAGES.every((_, i) => s.pathSeen.includes(i)) &&
        answerCorrect(s, "boundary")
      );
    case "prepare":
      return s.scaleSeen && s.placedCorrectly;
    case "contact":
      return s.invalidRecorded && answerCorrect(s, "gap") && s.recovered;
    case "observe":
      return !!first;
    case "verify":
      return (
        !!first &&
        s.readings.some(
          (r) => r.correct && directionDistance(r.angle, first.angle) >= 45,
        ) &&
        answerCorrect(s, "repeat")
      );
    case "explain":
      return ["critical", "air", "limit"].every((id) => answerCorrect(s, id));
    case "cleanup":
      return (
        s.sample === "none" &&
        s.liquid === "none" &&
        s.stageClean &&
        s.sampleClean &&
        !s.power &&
        s.cover === "closed"
      );
  }
}
/** 课程条上的本步完成清单；与 isComplete 使用同一组条件。 */
export function courseChecklist(s: CourseState): CourseCheckItem[] {
  const answered = (id: string, label: string): CourseCheckItem => ({ id, label, done: answerCorrect(s, id) });
  const first = s.readings.find((r) => r.correct);
  switch (s.step) {
    case "parts": return [{ id: "parts", label: `点选关键部件 ${KEY_PARTS.filter((p) => s.partsSeen.includes(p.id)).length} / ${KEY_PARTS.length}`, done: isComplete(s, "parts") }];
    case "path": return [{ id: "stages", label: `跟随光路 ${PATH_STAGES.filter((_, i) => s.pathSeen.includes(i)).length} / ${PATH_STAGES.length}`, done: PATH_STAGES.every((_, i) => s.pathSeen.includes(i)) }, answered("boundary", "回答：明暗边界从哪里来")];
    case "prepare": return [{ id: "scale", label: "开灯看空载刻度", done: s.scaleSeen }, { id: "placed", label: "滴接触液、台面朝下放样", done: s.placedCorrectly }];
    case "contact": return [{ id: "invalid", label: "记录：不能读数", done: s.invalidRecorded }, answered("gap", "回答：为什么不能读"), { id: "recovered", label: "轻推恢复贴合", done: s.recovered }];
    case "observe": return [{ id: "reading", label: "独立读数并核对正确", done: !!first }];
    case "verify": return [{ id: "turned", label: "换方向后读数正确", done: !!first && s.readings.some((r) => r.correct && directionDistance(r.angle, first.angle) >= 45) }, answered("repeat", "回答：边界为什么不动")];
    case "explain": return [answered("critical", "边界对应什么"), answered("air", "接触不良怎么办"), answered("limit", "超过上限怎么记")];
    case "cleanup": return [{ id: "removed", label: "取下样品、擦去接触液", done: s.sample === "none" && s.liquid === "none" }, { id: "clean", label: "擦净测台与样品", done: s.stageClean && s.sampleClean }, { id: "off", label: "关灯并合上翻盖", done: !s.power && s.cover === "closed" }];
  }
}

export const allComplete = (s: CourseState) =>
  STEPS.every((step) => isComplete(s, step.id));
export const maySaveProgress = (s: CourseState) =>
  mayRecordLearning(s.mode, s.hasSkipped, allComplete(s));
export function navigateCourse(
  s: CourseState,
  step: StepId,
  skip = false,
): CourseState {
  let next = {
    ...s,
    step,
    hasSkipped: s.hasSkipped || skip,
    explode: 0,
    isolated: false,
  };
  if (step === "prepare" && s.step !== "prepare")
    next = {
      ...next,
      power: false,
      liquid: "none",
      sample: "none",
      contact: "air-gap",
      cover: "open",
      rays: false,
      epoch: s.epoch + 1,
    };
  if (step === "contact" && s.step !== "contact" && !s.recovered)
    next = { ...next, contact: "air-gap", epoch: s.epoch + 1 };
  if (step === "path") next = { ...next, rays: true };
  return next;
}
export type Operation =
  | "power"
  | "cover"
  | "drop"
  | "place"
  | "recover"
  | "remove"
  | "clean-stage"
  | "clean-sample"
  | "turn";
export function operate(s: CourseState, op: Operation): CourseState {
  switch (op) {
    case "power":
      return {
        ...s,
        power: !s.power,
        scaleSeen:
          s.scaleSeen ||
          (!s.power &&
            s.sample === "none" &&
            s.liquid === "none" &&
            s.step === "prepare"),
      };
    case "cover":
      return s.sample === "placed"
        ? s
        : { ...s, cover: s.cover === "open" ? "closed" : "open" };
    case "drop":
      return s.cover !== "open"
        ? s
        : { ...s, liquid: "drop", stageClean: false, epoch: s.epoch + 1 };
    case "place":
      return s.cover !== "open" || s.sample === "placed"
        ? s
        : {
            ...s,
            sample: "placed",
            contact: "air-gap",
            placedCorrectly:
              s.placedCorrectly ||
              (s.step === "prepare" &&
                s.power &&
                s.liquid === "drop" &&
                s.scaleSeen),
            sampleClean: false,
            epoch: s.epoch + 1,
          };
    case "recover":
      return s.sample !== "placed" || s.liquid === "none" || s.cover !== "open"
        ? s
        : {
            ...s,
            contact: "good",
            recovered:
              s.recovered ||
              (s.step === "contact" &&
                s.invalidRecorded &&
                answerCorrect(s, "gap")),
            epoch: s.epoch + 1,
          };
    case "remove":
      return { ...s, sample: "none", contact: "air-gap", epoch: s.epoch + 1 };
    case "clean-stage":
      return s.sample === "placed"
        ? s
        : { ...s, liquid: "none", stageClean: true, epoch: s.epoch + 1 };
    case "clean-sample":
      return s.sample === "placed" ? s : { ...s, sampleClean: true };
    // Reorientation includes lift and replace: optical contact must be restored.
    case "turn":
      return s.sample !== "placed" || s.cover !== "open"
        ? s
        : {
            ...s,
            angle: (s.angle + 90) % 360,
            contact: "air-gap",
            epoch: s.epoch + 1,
          };
  }
}

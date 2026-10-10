import { useEffect, useRef, useState } from "react";
import { useResponsiveViewport } from "../shared/useResponsiveViewport";
import { ChoiceQuestionField, CourseDock, CourseShell } from "../course/CourseShell";
import { useMediaQuery } from "../shared/useMediaQuery";
import RangeControl from "../shared/RangeControl";
import { useLearningRecord } from "../course/useLearningRecord";
import {
  createOpticsViewer,
  type OpticsSnapshot,
  type OpticsViewer,
} from "../optics3d/opticsViewer.js";
import { opticsAssetBase } from "../optics3d/opticsInstruments";
import ObservationWindow from "../refractometer/ObservationWindow";
import {
  allComplete,
  courseChecklist,
  COURSE_RI,
  COURSE_SAMPLE,
  deriveCourse,
  initialCourse,
  isComplete,
  KEY_PARTS,
  navigateCourse,
  operate,
  PATH_STAGES,
  QUESTIONS,
  STEPS,
  submitReading,
  type CourseState,
  type StepId,
  type Operation,
} from "../../domain/refractometerCourse";

/** 从地址直达中间步骤开课：与偏光镜一致记为跳步。 */
function startCourse(mode: CourseState["mode"], initialStep?: string | null) {
  const index = STEPS.findIndex((step) => step.id === initialStep);
  return index > 0 ? navigateCourse(initialCourse(mode), STEPS[index].id, true) : initialCourse(mode);
}

export default function RefractometerCourse({
  mode,
  onMode,
  onExit,
  initialStep,
}: {
  mode: CourseState["mode"];
  onMode: (mode: CourseState["mode"]) => void;
  onExit: () => void;
  initialStep?: string | null;
}) {
  const [s, setS] = useState(() => startCourse(mode, initialStep));
  // 切换讲师 / 学员不重置进度；本轮只要用过讲师演示，就不写入学习记录（同偏光镜）。
  const teacherUsed = useRef(mode === "teacher");
  if (mode === "teacher") teacherUsed.current = true;
  useEffect(() => setS((prev) => (prev.mode === mode ? prev : { ...prev, mode })), [mode]);
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({
    status: "loading",
  });
  const [input, setInput] = useState("");
  const phone = useMediaQuery("(max-width: 680px)");
  const [finished, setFinished] = useState(false);
  const learning = useLearningRecord("refractometer", teacherUsed.current ? "teacher" : "student");
  const viewport = useRef<HTMLDivElement>(null),
    viewer = useRef<OpticsViewer | null>(null);
  const derived = deriveCourse(s),
    ready = snapshot.status === "ready";
  const assetBase = opticsAssetBase("refractometer");
  useResponsiveViewport();
  useEffect(() => {
    if (!viewport.current) return;
    const v = createOpticsViewer({
      container: viewport.current,
      instrument: "refractometer",
      assetBase,
      onChange: (snap) => {
        setSnapshot(snap);
        const selectedId = snap.status === "ready" ? snap.selected?.id : null;
        if (selectedId)
          setS((prev) =>
            prev.step === "parts" &&
            KEY_PARTS.some((p) => p.id === selectedId) &&
            !prev.partsSeen.includes(selectedId)
              ? { ...prev, partsSeen: [...prev.partsSeen, selectedId] }
              : prev,
          );
      },
    });
    viewer.current = v;
    v.setView("whole");
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [assetBase]);
  useEffect(() => {
    if (!ready) return;
    viewer.current?.setState({ ...deriveCourse(s), angle: s.angle });
  }, [s, ready]);
  useEffect(() => {
    if (ready) {
      viewer.current?.setView(s.step === "path" ? "optics" : "whole");
      viewer.current?.fit();
    }
  }, [ready, s.step]);
  useEffect(() => {
    setInput("");
  }, [s.epoch, s.step, s.angle]);
  const selected = snapshot.status === "ready" ? snapshot.selected : null;
  const latest = s.readings
    .filter((r) => r.epoch === s.epoch && r.angle === s.angle)
    .at(-1);
  const op = (operation: Operation) => setS((prev) => operate(prev, operation));
  const go = (id: StepId, skip = false) => {
    setS((prev) => navigateCourse(prev, id, skip));
    viewer.current?.setView(id === "path" ? "optics" : "whole");
    viewer.current?.fit();
  };
  function finish() {
    if (!allComplete(s)) return;
    setFinished(true);
    void learning.record(s.hasSkipped, true);
  }
  function restart() {
    learning.reset();
    teacherUsed.current = mode === "teacher";
    setFinished(false);
    setInput("");
    setS(initialCourse(mode));
  }
  function question(id: string) {
    return (
      <ChoiceQuestionField
        key={id}
        question={QUESTIONS.find((x) => x.id === id)!}
        answer={s.answers[id]}
        onAnswer={(i) =>
          setS((prev) => ({ ...prev, answers: { ...prev.answers, [id]: i } }))
        }
      />
    );
  }
  const observe = [
    "prepare",
    "contact",
    "observe",
    "verify",
    "explain",
    "cleanup",
  ].includes(s.step);
  const model = (
        <section
          className="course-shell__model"
          ref={viewport}
          aria-label="课程三维仪器"
        >
          <div className="course-shell__views">
            <button
              type="button"
              disabled={!ready}
              onClick={() => viewer.current?.setView("whole")}
            >
              整机结构
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                setS((prev) => ({ ...prev, rays: true }));
                viewer.current?.setView("optics");
              }}
            >
              内部光路
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => viewer.current?.fit()}
            >
              完整视野
            </button>
          </div>
          {snapshot.status === "loading" && (
            <p className="course-shell__loading" role="status">
              正在载入教学模型…
            </p>
          )}
          {snapshot.status === "error" && (
            <div className="course-shell__fallback" role="alert">
              <img src={`${assetBase}poster.png`} alt="折射仪静态预览" />
              <p>模型载入失败，静态图不能替代操作练习。</p>
              <button onClick={() => window.location.reload()}>重新载入</button>
            </div>
          )}
          {observe && (
            <CourseDock
              kind="eyepiece"
              title={<>目镜观察 <span>教学模拟</span></>}
              data-view={derived.view}
              data-valid={String(derived.validReading)}
            >
              <ObservationWindow
                view={derived.view}
                sample={COURSE_SAMPLE}
                size={phone ? 128 : 196}
                showReading={false}
                hideChrome
              />
              <p role="status">{derived.reason}</p>
            </CourseDock>
          )}
          <p className="course-shell__model-note">
            拖动旋转 · 滚轮缩放 · 比例及内部处方未标定
          </p>
        </section>
  );
  return (
    <CourseShell
      instrument="refractometer"
      title="折射仪基础读数课"
      minutes={9}
      testId="refractometer-course"
      steps={STEPS}
      current={s.step}
      mode={mode}
      onMode={onMode}
      isComplete={(id) => isComplete(s, id)}
      checklist={courseChecklist(s)}
      allComplete={allComplete(s)}
      hasSkipped={s.hasSkipped}
      onGo={go}
      onFinish={finish}
      onExit={onExit}
      finish={finished ? { status: learning.status, failed: learning.failed, summary: "你已完成接触恢复、两次读数、解释与清洁复位。学习完成与独立检测掌握分别记录。", onRetry: () => void learning.record(s.hasSkipped, allComplete(s)), onRestart: restart } : null}
      model={model}
    >
            <>
              {!ready && <p className="course-shell__state">模型就绪后开始操作。</p>}
              <fieldset className="course-shell__content" disabled={!ready}>
                {s.step === "parts" && (
                  <>
                    <div className="course-shell__parts">
                      {KEY_PARTS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={selected?.id === p.id}
                          onClick={() => {
                            viewer.current?.setView(
                              ["internal_light", "internal_scale"].includes(
                                p.id,
                              )
                                ? "optics"
                                : "whole",
                            );
                            viewer.current?.select(p.id);
                          }}
                        >
                          {s.partsSeen.includes(p.id) ? "✓ " : ""}
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="course-shell__note">
                      {KEY_PARTS.find((p) => p.id === selected?.id)?.note ||
                        "点选部件，模型会自动聚焦。"}
                    </p>
                  </>
                )}
                {s.step === "path" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.rays}
                        onChange={(e) =>
                          setS((prev) => ({ ...prev, rays: e.target.checked }))
                        }
                      />
                      显示代表光路
                    </label>
                    <ol className="course-shell__path">
                      {PATH_STAGES.map((stage, i) => (
                        <li key={stage.part}>
                          <button
                            disabled={!s.rays}
                            type="button"
                            aria-pressed={s.pathSeen.includes(i)}
                            onClick={() => {
                              viewer.current?.select(stage.part);
                              setS((prev) => ({
                                ...prev,
                                pathSeen: [...new Set([...prev.pathSeen, i])],
                              }));
                            }}
                          >
                            {s.pathSeen.includes(i) ? "✓ " : ""}
                            {i + 1}. {stage.text}
                          </button>
                        </li>
                      ))}
                    </ol>
                    {question("boundary")}
                    <p className="course-shell__note">
                      这些线为理想单色代表路径；真实透镜面形、像差和仪器标定未模拟。
                    </p>
                  </>
                )}
                {observe && (
                  <>
                    {!derived.validReading && derived.recovery && (
                      <p className="iu-blocked">{derived.recovery}</p>
                    )}
                    <small>目镜观察停靠在三维区右上角。刻度为教学示意；本例接触液可测上限为 1.78。</small>
                    <div
                      className="course-shell__operations"
                      aria-label="仪器操作"
                    >
                      <button
                        type="button"
                        aria-pressed={s.power}
                        onClick={() => op("power")}
                      >
                        {s.power ? "关闭电源" : "打开电源"}
                      </button>
                      <button
                        type="button"
                        disabled={s.sample === "placed"}
                        onClick={() => op("cover")}
                      >
                        {s.cover === "open" ? "合上翻盖" : "打开翻盖"}
                      </button>
                      <button
                        type="button"
                        disabled={s.cover !== "open"}
                        onClick={() => op("drop")}
                      >
                        滴一小滴接触液
                      </button>
                      <button
                        type="button"
                        disabled={s.cover !== "open" || s.sample === "placed"}
                        onClick={() => op("place")}
                      >
                        台面朝下放样
                      </button>
                      <button
                        type="button"
                        disabled={
                          s.sample !== "placed" ||
                          s.liquid === "none" ||
                          s.cover !== "open"
                        }
                        onClick={() => op("recover")}
                      >
                        轻推贴合
                      </button>
                      <button
                        type="button"
                        disabled={s.sample !== "placed" || s.cover !== "open"}
                        onClick={() => op("turn")}
                      >
                        取下转向 90° 并放回
                      </button>
                      <button
                        type="button"
                        disabled={s.sample !== "placed"}
                        onClick={() => op("remove")}
                      >
                        取下样品
                      </button>
                    </div>
                    <label className="course-shell__rays">
                      <input
                        type="checkbox"
                        checked={s.rays}
                        onChange={(e) =>
                          setS((prev) => ({ ...prev, rays: e.target.checked }))
                        }
                      />
                      显示代表光路（透视叠加）
                    </label>
                    <p className="course-shell__state">
                      {s.power ? "通电" : "关机"} · 翻盖
                      {s.cover === "open" ? "打开" : "闭合"} ·{" "}
                      {s.liquid === "drop" ? "已滴液" : "无接触液"} ·{" "}
                      {s.sample === "placed" ? "已放样" : "未放样"} · 方向{" "}
                      {s.angle}°
                    </p>
                    {s.step === "prepare" && (
                      <ul className="course-shell__check">
                        <li>{s.scaleSeen ? "✓" : "○"} 空载开灯看到刻度</li>
                        <li>
                          {s.placedCorrectly ? "✓" : "○"} 滴液后平整台面朝下放样
                        </li>
                      </ul>
                    )}
                    {s.step === "contact" && (
                      <>
                        <button
                          type="button"
                          disabled={derived.validReading}
                          onClick={() =>
                            setS((prev) =>
                              deriveCourse(prev).validReading
                                ? prev
                                : { ...prev, invalidRecorded: true },
                            )
                          }
                        >
                          记录：无法可靠读数
                        </button>
                        {s.invalidRecorded && <p>✓ 已记录无可靠边界</p>}
                        {question("gap")}
                        {s.recovered && <p>✓ 已恢复光学接触</p>}
                      </>
                    )}
                    {["observe", "verify"].includes(s.step) && (
                      <>
                        <form
                          className="course-shell__reading"
                          onSubmit={(e) => {
                            e.preventDefault();
                            setS((prev) => submitReading(prev, Number(input)));
                          }}
                        >
                          <label htmlFor="course-ri">
                            你的{s.step === "verify" ? "复核" : "第一次"}读数
                          </label>
                          <div>
                            <input
                              id="course-ri"
                              type="number"
                              min="1.3"
                              max="1.78"
                              step="0.001"
                              inputMode="decimal"
                              required
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              disabled={!derived.validReading}
                            />
                            <button
                              type="submit"
                              disabled={
                                !derived.validReading || input.trim() === ""
                              }
                            >
                              提交读数
                            </button>
                          </div>
                        </form>
                        {!derived.validReading && (
                          <button
                            onClick={() =>
                              setS((prev) => ({
                                ...prev,
                                invalidRecorded: true,
                              }))
                            }
                          >
                            记录：无法可靠读数
                          </button>
                        )}
                        {latest && (
                          <div
                            className="course-shell__feedback"
                            role="status"
                            data-testid="reading-feedback"
                          >
                            <strong>
                              {latest.correct
                                ? "读数在容差内"
                                : "请重新观察并读数"}
                            </strong>
                            <p>
                              你的记录 {latest.value.toFixed(3)} · 参考{" "}
                              {COURSE_RI.toFixed(3)} · 偏差{" "}
                              {(latest.value - COURSE_RI).toFixed(3)}
                              ，刻面法容差 ±0.005。
                            </p>
                            <p>
                              本课固定理想均质样品只有一条边界；参考参数不是这件实物的测量结果。
                            </p>
                          </div>
                        )}
                        {s.step === "verify" && question("repeat")}
                      </>
                    )}
                    {s.step === "explain" &&
                      ["critical", "air", "limit"].map(question)}
                    {s.step === "cleanup" && (
                      <>
                        <div className="course-shell__operations">
                          <button
                            disabled={s.sample === "placed"}
                            onClick={() => op("clean-stage")}
                          >
                            擦净测台
                          </button>
                          <button
                            disabled={s.sample === "placed"}
                            onClick={() => op("clean-sample")}
                          >
                            擦净样品
                          </button>
                        </div>
                        <p>
                          {s.stageClean ? "✓" : "○"} 测台已清洁　
                          {s.sampleClean ? "✓" : "○"} 样品已清洁
                        </p>
                      </>
                    )}
                    <details className="course-shell__structure">
                      <summary>部件与装配辅助</summary>
                      <RangeControl
                        label="连续拆解"
                        min={0}
                        max={100}
                        value={Math.round(s.explode * 100)}
                        display={`${Math.round(s.explode * 100)}%`}
                        ends={["装配", "拆开"]}
                        onChange={(v) => {
                          const value = v / 100;
                          setS((prev) => ({ ...prev, explode: value }));
                          viewer.current?.setExplode(value);
                        }}
                      />
                      <button
                        onClick={() => {
                          setS((prev) => ({
                            ...prev,
                            explode: 0,
                            isolated: false,
                          }));
                          viewer.current?.setExplode(0);
                          if (
                            snapshot.status === "ready" &&
                            snapshot.state.isolated
                          )
                            viewer.current?.toggleIsolate();
                        }}
                      >
                        恢复装配
                      </button>
                    </details>
                  </>
                )}
              </fieldset>
            </>
          <details className="course-shell__sources">
            <summary>依据与范围</summary>
            <p>
              课程采用项目中的尖晶石教学参数和理想各向同性单色光路。接触膜厚度、内部处方和尺寸未经实物标定；不覆盖双折射、点测或所有宝石。
            </p>
            {snapshot.status === "ready" &&
              snapshot.sources.map((x) => (
                <p key={x.title}>
                  <a href={x.url || undefined} target="_blank" rel="noreferrer">
                    {x.title}
                  </a>
                </p>
              ))}
          </details>
        </CourseShell>
  );
}

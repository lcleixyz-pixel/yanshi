import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Header from "../shared/Header";
import {
  createOpticsViewer,
  type OpticsSnapshot,
  type OpticsViewer,
} from "../optics3d/opticsViewer.js";
import { opticsAssetBase } from "../optics3d/opticsInstruments";
import ObservationWindow from "../refractometer/ObservationWindow";
import {
  allComplete,
  answerCorrect,
  COURSE_RI,
  COURSE_SAMPLE,
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
  type StepId,
  type Operation,
} from "../../domain/refractometerCourse";
import "../../styles/refractometer-course.css";

export default function RefractometerCourse({
  mode,
  onExit,
}: {
  mode: CourseState["mode"];
  onExit: () => void;
}) {
  const [s, setS] = useState(() => initialCourse(mode));
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({
    status: "loading",
  });
  const [input, setInput] = useState("");
  const [finished, setFinished] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const saving = useRef(false);
  const viewport = useRef<HTMLDivElement>(null),
    viewer = useRef<OpticsViewer | null>(null);
  const derived = deriveCourse(s),
    ready = snapshot.status === "ready";
  const assetBase = opticsAssetBase("refractometer");
  useLayoutEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    );
    const old = meta?.content;
    if (meta) meta.content = "width=device-width, initial-scale=1";
    return () => {
      if (meta && old !== undefined) meta.content = old;
    };
  }, []);
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
  const stepIndex = STEPS.findIndex((x) => x.id === s.step),
    step = STEPS[stepIndex];
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
  async function finish() {
    if (!allComplete(s) || saving.current) return;
    saving.current = true;
    setFinished(true);
    if (maySaveProgress(s)) {
      try {
        const { useProgress } = await import("../../store/progressStore");
        useProgress.getState().markDemoComplete({
          instrumentId: "refractometer",
          mode: "learning",
          completedAt: Date.now(),
        });
        setSaveStatus("已记录本次学习完成。");
      } catch {
        setSaveStatus("学习记录保存失败，可重试。");
        saving.current = false;
      }
    } else
      setSaveStatus(
        mode === "teacher"
          ? "讲师演示结束，不写入学习进度。"
          : "本次使用过跳步，已完成复习，不写入学习进度。",
      );
  }
  function question(id: string) {
    const q = QUESTIONS.find((x) => x.id === id)!;
    const answered = s.answers[id] !== undefined;
    return (
      <fieldset
        className="ref-course__question"
        key={id}
        data-testid={`question-${id}`}
      >
        <legend>{q.prompt}</legend>
        {q.options.map((text, i) => (
          <button
            type="button"
            key={text}
            aria-pressed={s.answers[id] === i}
            onClick={() =>
              setS((prev) => ({
                ...prev,
                answers: { ...prev.answers, [id]: i },
              }))
            }
          >
            {text}
          </button>
        ))}
        {answered && (
          <p role="status">
            {answerCorrect(s, id) ? "判断正确。" : "再想一想。"} {q.feedback}
          </p>
        )}
      </fieldset>
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
  return (
    <div
      className="ref-course"
      data-testid="refractometer-course"
      data-step={s.step}
      data-mode={mode}
    >
      <Header
        title="折射仪基础读数课"
        subtitle={`${mode === "student" ? "学员练习" : "讲师演示"} · 约 9 分钟`}
      />
      <div className="ref-course__bar">
        <nav aria-label="课程步骤">
          {STEPS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-current={s.step === item.id ? "step" : undefined}
              disabled={
                mode === "student" &&
                i > stepIndex &&
                !STEPS.slice(0, i).every((x) => isComplete(s, x.id))
              }
              onClick={() => go(item.id)}
            >
              <span>{isComplete(s, item.id) ? "✓" : i + 1}</span>
              {item.title}
            </button>
          ))}
        </nav>
        <button type="button" onClick={onExit}>
          返回自由探索
        </button>
      </div>
      <main className="ref-course__main">
        <section
          className="ref-course__model"
          ref={viewport}
          aria-label="课程三维仪器"
        >
          <div className="ref-course__views">
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
            <p className="ref-course__loading" role="status">
              正在载入教学模型…
            </p>
          )}
          {snapshot.status === "error" && (
            <div className="ref-course__fallback" role="alert">
              <img src={`${assetBase}poster.png`} alt="折射仪静态预览" />
              <p>模型载入失败，静态图不能替代操作练习。</p>
              <button onClick={() => window.location.reload()}>重新载入</button>
            </div>
          )}
          <p className="ref-course__model-note">
            拖动旋转 · 滚轮缩放 · 比例及内部处方未标定
          </p>
        </section>
        <aside className="ref-course__panel" aria-label="课程操作与观察">
          {finished ? (
            <section className="ref-course__finish">
              <h1>本课完成</h1>
              <p>{saveStatus || "正在保存学习记录…"}</p>
              <p>
                你已完成接触恢复、两次读数、解释与清洁复位。学习完成与独立检测掌握分别记录。
              </p>
              {saveStatus.includes("失败") && (
                <button onClick={finish}>重试保存</button>
              )}
              <button onClick={onExit}>返回自由探索</button>
            </section>
          ) : (
            <>
              <div className="ref-course__step">
                <small>
                  第 {stepIndex + 1} / {STEPS.length} 步
                </small>
                <h1>{step.title}</h1>
                <p>{step.task}</p>
              </div>
              {!ready && <p>模型就绪后开始操作。</p>}
              <fieldset className="ref-course__content" disabled={!ready}>
                {s.step === "parts" && (
                  <>
                    <div className="ref-course__parts">
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
                    <p className="ref-course__note">
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
                    <ol className="ref-course__path">
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
                    <p className="ref-course__note">
                      这些线为理想单色代表路径；真实透镜面形、像差和仪器标定未模拟。
                    </p>
                  </>
                )}
                {observe && (
                  <>
                    <div
                      className="ref-course__observation"
                      data-testid="course-observation"
                      data-view={derived.view}
                      data-valid={String(derived.validReading)}
                    >
                      <h2>
                        目镜观察 <span>教学模拟</span>
                      </h2>
                      <ObservationWindow
                        view={derived.view}
                        sample={COURSE_SAMPLE}
                        size={248}
                        showReading={false}
                        hideChrome
                      />
                      <p role="status">{derived.reason}</p><small>刻度为教学示意；本例接触液可测上限为 1.78。</small>
                      {!derived.validReading && (
                        <small>{derived.recovery}</small>
                      )}
                    </div>
                    <div
                      className="ref-course__operations"
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
                    <label className="ref-course__rays">
                      <input
                        type="checkbox"
                        checked={s.rays}
                        onChange={(e) =>
                          setS((prev) => ({ ...prev, rays: e.target.checked }))
                        }
                      />
                      显示代表光路（透视叠加）
                    </label>
                    <p className="ref-course__state">
                      {s.power ? "通电" : "关机"} · 翻盖
                      {s.cover === "open" ? "打开" : "闭合"} ·{" "}
                      {s.liquid === "drop" ? "已滴液" : "无接触液"} ·{" "}
                      {s.sample === "placed" ? "已放样" : "未放样"} · 方向{" "}
                      {s.angle}°
                    </p>
                    {s.step === "prepare" && (
                      <ul className="ref-course__check">
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
                          className="ref-course__reading"
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
                            className="ref-course__feedback"
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
                        <div className="ref-course__operations">
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
                    <details className="ref-course__structure">
                      <summary>部件与装配辅助</summary>
                      <label>
                        连续拆解
                        <input
                          aria-label="连续拆解"
                          type="range"
                          min="0"
                          max="100"
                          value={s.explode * 100}
                          onChange={(e) => {
                            const value = Number(e.target.value) / 100;
                            setS((prev) => ({ ...prev, explode: value }));
                            viewer.current?.setExplode(value);
                          }}
                        />
                      </label>
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
                <footer className="ref-course__navigation">
                  <p>
                    {isComplete(s, s.step)
                      ? "✓ 本步已完成"
                      : "请完成本步操作与判断"}
                  </p>
                  <div>
                    {stepIndex > 0 && (
                      <button onClick={() => go(STEPS[stepIndex - 1].id)}>
                        上一步
                      </button>
                    )}
                    {stepIndex < STEPS.length - 1 ? (
                      <>
                        <button
                          disabled={!isComplete(s, s.step)}
                          onClick={() => go(STEPS[stepIndex + 1].id)}
                        >
                          下一步
                        </button>
                        <button
                          className="ref-course__skip"
                          onClick={() =>
                            go(STEPS[stepIndex + 1].id, mode === "student")
                          }
                        >
                          {mode === "teacher" ? "跳到下一步" : "跳步复习"}
                        </button>
                      </>
                    ) : (
                      <button disabled={!allComplete(s)} onClick={finish}>
                        完成课程
                      </button>
                    )}
                  </div>
                  {s.hasSkipped && (
                    <small>本次已使用跳步；完成后不记录学习进度。</small>
                  )}
                </footer>
              </fieldset>
            </>
          )}
          <details className="ref-course__sources">
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
        </aside>
      </main>
    </div>
  );
}

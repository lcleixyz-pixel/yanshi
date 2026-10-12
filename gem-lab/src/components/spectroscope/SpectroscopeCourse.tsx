import { useEffect, useMemo, useRef, useState } from 'react';
import { useResponsiveViewport } from '../shared/useResponsiveViewport';
import { ChoiceQuestionField, CourseDock, CourseShell } from '../course/CourseShell';
import { useMediaQuery } from '../shared/useMediaQuery';
import RangeControl from '../shared/RangeControl';
import { useLearningRecord } from '../course/useLearningRecord';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../optics3d/opticsViewer.js';
import { opticsAssetBase } from '../optics3d/opticsInstruments';
import { benchSpecimenAppearance, createSpectroscopeBenchViewer, type SpectroscopeBenchViewer } from '../spectroscope3d/spectroscopeBenchViewer';
import '../../styles/spectroscope-bench.css';
import SpectrumStrip from './SpectrumStrip';
import { allComplete, checkMarks, COURSE_CONFIG, COURSE_SAMPLE, courseChecklist, display, FEATURE_GROUPS, initialCourse, isComplete, navigateCourse, operate, QUESTIONS, REQUIRED_GROUPS, type CourseState, type CourseVariant, type Operation, type StepId } from '../../domain/spectroscopeCourse';
import { BENCH_GEOMETRY, evaluateBench } from '../../domain/spectroscopeBench';
import { BENCH_VIEWS, IDEAL, PROBLEM_TEXT, VARIANT_TEXT, WEAK_LIGHT } from '../../domain/spectroscopeCopy';

const INSTRUMENT_STEPS: readonly StepId[] = ['parts', 'path'];
const SPECIMEN = benchSpecimenAppearance(COURSE_SAMPLE);

type CourseProps = { mode: CourseState['mode']; onMode: (mode: CourseState['mode']) => void; onExit: () => void; initialStep?: string | null };

export function GratingSpectroscopeCourse(props: CourseProps) {
  return <SpectroscopeCourse {...props} variant="grating" />;
}

/** 从地址直达中间步骤开课：与偏光镜一致记为跳步。 */
function startCourse(mode: CourseState['mode'], variant: CourseVariant, initialStep?: string | null) {
  const start = initialCourse(mode, variant);
  const index = COURSE_CONFIG[variant].steps.findIndex((step) => step.id === initialStep);
  return index > 0 ? navigateCourse(start, COURSE_CONFIG[variant].steps[index].id, true) : start;
}

export default function SpectroscopeCourse({ mode, onMode, onExit, initialStep, variant = 'prism' }: CourseProps & { variant?: CourseVariant }) {
  const [s, setS] = useState(() => startCourse(mode, variant, initialStep));
  const config = COURSE_CONFIG[variant], text = VARIANT_TEXT[variant];
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });
  const [finished, setFinished] = useState(false);
  // 切换讲师 / 学员不重置进度；本轮只要用过讲师演示，就不写入学习记录（同偏光镜）。
  const teacherUsed = useRef(mode === 'teacher');
  if (mode === 'teacher') teacherUsed.current = true;
  useEffect(() => setS((prev) => (prev.mode === mode ? prev : { ...prev, mode })), [mode]);
  const learning = useLearningRecord('spectroscope', teacherUsed.current ? 'teacher' : 'student');
  const phone = useMediaQuery('(max-width: 680px)');
  // 载入失败时原地重试：换一次 attempt 就重新创建当前场景的查看器，不刷新整页（同偏光镜）。
  const [attempt, setAttempt] = useState(0);
  const [benchView, setBenchView] = useState<(typeof BENCH_VIEWS)[number][0]>('whole');
  const [benchStatus, setBenchStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slitGapMm, setSlitGapMm] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), viewer = useRef<OpticsViewer | null>(null);
  const benchHost = useRef<HTMLDivElement>(null), bench = useRef<SpectroscopeBenchViewer | null>(null);
  const onInstrument = INSTRUMENT_STEPS.includes(s.step);
  const ready = onInstrument ? snapshot.status === 'ready' : benchStatus === 'ready';
  const assetBase = opticsAssetBase(text.instrument);
  useResponsiveViewport();
  useEffect(() => {
    if (!onInstrument || !viewport.current) return;
    setSnapshot({ status: 'loading' });
    const v = createOpticsViewer({
      container: viewport.current,
      instrument: text.instrument,
      assetBase,
      onChange: (snap) => {
        setSnapshot(snap);
        const selectedId = snap.status === 'ready' ? snap.selected?.id : null;
        if (selectedId) setS((prev) => (prev.step === 'parts' ? operate(prev, { type: 'see-part', id: selectedId }) : prev));
      },
    });
    viewer.current = v;
    v.setView('whole');
    return () => { v.dispose(); viewer.current = null; };
  }, [onInstrument, assetBase, text.instrument, attempt]);
  // 认识部件：模型上显示编号热点；学员模式另有「点这里」指向下一个未看的部件（同偏光镜）。
  const partsSeen = s.partsSeen.join(' ');
  useEffect(() => {
    if (!onInstrument || snapshot.status !== 'ready') return;
    if (s.step !== 'parts') { viewer.current?.setHotspots(null); return; }
    const seen = partsSeen ? partsSeen.split(' ') : [];
    viewer.current?.setHotspots({
      ids: config.parts.map((p) => p.id), done: seen, labels: Object.fromEntries(config.parts.map((p) => [p.id, p.label])),
      coach: mode === 'student' ? config.parts.find((p) => !seen.includes(p.id))?.id ?? null : null,
    });
  }, [onInstrument, snapshot.status, s.step, partsSeen, mode, config]);
  useEffect(() => {
    if (!onInstrument || snapshot.status !== 'ready') return;
    viewer.current?.setView(s.step === 'path' ? 'optics' : 'whole');
    viewer.current?.setRays(s.step === 'path');
    viewer.current?.fit();
  }, [onInstrument, snapshot.status, s.step]);
  useEffect(() => {
    if (onInstrument || !benchHost.current) return;
    setBenchStatus('loading');
    const v = createSpectroscopeBenchViewer(benchHost.current, {
      onStatus: (next) => setBenchStatus(next),
      // 在三维中拖动灯头、狭缝调节环或目镜套筒，与滑杆走同一组操作。
      onAdjust: (patch) => {
        if (patch.lampLateral !== undefined) op({ type: 'lamp-lateral', value: patch.lampLateral });
        if (patch.slit !== undefined) op({ type: 'slit', value: patch.slit });
        if (patch.focus !== undefined) op({ type: 'focus', value: patch.focus });
      },
    });
    bench.current = v;
    return () => { v.dispose(); bench.current = null; };
  }, [onInstrument, attempt]);
  // 窄屏上课程布局在模型载入后才定下尺寸，载入完成后按最终画幅重新取一次整体视角。
  useEffect(() => {
    if (onInstrument || benchStatus !== 'ready') return;
    setBenchView('whole');
    const frame = requestAnimationFrame(() => bench.current?.focus('whole'));
    return () => cancelAnimationFrame(frame);
  }, [onInstrument, benchStatus]);
  // 夹样、狭缝调节环与刃口、目镜套筒都由工作台按同一状态摆放；缝宽从刃口实际位置测出。
  const benchState = s.bench;
  const current = useMemo(() => evaluateBench(COURSE_SAMPLE, benchState), [benchState]);
  useEffect(() => {
    if (onInstrument || benchStatus !== 'ready' || !bench.current) return;
    bench.current.update(benchState, current, SPECIMEN);
    const gap = benchHost.current?.querySelector('canvas')?.dataset.slitGap;
    setSlitGapMm(gap && gap !== 'fixed' ? (Number(gap) * 1000).toFixed(2) : null);
  }, [onInstrument, benchStatus, benchState, current]);

  const op = (operation: Operation) => setS((prev) => operate(prev, operation));
  const go = (id: StepId, skip = false) => setS((prev) => navigateCourse(prev, id, skip));
  const shown = display(s);
  const marks = checkMarks(s.marks);
  const selected = snapshot.status === 'ready' ? snapshot.selected : null;
  function finish() {
    if (!allComplete(s)) return;
    setFinished(true);
    void learning.record(s.hasSkipped, true);
  }
  function restart() {
    learning.reset();
    teacherUsed.current = mode === 'teacher';
    setFinished(false);
    setS(initialCourse(mode, variant));
  }
  const question = (id: string) => <ChoiceQuestionField key={id} question={QUESTIONS.find((q) => q.id === id)!} answer={s.answers[id]} onAnswer={(option) => op({ type: 'answer', id, option })} />;
  const observing = ['light', 'tune', 'observe'].includes(s.step);
  const placed = s.bench.samplePlaced;

  const model = !onInstrument ? (
    <section className="course-shell__model" key="bench" ref={benchHost} aria-label="照明与夹样工作台" data-testid="course-bench">
      <div className="course-shell__views">
        {BENCH_VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={benchView === id} disabled={!ready} onClick={() => { setBenchView(id); bench.current?.focus(id); }}>{label}</button>)}
      </div>
      {benchStatus === 'loading' && <p className="course-shell__loading" role="status">正在载入照明与夹样工作台…</p>}
      {benchStatus === 'error' && (
        <div className="course-shell__fallback" role="alert">
          <p>工作台模型载入失败；光谱观察与本步操作仍可继续。</p>
          <button className="iu-button" onClick={() => setAttempt((n) => n + 1)} data-testid="course-retry">重新载入</button>
        </div>
      )}
      {observing ? (
        <CourseDock kind="strip" title={<>目镜观察 <span>教学模拟 · {text.scale}</span></>} data-problems={shown.problems.join(' ')}>
          <SpectrumStrip
            features={shown.features}
            display={shown}
            dispersion={variant}
            userMarks={s.step === 'observe' ? s.marks : []}
            onAddMark={(wavelength) => op({ type: 'mark', wavelength })}
            onRemoveMark={(wavelength) => op({ type: 'unmark', wavelength })}
            interactive={s.step === 'observe'}
            showFeatureDescriptions={false}
            height={phone ? 44 : 64}
          />
          <p role="status">{shown.problems.length ? shown.problems.map((p) => PROBLEM_TEXT[p]).join(' ') : text.ok}</p>
        </CourseDock>
      ) : <p className="course-shell__model-note">拖动旋转 · 滚轮缩放 · 手持操作与尺寸示意，未经实物标定</p>}
    </section>
  ) : (
    <section className="course-shell__model" key="instrument" ref={viewport} aria-label="课程三维仪器">
      <div className="course-shell__views">
        <button type="button" aria-pressed={snapshot.status === 'ready' && snapshot.state.view === 'whole'} disabled={!ready} onClick={() => viewer.current?.setView('whole')}>整机结构</button>
        <button type="button" aria-pressed={snapshot.status === 'ready' && snapshot.state.view === 'optics'} disabled={!ready} onClick={() => { viewer.current?.setView('optics'); viewer.current?.setRays(true); }}>内部光路</button>
        <button type="button" disabled={!ready} onClick={() => viewer.current?.fit()}>完整视野</button>
      </div>
      {snapshot.status === 'loading' && <p className="course-shell__loading" role="status">正在载入教学模型…</p>}
      {snapshot.status === 'error' && (
        <div className="course-shell__fallback" role="alert">
          <img src={`${assetBase}poster.png`} alt={text.poster} />
          <p>模型载入失败，部件与光路两步需要三维模型；光谱观察仍可练习。</p>
          <button className="iu-button" onClick={() => setAttempt((n) => n + 1)} data-testid="course-retry">重新载入</button>
        </div>
      )}
      <p className="course-shell__model-note">拖动旋转 · 滚轮缩放 · 比例及内部处方未标定</p>
    </section>
  );

  return (
    <CourseShell
      instrument="spectroscope" title={text.title} minutes={text.minutes} testId="spectroscope-course"
      steps={config.steps} current={s.step} mode={mode} onMode={onMode} isComplete={(id) => isComplete(s, id)}
      checklist={courseChecklist(s)} allComplete={allComplete(s)} hasSkipped={s.hasSkipped} onGo={go} onFinish={finish} onExit={onExit}
      finish={finished ? { status: learning.status, failed: learning.failed, summary: text.finish, onRetry: () => void learning.record(s.hasSkipped, allComplete(s)), onRestart: restart } : null}
      model={model}
    >
      <>
          {!ready && onInstrument && <p className="course-shell__state">模型就绪后开始操作。</p>}
          <fieldset className="course-shell__content" disabled={!ready && onInstrument}>
            {s.step === 'parts' && <>
              <div className="course-shell__parts">
                {config.parts.map((p) => (
                  <button key={p.id} type="button" aria-pressed={selected?.id === p.id} onClick={() => { viewer.current?.setView((text.opticsParts as readonly string[]).includes(p.id) ? 'optics' : 'whole'); viewer.current?.select(p.id); }}>
                    {s.partsSeen.includes(p.id) ? '✓ ' : ''}{p.label}
                  </button>
                ))}
              </div>
              <p className="course-shell__note">{config.parts.find((p) => p.id === selected?.id)?.note || '点选部件，模型会自动聚焦。'}</p>
            </>}
            {s.step === 'path' && <>
              <ol className="course-shell__path">
                {config.cases.map((c) => (
                  <li key={c.id}><button type="button" aria-pressed={snapshot.status === 'ready' && snapshot.state.caseId === c.id} onClick={() => { viewer.current?.setCase(c.id); op({ type: 'see-case', id: c.id }); }}>
                    {s.casesSeen.includes(c.id) ? '✓ ' : ''}{c.label}
                  </button></li>
                ))}
              </ol>
              {snapshot.status === 'ready' && <p className="course-shell__note">{snapshot.currentCase.description}</p>}
              {question(config.stepQuestions.path)}
            </>}
            {observing && <>
              <small>目镜观察停靠在三维区底部{s.step === 'observe' ? '，直接在光谱上点出吸收线和吸收带' : ''}。参考光谱来自项目样品数据（与 GB/T 16553-2010 一致）；条件不合适时的变化为教学模拟。</small>
              <div className="course-shell__operations" aria-label="夹样">
                <button type="button" aria-pressed={!placed} onClick={() => op({ type: 'place-sample', on: false })}>镊子上不放样品</button>
                <button type="button" aria-pressed={placed} onClick={() => op({ type: 'place-sample', on: true })}>用镊子夹样品放入光路</button>
              </div>
              {s.step === 'light' && <>
                <button type="button" disabled={current.spectrumMode !== 'continuous-light'} onClick={() => op({ type: 'record-continuous' })}>记录：只见连续光谱</button>
                {s.continuousRecorded && <p>✓ 已记录：光没有穿过样品，不能据此下结论</p>}
                {question(config.stepQuestions.light)}
              </>}
              {(s.step === 'tune' || s.step === 'observe') && variant === 'grating' && <div className="course-shell__tuning">
                <RangeControl label="光源亮度" min={0} max={100} value={Math.round(s.bench.brightness * 100)} display={`${Math.round(s.bench.brightness * 100)}%`} ends={['暗', '亮']} onChange={(v) => op({ type: 'brightness', value: v / 100 })} />
                <RangeControl label="灯头横移" min={-100} max={100} value={Math.round(s.bench.lampLateral * 100)} display={`${(s.bench.lampLateral * BENCH_GEOMETRY.lateralScale * 1000).toFixed(1)} mm`} valueText={`偏离光轴 ${Math.abs(s.bench.lampLateral * BENCH_GEOMETRY.lateralScale * 1000).toFixed(1)} 毫米`} ends={['左', '右']} onChange={(v) => op({ type: 'lamp-lateral', value: v / 100 })} />
                <p className="course-shell__note" data-testid="grating-fixed">本机狭缝与焦距固定：模型上没有狭缝调节环和抽拉套筒，只能调照明与对光。</p>
                <small>灯头也可以在三维中按住左右拖动。改变夹样、亮度或灯头位置会清除已有标记。亮度档位与对准范围为教学设定，未经实物标定；点“灯头”“分光镜”可近看。</small>
              </div>}
              {(s.step === 'tune' || s.step === 'observe') && variant === 'prism' && <div className="course-shell__tuning">
                <RangeControl label="狭缝宽度" testId="slit-control" min={0} max={100} value={Math.round(s.bench.slit * 100)} display={slitGapMm ? `${slitGapMm} mm` : `${Math.round(s.bench.slit * 100)}%`} valueText={slitGapMm ? `刃口间距 ${slitGapMm} 毫米` : undefined} ends={['窄', '宽']} onChange={(v) => op({ type: 'slit', value: v / 100 })} />
                <RangeControl label="目镜焦距" min={0} max={100} value={Math.round(s.bench.focus * 100)} display={`套筒 ${Math.round(s.bench.focus * 20)} mm`} valueText={`目镜套筒拉出 ${Math.round(s.bench.focus * 20)} 毫米`} ends={['缩回', '拉出']} onChange={(v) => op({ type: 'focus', value: v / 100 })} />
                <small>也可以在三维中按住狭缝调节环或目镜套筒左右拖动。改变夹样、狭缝或焦距会清除已有标记。模型中的转角、行程和缝宽为教学联动示意，未经实物标定；点“分光镜”可近看。</small>
              </div>}
              {s.step === 'tune' && question(config.stepQuestions.tune)}
              {s.step === 'observe' && <>
                <p className="course-shell__note">已标记：{s.marks.length ? s.marks.map((m) => `${m} nm`).join('、') : '无'}</p>
                <button type="button" disabled={!s.marks.length || shown.problems.length > 0} onClick={() => op({ type: 'check' })}>核对标记</button>
                {s.checked && (
                  <div className="course-shell__feedback" role="status" data-testid="marks-feedback">
                    <strong>{marks.foundCount >= REQUIRED_GROUPS ? `找到 ${marks.foundCount} 组诊断特征` : `找到 ${marks.foundCount} 组，至少需要 ${REQUIRED_GROUPS} 组`}</strong>
                    <ul className="course-shell__check">{FEATURE_GROUPS.map((group, i) => <li key={group.label}>{marks.found[i] ? '✓' : '○'} {group.label}</li>)}</ul>
                    {!!marks.stray.length && <p>{marks.stray.map((m) => `${m} nm`).join('、')} 附近没有吸收特征，可以点掉重标。</p>}
                    <p>参考：{COURSE_SAMPLE.spectrum.description}</p>
                  </div>
                )}
              </>}
            </>}
            {s.step === 'explain' && <>
              {variant === 'grating' && <div className="course-shell__observation" data-testid="scale-comparison">
                <h2>对照：同一颗红宝石，两种刻度 <span>教学模拟</span></h2>
                {(['grating', 'prism'] as const).map((d) => <div key={d} className="course-shell__spectrum" data-dispersion={d}>
                  <small>{d === 'grating' ? '光栅式（近似线性）' : '棱镜式（红端压缩、紫端展开）'}</small>
                  <SpectrumStrip features={IDEAL[d].features} display={IDEAL[d]} dispersion={d} interactive={false} showFeatureDescriptions={false} height={48} />
                </div>)}
              </div>}
              <div className="course-shell__observation" data-testid="weak-light-comparison">
                <h2>对照：透光太弱时 <span>教学模拟</span></h2>
                <div className="course-shell__spectrum"><SpectrumStrip features={WEAK_LIGHT[variant].features} display={WEAK_LIGHT[variant]} dispersion={variant} interactive={false} showFeatureDescriptions={false} height={56} /></div>
              </div>
              {config.explainQuestions.map(question)}
            </>}
          </fieldset>
      </>
      <details className="course-shell__sources">
        <summary>依据与范围</summary>
        <p>固定一颗透明的红宝石教学样品（品种透明度为透明至半透明，本课选用可清楚透射的一颗）；吸收特征波长与 GB/T 16553-2010 一致，见 docs/分光镜吸收光谱数据核对-2026-10-09.md。{text.scope}本课不覆盖其他样品。</p>
        {snapshot.status === 'ready' && snapshot.sources.map((x) => <p key={x.title}><a href={x.url || undefined} target="_blank" rel="noreferrer">{x.title}</a></p>)}
      </details>
    </CourseShell>
  );
}

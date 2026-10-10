import { useEffect, useRef, useState } from 'react';
import { useResponsiveViewport } from '../shared/useResponsiveViewport';
import { ChoiceQuestionField, CourseFinish, CourseShell, CourseStepFooter, CourseStepHeading } from '../course/CourseShell';
import { useLearningRecord } from '../course/useLearningRecord';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../optics3d/opticsViewer.js';
import { opticsAssetBase } from '../optics3d/opticsInstruments';
import SpectrumStrip from './SpectrumStrip';
import { allComplete, checkMarks, COURSE_SAMPLE, display, FEATURE_GROUPS, initialCourse, isComplete, KEY_PARTS, navigateCourse, operate, PATH_CASES, QUESTIONS, REQUIRED_GROUPS, STEPS, type CourseState, type Operation, type StepId } from '../../domain/spectroscopeCourse';
import { displaySpectrum, IDEAL_CONDITIONS, type SpectrumProblem } from '../../domain/spectrumDisplay';

const PROBLEM_TEXT: Record<SpectrumProblem, string> = {
  'not-through-sample': '光没有穿过样品：只看到光源的连续光谱。',
  'weak-light': '透光太弱：整体偏暗，蓝紫端先变黑。',
  'slit-wide': '狭缝过宽：谱线发糊，相邻细线并在一起，弱线消失。',
  'slit-narrow': '狭缝过窄：视场变暗，紫端和弱线看不清。',
  defocus: '焦距偏离：所有谱线发虚。',
};

/** 用于「透光太弱」问题的对照：同一份参考光谱，只把光强降下来。 */
const WEAK_LIGHT = displaySpectrum(COURSE_SAMPLE.spectrum.features, { ...IDEAL_CONDITIONS, light: 'weak' });

export default function SpectroscopeCourse({ mode, onExit }: { mode: CourseState['mode']; onExit: () => void }) {
  const [s, setS] = useState(() => initialCourse(mode));
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });
  const [finished, setFinished] = useState(false);
  const learning = useLearningRecord('spectroscope', mode);
  const viewport = useRef<HTMLDivElement>(null), viewer = useRef<OpticsViewer | null>(null);
  const ready = snapshot.status === 'ready';
  const assetBase = opticsAssetBase('prism-spectroscope');
  useResponsiveViewport();
  useEffect(() => {
    if (!viewport.current) return;
    const v = createOpticsViewer({
      container: viewport.current,
      instrument: 'prism-spectroscope',
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
  }, [assetBase]);
  useEffect(() => {
    if (!ready) return;
    viewer.current?.setView(s.step === 'path' ? 'optics' : 'whole');
    viewer.current?.setRays(s.step === 'path');
    viewer.current?.fit();
  }, [ready, s.step]);
  // 3D 联动：狭缝滑杆转动调节环、带动刃口开合；焦距滑杆抽拉目镜套筒；对光时样品在光路中或移开。
  const showSample = ['light', 'tune', 'observe'].includes(s.step);
  useEffect(() => {
    if (ready) viewer.current?.setControls({ slitControl: s.slit, focusTube: s.focus });
  }, [ready, s.slit, s.focus]);
  useEffect(() => {
    if (ready) viewer.current?.setSample(showSample ? { position: s.throughSample ? 'through' : 'aside' } : null);
  }, [ready, showSample, s.throughSample]);

  const op = (operation: Operation) => setS((prev) => operate(prev, operation));
  const go = (id: StepId, skip = false) => setS((prev) => navigateCourse(prev, id, skip));
  const shown = display(s);
  const marks = checkMarks(s.marks);
  const selected = snapshot.status === 'ready' ? snapshot.selected : null;
  const motion = snapshot.status === 'ready' ? snapshot.controls : null;
  function finish() {
    if (!allComplete(s)) return;
    setFinished(true);
    void learning.record(s.hasSkipped, true);
  }
  const question = (id: string) => <ChoiceQuestionField key={id} question={QUESTIONS.find((q) => q.id === id)!} answer={s.answers[id]} onAnswer={(option) => op({ type: 'answer', id, option })} />;
  const observing = ['light', 'tune', 'observe'].includes(s.step);

  const model = (
    <section className="course-shell__model" ref={viewport} aria-label="课程三维仪器">
      <div className="course-shell__views">
        <button type="button" disabled={!ready} onClick={() => viewer.current?.setView('whole')}>整机结构</button>
        <button type="button" disabled={!ready} onClick={() => { viewer.current?.setView('optics'); viewer.current?.setRays(true); }}>内部光路</button>
        <button type="button" disabled={!ready} onClick={() => viewer.current?.fit()}>完整视野</button>
      </div>
      {snapshot.status === 'loading' && <p className="course-shell__loading" role="status">正在载入教学模型…</p>}
      {snapshot.status === 'error' && (
        <div className="course-shell__fallback" role="alert">
          <img src={`${assetBase}poster.png`} alt="棱镜式分光镜静态预览" />
          <p>模型载入失败，部件与光路两步需要三维模型；光谱观察仍可练习。</p>
          <button onClick={() => window.location.reload()}>重新载入</button>
        </div>
      )}
      <p className="course-shell__model-note">拖动旋转 · 滚轮缩放 · 比例及内部处方未标定</p>
    </section>
  );

  return (
    <CourseShell title="分光镜基础观察课" minutes={8} testId="spectroscope-course" steps={STEPS} current={s.step} mode={mode} isComplete={(id) => isComplete(s, id)} onGo={go} onExit={onExit} model={model}>
      {finished ? (
        <CourseFinish status={learning.status} failed={learning.failed} summary="你已完成对光、调节狭缝与焦距、标记吸收特征和解释。学习完成与独立检测掌握分别记录。" onRetry={() => void learning.record(s.hasSkipped, allComplete(s))} onExit={onExit} />
      ) : (
        <>
          <CourseStepHeading steps={STEPS} current={s.step} />
          {!ready && (s.step === 'parts' || s.step === 'path') && <p>模型就绪后开始操作。</p>}
          <fieldset className="course-shell__content" disabled={!ready && (s.step === 'parts' || s.step === 'path')}>
            {s.step === 'parts' && <>
              <div className="course-shell__parts">
                {KEY_PARTS.map((p) => (
                  <button key={p.id} type="button" aria-pressed={selected?.id === p.id} onClick={() => { viewer.current?.setView(p.id === 'collimator' || p.id === 'prismTrain' ? 'optics' : 'whole'); viewer.current?.select(p.id); }}>
                    {s.partsSeen.includes(p.id) ? '✓ ' : ''}{p.label}
                  </button>
                ))}
              </div>
              <p className="course-shell__note">{KEY_PARTS.find((p) => p.id === selected?.id)?.note || '点选部件，模型会自动聚焦。'}</p>
            </>}
            {s.step === 'path' && <>
              <ol className="course-shell__path">
                {PATH_CASES.map((c) => (
                  <li key={c.id}><button type="button" aria-pressed={snapshot.status === 'ready' && snapshot.state.caseId === c.id} onClick={() => { viewer.current?.setCase(c.id); op({ type: 'see-case', id: c.id }); }}>
                    {s.casesSeen.includes(c.id) ? '✓ ' : ''}{c.label}
                  </button></li>
                ))}
              </ol>
              {snapshot.status === 'ready' && <p className="course-shell__note">{snapshot.currentCase.description}</p>}
              {question('dispersion')}
            </>}
            {observing && <>
              <div className="course-shell__observation" data-testid="course-observation" data-problems={shown.problems.join(' ')}>
                <h2>目镜观察 <span>教学模拟 · 棱镜式刻度</span></h2>
                <div className="course-shell__spectrum"><SpectrumStrip
                  features={shown.features}
                  display={shown}
                  dispersion="prism"
                  userMarks={s.step === 'observe' ? s.marks : []}
                  onAddMark={(wavelength) => op({ type: 'mark', wavelength })}
                  onRemoveMark={(wavelength) => op({ type: 'unmark', wavelength })}
                  interactive={s.step === 'observe'}
                  showFeatureDescriptions={false}
                  height={84}
                /></div>
                <p role="status">{shown.problems.length ? shown.problems.map((p) => PROBLEM_TEXT[p]).join(' ') : '光穿过样品，狭缝与焦距合适。'}</p>
                <small>参考光谱来自项目样品数据（与 GB/T 16553-2010 一致）；条件不合适时的变化为教学模拟。</small>
              </div>
              <div className="course-shell__operations" aria-label="照明">
                <button type="button" aria-pressed={!s.throughSample} onClick={() => op({ type: 'through-sample', on: false })}>光绕过样品</button>
                <button type="button" aria-pressed={s.throughSample} onClick={() => op({ type: 'through-sample', on: true })}>透射：光穿过样品</button>
              </div>
              {s.step === 'light' && <>
                <button type="button" disabled={s.throughSample} onClick={() => op({ type: 'record-continuous' })}>记录：只见连续光谱</button>
                {s.continuousRecorded && <p>✓ 已记录：光没有穿过样品，不能据此下结论</p>}
                {question('continuous')}
              </>}
              {(s.step === 'tune' || s.step === 'observe') && <div className="course-shell__tuning">
                <label>狭缝宽度<input type="range" aria-label="狭缝宽度" min={0} max={100} value={Math.round(s.slit * 100)} onChange={(e) => op({ type: 'slit', value: Number(e.target.value) / 100 })} /></label>
                <label>目镜焦距<input type="range" aria-label="目镜焦距" min={0} max={100} value={Math.round(s.focus * 100)} onChange={(e) => op({ type: 'focus', value: Number(e.target.value) / 100 })} /></label>
                {motion && <p className="course-shell__note" data-testid="model-motion">模型：调节环转 {motion.slitControlDegrees}°，狭缝宽 {motion.slitGapMm} mm；目镜套筒拉出 {motion.focusTubeMm} mm</p>}
                <div className="course-shell__operations" aria-label="看模型">
                  <button type="button" disabled={!ready} onClick={() => viewer.current?.focusParts(['slitLeft', 'slitRight'], 'optics', [0.12, 0.2, -1])}>近看狭缝刃口</button>
                  <button type="button" disabled={!ready} onClick={() => viewer.current?.focusParts(['focusTube', 'eyepiece'], 'whole', [0.45, 1, 0.15])}>近看目镜套筒</button>
                  <button type="button" disabled={!ready} onClick={() => { viewer.current?.setView('whole'); viewer.current?.fit(); }}>整机与样品</button>
                </div>
                <small>改变照明、狭缝或焦距会清除已有标记。模型中的转角、行程和缝宽为教学联动示意，未经实物标定。</small>
              </div>}
              {s.step === 'tune' && question('slit')}
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
              <div className="course-shell__observation" data-testid="weak-light-comparison">
                <h2>对照：透光太弱时 <span>教学模拟</span></h2>
                <div className="course-shell__spectrum"><SpectrumStrip features={WEAK_LIGHT.features} display={WEAK_LIGHT} dispersion="prism" interactive={false} showFeatureDescriptions={false} height={56} /></div>
              </div>
              {['dark', 'grating', 'evidence'].map(question)}
            </>}
            <CourseStepFooter steps={STEPS} current={s.step} mode={mode} isComplete={(id) => isComplete(s, id)} allComplete={allComplete(s)} hasSkipped={s.hasSkipped} onGo={go} onFinish={finish} />
          </fieldset>
        </>
      )}
      <details className="course-shell__sources">
        <summary>依据与范围</summary>
        <p>固定红宝石教学样品；吸收特征波长与 GB/T 16553-2010 一致，见 docs/分光镜吸收光谱数据核对-2026-10-09.md。狭缝、焦距、对光与透光条件对光谱的影响为显示变换模拟，不是实拍；三维模型的内部处方和尺寸未经实物标定。本课不覆盖光栅式操作和其他样品。</p>
        {snapshot.status === 'ready' && snapshot.sources.map((x) => <p key={x.title}><a href={x.url || undefined} target="_blank" rel="noreferrer">{x.title}</a></p>)}
      </details>
    </CourseShell>
  );
}

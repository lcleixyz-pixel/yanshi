import { useEffect, useRef, useState, type ReactNode } from 'react';
import Header from '../shared/Header';
import { stepLocked, type ChoiceQuestion, type CourseCheckItem, type CourseMode, type CourseStep } from '../../domain/course';
import type { InstrumentId } from '../../data/types';
import { INSTRUMENTS } from '../../data/instruments';
import '../../styles/instrument-ui.css';
import '../../styles/course-shell.css';

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}

export interface CourseFinishInfo {
  status: string;
  failed: boolean;
  summary: string;
  onRetry: () => void;
  onRestart: () => void;
}

/**
 * 课程页骨架，结构与偏光镜课程一致：顶部课程条（步骤、讲师 / 学员切换、退出；任务、为什么、本步清单、上一步 / 下一步 / 跳过），
 * 下方三维区与本步操作面板。步骤条只能回到已到达过的最远一步；完成后在三维区上方显示各步用时（只显示、不保存）。
 */
export function CourseShell<Id extends string>({ instrument, title, minutes, testId, steps, current, mode, onMode, isComplete, checklist, allComplete, hasSkipped, onGo, onFinish, onExit, finish, model, children }: {
  instrument: InstrumentId;
  title: string;
  minutes: number;
  testId: string;
  steps: readonly CourseStep<Id>[];
  current: Id;
  mode: CourseMode;
  onMode: (mode: CourseMode) => void;
  isComplete: (id: Id) => boolean;
  checklist: readonly CourseCheckItem[];
  allComplete: boolean;
  hasSkipped: boolean;
  onGo: (id: Id, skip?: boolean) => void;
  onFinish: () => void;
  onExit: () => void;
  /** 完成后提供：保存状态、重试与再学一遍。 */
  finish: CourseFinishInfo | null;
  model: ReactNode;
  children: ReactNode;
}) {
  const index = steps.findIndex((step) => step.id === current);
  const [reached, setReached] = useState(index);
  useEffect(() => setReached((previous) => Math.max(previous, index)), [index]);
  // 各步用时：离开一步时累加；完成后停表。
  const times = useRef<number[]>(steps.map(() => 0));
  const entered = useRef({ index, at: Date.now() });
  const [stepTimes, setStepTimes] = useState<number[] | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (entered.current.index !== index) {
      times.current[entered.current.index] += now - entered.current.at;
      entered.current = { index, at: now };
    }
  }, [index]);
  const finished = finish !== null;
  useEffect(() => {
    if (!finished) { setStepTimes(null); return; }
    const now = Date.now();
    times.current[entered.current.index] += now - entered.current.at;
    entered.current = { index: entered.current.index, at: now };
    setStepTimes([...times.current]);
  }, [finished]);

  // 投屏模式（同偏光镜）：隐藏页眉，三维区放大；课程条与本步操作保留。Esc 退出，焦点在页内循环，退出后回到入口按钮。
  const [projection, setProjection] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null), enterRef = useRef<HTMLButtonElement>(null), exitRef = useRef<HTMLButtonElement>(null);
  const wasProjection = useRef(false);
  useEffect(() => {
    if (projection) exitRef.current?.focus();
    else if (wasProjection.current) enterRef.current?.focus();
    wasProjection.current = projection;
    if (!projection) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setProjection(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0], lastItem = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastItem?.focus(); }
      if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [projection]);

  const step = steps[index];
  const complete = isComplete(current);
  const last = index === steps.length - 1;
  const total = stepTimes?.reduce((sum, value) => sum + value, 0) ?? 0;
  return (
    <div ref={rootRef} className={`course-shell iu${projection ? ' course-shell--projection' : ''}`} data-instrument={instrument} data-testid={testId} data-step={current} data-mode={mode} data-projection={projection}>
      <Header title={INSTRUMENTS[instrument]?.name ?? title} subtitle="3D 仪器教学" right={<button ref={enterRef} type="button" className="iu-button" onClick={() => setProjection(true)} aria-label="进入投屏模式" data-testid="course-projection">投屏模式</button>} />
      {projection && <button ref={exitRef} type="button" className="iu-button course-shell__projection-exit" onClick={() => setProjection(false)} aria-label="退出投屏模式" data-testid="course-projection-exit">退出投屏 · Esc</button>}
      <section className="course-shell__guide" aria-label="引导课程" data-testid="course-guide" data-complete={complete}>
        <div className="course-shell__rail">
          <span className="course-shell__title"><strong>{title}</strong><span>{mode === 'student' ? '学员自学' : '讲师演示'} · 约 {minutes} 分钟</span></span>
          <nav className="course-shell__steps-nav" aria-label="课程步骤"><ol className="course-shell__steps">{steps.map((item, i) => {
            const done = isComplete(item.id);
            return <li key={item.id}><button type="button" aria-current={i === index ? 'step' : undefined} data-done={done} disabled={stepLocked(i, reached)} aria-label={`${i + 1} ${item.title}${done ? '（已完成）' : ''}`} onClick={() => onGo(item.id)} data-testid={`course-step-${item.id}`}><span>{done ? '✓' : i + 1}</span><em>{item.title}</em></button></li>;
          })}</ol></nav>
          <div className="course-shell__mode" role="group" aria-label="使用方式">{(['teacher', 'student'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onMode(value)} data-testid={`course-mode-${value}`}>{value === 'teacher' ? '讲师演示' : '学员自学'}</button>)}</div>
          <button type="button" className="iu-button iu-button--quiet course-shell__exit" onClick={onExit} data-testid="course-exit">退出课程</button>
        </div>
        <div className="course-shell__body">
          <div className="course-shell__task">
            <h1><span>{index + 1} / {steps.length}</span>{step.title}</h1>
            <p>{step.task}</p>
            {complete && step.why && <p className="iu-why" data-testid="course-why"><strong>为什么：</strong>{step.why}</p>}
          </div>
          <ul className="course-shell__checklist" aria-label="本步完成情况">{checklist.map((item) => (
            <li key={item.id} data-done={item.done}><span aria-hidden="true">{item.done ? '✓' : '○'}</span>{item.label}<span className="iu-sr">{item.done ? '（已完成）' : '（未完成）'}</span></li>
          ))}</ul>
          <div className="course-shell__nav">
            <button type="button" className="iu-button" disabled={index === 0} onClick={() => onGo(steps[index - 1].id)} data-testid="course-prev">← 上一步</button>
            {last
              ? <button type="button" className="iu-button iu-button--primary" disabled={!allComplete || !!finish} onClick={onFinish} data-testid="course-finish">完成课程</button>
              : <button type="button" className="iu-button iu-button--primary" disabled={!complete} onClick={() => onGo(steps[index + 1].id)} data-testid="course-next">下一步 →</button>}
            {!complete && !last && <button type="button" className="iu-button iu-button--quiet" onClick={() => onGo(steps[index + 1].id, mode === 'student')} data-testid="course-skip">跳过</button>}
            {hasSkipped && <small className="course-shell__skipped">本次有跳过的步骤，完成后不记录学习进度。</small>}
          </div>
        </div>
      </section>
      <main className="course-shell__main">
        {model}
        <aside className="course-shell__panel" aria-label="本步操作与观察">{children}</aside>
        {finish && stepTimes && (
          <div className="course-shell__overlay">
            <div className="course-shell__card" role="region" aria-label="课程完成" data-testid="course-complete">
              <span className="iu-eyebrow">COURSE COMPLETE</span>
              <h2>本课完成 · 用时 {formatDuration(total)}</h2>
              <ol className="course-shell__times">{steps.map((item, i) => <li key={item.id}><span>{item.title}</span><output>{formatDuration(stepTimes[i] ?? 0)}</output></li>)}</ol>
              <p className="course-shell__small">用时只在本页显示，不保存、不计分。</p>
              <p role="status" data-testid="course-save-status">{finish.status || '正在保存学习记录…'}</p>
              <p>{finish.summary}</p>
              <div className="course-shell__nav">
                {finish.failed && <button type="button" className="iu-button" onClick={finish.onRetry}>重试保存</button>}
                <button type="button" className="iu-button" onClick={finish.onRestart} data-testid="course-restart">再学一遍</button>
                <button type="button" className="iu-button iu-button--primary" onClick={onExit}>进入自由探索</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * 观察窗停靠在三维区内（同偏光镜目镜视场）：操作滑杆时模型与观察结果同时可见。
 * eyepiece 为右上角圆形视场，strip 为底部光谱条。其余属性透传，供页面写入核验用的 data-*。
 */
export function CourseDock({ kind, title, children, ...rest }: { kind: 'eyepiece' | 'strip'; title: ReactNode; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <div className={`course-shell__dock course-shell__dock--${kind}`} data-testid="course-observation" role="group" aria-label="目镜观察" {...rest}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** 单选问答（同偏光镜）：先选择再提交，逐项显示 ✓ / ✗；答对后锁定。答错不直接给出正确答案。 */
export function ChoiceQuestionField({ question, answer, onAnswer }: { question: ChoiceQuestion; answer: number | undefined; onAnswer: (option: number) => void }) {
  const [selected, setSelected] = useState<number | undefined>(answer);
  const right = answer === question.correct;
  const shown = answer !== undefined && answer === selected;
  return (
    <fieldset className="course-shell__question" data-testid={`question-${question.id}`} data-correct={right}>
      <legend>{question.prompt}</legend>
      {question.options.map((text, i) => (
        <label key={text} className="course-shell__option" data-result={shown && selected === i ? (i === question.correct ? 'right' : 'wrong') : undefined}>
          <input type="radio" name={question.id} checked={selected === i} disabled={right} onChange={() => setSelected(i)} />
          <span>{text}{shown && selected === i && <small>{i === question.correct ? `✓ ${question.feedback}` : '✗ 这个选项不对，再想一想。'}</small>}</span>
        </label>
      ))}
      {right
        ? <p className="course-shell__result" role="status">回答正确。</p>
        : <div className="course-shell__submit"><button type="button" className="iu-button" disabled={selected === undefined || shown} onClick={() => selected !== undefined && onAnswer(selected)}>提交</button></div>}
    </fieldset>
  );
}

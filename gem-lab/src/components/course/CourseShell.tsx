import { useEffect, useRef, useState, type ReactNode } from 'react';
import Header from '../shared/Header';
import type { ChoiceQuestion, CourseCheckItem, CourseMode, CourseStep } from '../../domain/course';
import { CourseCompleteCard, CourseGuideBar, CourseQuestionCard } from './CourseParts';
import type { InstrumentId } from '../../data/types';
import { INSTRUMENTS } from '../../data/instruments';
import '../../styles/instrument-ui.css';
import '../../styles/course-shell.css';

export { formatDuration } from './CourseParts';

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

  return (
    <div ref={rootRef} className={`course-shell iu${projection ? ' course-shell--projection' : ''}`} data-instrument={instrument} data-testid={testId} data-step={current} data-mode={mode} data-projection={projection}>
      <Header title={INSTRUMENTS[instrument]?.name ?? title} subtitle="3D 仪器教学" right={<button ref={enterRef} type="button" className="iu-button" onClick={() => setProjection(true)} aria-label="进入投屏模式" data-testid="course-projection">投屏模式</button>} />
      {projection && <button ref={exitRef} type="button" className="iu-button course-shell__projection-exit" onClick={() => setProjection(false)} aria-label="退出投屏模式" data-testid="course-projection-exit">退出投屏 · Esc</button>}
      <CourseGuideBar
        title={title} subtitle={`${mode === 'student' ? '学员自学' : '讲师演示'} · 约 ${minutes} 分钟`}
        steps={steps} index={index} reached={reached} isDone={(i) => isComplete(steps[i].id)} checklist={checklist}
        mode={mode} onMode={onMode} onExit={onExit} onGo={(i, skip) => onGo(steps[i].id, skip && mode === 'student')}
        onFinish={onFinish} canFinish={allComplete && !finish} hasSkipped={hasSkipped}
      />
      <main className="course-shell__main">
        {model}
        <aside className="course-shell__panel" aria-label="本步操作与观察">{children}</aside>
        {finish && stepTimes && (
          <div className="course-shell__overlay">
            <CourseCompleteCard title="本课完成" steps={steps} stepTimes={stepTimes} skipped={[]} status={finish.status} summary={finish.summary} failed={finish.failed} onRetry={finish.onRetry} onRestart={finish.onRestart} onExit={onExit} />
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

/** 单选问答：领域数据为「选项文字 + 正确序号 + 整题反馈」，转成共用问答卡；提交时回报所选序号。 */
export function ChoiceQuestionField({ question, answer, onAnswer }: { question: ChoiceQuestion; answer: number | undefined; onAnswer: (option: number) => void }) {
  const card = { id: question.id, prompt: question.prompt, options: question.options.map((text, i) => ({ id: String(i), text, correct: i === question.correct })) };
  return <CourseQuestionCard question={card} solved={answer === question.correct} rightFeedback={question.feedback} onSubmit={(selected) => onAnswer(Number(selected[0]))} testId={`question-${question.id}`} />;
}

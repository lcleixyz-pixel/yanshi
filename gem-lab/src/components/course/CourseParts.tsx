import { useState } from 'react';
import { stepLocked, type CourseMode } from '../../domain/course';

/**
 * 引导课程的共用部件：课程条、问答卡、完成卡片。偏光镜页面与课程外壳（折射仪、分光镜）共用，
 * 结构与交互规则取自偏光镜课程；颜色取 instrument-ui.css 的设计变量，外层需带 .iu。
 */

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}

export interface GuideStep { id: string; title: string; task: string; why?: string }
export interface GuideCheckItem {
  id: string;
  label: string;
  done: boolean;
  /** 未完成时可直接在课程条上执行的操作（例如换到某个样品、改为一般方向）。 */
  action?: { onClick: () => void; testId?: string };
}

/** 课程条：步骤（只能回到已到达过的最远一步）、讲师 / 学员切换、退出；任务、为什么、本步清单、上一步 / 下一步 / 跳过。 */
export function CourseGuideBar({ title, subtitle, steps, index, reached, isDone, checklist, mode, onMode, onExit, onGo, onFinish, canFinish, hasSkipped, className }: {
  title: string;
  subtitle: string;
  steps: readonly GuideStep[];
  index: number;
  reached: number;
  isDone: (index: number) => boolean;
  checklist: readonly GuideCheckItem[];
  mode: CourseMode;
  onMode: (mode: CourseMode) => void;
  onExit: () => void;
  /** skip 为 true 表示本步未完成即前进。 */
  onGo: (index: number, skip?: boolean) => void;
  onFinish: () => void;
  canFinish: boolean;
  hasSkipped?: boolean;
  className?: string;
}) {
  const step = steps[index];
  const complete = checklist.every((item) => item.done);
  const last = index === steps.length - 1;
  return (
    <section className={`course-shell__guide${className ? ` ${className}` : ''}`} aria-label="引导课程" data-testid="course-guide" data-step={step.id} data-complete={complete}>
      <div className="course-shell__rail">
        <span className="course-shell__title"><strong>{title}</strong><span>{subtitle}</span></span>
        <nav className="course-shell__steps-nav" aria-label="课程步骤"><ol className="course-shell__steps">{steps.map((item, i) => {
          const done = isDone(i);
          return <li key={item.id}><button type="button" aria-current={i === index ? 'step' : undefined} data-done={done} disabled={stepLocked(i, reached)} aria-label={`${i + 1} ${item.title}${done ? '（已完成）' : ''}`} onClick={() => onGo(i)} data-testid={`course-step-${item.id}`}><span>{done ? '✓' : i + 1}</span><em>{item.title}</em></button></li>;
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
          <li key={item.id} data-done={item.done}>{item.action && !item.done
            ? <button type="button" className="course-shell__check-button" onClick={item.action.onClick} data-testid={item.action.testId}><span aria-hidden="true">○</span>{item.label}</button>
            : <><span aria-hidden="true">{item.done ? '✓' : '○'}</span>{item.label}<span className="iu-sr">{item.done ? '（已完成）' : '（未完成）'}</span></>}</li>
        ))}</ul>
        <div className="course-shell__nav">
          <button type="button" className="iu-button" disabled={index === 0} onClick={() => onGo(index - 1)} data-testid="course-prev">← 上一步</button>
          {last
            ? <button type="button" className="iu-button iu-button--primary" disabled={!canFinish} onClick={onFinish} data-testid="course-finish">完成课程</button>
            : <button type="button" className="iu-button iu-button--primary" disabled={!complete} onClick={() => onGo(index + 1)} data-testid="course-next">下一步 →</button>}
          {!complete && !last && <button type="button" className="iu-button iu-button--quiet" onClick={() => onGo(index + 1, true)} data-testid="course-skip">跳过</button>}
          {hasSkipped && <small className="course-shell__skipped">本次有跳过的步骤，完成后不记录学习进度。</small>}
        </div>
      </div>
    </section>
  );
}

export interface CardQuestion {
  id: string;
  prompt: string;
  multiple?: boolean;
  options: readonly { id: string; text: string; correct: boolean; feedback?: string }[];
}

/**
 * 问答卡（同偏光镜）：选择 → 提交 → 逐项 ✓ / ✗；答对后锁定。
 * 选项自带反馈时逐项显示；否则答对显示 rightFeedback，答错只提示再想想、不直接给出答案。
 */
export function CourseQuestionCard({ question, number, solved, rightFeedback, onSubmit, testId }: {
  question: CardQuestion;
  number?: number;
  solved: boolean;
  rightFeedback?: string;
  onSubmit: (selected: string[]) => void;
  testId: string;
}) {
  const [selected, setSelected] = useState<string[]>(() => solved ? question.options.filter((option) => option.correct).map((option) => option.id) : []);
  const [submitted, setSubmitted] = useState(solved);
  const toggle = (id: string) => {
    setSubmitted(false);
    setSelected((previous) => question.multiple ? (previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]) : [id]);
  };
  const wrongChosen = question.options.some((option) => !option.correct && selected.includes(option.id));
  return (
    <fieldset className="course-shell__question" data-testid={testId} data-correct={solved}>
      <legend>{number ? `${number}. ` : ''}{question.prompt}</legend>
      {question.options.map((option) => {
        const shown = submitted && selected.includes(option.id);
        return (
          <label key={option.id} className="course-shell__option" data-result={shown ? (option.correct ? 'right' : 'wrong') : undefined}>
            <input type={question.multiple ? 'checkbox' : 'radio'} name={testId} checked={selected.includes(option.id)} disabled={solved} onChange={() => toggle(option.id)} />
            <span>{option.text}{shown && <small>{option.correct ? '✓ ' : '✗ '}{option.feedback ?? (option.correct ? rightFeedback : '这个选项不对，再想一想。')}</small>}</span>
          </label>
        );
      })}
      {solved
        ? <p className="course-shell__result" role="status">回答正确。</p>
        : <div className="course-shell__submit">
            <button type="button" className="iu-button" disabled={!selected.length || submitted} onClick={() => { setSubmitted(true); onSubmit(selected); }}>提交</button>
            {submitted && <span data-result="wrong">{wrongChosen ? '有选项不对，看看反馈后再改一改。' : '还有遗漏，再想想哪些情况也不能下结论。'}</span>}
          </div>}
    </fieldset>
  );
}

export interface CompleteTopic { id: string; title: string; text: string }

/** 完成卡片：总用时与各步用时（只显示、不保存）、保存状态、重试、再学一遍、进入自由探索；可附进阶内容。 */
export function CourseCompleteCard({ title, steps, stepTimes, skipped, status, summary, failed, onRetry, topics, onTopic, onRestart, onExit }: {
  title: string;
  steps: readonly { id: string; title: string }[];
  stepTimes: readonly number[];
  /** 未完成（被跳过）的步骤 id。 */
  skipped: readonly string[];
  status: string;
  summary?: string;
  failed?: boolean;
  onRetry?: () => void;
  topics?: readonly CompleteTopic[];
  onTopic?: (id: string) => void;
  onRestart: () => void;
  onExit: () => void;
}) {
  const total = stepTimes.reduce((sum, value) => sum + value, 0);
  return (
    <div className="course-shell__card" role="region" aria-label="课程完成" data-testid="course-complete" data-total-ms={Math.round(total)} data-skipped={skipped.length}>
      <span className="iu-eyebrow">COURSE COMPLETE</span>
      <h2>{title} · 用时 {formatDuration(total)}</h2>
      <ol className="course-shell__times">{steps.map((step, i) => <li key={step.id}><span>{step.title}{skipped.includes(step.id) && <em>已跳过</em>}</span><output>{formatDuration(stepTimes[i] ?? 0)}</output></li>)}</ol>
      <p className="course-shell__small">用时只在本页显示，不保存、不计分。</p>
      <p role="status" data-testid="course-save-status">{status || '正在保存学习记录…'}</p>
      {summary && <p>{summary}</p>}
      {!!topics?.length && <>
        <h3>进阶内容</h3>
        <div className="course-shell__topics">{topics.map((topic) => <button key={topic.id} type="button" className="course-shell__topic" onClick={() => onTopic?.(topic.id)} data-testid={`course-advanced-${topic.id}`}><strong>{topic.title}</strong><span>{topic.text}</span></button>)}</div>
      </>}
      <div className="course-shell__nav">
        {failed && onRetry && <button type="button" className="iu-button" onClick={onRetry}>重试保存</button>}
        <button type="button" className="iu-button" onClick={onRestart} data-testid="course-restart">再学一遍</button>
        <button type="button" className="iu-button iu-button--primary" onClick={onExit}>进入自由探索</button>
      </div>
    </div>
  );
}

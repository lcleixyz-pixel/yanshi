import type { ReactNode } from 'react';
import Header from '../shared/Header';
import { stepLocked, type ChoiceQuestion, type CourseMode, type CourseStep } from '../../domain/course';
import '../../styles/course-shell.css';

interface StepProps<Id extends string> {
  steps: readonly CourseStep<Id>[];
  current: Id;
  mode: CourseMode;
  isComplete: (id: Id) => boolean;
}

/** 课程页骨架：页眉、步骤条与退出、左侧三维区（由课程自己渲染）、右侧操作面板。 */
export function CourseShell<Id extends string>({ title, minutes, testId, steps, current, mode, isComplete, onGo, onExit, model, children }: StepProps<Id> & {
  title: string;
  minutes: number;
  testId: string;
  onGo: (id: Id) => void;
  onExit: () => void;
  model: ReactNode;
  children: ReactNode;
}) {
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <div className="course-shell" data-testid={testId} data-step={current} data-mode={mode}>
      <Header title={title} subtitle={`${mode === 'student' ? '学员练习' : '讲师演示'} · 约 ${minutes} 分钟`} />
      <div className="course-shell__bar">
        <nav aria-label="课程步骤">
          {steps.map((item, i) => (
            <button key={item.id} type="button" aria-current={current === item.id ? 'step' : undefined} disabled={stepLocked(steps, i, currentIndex, mode, isComplete)} onClick={() => onGo(item.id)}>
              <span>{isComplete(item.id) ? '✓' : i + 1}</span>
              {item.title}
            </button>
          ))}
        </nav>
        <button type="button" onClick={onExit}>返回自由探索</button>
      </div>
      <main className="course-shell__main">
        {model}
        <aside className="course-shell__panel" aria-label="课程操作与观察">{children}</aside>
      </main>
    </div>
  );
}

/** 当前步骤的标题与任务。 */
export function CourseStepHeading<Id extends string>({ steps, current }: { steps: readonly CourseStep<Id>[]; current: Id }) {
  const index = steps.findIndex((step) => step.id === current);
  return (
    <div className="course-shell__step">
      <small>第 {index + 1} / {steps.length} 步</small>
      <h1>{steps[index].title}</h1>
      <p>{steps[index].task}</p>
    </div>
  );
}

/** 上一步 / 下一步 / 跳步 / 完成课程。学员跳步会被记下，完成后不写入学习进度。 */
export function CourseStepFooter<Id extends string>({ steps, current, mode, isComplete, allComplete, hasSkipped, onGo, onFinish }: StepProps<Id> & {
  allComplete: boolean;
  hasSkipped: boolean;
  onGo: (id: Id, skip?: boolean) => void;
  onFinish: () => void;
}) {
  const index = steps.findIndex((step) => step.id === current);
  return (
    <footer className="course-shell__navigation">
      <p>{isComplete(current) ? '✓ 本步已完成' : '请完成本步操作与判断'}</p>
      <div>
        {index > 0 && <button onClick={() => onGo(steps[index - 1].id)}>上一步</button>}
        {index < steps.length - 1 ? <>
          <button disabled={!isComplete(current)} onClick={() => onGo(steps[index + 1].id)}>下一步</button>
          <button className="course-shell__skip" onClick={() => onGo(steps[index + 1].id, mode === 'student')}>{mode === 'teacher' ? '跳到下一步' : '跳步复习'}</button>
        </> : <button disabled={!allComplete} onClick={onFinish}>完成课程</button>}
      </div>
      {hasSkipped && <small>本次已使用跳步；完成后不记录学习进度。</small>}
    </footer>
  );
}

/** 课程完成：保存状态、失败重试和返回。 */
export function CourseFinish({ status, failed, summary, onRetry, onExit }: { status: string; failed: boolean; summary: string; onRetry: () => void; onExit: () => void }) {
  return (
    <section className="course-shell__finish">
      <h1>本课完成</h1>
      <p>{status || '正在保存学习记录…'}</p>
      <p>{summary}</p>
      {failed && <button onClick={onRetry}>重试保存</button>}
      <button onClick={onExit}>返回自由探索</button>
    </section>
  );
}

/** 单选问答：选中即判断，并显示解释。 */
export function ChoiceQuestionField({ question, answer, onAnswer }: { question: ChoiceQuestion; answer: number | undefined; onAnswer: (option: number) => void }) {
  return (
    <fieldset className="course-shell__question" data-testid={`question-${question.id}`}>
      <legend>{question.prompt}</legend>
      {question.options.map((text, i) => <button type="button" key={text} aria-pressed={answer === i} onClick={() => onAnswer(i)}>{text}</button>)}
      {answer !== undefined && <p role="status">{answer === question.correct ? '判断正确。' : '再想一想。'} {question.feedback}</p>}
    </fieldset>
  );
}

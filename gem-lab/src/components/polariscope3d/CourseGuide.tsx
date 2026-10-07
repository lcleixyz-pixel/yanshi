import { useState } from 'react';
import {
  COURSE_MINUTES,
  COURSE_QUESTIONS,
  COURSE_STEPS,
  courseChecklist,
  isAnswerCorrect,
  isStepComplete,
  type CourseProgress,
} from '../../domain/polariscopeCourse';

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}

interface CourseGuideProps {
  step: number;
  /** 已到达过的最远一步，之前的步骤可以回看。 */
  reached: number;
  progress: CourseProgress;
  onStep: (step: number) => void;
  onFinish: () => void;
  onExit: () => void;
  onPickSample: (sampleId: string) => void;
  /** 当前为沿光轴放置时可换方向。 */
  onReorient: (() => void) | null;
  /** 讲师演示：说明与控件在两侧面板；学员自学：提示与控件集中在中间展台。 */
  mode: 'teacher' | 'student';
  onMode: (mode: 'teacher' | 'student') => void;
}

/** 引导课程的步骤条：当前任务、完成清单与「为什么」。 */
export function CourseGuide({ step, reached, progress, onStep, onFinish, onExit, onPickSample, onReorient, mode, onMode }: CourseGuideProps) {
  const current = COURSE_STEPS[step];
  const checklist = courseChecklist(current.id, progress);
  const complete = checklist.every((item) => item.done);
  const last = step === COURSE_STEPS.length - 1;
  return (
    <section className="pol-course" aria-label="引导课程" data-testid="course-guide" data-step={current.id} data-complete={complete}>
      <div className="pol-course__rail">
        <span className="pol-course__title"><strong>偏光镜</strong><span>基础引导课程 · 约 {Math.ceil(COURSE_MINUTES)} 分钟</span></span>
        <ol className="pol-course__steps">{COURSE_STEPS.map((item, index) => {
          const done = isStepComplete(item.id, progress);
          return <li key={item.id}><button aria-current={index === step ? 'step' : undefined} data-done={done} disabled={index > reached} onClick={() => onStep(index)} data-testid={`course-step-${item.id}`}><span>{done ? '✓' : index + 1}</span>{item.title}</button></li>;
        })}</ol>
        <div className="pol-course__mode" role="group" aria-label="使用方式">{(['teacher', 'student'] as const).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => onMode(value)} data-testid={`course-mode-${value}`}>{value === 'teacher' ? '讲师演示' : '学员自学'}</button>)}</div>
        <button className="pol-explore__button pol-explore__button--quiet pol-course__exit" onClick={onExit} data-testid="course-exit">退出课程</button>
      </div>
      <div className="pol-course__body">
        <div className="pol-course__task">
          <h2><span>{step + 1} / {COURSE_STEPS.length}</span>{current.title}</h2>
          <p>{current.task}</p>
          {complete && <p className="pol-course__why" data-testid="course-why"><strong>为什么：</strong>{current.why}</p>}
        </div>
        <ul className="pol-course__checklist" aria-label="本步完成情况">{checklist.map((item) => <li key={item.id} data-done={item.done}>
          {item.sampleId && !item.done ? <button className="pol-course__check-button" onClick={() => onPickSample(item.sampleId!)}><span aria-hidden="true">○</span>{item.label}</button>
            : item.reorient && !item.done && onReorient ? <button className="pol-course__check-button" onClick={onReorient} data-testid="course-reorient"><span aria-hidden="true">○</span>{item.label}</button>
            : <span className="pol-course__check"><span aria-hidden="true">{item.done ? '✓' : '○'}</span>{item.label}<span className="pol-course__sr">{item.done ? '（已完成）' : '（未完成）'}</span></span>}
        </li>)}</ul>
        <div className="pol-course__nav">
          <button className="pol-explore__button" disabled={step === 0} onClick={() => onStep(step - 1)} data-testid="course-prev">← 上一步</button>
          {last
            ? <button className="pol-explore__button pol-explore__button--primary" disabled={!complete} onClick={onFinish} data-testid="course-finish">完成课程</button>
            : <button className="pol-explore__button pol-explore__button--primary" disabled={!complete} onClick={() => onStep(step + 1)} data-testid="course-next">下一步 →</button>}
          {!complete && !last && <button className="pol-explore__button pol-explore__button--quiet" onClick={() => onStep(step + 1)} data-testid="course-skip">跳过</button>}
        </div>
      </div>
    </section>
  );
}

/** 第 6 步：三道解释题。每题提交后显示逐项反馈，可修改后重新提交。 */
export function CourseQuiz({ correct, onCorrect }: { correct: readonly string[]; onCorrect: (id: string) => void }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  return (
    <div className="pol-course-card" role="region" aria-label="解释题" data-testid="course-quiz">
      <span className="pol-explore__eyebrow">06 / 解释</span>
      <h2>说清判断的依据</h2>
      {COURSE_QUESTIONS.map((question, index) => {
        const selected = answers[question.id] ?? [];
        const shown = submitted[question.id];
        const right = correct.includes(question.id);
        const toggle = (id: string) => {
          setSubmitted((previous) => ({ ...previous, [question.id]: false }));
          setAnswers((previous) => ({ ...previous, [question.id]: question.multiple ? (selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]) : [id] }));
        };
        const submit = () => {
          setSubmitted((previous) => ({ ...previous, [question.id]: true }));
          if (isAnswerCorrect(question, selected)) onCorrect(question.id);
        };
        return <fieldset key={question.id} className="pol-course-quiz__question" data-testid={`course-question-${question.id}`} data-correct={right}>
          <legend>{index + 1}. {question.prompt}</legend>
          {question.options.map((option) => <label key={option.id} className="pol-course-quiz__option" data-result={shown && selected.includes(option.id) ? (option.correct ? 'right' : 'wrong') : undefined}>
            <input type={question.multiple ? 'checkbox' : 'radio'} name={question.id} checked={selected.includes(option.id)} onChange={() => toggle(option.id)} disabled={right} />
            <span>{option.text}{shown && selected.includes(option.id) && <small>{option.correct ? '✓ ' : '✗ '}{option.feedback}</small>}</span>
          </label>)}
          {right ? <p className="pol-course-quiz__result" data-result="right">回答正确。</p>
            : <div className="pol-course-quiz__submit"><button className="pol-explore__button" disabled={!selected.length} onClick={submit}>提交</button>{shown && <span data-result="wrong">{question.options.some((option) => !option.correct && selected.includes(option.id)) ? '有选项不对，看看反馈后再改一改。' : '还有遗漏，再想想哪些情况也不能下结论。'}</span>}</div>}
        </fieldset>;
      })}
    </div>
  );
}

export interface AdvancedTopic { id: string; title: string; text: string }

/** 课程完成：总用时、各步用时与进阶内容入口。 */
export function CourseComplete({ stepTimes, progress, topics, onTopic, onRestart, onExit }: { stepTimes: number[]; progress: CourseProgress; topics: readonly AdvancedTopic[]; onTopic: (id: string) => void; onRestart: () => void; onExit: () => void }) {
  const total = stepTimes.reduce((sum, value) => sum + value, 0);
  return (
    <div className="pol-course-card" role="region" aria-label="课程完成" data-testid="course-complete" data-total-ms={Math.round(total)} data-skipped={COURSE_STEPS.filter((step) => !isStepComplete(step.id, progress)).length}>
      <span className="pol-explore__eyebrow">COURSE COMPLETE</span>
      <h2>基础课程完成 · 用时 {formatDuration(total)}</h2>
      <ol className="pol-course-complete__times">{COURSE_STEPS.map((step, index) => { const done = isStepComplete(step.id, progress); return <li key={step.id} data-done={done}><span>{step.title}{done ? null : <em>已跳过</em>}</span><output>{formatDuration(stepTimes[index] ?? 0)}</output></li>; })}</ol>
      <p className="pol-course-complete__note">用时只在本页显示，不保存、不计分。</p>
      <h3>进阶内容</h3>
      <div className="pol-course-complete__topics">{topics.map((topic) => <button key={topic.id} className="pol-course-complete__topic" onClick={() => onTopic(topic.id)} data-testid={`course-advanced-${topic.id}`}><strong>{topic.title}</strong><span>{topic.text}</span></button>)}</div>
      <div className="pol-course__nav"><button className="pol-explore__button" onClick={onRestart} data-testid="course-restart">再学一遍</button><button className="pol-explore__button pol-explore__button--primary" onClick={onExit}>进入自由探索</button></div>
    </div>
  );
}

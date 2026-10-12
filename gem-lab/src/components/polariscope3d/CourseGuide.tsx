import { CourseCompleteCard, CourseGuideBar, CourseQuestionCard, formatDuration, type CompleteTopic } from '../course/CourseParts';
import {
  COURSE_MINUTES,
  COURSE_QUESTIONS,
  COURSE_STEPS,
  courseChecklist,
  isAnswerCorrect,
  isStepComplete,
  type CourseProgress,
} from '../../domain/polariscopeCourse';
import '../../styles/instrument-ui.css';
import '../../styles/course-shell.css';

export { formatDuration };

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

/** 偏光镜引导课程的课程条：共用 CourseGuideBar；清单中「换样品」「换方向」可直接点。 */
export function CourseGuide({ step, reached, progress, onStep, onFinish, onExit, onPickSample, onReorient, mode, onMode }: CourseGuideProps) {
  const current = COURSE_STEPS[step];
  const checklist = courseChecklist(current.id, progress).map((item) => ({
    id: item.id, label: item.label, done: item.done,
    action: item.sampleId ? { onClick: () => onPickSample(item.sampleId!) }
      : item.reorient && onReorient ? { onClick: onReorient, testId: 'course-reorient' } : undefined,
  }));
  return (
    <CourseGuideBar
      className="pol-course"
      title="偏光镜" subtitle={`基础引导课程 · 约 ${Math.ceil(COURSE_MINUTES)} 分钟`}
      steps={COURSE_STEPS} index={step} reached={reached} isDone={(i) => isStepComplete(COURSE_STEPS[i].id, progress)} checklist={checklist}
      mode={mode} onMode={onMode} onExit={onExit} onGo={(i) => onStep(i)} onFinish={onFinish} canFinish={checklist.every((item) => item.done)}
    />
  );
}

/** 第 6 步：三道解释题（共用问答卡）。每题提交后显示逐项反馈，可修改后重新提交。 */
export function CourseQuiz({ correct, onCorrect }: { correct: readonly string[]; onCorrect: (id: string) => void }) {
  return (
    <div className="course-shell__card" role="region" aria-label="解释题" data-testid="course-quiz">
      <span className="iu-eyebrow">06 / 解释</span>
      <h2>说清判断的依据</h2>
      {COURSE_QUESTIONS.map((question, index) => (
        <CourseQuestionCard key={question.id} question={question} number={index + 1} solved={correct.includes(question.id)} testId={`course-question-${question.id}`}
          onSubmit={(selected) => { if (isAnswerCorrect(question, selected)) onCorrect(question.id); }} />
      ))}
    </div>
  );
}

export type AdvancedTopic = CompleteTopic;

/** 课程完成：共用完成卡片，附进阶内容入口。 */
export function CourseComplete({ stepTimes, progress, saveNote, topics, onTopic, onRestart, onExit }: { stepTimes: number[]; progress: CourseProgress; saveNote?: string; topics: readonly AdvancedTopic[]; onTopic: (id: string) => void; onRestart: () => void; onExit: () => void }) {
  return (
    <CourseCompleteCard
      title="基础课程完成" steps={COURSE_STEPS} stepTimes={stepTimes}
      skipped={COURSE_STEPS.filter((step) => !isStepComplete(step.id, progress)).map((step) => step.id)}
      status={saveNote ?? ''} topics={topics} onTopic={onTopic} onRestart={onRestart} onExit={onExit}
    />
  );
}

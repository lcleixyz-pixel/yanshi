import { useState, type ReactNode } from 'react';
import { ChoiceQuestionField } from '../../course/CourseShell';
import { useLearningRecord } from '../../course/useLearningRecord';
import { useSimDrawer } from '../SimDrawer';
import { SimTaskCard, SimTaskDock, SimTaskLine, taskChecklist } from '../SimShell';
import type { CourseMode } from '../../../domain/course';
import { isComplete, QUESTIONS, STEPS } from '../../../domain/refractometerCourse';
import { STEP_SHORT, type CourseView } from '../../../domain/refractometerSim';
import { SIM_SCREEN_LABELS, type SimScreenId } from '../../../domain/simSession';

/**
 * 引导任务卡：可收起的小卡，只写本步一句话、完成勾选与做完后的「为什么」，问答放在末尾的「检查一下」。
 * 步骤、完成条件与学习记录规则沿用课程域（学员自学、未跳步、全部完成才写入学习进度）。
 */
export default function RefractometerTaskCard({ view, open, mode, hasSkipped, teacherUsed, children, onOpen, onChoose, onAnswer, onRestart, onScreen }: {
  view: CourseView;
  open: boolean;
  mode: CourseMode | null;
  hasSkipped: boolean;
  teacherUsed: boolean;
  /** 本步专属的操作（实验屏用）：读数输入与超量程记录。 */
  children?: ReactNode;
  onOpen: (open: boolean) => void;
  onChoose: (mode: CourseMode) => void;
  onAnswer: (id: string, option: number) => void;
  onRestart: () => void;
  onScreen: (screen: SimScreenId) => void;
}) {
  const suppressed = useSimDrawer('task', open);
  const learning = useLearningRecord('refractometer', teacherUsed ? 'teacher' : 'student');
  const [finished, setFinished] = useState(false);
  const step = view.state.step;
  const current = STEPS.find((item) => item.id === step)!;
  const stepDone = view.completed.includes(step) || isComplete(view.state, step);

  // 还没选讲师演示 / 学员自学：与课程页一致，先选身份再开始；不选也可以直接自由练习。
  if (mode === null) {
    if (!open) return <SimTaskLine title="折射仪基础读数课" done={view.progress.done} total={view.progress.total} onOpen={() => onOpen(true)} />;
    return (
      <SimTaskDock>
      <section className="sim-task" aria-label="引导任务" data-testid="sim-task" data-suppressed={suppressed}>
        <header><span>引导任务</span><button type="button" onClick={() => onOpen(false)} data-testid="sim-task-close">收起 ▾</button></header>
        <strong>折射仪基础读数课</strong>
        <p className="sim-task__note">约 9 分钟，八步：认识部件、跟随光路、开灯放样、恢复光学接触、两次读数、解释与清理。学员自学按规则写入学习进度；讲师演示不写入。不选也可以直接在操作台上自由练习。</p>
        <div className="sim-row">
          <button type="button" className="iu-button iu-button--primary" onClick={() => onChoose('teacher')} data-testid="sim-task-teacher">讲师演示</button>
          <button type="button" className="iu-button" onClick={() => onChoose('student')} data-testid="sim-task-student">开始学习（学员）</button>
        </div>
      </section>
      </SimTaskDock>
    );
  }

  const checklist = taskChecklist(view.items, view.questions);

  return (
    <SimTaskCard
      title={`${STEP_SHORT[step]}${view.screenDone ? ' · 本屏已完成' : ''}`}
      items={checklist.items}
      progress={view.progress}
      open={open}
      onOpen={onOpen}
      onRestart={() => { setFinished(false); learning.reset(); onRestart(); }}
    >
      {children}
      {stepDone && current.why && <p className="sim-task__why" data-testid="sim-task-why">{current.why}</p>}
      {view.screenDone && !view.allComplete && view.nextScreen && (
        <p className="sim-task__note" data-testid="sim-task-next-screen">本屏的任务已做完，继续到「{SIM_SCREEN_LABELS[view.nextScreen]}」屏。<button type="button" className="iu-button" onClick={() => onScreen(view.nextScreen!)}>去{SIM_SCREEN_LABELS[view.nextScreen]}屏</button></p>
      )}
      {view.questions.filter((item) => checklist.ready(item.id)).map((item) => (
        <ChoiceQuestionField key={item.id} question={QUESTIONS.find((q) => q.id === item.id)!} answer={view.state.answers[item.id]} onAnswer={(option) => onAnswer(item.id, option)} />
      ))}
      {view.allComplete && (
        <div className="sim-task__finish" data-testid="sim-task-finish">
          {finished
            ? <p role="status">{learning.status}</p>
            : <button type="button" className="iu-button iu-button--primary" onClick={() => { setFinished(true); void learning.record(hasSkipped, true); }}>完成课程并记录</button>}
        </div>
      )}
    </SimTaskCard>
  );
}

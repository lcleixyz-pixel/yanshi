import { useState, type ReactNode } from 'react';
import { useLearningRecord } from '../../course/useLearningRecord';
import { useSimDrawer } from '../SimDrawer';
import { SimTaskCard, SimTaskDock, SimTaskLine } from '../SimShell';
import type { CourseMode } from '../../../domain/course';
import { COURSE_MINUTES, COURSE_STEPS } from '../../../domain/polariscopeCourse';
import { ADVANCED_TOPICS, STEP_SHORT, STEP_TASK, type CourseView } from '../../../domain/polariscopeSim';
import type { CourseStepId } from '../../../domain/polariscopeCourse';
import { SIM_SCREEN_LABELS, type SimScreenId } from '../../../domain/simSession';

/**
 * 引导任务卡：可收起的小卡，只写本步一句话、完成勾选与做完后的「为什么」。
 * 步骤、完成条件与学习记录规则沿用课程域（学员自学、未跳步、全部完成才写入学习进度）。
 */
export default function PolariscopeTaskCard({ view, finished: done, open, mode, hasSkipped, teacherUsed, children, onOpen, onChoose, onNext, onTopic, onRestart, onScreen }: {
  view: CourseView;
  /** 刚做完、还停在画面上的一步：先看结果与「为什么」，点「下一步」再换场景。 */
  finished?: { step: CourseStepId; items: CourseView['items'] } | null;
  onNext?: () => void;
  /** 完成课程后的进阶内容入口（进入实验屏的对应讲次与样品）。 */
  onTopic?: (id: string) => void;
  open: boolean;
  mode: CourseMode | null;
  hasSkipped: boolean;
  teacherUsed: boolean;
  /** 本步专属的操作（实验屏用）：预测、换方向与三道问答。 */
  children?: ReactNode;
  onOpen: (open: boolean) => void;
  onChoose: (mode: CourseMode) => void;
  onRestart: () => void;
  onScreen: (screen: SimScreenId) => void;
}) {
  const suppressed = useSimDrawer('task', open);
  const learning = useLearningRecord('polariscope', teacherUsed ? 'teacher' : 'student');
  const [finished, setFinished] = useState(false);
  const current = COURSE_STEPS.find((item) => item.id === view.step)!;
  const stepDone = view.completed.includes(view.step) || view.items.every((item) => item.done);

  // 还没选讲师演示 / 学员自学：先选身份再开始；不选也可以直接自由探索。
  if (mode === null) {
    if (!open) return <SimTaskLine title="偏光镜基础课" done={view.progress.done} total={view.progress.total} onOpen={() => onOpen(true)} />;
    return (
      <SimTaskDock>
        <section className="sim-task" aria-label="引导任务" data-testid="sim-task" data-suppressed={suppressed}>
          <header><span>引导任务</span><button type="button" onClick={() => onOpen(false)} data-testid="sim-task-close">收起 ▾</button></header>
          <strong>偏光镜基础课</strong>
          <p className="sim-task__note">约 {Math.ceil(COURSE_MINUTES)} 分钟，六步：认识部件、跟随光路、空载调正、放样旋转、换方向复核、解释。学员自学按规则写入学习进度；讲师演示不写入。不选也可以直接自由探索。</p>
          <div className="sim-row">
            <button type="button" className="iu-button iu-button--primary" onClick={() => onChoose('teacher')} data-testid="sim-task-teacher">讲师演示</button>
            <button type="button" className="iu-button" onClick={() => onChoose('student')} data-testid="sim-task-student">开始学习（学员）</button>
          </div>
        </section>
      </SimTaskDock>
    );
  }

  if (done) {
    const why = COURSE_STEPS.find((item) => item.id === done.step)!.why;
    return (
      <SimTaskCard title={`${STEP_SHORT[done.step]} · 已完成`} items={done.items.map((item, index) => ({ id: `step:${index}:${item.id}`, label: item.label, done: item.done }))}
        progress={view.progress} open={open} onOpen={onOpen} onRestart={() => { setFinished(false); learning.reset(); onRestart(); }}>
        <p className="sim-task__why" data-testid="sim-task-why">{why}</p>
        <button type="button" className="iu-button iu-button--primary" onClick={onNext} data-testid="sim-task-next">下一步：{STEP_SHORT[view.step]}</button>
      </SimTaskCard>
    );
  }

  return (
    <SimTaskCard
      title={`${STEP_SHORT[view.step]}${view.screenDone ? ' · 本屏已完成' : ''}`}
      items={view.items.map((item, index) => ({ id: `step:${index}:${item.id}`, label: item.label, done: item.done }))}
      progress={view.progress}
      open={open}
      onOpen={onOpen}
      onRestart={() => { setFinished(false); learning.reset(); onRestart(); }}
    >
      {!stepDone && <p className="sim-task__note" data-testid="sim-task-hint">{STEP_TASK[view.step]}</p>}
      {children}
      {stepDone && <p className="sim-task__why" data-testid="sim-task-why">{current.why}</p>}
      {view.screenDone && !view.allComplete && view.nextScreen && (
        <p className="sim-task__note" data-testid="sim-task-next-screen">本屏的任务已做完，继续到「{SIM_SCREEN_LABELS[view.nextScreen]}」屏。<button type="button" className="iu-button" onClick={() => onScreen(view.nextScreen!)}>去{SIM_SCREEN_LABELS[view.nextScreen]}屏</button></p>
      )}
      {view.allComplete && (
        <div className="sim-task__finish" data-testid="sim-task-finish">
          {finished
            ? <p role="status" data-testid="sim-task-save-status">{learning.status}</p>
            : <button type="button" className="iu-button iu-button--primary" onClick={() => { setFinished(true); void learning.record(hasSkipped, true); }}>完成课程并记录</button>}
          {finished && onTopic && (
            <div className="sim-task__topics" data-testid="sim-task-topics">
              <span className="sim-task__note">进阶内容</span>
              {ADVANCED_TOPICS.map((topic) => <button key={topic.id} type="button" className="iu-button" title={topic.text} onClick={() => onTopic(topic.id)} data-testid={`sim-task-topic-${topic.id}`}>{topic.title}</button>)}
            </div>
          )}
        </div>
      )}
    </SimTaskCard>
  );
}

/** 引导课程的通用约定：步骤、单选问答、步骤锁定和学习记录规则。各仪器课程只提供自己的步骤与完成条件。 */

export type CourseMode = 'student' | 'teacher';

export interface CourseStep<Id extends string = string> {
  id: Id;
  title: string;
  task: string;
}

export interface ChoiceQuestion {
  id: string;
  prompt: string;
  options: readonly string[];
  correct: number;
  feedback: string;
}

/** 学员模式下，前面的步骤都完成才可以点选后面的步骤；讲师可以自由跳转。 */
export function stepLocked<Id extends string>(
  steps: readonly CourseStep<Id>[],
  index: number,
  currentIndex: number,
  mode: CourseMode,
  isComplete: (id: Id) => boolean,
): boolean {
  return mode === 'student' && index > currentIndex && !steps.slice(0, index).every((step) => isComplete(step.id));
}

/** 只有学员自学、从未跳步、全部完成时才写入学习进度；讲师演示和复习都不计入。 */
export function mayRecordLearning(mode: CourseMode, hasSkipped: boolean, allComplete: boolean): boolean {
  return mode === 'student' && !hasSkipped && allComplete;
}

/** 不写入学习进度时给学员看的原因。 */
export function noRecordReason(mode: CourseMode): string {
  return mode === 'teacher' ? '讲师演示结束，不写入学习进度。' : '本次使用过跳步，已完成复习，不写入学习进度。';
}

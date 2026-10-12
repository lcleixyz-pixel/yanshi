/** 引导课程的通用约定：步骤、单选问答、步骤锁定和学习记录规则。各仪器课程只提供自己的步骤与完成条件。 */

export type CourseMode = 'student' | 'teacher';

export interface CourseStep<Id extends string = string> {
  id: Id;
  title: string;
  task: string;
  /** 本步完成后在任务下方出现的「为什么」。 */
  why?: string;
}

/** 课程条上的本步完成清单。 */
export interface CourseCheckItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ChoiceQuestion {
  id: string;
  prompt: string;
  options: readonly string[];
  correct: number;
  feedback: string;
}

/** 与偏光镜一致：步骤条只能回到已到达过的最远一步；要往后走用「下一步」或「跳过」。 */
export function stepLocked(index: number, reached: number): boolean {
  return index > reached;
}

/** 只有学员自学、从未跳步、全部完成时才写入学习进度；讲师演示和复习都不计入。 */
export function mayRecordLearning(mode: CourseMode, hasSkipped: boolean, allComplete: boolean): boolean {
  return mode === 'student' && !hasSkipped && allComplete;
}

/** 不写入学习进度时给学员看的原因。 */
export function noRecordReason(mode: CourseMode): string {
  return mode === 'teacher' ? '讲师演示结束，不写入学习进度。' : '本次使用过跳步，已完成复习，不写入学习进度。';
}

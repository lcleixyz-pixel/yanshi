import { useEffect, useRef } from 'react';
import { useDesktopLayout } from '../SimShell';
import RefractometerBench from './RefractometerBench';
import RefractometerTaskCard from './RefractometerTaskCard';
import type { SimScreenProps } from '../registry';
import { SAMPLES, SAMPLES_BY_ID } from '../../../data/samples';
import { requiredRefractometerMethod } from '../../../data/refractometerSampleMethod';
import {
  applyOperation, COURSE_SAMPLE, courseStepBar, courseView, EMPTY_SCENE_FIELDS, labInitial, nextBenchAction, readLabScene, readTaskData, sceneFields,
  type LabScene, type SimOperation,
} from '../../../domain/refractometerSim';
import '../../../styles/sim-instrument.css';

/**
 * 折射仪 · 实验屏：开灯、滴液、放样、恢复接触、读数与复核、清理复位。
 * 引导任务固定用课程教学样品（尖晶石）与课程域的条件判断；不选身份时就是自由练习，可换任意样品。
 */
export default function RefractometerLabScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const lab = readLabScene(session.scenes[screen]);
  const task = readTaskData(session.task.data);
  const guided = task.mode !== null;
  // 引导任务固定教学样品（课程条件按它判断）；自由练习用所选样品。
  const sample = guided ? COURSE_SAMPLE : SAMPLES_BY_ID[lab.sampleId] ?? SAMPLES[0];
  const scene: LabScene = guided ? { ...lab, sampleId: COURSE_SAMPLE.id } : lab;
  const view = courseView(task, sceneFields(scene), screen);

  // 手机上任务卡先收为顶部一行，给仪器与观察面板让出高度；学员随时可以展开。
  const desktop = useDesktopLayout();
  useEffect(() => { if (!desktop) dispatch({ type: 'task-open', open: false }); }, [desktop]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (next: Partial<LabScene>) => dispatch({ type: 'patch-scene', screen, patch: next as unknown as Record<string, unknown> });
  // 引导任务的每个操作都走课程域，进度才会记上；用 ref 取最新会话，连点两下不会丢进度。
  const latest = useRef(session);
  latest.current = session;
  const operate = (op: SimOperation) => {
    const current = latest.current;
    const next = applyOperation(readTaskData(current.task.data), readLabScene(current.scenes[screen]), COURSE_SAMPLE, op);
    dispatch({ type: 'patch-scene', screen, patch: next.scene as unknown as Record<string, unknown> });
    dispatch({ type: 'task-patch', patch: next.task as unknown as Record<string, unknown> });
  };

  return (
    <RefractometerBench
      sim={sim} screen={screen} onScreen={onScreen}
      scene={scene} sample={sample}
      onOperate={guided ? operate : undefined}
      observe={{ steps: guided ? courseStepBar(view) : null, next: guided ? nextBenchAction(view.state) : null, onRecordInvalid: () => operate({ type: 'record-invalid' }) }}
      onPatch={patch}
      onReset={() => dispatch({ type: 'reset-scene', screen, initial: { ...labInitial(guided ? COURSE_SAMPLE.id : lab.sampleId), saved: lab.saved ? { ...lab.saved, stale: true } : null } as unknown as Record<string, unknown> })}
      onSave={(record) => {
        // 引导任务：读数走课程域（完成条件与学习记录规则据此判断）；自由练习只记到场景里。
        if (guided) operate({ type: 'reading', min: record.min, max: record.max });
        patch({ saved: { summary: record.summary, stale: false } });
      }}
      taskSlot={(
        <RefractometerTaskCard
          view={view} open={session.task.open} mode={task.mode} hasSkipped={task.hasSkipped} teacherUsed={session.task.teacherUsed}
          onOpen={(open) => dispatch({ type: 'task-open', open })}
          onChoose={(mode) => {
            // 开始引导任务：操作台回到课程起点，并切到教学样品（课程条件按它判断）。
            dispatch({ type: 'patch-scene', screen, patch: { ...labInitial(COURSE_SAMPLE.id), saved: lab.saved ? { ...lab.saved, stale: true } : null } as unknown as Record<string, unknown> });
            dispatch({ type: 'task-patch', patch: { mode } });
            if (mode === 'teacher') dispatch({ type: 'task-teacher' });
          }}
          onAnswer={(id, option) => operate({ type: 'answer', id, option })}
          onRestart={() => dispatch({ type: 'task-restart' })}
          onScreen={onScreen}
        >
          {view.state.step === 'contact' && (
            <div className="sim-task__step" data-testid="sim-task-contact">
              <button type="button" className="iu-button" disabled={view.state.invalidRecorded} onClick={() => operate({ type: 'record-invalid' })}>记录：无法可靠读数</button>
              <p className="sim-note">{view.state.invalidRecorded ? '已记录：空气间隙下没有可靠的样品边界。' : '先判断当下条件能不能给出样品读数，再记录；恢复贴合后才重新读。'}</p>
            </div>
          )}
          {['observe', 'verify'].includes(view.state.step) && (
            <div className="sim-task__step" data-testid="sim-task-reading">
              <p className="sim-note">用观察面板里的「记录读数」提交本次估读；{view.state.step === 'verify' ? '先把样品转向 90°。' : '先独立估读，再核对。'}</p>
              <ReadingSummary readings={view.state.readings} />
            </div>
          )}
          {view.state.step === 'prepare' && (
            <div className="sim-task__step" data-testid="sim-task-prepare">
              <p className="sim-note">操作台上的每一步都算数：{scene.power ? '✓' : '○'} 开灯看空载刻度 · {scene.liquid === 'drop' ? '✓' : '○'} 滴接触液 · {scene.sample === 'placed' ? '✓' : '○'} 台面朝下放样。</p>
            </div>
          )}
          {view.state.step === 'cleanup' && (
            <div className="sim-task__step" data-testid="sim-task-cleanup">
              <p className="sim-note">取下样品、擦净测台与样品、关灯并合上翻盖；清洁顺序与课程一致。</p>
            </div>
          )}
        </RefractometerTaskCard>
      )}
    />
  );
}

/** 引导任务里的读数小结：显示已提交的读数与核对结果。 */
function ReadingSummary({ readings }: { readings: { value: number; angle: number; max?: number | null; correct: boolean; overLimit?: boolean }[] }) {
  if (readings.length === 0) return null;
  return (
    <ul className="sim-readings" data-testid="sim-readings">
      {readings.map((reading, index) => (
        <li key={index} data-correct={reading.correct}>
          {reading.overLimit ? '记录：> 1.780' : `${reading.max ? `${reading.value} – ${reading.max}` : reading.value} nD · 方向 ${reading.angle}°`} · {reading.correct ? '✓ 与参考一致' : '△ 与参考不符，可重读'}
        </li>
      ))}
    </ul>
  );
}

import type { SampleDef } from '@/data/types';
import { SAMPLES_BY_ID } from '@/data/samples';
import type { AssessmentAttempt, DetectionSession } from '@/store/detectionStore';
import { formatDR } from '@/utils/format';

const EVIDENCE_LABEL = { ri: '折射率', optical: '光性现象', spectrum: '吸收光谱' } as const;
const DIFFICULTY_LABEL = { beginner: '初级', intermediate: '中级', advanced: '高级' } as const;

export default function PracticeReport({
  session,
  sample,
  attempt,
}: {
  session: DetectionSession;
  sample: SampleDef;
  attempt: AssessmentAttempt;
}) {
  const answer = SAMPLES_BY_ID[attempt.selectedSampleId]?.name ?? '未知选项';
  const ri = session.refractometer.riMin !== null
    ? session.refractometer.riMax !== null && session.refractometer.riMax !== session.refractometer.riMin
      ? `${session.refractometer.riMin.toFixed(3)} – ${session.refractometer.riMax.toFixed(3)}`
      : session.refractometer.riMin.toFixed(3)
    : session.refractometer.notes.includes('> 1.780') ? '> 1.780' : '未测';
  const optical = session.polariscope.notes ||
    (session.polariscope.optical === 'isotropic' ? '均质体'
      : session.polariscope.optical === 'anisotropic' ? '非均质体'
        : session.polariscope.optical === 'aggregate' ? '多晶质集合体' : '未测');
  const spectrum = session.spectroscope.markedLines.length > 0
    ? session.spectroscope.markedLines.map((line) => `${line} nm`).join('、')
    : session.spectroscope.notes || '未观察';

  return (
    <section className="print-only practice-report" data-testid="practice-print-report">
      <div className="report-kicker">GEM LAB · LEARNING RECORD</div>
      <h1>宝石检测课堂练习记录</h1>
      <p className="report-notice">教学模拟资料，仅用于课堂练习与复盘，不作为真实宝石鉴定结论或证书。</p>
      <div className="report-meta">
        <span>练习时间：{new Date(attempt.completedAt).toLocaleString('zh-CN')}</span>
        <span>难度：{DIFFICULTY_LABEL[session.difficulty ?? 'beginner']}</span>
        <span>第 {attempt.attemptNumber} 次命名</span>
      </div>
      <h2>一、模拟观察记录</h2>
      <table>
        <tbody>
          <tr><th>折射仪</th><td>折射率 {ri}；双折射率 {formatDR(session.refractometer.birefringence ?? undefined)}</td></tr>
          <tr><th>偏光镜</th><td>{optical}；{session.polariscope.phenomenon === 'four-bright-four-dark' ? '四明四暗' : session.polariscope.phenomenon === 'all-dark' ? '全暗' : session.polariscope.phenomenon === 'all-bright' ? '全亮' : '未记录正交现象'}</td></tr>
          <tr><th>分光镜</th><td>{spectrum}</td></tr>
        </tbody>
      </table>
      <h2>二、命名与推理</h2>
      <table>
        <tbody>
          <tr><th>你的命名</th><td>{answer}</td></tr>
          <tr><th>参考答案</th><td>{sample.name}</td></tr>
          <tr><th>主要依据</th><td>{EVIDENCE_LABEL[attempt.evidence]}</td></tr>
          <tr><th>确信程度</th><td>{attempt.confidence}%</td></tr>
          <tr><th>反馈</th><td>{attempt.selectedSampleId === sample.id ? '判断正确' : '需要复习'} · 本次得分 {attempt.score}</td></tr>
        </tbody>
      </table>
      <h2>三、复盘要点</h2>
      <ul>{sample.detectionTips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>
      {attempt.attemptNumber > 1 && <p className="report-notice">本次为答案揭晓后的复盘，不计分，也不计入掌握度。</p>}
      <p className="report-footer">记录仅保存在当前浏览器；此页可通过浏览器“打印 / 保存为 PDF”留存。</p>
    </section>
  );
}

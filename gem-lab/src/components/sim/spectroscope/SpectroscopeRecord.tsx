import { useState, type ReactNode } from 'react';
import { SimSheet } from '../SimShell';
import type { SpectroscopeData } from '../../../store/detectionStore';
import { BENCH_METHOD_LABELS, type BenchEvaluation, type BenchState } from '../../../domain/spectroscopeBench';
import { canSaveRecord, observationText, recordData, type BandRange, type RecordInput } from '../../../domain/spectroscopeRecord';
import { MACHINE_LABELS } from '../../../domain/spectroscopeCopy';
import { checkMarks, COURSE_SAMPLE, FEATURE_GROUPS, REQUIRED_GROUPS } from '../../../domain/spectroscopeCourse';
import type { SavedRecord } from '../../../domain/spectroscopeSim';

export interface SpectroscopeRecordProps {
  onClose: () => void;
  state: BenchState;
  evaluation: BenchEvaluation;
  marks: readonly number[];
  bands: readonly BandRange[];
  noAbsorption: boolean;
  notes: string;
  saved: SavedRecord | null;
  /** 三维工作台已就绪，才允许记录。 */
  ready: boolean;
  /** 引导任务进行中：确认保存有效观察后给出本课诊断特征分组。 */
  guided?: boolean;
  /** 兼容课程核对状态；仅核对不开放参考，参考门禁以有效的已保存记录为准。 */
  reviewed?: boolean;
  /** 记录里写的样品名；未知样品（挑战屏）不传，等于不写品种。 */
  sampleName?: string;
  onAddMark: (wavelength: number) => void;
  onRemoveMark: (wavelength: number) => void;
  onAddBand: (band: BandRange) => void;
  onRemoveBand: (index: number) => void;
  /** 勾「未见明显特征吸收」：清掉已有的线与带。 */
  onNoAbsorption: (value: boolean) => void;
  onNotes: (value: string) => void;
  /** 引导任务里的「核对标记」（课程 observe 步的完成条件）。 */
  onReview?: () => void;
  onSave: (data: SpectroscopeData) => void;
  /** 保存后开放的对照资料；检测与独立挑战不给。 */
  reference?: ReactNode;
}

/**
 * 记录观察：吸收线 / 吸收带输入、「本次条件下未见明显特征吸收」、补充说明 → 核对并保存 → 保存后才开放对照资料。
 * 条件一变旧记录保留但标为过期，调回原设置也不会自动恢复确认（同练习页）。
 */
export default function SpectroscopeRecord(props: SpectroscopeRecordProps) {
  const { onClose, state, evaluation, marks, bands, noAbsorption, notes, saved, ready, guided, sampleName, onAddMark, onRemoveMark, onAddBand, onRemoveBand, onNoAbsorption, onNotes, onReview, onSave, reference } = props;
  const [line, setLine] = useState('');
  const [bandStart, setBandStart] = useState('');
  const [bandEnd, setBandEnd] = useState('');
  const [confirming, setConfirming] = useState(false);
  const input: RecordInput = { state, evaluation, marks, bands, noAbsorption, notes, sampleName };
  const mayObserve = evaluation.canRecord && ready;
  const canSave = canSaveRecord(input, ready);
  const pending = evaluation.recordStatus === 'unverified' || evaluation.recordStatus === 'setup-only';
  // 核对只预览本次输入；确认保存才开放答案。条件改变会让旧记录过期并重新锁住参考。
  const referenceUnlocked = !!saved && !saved.stale && !saved.pending;
  const review = () => { onReview?.(); setConfirming(true); };
  const save = () => { onSave(recordData(input)); setConfirming(false); };
  const found = checkMarks(marks);
  const addBand = (start: number, end: number) => { onAddBand({ start, end }); setConfirming(false); };

  return (
    <SimSheet title="记录观察" onClose={onClose} testId="sim-record">
      <p className="sim-note">观察条件：{MACHINE_LABELS[state.dispersion]} · {BENCH_METHOD_LABELS[state.method]}{evaluation.canRecord ? '' : ` · ${evaluation.recordStatus === 'setup-only' ? '先做布置练习' : '条件还不适合记录'}`}</p>
      <fieldset className="sim-fieldset sim-record__inputs" disabled={!mayObserve}>
        <div className="sim-record__row">
          <label htmlFor="sim-record-line">吸收线</label>
          <input id="sim-record-line" type="number" min={400} max={700} placeholder="400–700" value={line} onChange={(event) => setLine(event.target.value)} data-testid="sim-record-line" />
          <span>nm</span>
          <button type="button" className="iu-button" onClick={() => { const wl = Number(line); if (Number.isFinite(wl) && wl >= 400 && wl <= 700) { onAddMark(Math.round(wl)); setLine(''); setConfirming(false); } }} data-testid="sim-record-add-line">添加线</button>
        </div>
        <div className="sim-record__row">
          <label htmlFor="sim-record-band-start">吸收带</label>
          <input id="sim-record-band-start" type="number" min={400} max={700} placeholder="起点" value={bandStart} onChange={(event) => setBandStart(event.target.value)} data-testid="sim-record-band-start" />
          <span>—</span>
          <input type="number" min={400} max={700} placeholder="终点" aria-label="吸收带终点" value={bandEnd} onChange={(event) => setBandEnd(event.target.value)} data-testid="sim-record-band-end" />
          <span>nm</span>
          <button type="button" className="iu-button" onClick={() => {
            const start = Number(bandStart), end = Number(bandEnd);
            if (!bandStart || !bandEnd || start < 400 || end > 700 || start >= end) return;
            addBand(start, end); setBandStart(''); setBandEnd('');
          }} data-testid="sim-record-add-band">添加带</button>
        </div>
        <label className="sim-record__check"><input type="checkbox" checked={noAbsorption} onChange={(event) => onNoAbsorption(event.target.checked)} data-testid="sim-record-no-absorption" />本次条件下未见明显特征吸收</label>
      </fieldset>
      {!!(marks.length || bands.length) && (
        <div className="sim-row" data-testid="sim-record-chips">
          {marks.map((wl) => <button key={wl} type="button" className="iu-button" onClick={() => { onRemoveMark(wl); setConfirming(false); }}>{wl} nm 线 ×</button>)}
          {bands.map((band, index) => <button key={`${band.start}-${index}`} type="button" className="iu-button" onClick={() => { onRemoveBand(index); setConfirming(false); }}>{band.start}–{band.end} nm 带 ×</button>)}
        </div>
      )}
      <label className="sim-record__notes" htmlFor="sim-record-notes">补充说明</label>
      <textarea id="sim-record-notes" rows={2} value={notes} onChange={(event) => { onNotes(event.target.value); setConfirming(false); }} placeholder="例如蓝紫区较暗、弱带不确定，或需要换向复核…" data-testid="sim-record-notes" />
      {guided && referenceUnlocked && (
        <div className="sim-record__groups" data-testid="marks-feedback">
          <strong>{found.foundCount >= REQUIRED_GROUPS ? `找到 ${found.foundCount} 组诊断特征` : `找到 ${found.foundCount} 组，至少需要 ${REQUIRED_GROUPS} 组`}</strong>
          <ul>{FEATURE_GROUPS.map((group, index) => <li key={group.label}>{found.found[index] ? '✓' : '○'} {group.label}</li>)}</ul>
          {!!found.stray.length && <p>{found.stray.map((wl) => `${wl} nm`).join('、')} 附近没有吸收特征，可以点掉重标。</p>}
          <p>参考：{COURSE_SAMPLE.spectrum.description}</p>
        </div>
      )}
      {confirming ? (
        <div className="sim-record__confirm" role="region" aria-label="核对本次记录" data-testid="sim-record-confirm">
          <strong>核对本次记录</strong>
          <p>{observationText(input)}</p>
          <p>{MACHINE_LABELS[state.dispersion]} · {BENCH_METHOD_LABELS[state.method]} · {pending ? '仅作待核说明，不计有效观察' : evaluation.lightPath === 'weak' ? '受限观察，需复核' : '观察条件可用'}</p>
          {notes && <p>{notes}</p>}
          <div className="sim-row">
            <button type="button" className="iu-button" onClick={() => setConfirming(false)}>返回修改</button>
            <button type="button" className="iu-button iu-button--primary" disabled={!canSave} onClick={save} data-testid="sim-record-save">确认保存</button>
          </div>
        </div>
      ) : (
        <button type="button" className="iu-button iu-button--primary" disabled={!canSave} onClick={review} data-testid="sim-record-review">{pending ? '核对待核说明' : '核对并保存观察'}</button>
      )}
      <p className="sim-note">暗场、没有经过样品的白光和未放样都不能作为吸收记录；条件一变旧记录保留但标为过期。</p>
      {saved && (
        <div className="sim-record__saved" data-testid="sim-record-saved" data-stale={saved.stale}>
          <strong>{saved.stale ? '先前记录已保留，当前条件已改变' : saved.pending ? '待核说明已保存' : '本次观察已保存'}</strong>
          <p>{saved.notes}</p>
          {saved.stale && <p>请重新观察；调回原设置也不会自动确认旧结果。</p>}
        </div>
      )}
      {referenceUnlocked && reference}
    </SimSheet>
  );
}

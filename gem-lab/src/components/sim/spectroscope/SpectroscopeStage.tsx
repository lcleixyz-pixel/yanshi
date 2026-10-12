import type { RefObject } from 'react';
import { SimReadout } from '../SimShell';
import SpectrumStrip from '../../spectroscope/SpectrumStrip';
import type { BenchEvaluation } from '../../../domain/spectroscopeBench';
import type { Dispersion } from '../../../domain/spectrumDisplay';
import { fieldChecks, yardstickStatus } from '../../../domain/spectroscopeCopy';
import type { BenchStatus } from './useSpectroscopeBench';

/**
 * 实验屏的操作区：三维照明夹样工作台铺满，载入失败给原地重试；
 * 底部停靠「目镜视场」读数框（刻度字样 + 可点标记的光谱条 + 条件状态行）。
 * 条件问题写在操作区的 data-problems 上，供核验与样式共用。
 *
 * 读数框只报「此刻在目镜里能不能看到谱」：谱没进来（无光、旁路、偏轴、反射布置）时不写「吸收特征 无」，
 * 也不报 400–700 nm 的假范围；参考谱待核时写明待核，不把空白当成「无特征」。
 */
export default function SpectroscopeStage({ hostRef, status, error, onRetry, evaluation, dispersion, marks, interactive, onAddMark, onRemoveMark, values, idle, children }: {
  hostRef: RefObject<HTMLDivElement>;
  status: BenchStatus;
  error: string;
  onRetry: () => void;
  evaluation: BenchEvaluation;
  dispersion: Dispersion;
  marks: readonly number[];
  interactive: boolean;
  onAddMark: (wavelength: number) => void;
  onRemoveMark: (wavelength: number) => void;
  values: boolean;
  /** 挑战屏还没抽样品：不显示目镜视场（此时没有可观察的样品）。 */
  idle?: boolean;
  children?: React.ReactNode;
}) {
  const ready = status === 'ready';
  const checks = fieldChecks(evaluation, dispersion);
  return (
    <section className="sim-stage" aria-label="照明与夹样工作台" data-testid="sim-spectro-stage" data-problems={evaluation.display.problems.join(' ')}>
      <div className="sim-stage__host" ref={hostRef} aria-label="光源、镊子与手持分光镜三维场景" data-testid="bench-scene" />
      {status === 'loading' && <p className="sim-stage__note" role="status"><i />正在载入照明与夹样工作台…</p>}
      {status === 'error' && (
        <div className="sim-stage__error" role="alert">
          <p>工作台模型载入失败：{error}。光谱观察与本屏操作仍可继续。</p>
          <button type="button" className="iu-button" onClick={onRetry} data-testid="sim-spectro-retry">重新载入</button>
        </div>
      )}
      <p className="sim-stage__hint">拖动旋转 · 滚轮缩放 · 按住灯头、狭缝环或目镜套筒左右拖动可调节</p>
      {idle ? <p className="sim-stage__note" data-testid="sim-spectro-idle">先在面板里选一档难度，抽一颗未知样品再观察。</p> : (
      <SimReadout title="目镜视场" meta={checks.scale} testId="sim-spectro-field">
        {checks.showSpectrum ? (
          <SpectrumStrip
            features={evaluation.display.features}
            display={evaluation.display}
            dispersion={dispersion}
            userMarks={[...marks]}
            onAddMark={onAddMark}
            onRemoveMark={onRemoveMark}
            interactive={interactive && ready}
            showFeatureDescriptions={false}
            height={64}
          />
        ) : (
          <p className="sim-note" data-testid="sim-spectro-nospectrum">{checks.noSpectrumText}</p>
        )}
        {values && (
          <dl className="sim-readout-list" data-testid="sim-spectro-values">
            <div><dt>光谱范围</dt><dd>{checks.range}</dd></div>
            <div><dt>吸收特征</dt><dd>{checks.features}</dd></div>
            <div><dt>已标记</dt><dd>{marks.length ? marks.map((wl) => `${wl} nm`).join('、') : '无'}</dd></div>
          </dl>
        )}
        <p className="sim-note" role="status" data-testid="sim-spectro-status">{yardstickStatus(evaluation, dispersion)}</p>
        {children}
      </SimReadout>
      )}
    </section>
  );
}

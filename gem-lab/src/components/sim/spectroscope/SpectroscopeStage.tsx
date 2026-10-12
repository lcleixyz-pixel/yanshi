import type { RefObject } from 'react';
import { SimReadout } from '../SimShell';
import SpectrumStrip from '../../spectroscope/SpectrumStrip';
import type { SpectrumDisplay, Dispersion } from '../../../domain/spectrumDisplay';
import { PROBLEM_TEXT, VARIANT_TEXT } from '../../../domain/spectroscopeCopy';
import type { BenchStatus } from './useSpectroscopeBench';

/**
 * 实验屏的操作区：三维照明夹样工作台铺满，载入失败给原地重试；
 * 底部停靠「目镜视场」读数框（刻度字样 + 可点标记的光谱条 + 条件状态行）。
 * 条件问题写在操作区的 data-problems 上，供核验与样式共用。
 */
export default function SpectroscopeStage({ hostRef, status, error, onRetry, display, dispersion, marks, interactive, onAddMark, onRemoveMark, values, children }: {
  hostRef: RefObject<HTMLDivElement>;
  status: BenchStatus;
  error: string;
  onRetry: () => void;
  display: SpectrumDisplay;
  dispersion: Dispersion;
  marks: readonly number[];
  interactive: boolean;
  onAddMark: (wavelength: number) => void;
  onRemoveMark: (wavelength: number) => void;
  values: boolean;
  children?: React.ReactNode;
}) {
  const ready = status === 'ready';
  return (
    <section className="sim-stage" aria-label="照明与夹样工作台" data-testid="sim-spectro-stage" data-problems={display.problems.join(' ')}>
      <div className="sim-stage__host" ref={hostRef} aria-label="光源、镊子与手持分光镜三维场景" data-testid="bench-scene" />
      {status === 'loading' && <p className="sim-stage__note" role="status"><i />正在载入照明与夹样工作台…</p>}
      {status === 'error' && (
        <div className="sim-stage__error" role="alert">
          <p>工作台模型载入失败：{error}。光谱观察与本屏操作仍可继续。</p>
          <button type="button" className="iu-button" onClick={onRetry} data-testid="sim-spectro-retry">重新载入</button>
        </div>
      )}
      <p className="sim-stage__hint">拖动旋转 · 滚轮缩放 · 按住灯头、狭缝环或目镜套筒左右拖动可调节</p>
      <SimReadout title="目镜视场" meta={VARIANT_TEXT[dispersion].scale} testId="sim-spectro-field">
        <SpectrumStrip
          features={display.features}
          display={display}
          dispersion={dispersion}
          userMarks={[...marks]}
          onAddMark={onAddMark}
          onRemoveMark={onRemoveMark}
          interactive={interactive && ready}
          showFeatureDescriptions={false}
          height={64}
        />
        {values && (
          <dl className="sim-readout-list" data-testid="sim-spectro-values">
            <div><dt>光谱范围</dt><dd>400–700 nm</dd></div>
            <div><dt>吸收特征</dt><dd>{display.features.length ? `${display.features.length} 条` : '无'}</dd></div>
            <div><dt>已标记</dt><dd>{marks.length ? marks.map((wl) => `${wl} nm`).join('、') : '无'}</dd></div>
          </dl>
        )}
        <p className="sim-note" role="status" data-testid="sim-spectro-status">{display.problems.length ? display.problems.map((problem) => PROBLEM_TEXT[problem]).join(' ') : VARIANT_TEXT[dispersion].ok}</p>
        {children}
      </SimReadout>
    </section>
  );
}

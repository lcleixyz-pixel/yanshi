import { useEffect, useRef } from 'react';
import { renderConoscopicFigure, type CrystalOptics, type Rgb } from '../../domain/polarizedLight';
import { renderEyepieceField, type SampleFieldMap } from '../../domain/eyepieceField';

export const EYEPIECE_RESOLUTION = 240;

export type EyepieceContent =
  | { kind: 'field'; map: SampleFieldMap | null; backgroundTransmission?: number }
  | { kind: 'conoscope'; crystal: CrystalOptics; thicknessMm: number; tint: Rgb; sinThetaMax?: number };

/**
 * 目镜视场：同一张画布既显示在页面上，也作为三维检偏器上的视场纹理。
 * 视场坐标：x 向右为下偏光片透振方向（0°），角度逆时针为正，与三维物台转向一致。
 */
export default function EyepieceView({ content, stageDeg, analyzerDeg, active, label, onRendered, onCanvas }: {
  content: EyepieceContent;
  stageDeg: number;
  analyzerDeg: number;
  active: boolean;
  label: string;
  onRendered?: () => void;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const own = useRef<HTMLCanvasElement | null>(null);
  const rendered = useRef(onRendered); rendered.current = onRendered;
  // 光轴竖直的一轴晶干涉图绕视场中心旋转对称：转动物台画面不变，无需重算（水晶逐波长计算较慢）。
  const stageInvariant = content.kind === 'conoscope' && content.crystal.kind === 'uniaxial' && content.crystal.axis[2] > 0.999999;
  const effectiveStage = stageInvariant ? 0 : stageDeg;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = own.current, context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const n = EYEPIECE_RESOLUTION;
      const pixels = content.kind === 'field'
        ? renderEyepieceField(content.map, n, { stageDeg: effectiveStage, analyzerDeg, active, backgroundTransmission: content.backgroundTransmission })
        : renderConoscopicFigure(content.crystal, { stageDeg: effectiveStage, analyzerDeg, thicknessMm: content.thicknessMm, sinThetaMax: content.sinThetaMax ?? 0.42, resolution: n, tint: content.tint, exposure: active ? 1 : 0 });
      context.putImageData(new ImageData(pixels, n, n), 0, 0);
      rendered.current?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [content, effectiveStage, analyzerDeg, active]);
  return (
    <figure className="pol-eyepiece" data-testid="eyepiece-view" data-kind={content.kind}>
      <div className="pol-eyepiece__ring">
        <canvas ref={(element) => { own.current = element; onCanvas?.(element); }} width={EYEPIECE_RESOLUTION} height={EYEPIECE_RESOLUTION} role="img" aria-label={label} />
        <span className="pol-eyepiece__mark pol-eyepiece__mark--p" aria-hidden="true">P</span>
        <span className="pol-eyepiece__mark pol-eyepiece__mark--a" aria-hidden="true" style={{ transform: `rotate(${-analyzerDeg}deg)` }}><i>A</i></span>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

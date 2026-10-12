import { useId } from 'react';
import '../../styles/instrument-ui.css';

/** 共用滑杆：标签、数值与单位读数、两端刻度、读屏文字（同偏光镜 AngleControl）。数值以显示单位传入。 */
export default function RangeControl({ label, value, min, max, step = 1, display, valueText, ends, onChange, testId }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 读数文字，例如「0.59 mm」「82%」。 */
  display: string;
  /** 读屏文字；默认同读数。 */
  valueText?: string;
  /** 两端刻度文字。 */
  ends: readonly [string, string];
  onChange: (value: number) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="iu-range" data-testid={testId}>
      <div className="iu-range__head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input id={id} type="range" aria-label={label} min={min} max={max} step={step} value={value} aria-valuetext={valueText ?? display} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="iu-range__labels" aria-hidden="true"><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );
}

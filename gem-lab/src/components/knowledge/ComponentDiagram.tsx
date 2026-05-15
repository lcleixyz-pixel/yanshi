import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from '@/utils/clsx';
import type { InstrumentComponent } from '@/data/types';

/**
 * 双侧标签 + 连线 风格的结构标注图。
 * 所有信息一屏全显示，无需滚动；圆点和标签卡 hover 联动高亮。
 */
export default function ComponentDiagram({
  productImage,
  components,
  themeHex = '#1f5ba8',
}: {
  productImage: string;
  components: InstrumentComponent[];
  themeHex?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const updateFit = useCallback(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img?.naturalWidth) return;

    const W = box.clientWidth;
    const H = box.clientHeight;
    if (W < 1 || H < 1) return;

    const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    setFit({
      left: (W - width) / 2,
      top: (H - height) / 2,
      width,
      height,
    });
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const ro = new ResizeObserver(updateFit);
    ro.observe(box);
    imgRef.current?.addEventListener('load', updateFit);
    updateFit();
    return () => {
      ro.disconnect();
      imgRef.current?.removeEventListener('load', updateFit);
    };
  }, [productImage, updateFit]);

  // 拆分左右两侧标签，并按 y 位置升序排列
  const { left, right } = useMemo(() => {
    const left: InstrumentComponent[] = [];
    const right: InstrumentComponent[] = [];
    components.forEach((c) => {
      if (c.labelSide === 'right') right.push(c);
      else left.push(c); // 默认左侧
    });
    const byY = (a: InstrumentComponent, b: InstrumentComponent) =>
      (a.position?.y ?? 0) - (b.position?.y ?? 0);
    left.sort(byY);
    right.sort(byY);
    return { left, right };
  }, [components]);

  const indexOf = (c: InstrumentComponent) =>
    components.findIndex((x) => x.id === c.id) + 1;

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50/60 via-white to-white p-2 ring-1 ring-line">
      <div className="grid grid-cols-[230px_1fr_230px] items-stretch gap-0">
        {/* 左侧标签栏 */}
        <CalloutColumn
          side="left"
          components={left}
          active={active}
          setActive={setActive}
          themeHex={themeHex}
          indexOf={indexOf}
        />

        {/* 中央：产品图 + 圆点 + 内部连线 */}
        <div ref={boxRef} className="relative flex aspect-[4/3] items-center justify-center">
          <img
            ref={imgRef}
            src={productImage}
            alt=""
            className="absolute inset-0 h-full w-full select-none object-contain"
            draggable={false}
          />

          <div
            className="pointer-events-none absolute"
            style={{
              left: fit.left,
              top: fit.top,
              width: fit.width,
              height: fit.height,
            }}
          >
            {/* SVG 连线层（按图片实际 object-contain 绘制区域定位） */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {components.map((c) => {
                if (!c.position) return null;
                const isActive = active === c.id;
                const side = c.labelSide ?? 'left';
                const x1 = c.position.x * 100;
                const y1 = c.position.y * 100;
                const x2 = side === 'left' ? 0 : 100;
                const y2 = c.position.y * 100;
                return (
                  <line
                    key={c.id}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={themeHex}
                    strokeWidth={isActive ? 0.3 : 0.18}
                    strokeDasharray={isActive ? '0 0' : '0.6 0.4'}
                    opacity={isActive ? 0.95 : 0.45}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
          </div>

          {/* 圆点层 */}
          <div
            className="absolute"
            style={{
              left: fit.left,
              top: fit.top,
              width: fit.width,
              height: fit.height,
            }}
          >
            {components.map((c) => {
              if (!c.position) return null;
              const isActive = active === c.id;
              const idx = indexOf(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setActive(c.id)}
                  onMouseLeave={() => setActive(null)}
                  className={clsx(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform',
                    isActive ? 'scale-125' : 'hover:scale-110',
                  )}
                  style={{
                    left: `${c.position.x * 100}%`,
                    top: `${c.position.y * 100}%`,
                  }}
                  aria-label={c.name}
                >
                  {/* 脉动外圈 */}
                  {isActive && (
                    <span
                      className="absolute inset-0 animate-pulse-ring rounded-full"
                      style={{ border: `2px solid ${themeHex}` }}
                    />
                  )}
                  {/* 数字徽章 */}
                  <span
                    className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[12px] font-semibold text-white shadow-card"
                    style={{ background: themeHex }}
                  >
                    {idx}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧标签栏 */}
        <CalloutColumn
          side="right"
          components={right}
          active={active}
          setActive={setActive}
          themeHex={themeHex}
          indexOf={indexOf}
        />
      </div>

      {/* 顶部小提示 */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-line-2 bg-white/90 px-3 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-4 shadow-soft backdrop-blur">
        鼠标悬停部件查看详情
      </div>
    </div>
  );
}

function CalloutColumn({
  side,
  components,
  active,
  setActive,
  themeHex,
  indexOf,
}: {
  side: 'left' | 'right';
  components: InstrumentComponent[];
  active: string | null;
  setActive: (id: string | null) => void;
  themeHex: string;
  indexOf: (c: InstrumentComponent) => number;
}) {
  // 防重叠：依次扫描，相邻标签 y 间距强制 ≥ MIN_GAP（圆点位置不变，仅标签 y 调整）
  const MIN_GAP = 0.18;
  const hasCustomLabelY = components.some((c) => c.labelPosition?.y != null);
  const labelYs: number[] = [];
  if (hasCustomLabelY) {
    components.forEach((c) => {
      labelYs.push(c.labelPosition?.y ?? c.position?.y ?? 0.5);
    });
  } else {
    components.forEach((c, i) => {
      const raw = c.position?.y ?? 0.5;
      if (i === 0) {
        labelYs.push(raw);
      } else {
        labelYs.push(Math.max(raw, labelYs[i - 1] + MIN_GAP));
      }
    });
  }

  return (
    <div className="relative h-full">
      {components.map((c, i) => {
        const isActive = active === c.id;
        const idx = indexOf(c);
        const isExternal = !c.position;
        const top = `${labelYs[i] * 100}%`;
        return (
          <div
            key={c.id}
            className="absolute w-full"
            style={{ top, transform: 'translateY(-50%)' }}
          >
            <button
              type="button"
              onMouseEnter={() => setActive(c.id)}
              onMouseLeave={() => setActive(null)}
              className={clsx(
                'group relative w-full text-left transition-all',
                side === 'left' ? 'pr-2' : 'pl-2',
              )}
            >
              {/* 标签卡 */}
              <div
                className={clsx(
                  'relative rounded-xl border bg-white px-3 py-2 transition-all',
                  isActive
                    ? 'shadow-lift'
                    : 'shadow-soft hover:shadow-card',
                )}
                style={{
                  borderColor: isActive ? themeHex : '#e3ebf5',
                  background: isActive ? `${themeHex}08` : '#fff',
                }}
              >
                {/* 顶部装饰条 */}
                <div
                  className="absolute inset-x-3 top-0 h-0.5 rounded-b"
                  style={{ background: themeHex, opacity: isActive ? 1 : 0.5 }}
                />

                <div
                  className={clsx(
                    'flex items-start gap-2',
                    side === 'right' && 'flex-row-reverse',
                  )}
                >
                  {/* 数字徽章 */}
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ background: themeHex }}
                  >
                    {idx}
                  </span>
                  <div
                    className={clsx(
                      'min-w-0 flex-1',
                      side === 'right' && 'text-right',
                    )}
                  >
                    <div className="font-display text-sm font-semibold text-ink">
                      {c.name}
                    </div>
                    {isExternal && (
                      <div
                        className={clsx(
                          'mt-1 inline-flex rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest',
                          side === 'right' && 'justify-end',
                        )}
                        style={{ background: `${themeHex}12`, color: themeHex }}
                      >
                        外接附件
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
                      {c.shortDesc ?? c.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* 指向中央图的小三角 */}
              {!isExternal && (
                <span
                  className={clsx(
                    'absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border bg-white transition-all',
                    side === 'left'
                      ? '-right-[5px] border-l-0 border-b-0'
                      : '-left-[5px] border-r-0 border-t-0',
                  )}
                  style={{
                    borderColor: isActive ? themeHex : '#d4dfee',
                    background: isActive ? `${themeHex}08` : '#fff',
                  }}
                />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

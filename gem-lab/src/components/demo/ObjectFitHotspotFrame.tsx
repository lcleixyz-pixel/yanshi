import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from '@/utils/clsx';

/**
 * 与 object-contain 后图片的绘制矩形一致的热点层，子节点内 x/y=0–1 表示图像内容上的比例（不受 letterbox 影响）。
 */
export default function ObjectFitHotspotFrame({
  src,
  alt,
  className,
  imgClassName,
  children,
  /** 热点层 z-index；偏光镜等需高于左上角浮层（多为 z-20）时用 z-[28] 等 */
  hotspotLayerClassName = 'z-10',
}: {
  src: string;
  alt: string;
  className?: string;
  /** 外层为定位上下文，通常 relative + aspect + h/w full */
  imgClassName?: string;
  children: ReactNode;
  hotspotLayerClassName?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const update = useCallback(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (W < 1 || H < 1) return;
    if (!img?.naturalWidth) return;
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const scale = Math.min(W / w0, H / h0);
    const dispW = w0 * scale;
    const dispH = h0 * scale;
    const left = (W - dispW) / 2;
    const top = (H - dispH) / 2;
    setFit({ left, top, width: dispW, height: dispH });
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(box);
    const img = imgRef.current;
    img?.addEventListener('load', update);
    update();
    return () => {
      ro.disconnect();
      img?.removeEventListener('load', update);
    };
  }, [update, src]);

  return (
    <div ref={boxRef} className={clsx('relative h-full w-full', className)}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={clsx(
          'pointer-events-none absolute inset-0 h-full w-full select-none object-contain',
          imgClassName,
        )}
        draggable={false}
      />
      {fit.width > 0.5 && fit.height > 0.5 && (
        <div
          className={clsx('absolute', hotspotLayerClassName)}
          style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }}
        >
          <div className="relative h-full w-full">{children}</div>
        </div>
      )}
    </div>
  );
}
